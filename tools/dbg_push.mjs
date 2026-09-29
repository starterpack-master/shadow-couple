import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
await page.goto(url + '?room=1-3&go&auto');
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 20000 });
await page.waitForTimeout(300);
await page.evaluate(() => { const b = window.__game.bearer; b.pos.set(6.3, 3.5); });
await page.keyboard.down('KeyD');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(400);
  console.log(await page.evaluate(() => { const g = window.__game, b = g.bearer, c = g.room.crates[0]; return `b=(${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)}) pushT=${b.pushT.toFixed(2)} crate=${c.tx},${c.tz} ${c.state} ax=${g.input.p[0].ax} frozen=${g.frozen} state=${g.state}`; }));
}
await page.keyboard.up('KeyD');
await browser.close();
