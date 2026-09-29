import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a);
await page.goto(url + '?auto');
await page.waitForTimeout(800);
await page.fill('#nameA', '민준'); await page.fill('#nameB', '서연');
await page.click('#btnStart');
for (let i = 0; i < 14; i++) {
  await page.waitForFunction((i) => window.__game?.state === 'play' && window.__game.roomIdx === i, i, { timeout: 30000 });
  // 방 클리어 흉내: memory 가 있으면 먼저 줍기 이벤트
  await ev(() => { const g = window.__game; if (g.room.memory && !g.room.memory.hidden) { g.room.memory.x = g.bearer.pos.x; g.room.memory.z = g.bearer.pos.y; } });
  await page.waitForTimeout(600);
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 });
  await ev(() => window.__game.completeRoom());
  console.log('cleared', await ev(() => window.__game.room.def.id));
}
await page.waitForFunction(() => window.__game?.state === 'play' && window.__game.roomIdx === 14, null, { timeout: 30000 });
await ev(() => { const g = window.__game; for (const h of g.room.hollows) h.kill(); });
await page.waitForTimeout(1500);
await ev(() => { const g = window.__game; const m = g.room.memory; m.x = g.bearer.pos.x; m.z = g.bearer.pos.y; });
await page.waitForTimeout(1500);
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 });
console.log('lamp ready', await ev(() => window.__game.room.lamp.ready));
await ev(() => { const g = window.__game; g.bearer.pos.set(g.room.lamp.x, g.room.lamp.z + 2.2); });
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !document.querySelector('#ending').classList.contains('hidden'), null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/projects/sandbox/shadow-couple/tools/shot_ending.png' });
console.log('ending text:', await ev(() => document.querySelector('#ending').innerText.replace(/\n+/g, ' | ')));
console.log('ERRORS:', errors.slice(0, 10).join('\n'));
await browser.close();
