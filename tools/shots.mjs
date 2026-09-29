import { chromium } from 'playwright';
import { ROOMS } from '../src/levels.js';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const only = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto(url);
await page.waitForTimeout(1500);
if (!only) await page.screenshot({ path: '/projects/sandbox/shadow-couple/tools/shot_title.png' });
for (const R of ROOMS) {
  if (only && R.id !== only) continue;
  await page.goto(url + `?room=${R.id}&go&auto`);
  try {
    await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 15000 });
  } catch (e) { errors.push(`${R.id}: never reached play state (state=${await page.evaluate(() => window.__game?.state)})`); }
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => { const g = window.__game; return { state: g.state, fps: 0, occ: g.occ.list.length, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, hp: g.shade.hp }; });
  console.log(R.id, JSON.stringify(info));
  await page.screenshot({ path: `/projects/sandbox/shadow-couple/tools/shot_${R.id}.png` });
}
console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
