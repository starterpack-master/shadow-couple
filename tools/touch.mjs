import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '?room=1-1&go&auto');
await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 20000 });
const cdp = await ctx.newCDPSession(page);
const pos0 = await page.evaluate(() => { const g = window.__game; return [g.bearer.pos.x, g.bearer.pos.y, g.shade.pos.x, g.shade.pos.y]; });
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
await T('touchStart', [{ x: 150, y: 250, id: 1 }, { x: 650, y: 250, id: 2 }]);
for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: 150 + i * 8, y: 250, id: 1 }, { x: 650, y: 250 - i * 8, id: 2 }]); await page.waitForTimeout(60); }
await page.waitForTimeout(1500);
const mid = await page.evaluate(() => { const g = window.__game; return [g.bearer.pos.x, g.bearer.pos.y, g.shade.pos.x, g.shade.pos.y, document.querySelector('#joy0').classList.contains('on'), document.querySelector('#joy1').classList.contains('on')]; });
await T('touchEnd', []);
// dash button tap
const b = await page.evaluate(() => { const r = document.querySelector('#btnP2A').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, !document.querySelector('#btnP2A').classList.contains('hidden')]; });
console.log('bearer moved right:', (mid[0] - pos0[0]).toFixed(2), 'bearer dz:', (mid[1] - pos0[1]).toFixed(2), '| shade dx:', (mid[2] - pos0[2]).toFixed(2), 'shade moved up (dz):', (mid[3] - pos0[3]).toFixed(2), '| joysticks shown:', mid[4], mid[5]);
console.log('dash button visible in 1-1 (should be false):', b[2]);
console.log('ERR', errors.join('\n'));
await browser.close();
