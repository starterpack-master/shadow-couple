import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url); await page.waitForTimeout(1200);
await page.screenshot({ path: 'tools/p_title.png' });
await page.tap('#goLocal'); await page.waitForTimeout(300);
await page.tap('#btnStart'); await page.waitForTimeout(2200);
await page.screenshot({ path: 'tools/p_prologue.png' });
const vis = await page.evaluate(() => { const n = document.querySelector('#narr'); const f = document.querySelector('#fade'); return { narrHidden: n.classList.contains('hidden'), narrZ: getComputedStyle(n).zIndex, fadeZ: getComputedStyle(f).zIndex, fadeOp: getComputedStyle(f).opacity, lines: n.innerText.slice(0, 40) }; });
console.log(JSON.stringify(vis));
for (let i = 0; i < 3; i++) { await page.waitForTimeout(1500); await page.tap('#narr', { force: true }).catch(() => page.mouse.click(400, 200)); }
await page.waitForTimeout(3500);
console.log('state after prologue:', await page.evaluate(() => window.__game.state + ' room=' + window.__game.roomIdx + ' cardHidden=' + document.querySelector('#card').classList.contains('hidden')));
await page.screenshot({ path: 'tools/p_after.png' });
console.log('ERR', errors.join('\n'));
await browser.close();
