import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const ev = (f, a) => page.evaluate(f, a);
async function open(id) { await page.goto(url + `?room=${id}&go&auto`); await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 20000 }); await page.waitForTimeout(300); }
await open('2-1');
for (const [bx, bz, mode] of [[15.5, 9.5, 'low'], [2.5, 5.5, 'low'], [9.5, 9.5, 'high']]) {
  const r = await ev(([bx, bz, mode]) => {
    const g = window.__game; g.frozen = true; const b = g.bearer; b.pos.set(bx, bz); b.face = b.faceT = Math.atan2(11.5 - bx, 7.5 - bz); b.lantern.mode = mode; b.updateLight(0, true); b.syncMesh(0.016);
    const rot = g.room.rotors[0]; let out = '';
    for (let i = 0; i < 48; i++) { rot.angle = (i / 48) * Math.PI * 2; rot.update(0); const e1 = g.exposure(11.5, 7.5), e2 = g.exposure(7.5, 3.5); out += (e1.inRange ? (e1.lit ? 'L' : '.') : 'x') + (e2.inRange ? (e2.lit ? 'L' : '.') : 'x') + ' '; }
    return out;
  }, [bx, bz, mode]);
  console.log(`2-1 bearer(${bx},${bz},${mode}) plates[1: (11,7) 2:(7,3)] over rotor angle:\n  ${r}`);
}
await open('5-2');
const r2 = await ev(() => {
  const g = window.__game; g.frozen = true; const bm = g.room.beam; let out = '';
  for (let i = 0; i < 48; i++) { bm.angle = (i / 48) * Math.PI * 2; bm.update(0); const e = g.exposure(16.5, 2.5), f = g.exposure(10.5, 2.5); out += (e.lit ? 'L' : '.') + (f.lit ? 'L' : '.') + ' '; }
  return out;
});
console.log('5-2 beam over angle at (16.5,2.5) and (10.5,2.5):\n  ' + r2);
await open('1-2');
const r3 = await ev(() => {
  const g = window.__game; g.frozen = true; const b = g.bearer; let out = '';
  for (let x = 1; x <= 8; x++) { let row = ''; for (let z = 1; z <= 4; z++) { b.pos.set(x + 0.5, z + 0.5); b.face = b.faceT = Math.PI / 2; b.updateLight(0, true); b.syncMesh(0.016); const e = g.exposure(7.5, 8.5); row += e.inRange ? (e.lit ? 'L' : '.') : 'x'; } out += `x${x}:${row} `; }
  return out;
});
console.log('1-2 plate exposure by bearer position (z=1..4, facing east):\n  ' + r3);
console.log('ERR', errors.join('\n'));
await browser.close();
