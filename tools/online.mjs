import { chromium } from 'playwright';
const url = 'file:///projects/sandbox/shadow-couple/dist/index.html';
const hostRole = process.argv[2] === 'shade' ? 1 : 0;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(tag + ' PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(tag + ' console ' + m.text()); });
  return p;
};
const A = await mk('HOST'), B = await mk('GUEST');
await A.goto(url + '?auto'); await B.goto(url + '?auto');
await A.waitForTimeout(800);
await A.click('#goCreate');
await A.click(`#title .role[data-role="${hostRole}"]`);
await A.fill('#nameMe', '민준');
await A.click('#btnHost');
await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#codeShow').textContent), null, { timeout: 20000 });
const code = await A.textContent('#codeShow');
console.log('room code:', code);
await B.click('#goJoin');
await B.fill('#codeIn', code); await B.fill('#nameJoin', '서연');
const t0 = Date.now();
await B.click('#btnJoin');
await A.waitForFunction(() => !document.querySelector('#btnHostStart').classList.contains('hidden'), null, { timeout: 25000 });
console.log('connected in', Date.now() - t0, 'ms; host status:', await A.textContent('#hostStatus'), '| guest status:', await B.textContent('#joinStatus'));
await A.click('#btnHostStart');
try { await A.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 }); }
catch (e) {
  const d = (p) => p.evaluate(() => { const g = window.__game; return { state: g.state, mode: g.mode, my: g.myRole, cur: g.curUI, room: g.roomIdx, dialog: !document.querySelector('#dialog').classList.contains('hidden') && document.querySelector('#dialog .text').textContent, choice: !document.querySelector('#choice').classList.contains('hidden'), narr: !document.querySelector('#narr').classList.contains('hidden'), card: !document.querySelector('#card').classList.contains('hidden'), wait: document.querySelector('#waitNote').className, pend: !!g.pendingChoice }; });
  console.log('HOST dbg', JSON.stringify(await d(A))); console.log('GUEST dbg', JSON.stringify(await d(B)));
  console.log('ERRORS:', [...A.errors, ...B.errors].slice(0, 12).join('\n') || 'none');
  process.exit(1);
}
await B.waitForFunction(() => window.__game.state === 'play' && window.__game.room, null, { timeout: 40000 });
const info = async (p) => p.evaluate(() => { const g = window.__game; return { mode: g.mode, my: g.myRole, room: g.room?.def.id, b: [+g.bearer.pos.x.toFixed(2), +g.bearer.pos.y.toFixed(2)], s: [+g.shade.pos.x.toFixed(2), +g.shade.pos.y.toFixed(2)], names: g.ui.names, rtt: Math.round(g.net?.rtt || 0) }; });
console.log('HOST ', JSON.stringify(await info(A)));
console.log('GUEST', JSON.stringify(await info(B)));
// guest moves own character (arrow right) for 1.2s, host moves own (D) for 1.2s
await B.bringToFront(); await B.keyboard.down('ArrowRight'); await B.waitForTimeout(1200); await B.keyboard.up('ArrowRight');
await A.keyboard.down('KeyS'); await A.waitForTimeout(800); await A.keyboard.up('KeyS');
await A.waitForTimeout(900);
console.log('after moves:');
console.log('HOST ', JSON.stringify(await info(A)));
console.log('GUEST', JSON.stringify(await info(B)));
// heart emote from guest
await B.keyboard.press('KeyH'); await A.waitForTimeout(400);
console.log('host sees emotes:', await A.evaluate(() => window.__game.emotes.list.length));
await A.screenshot({ path: 'tools/on_host.png' }); await B.screenshot({ path: 'tools/on_guest.png' });
console.log('ERRORS:', [...A.errors, ...B.errors].slice(0, 12).join('\n') || 'none');
await browser.close();
