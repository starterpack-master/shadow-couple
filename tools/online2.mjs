import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mk = async (tag) => { const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true }); const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(tag + ' ' + e.message + ' ' + (e.stack || '').split('\n')[1])); return p; };
const A = await mk('HOST'), B = await mk('GUEST');
await A.goto(url + '?auto'); await B.goto(url + '?auto');
await A.waitForTimeout(600);
await A.click('#goCreate'); await A.click('#title .role[data-role="1"]'); await A.fill('#nameMe', '서연'); await A.click('#btnHost');
await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#codeShow').textContent), null, { timeout: 20000 });
const code = await A.textContent('#codeShow');
await B.click('#goJoin'); await B.fill('#codeIn', code); await B.fill('#nameJoin', '민준'); await B.click('#btnJoin');
await A.waitForFunction(() => !document.querySelector('#btnHostStart').classList.contains('hidden'), null, { timeout: 25000 });
// 1-3 에서 시작 (index 2)
await A.evaluate(() => { const g = window.__game; g.net.send({ t: 'start' }); g.quiz = []; g.startGame(2, false); });
await A.waitForFunction(() => window.__game.state === 'play' && window.__game.roomIdx === 2, null, { timeout: 40000 });
await B.waitForFunction(() => window.__game.state === 'play' && window.__game.roomIdx === 2, null, { timeout: 40000 });
const H = (f) => A.evaluate(f), G = (f) => B.evaluate(f);
console.log('roles host/guest:', await H(() => window.__game.myRole), await G(() => window.__game.myRole), 'names', JSON.stringify(await G(() => window.__game.ui.names)));
// guest (bearer) toggles height with Q
await B.keyboard.press('KeyQ'); await A.waitForTimeout(700);
console.log('lantern mode host/guest:', await H(() => window.__game.bearer.lantern.mode), await G(() => window.__game.bearer.lantern.mode));
await B.keyboard.press('KeyQ'); await A.waitForTimeout(400);
// guest pushes crate: put own bearer left of crate, hold right
await G(() => { const b = window.__game.bearer; b.pos.set(6.3, 3.5); b.face = b.faceT = Math.PI / 2; });
await B.keyboard.down('ArrowRight'); await B.waitForTimeout(2600); await B.keyboard.up('ArrowRight');
await A.waitForTimeout(800);
console.log('crate on host:', JSON.stringify(await H(() => { const c = window.__game.room.crates[0]; return { tx: c.tx, state: c.state }; })), 'guest view:', JSON.stringify(await G(() => { const c = window.__game.room.crates[0]; return { tx: c.tx, state: c.state, filled: window.__game.room.filled[3][9] }; })));
// memory pickup by host's shade -> photo + dialogue on both
await H(() => { const g = window.__game; const m = g.room.memory; g.shade.pos.set(m.x, m.z); });
await A.waitForFunction(() => window.__game.room.memory.taken, null, { timeout: 10000 });
await A.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 });
console.log('memory taken; guest sees taken:', await G(() => window.__game.room.memory.taken), 'guest objective:', await G(() => document.querySelector('#objective').textContent));
// exit: both on E tiles (guest moves own bearer, host moves own shade)
await G(() => { window.__game.bearer.pos.set(19.5, 2.5); });
await H(() => { window.__game.shade.pos.set(20.5, 3.5); window.__game.room.doors.forEach((d) => { d.latched = true; }); });
await A.waitForFunction(() => window.__game.roomIdx === 3 && window.__game.state === 'play', null, { timeout: 60000 });
await B.waitForFunction(() => window.__game.roomIdx === 3, null, { timeout: 20000 });
console.log('moved to room', await H(() => window.__game.room.def.id), '/ guest', await G(() => window.__game.room.def.id), '| quiz saved:', JSON.stringify(await H(() => window.__game.quiz)));
await A.screenshot({ path: 'tools/on2_host.png' }); await B.screenshot({ path: 'tools/on2_guest.png' });
console.log('ERRORS:', [...A.errors, ...B.errors].slice(0, 12).join('\n') || 'none');
await browser.close();
