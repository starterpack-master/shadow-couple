import { ROOMS } from '../src/levels.js';
const BASE_SOLID = new Set(['#',' ','p','b','P','r','X','G','g']);
for (const R of ROOMS) {
  const rows = R.map; const H = rows.length; const W = Math.max(...rows.map(r=>r.length));
  const g = rows.map(r=>r.padEnd(W,' ').split(''));
  const legend = R.legend||{};
  const errs = [];
  const widths = new Set(rows.filter(r=>r.trim()).map(r=>r.length));
  const find = (c)=>{ const out=[]; for(let z=0;z<H;z++)for(let x=0;x<W;x++) if(g[z][x]===c) out.push([x,z]); return out; };
  const solid = (x,z,who)=>{
    if(x<0||z<0||x>=W||z>=H) return true;
    const c=g[z][x];
    if (BASE_SOLID.has(c)) return true;
    if (legend[c]?.t==='flower') return true;
    if (c==='|' && who==='bearer') return true;
    return false; // holes filled, doors open, crates ignored
  };
  const bfs = (sx,sz,who)=>{ const seen=new Set([sx+','+sz]); const q=[[sx,sz]]; while(q.length){const [x,z]=q.shift(); for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,k=nx+','+nz; if(seen.has(k)||solid(nx,nz,who)) continue; seen.add(k); q.push([nx,nz]);}} return seen; };
  const [L]=find('L'), [S]=find('S');
  if(!L||!S){ errs.push('missing L/S'); }
  const rb = bfs(L[0],L[1],'bearer'), rs = bfs(S[0],S[1],'shade');
  const E = find('E');
  if (!R.final) {
    if(!E.length) errs.push('no exit');
    if(!E.some(([x,z])=>rb.has(x+','+z))) errs.push('exit unreachable for bearer');
    if(!E.some(([x,z])=>rs.has(x+','+z))) errs.push('exit unreachable for shade');
  }
  for (const [c,d] of Object.entries(legend)) {
    const pos = find(c);
    if (!pos.length) errs.push(`legend ${c} not on map`);
    for (const [x,z] of pos) {
      if (d.t==='moon' && !rs.has(x+','+z)) errs.push(`moon ${c}@${x},${z} unreachable by shade`);
      if (d.t==='weight' && !rb.has(x+','+z)) errs.push(`weight ${c}@${x},${z} unreachable by bearer (crate?)`);
      if (d.t==='door' && !(rb.has(x+','+z)||rs.has(x+','+z))) errs.push(`door ${c}@${x},${z} unreachable`);
    }
  }
  for (const [x,z] of find('m')) if(!rb.has(x+','+z)&&!rs.has(x+','+z)) errs.push('memory unreachable');
  for (const [x,z] of find('P')) { if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>rb.has((x+dx)+','+(z+dz)))) errs.push('pedestal unreachable'); }
  console.log(R.id.padEnd(4), W+'x'+H, errs.length? 'ERR: '+errs.join('; ') : 'ok', widths.size>1? ' (row widths vary: '+[...widths].join(',')+')':'');
}
