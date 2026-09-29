import { Peer } from 'peerjs';

// 서버 없이 폰끼리 직접 연결 (WebRTC P2P).
// 처음 "만나는" 순간에만 PeerJS의 공개 무료 중계(시그널링)를 쓰고, 이후 게임 데이터는 두 폰이 직접 주고받아요.
const PREFIX = 'shadowcpl-v1-';
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.code = null;
    this.handlers = {};
    this.lastRecv = 0;
    this.rtt = 0;
    this.connected = false;
    this.hbTimer = null;
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, ...a) { for (const f of this.handlers[type] || []) { try { f(...a); } catch (e) { console.error(e); } } }

  // 방 만들기: 4자리 코드를 만들고 상대를 기다려요
  host() {
    this.role = 'host';
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = randomCode();
        const peer = new Peer(PREFIX + code, { debug: 0 });
        let opened = false;
        peer.on('open', () => {
          opened = true;
          this.peer = peer; this.code = code;
          resolve(code);
        });
        peer.on('connection', (conn) => {
          if (this.conn && this.conn.open) { try { this.conn.close(); } catch { /* ignore */ } }
          this.setupConn(conn);
        });
        peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
        peer.on('error', (err) => {
          if (!opened && err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
          if (!opened) reject(err);
          else this.emit('error', err);
        });
      };
      attempt();
    });
  }

  // 코드로 참가
  join(code) {
    this.role = 'guest';
    code = code.trim().toUpperCase();
    this.code = code;
    return new Promise((resolve, reject) => {
      const peer = this.peer || new Peer({ debug: 0 });
      this.peer = peer;
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')); } }, 15000);
      const go = () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); this.setupConn(conn); resolve(); });
        conn.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
      };
      if (peer.open) go(); else peer.on('open', go);
      peer.on('error', (err) => {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
        else this.emit('error', err);
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
    });
  }

  setupConn(conn) {
    this.conn = conn;
    const opened = () => {
      this.connected = true;
      this.lastRecv = performance.now();
      this.emit('connect');
      clearInterval(this.hbTimer);
      this.hbTimer = setInterval(() => {
        this.send({ t: 'ping', ts: performance.now() });
        const quiet = performance.now() - this.lastRecv;
        if (this.connected && quiet > 7000) { this.connected = false; this.emit('lost'); }
      }, 1000);
    };
    if (conn.open) opened(); else conn.on('open', opened);
    conn.on('data', (d) => {
      this.lastRecv = performance.now();
      if (!this.connected) { this.connected = true; this.emit('connect'); }
      if (d && d.t === 'ping') { this.send({ t: 'pong', ts: d.ts }); return; }
      if (d && d.t === 'pong') { this.rtt = performance.now() - d.ts; return; }
      this.emit('msg', d);
    });
    conn.on('close', () => { this.connected = false; this.emit('lost'); });
    conn.on('error', () => { this.connected = false; this.emit('lost'); });
  }

  send(obj) {
    const c = this.conn;
    if (c && c.open) { try { c.send(obj); } catch { /* ignore */ } }
  }

  // 연결이 끊겼을 때 참가자가 같은 코드로 다시 붙어요
  async rejoin() {
    if (this.role !== 'guest' || !this.code) return;
    try { await this.join(this.code); } catch { /* 다음 시도 */ }
  }

  destroy() {
    clearInterval(this.hbTimer);
    try { this.peer && this.peer.destroy(); } catch { /* ignore */ }
    this.peer = null; this.conn = null; this.connected = false;
  }
}
