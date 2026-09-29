import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a);
const sleep = (ms) => page.waitForTimeout(ms);
async function open(id) {
  await page.goto(url + `?room=${id}&go&auto`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 20000 });
  await sleep(300);
}
const put = (who, x, z) => ev(([w, x, z]) => { const g = window.__game; const o = w === 'b' ? g.bearer : g.shade; o.pos.set(x, z); if (w === 's') o.lastSafe.set(x, z); }, [who, x, z]);
const log = (...a) => console.log(...a);

// ---- 1-1: exposure logic
await open('1-1');
log('1-1 start exposure (shade behind bearer):', JSON.stringify(await ev(() => { const g = window.__game; return g.exposure(g.shade.pos.x, g.shade.pos.y); })));
await put('s', 5.5, 5.5); await put('b', 2.5, 5.5);
await ev(() => { window.__game.bearer.faceT = Math.PI / 2; window.__game.bearer.face = Math.PI / 2; });
await sleep(200);
log('1-1 shade in open light:', JSON.stringify(await ev(() => { const g = window.__game; return { e: g.exposure(g.shade.pos.x, g.shade.pos.y), hp: g.shade.hp }; })));
await sleep(1200);
log('1-1 hp after 1.4s in light:', await ev(() => window.__game.shade.hp.toFixed(2), 'state', ));
// shade behind pillar p at (7,2): light from west at (2.5+..,5.5)... put shade east of pillar (7,4) -> (8.5,4.5) with bearer at (4.5,4.5) facing east
await put('b', 4.5, 4.5); await put('s', 8.5, 4.5); await sleep(300);
log('1-1 shade behind pillar:', JSON.stringify(await ev(() => { const g = window.__game; return g.exposure(g.shade.pos.x, g.shade.pos.y); })));
await put('b', 17.5, 3.5); await put('s', 18.5, 4.5); await ev(() => { window.__game.shade.hp = 1; });
await sleep(1500);
log('1-1 -> after exit, roomIdx:', await ev(() => window.__game.roomIdx));

// ---- 1-2: moon plate + door
await open('1-2');
await put('s', 7.5, 8.5); await put('b', 8.3, 2.5);
await ev(() => { const b = window.__game.bearer; b.faceT = b.face = Math.PI / 2; });
await sleep(900);
log('1-2 plate exposure:', JSON.stringify(await ev(() => { const g = window.__game; return g.exposure(7.5, 8.5); })), 'door open:', await ev(() => window.__game.room.doors[0].open.toFixed(2)));
await put('b', 11.5, 2.5); await sleep(300);
await put('s', 13.5, 6.5); await sleep(1500);
log('1-2 door after shade leaves:', await ev(() => window.__game.room.doors[0].open.toFixed(2)));

// ---- 1-3: crate push into hole, weight plate, flower
await open('1-3');
await put('b', 6.3, 3.5);
await page.keyboard.down('KeyD'); await sleep(2200); await page.keyboard.up('KeyD');
log('1-3 crate:', JSON.stringify(await ev(() => { const c = window.__game.room.crates[0]; return { tx: c.tx, tz: c.tz, state: c.state, filled: window.__game.room.filled[3][9], bearerX: window.__game.bearer.pos.x.toFixed(2) }; })));
await put('b', 15.5, 7.5); await sleep(700);
log('1-3 weight plate -> door A open:', await ev(() => window.__game.room.doors.map((d) => d.gname + ':' + d.open.toFixed(2)).join(' ')));
await put('b', 15.5, 10.6);
await ev(() => { const b = window.__game.bearer; b.faceT = b.face = 0; b.lantern.mode = 'low'; });
await sleep(1200);
log('1-3 flower with LOW lantern:', await ev(() => window.__game.room.flowers[0].active));
await ev(() => { window.__game.bearer.lantern.mode = 'high'; });
await sleep(1500);
log('1-3 flower with HIGH lantern:', await ev(() => window.__game.room.flowers[0].active), 'doors:', await ev(() => window.__game.room.doors.map((d) => d.gname + ':' + d.open.toFixed(2)).join(' ')));

// ---- 2-1 rotor shadows sweep plate: sample exposure of plate over time with bearer outside
await open('2-1');
await put('b', 2.5, 7.5);
await ev(() => { const b = window.__game.bearer; b.faceT = b.face = Math.PI / 2; });
const samples = [];
for (let i = 0; i < 12; i++) { samples.push(await ev(() => window.__game.exposure(11.5, 7.5).lit ? 'L' : 's')); await sleep(250); }
log('2-1 plate lit timeline:', samples.join(''));

// ---- 3-1 pedestal placement
await open('3-1');
await put('b', 9.5, 3.5); await sleep(200);
await page.keyboard.press('KeyE'); await sleep(400);
log('3-1 lantern placed:', JSON.stringify(await ev(() => { const L = window.__game.bearer.lantern; return { held: L.held, kind: L.placed?.kind, R: window.__game.bearer.light.R.toFixed(1) }; })));
await put('b', 3.5, 8.5); await put('s', 19.5, 4.5); await sleep(1500);
log('3-1 moon plate lit?', JSON.stringify(await ev(() => window.__game.exposure(19.5, 4.5))), 'door C:', await ev(() => window.__game.room.doors[0].open.toFixed(2)), 'hp', await ev(() => window.__game.shade.hp.toFixed(2)));

// ---- 4-2 hollows burn in light
await open('4-2');
await ev(() => { const g = window.__game; const h = g.room.hollows[0]; h.pos.set(5.5, 3.5); const b = g.bearer; b.pos.set(3.5, 3.5); b.faceT = b.face = Math.PI / 2; g.shade.pos.set(1.5, 7.5); });
await sleep(1800);
log('4-2 hollow state after light:', await ev(() => window.__game.room.hollows.map((h) => h.state + ':' + h.hp.toFixed(2)).join(' ')));

// ---- 5-2 beam
await open('5-2');
const bs = [];
for (let i = 0; i < 12; i++) { bs.push(await ev(() => window.__game.exposure(16.5, 4.5).lit ? 'L' : 's')); await sleep(300); }
log('5-2 beam lit timeline at (16.5,4.5):', bs.join(''));

log('ERRORS:', errors.slice(0, 10).join('\n'));
await browser.close();
