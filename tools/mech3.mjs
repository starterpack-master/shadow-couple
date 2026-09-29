import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const ev = (f, a) => page.evaluate(f, a);
for (const id of ['2-1', '2-3']) {
  await page.goto(url + `?room=${id}&go&auto`); await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 20000 });
  const res = await ev(() => {
    const g = window.__game; g.frozen = true; const b = g.bearer, room = g.room, rot = room.rotors[0];
    const plates = room.triggers.filter((t) => t.constructor.name === 'MoonPlate' || t.gname === 'a' && t.x);
    const out = [];
    for (const mode of ['low', 'high']) for (let z = 0; z < room.H; z++) for (let x = 0; x < room.W; x++) {
      if (room.solidFor(x, z, 'bearer')) continue;
      b.pos.set(x + 0.5, z + 0.5);
      for (const P of plates) {
        b.face = b.faceT = Math.atan2(P.x - b.pos.x, P.z - b.pos.y); b.lantern.mode = mode; b.updateLight(0, true); b.syncMesh(0.016);
        let sh = 0, rng = 0;
        for (let i = 0; i < 72; i++) { rot.angle = (i / 72) * Math.PI * 2; rot.update(0); const e = g.exposure(P.x, P.z); if (e.inRange) { rng++; if (!e.lit) sh++; } }
        if (rng === 72 && sh > 0) out.push({ mode, x, z, plate: P.x + ',' + P.z, pct: Math.round((sh / 72) * 100) });
      }
    }
    out.sort((a, b) => b.pct - a.pct);
    return { n: out.length, best: out.slice(0, 6), fracPositionsOver20: out.filter((o) => o.pct >= 20).length };
  });
  console.log(id, JSON.stringify(res));
}
await browser.close();
