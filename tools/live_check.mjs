import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('https://starterpack-master.github.io/shadow-couple/?auto', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/projects/sandbox/shadow-couple/tools/live_title.png' });
await page.tap('#btnStart');
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 40000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/projects/sandbox/shadow-couple/tools/live_play.png' });
console.log('state:', await page.evaluate(() => window.__game.state + ' room ' + window.__game.room.def.id + ' lowPower=' + window.__game.lowPower));
console.log('errors:', errors.join(' | ') || 'none');
await browser.close();
