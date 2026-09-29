// 추억 폴라로이드 (SVG 일러스트). 사진 속엔 늘 1P 혼자 — 사진을 찍은 건 누구였을까?
const person = (x, y, s, opts = {}) => {
  const body = opts.body || '#f1e4cc', hair = opts.hair || '#4a3226', scarf = opts.scarf || '#e0474c';
  const arm = opts.wave ? `<path d="M${x + 16 * s} ${y - 30 * s} q ${14 * s} ${-18 * s} ${10 * s} ${-34 * s}" stroke="${body}" stroke-width="${6 * s}" stroke-linecap="round" fill="none"/>` : '';
  const eyes = opts.sleep
    ? `<path d="M${x - 7 * s} ${y - 58 * s} q ${3 * s} ${3 * s} ${6 * s} 0 M${x + 2 * s} ${y - 58 * s} q ${3 * s} ${3 * s} ${6 * s} 0" stroke="#3a2a2a" stroke-width="${1.6 * s}" fill="none"/>`
    : `<circle cx="${x - 5 * s}" cy="${y - 58 * s}" r="${1.8 * s}" fill="#2a1f1f"/><circle cx="${x + 6 * s}" cy="${y - 58 * s}" r="${1.8 * s}" fill="#2a1f1f"/>
       <path d="M${x - 4 * s} ${y - 51 * s} q ${4.5 * s} ${4 * s} ${9 * s} 0" stroke="#7a3a3a" stroke-width="${1.4 * s}" fill="none" stroke-linecap="round"/>`;
  return `<g>
    ${arm}
    <path d="M${x - 20 * s} ${y} Q ${x - 18 * s} ${y - 30 * s} ${x - 9 * s} ${y - 40 * s} L ${x + 9 * s} ${y - 40 * s} Q ${x + 18 * s} ${y - 30 * s} ${x + 20 * s} ${y} Z" fill="${body}"/>
    <ellipse cx="${x}" cy="${y - 40 * s}" rx="${11 * s}" ry="${4 * s}" fill="${scarf}"/>
    <circle cx="${x}" cy="${y - 57 * s}" r="${16 * s}" fill="#ffe2cc"/>
    <path d="M${x - 16 * s} ${y - 58 * s} Q ${x - 15 * s} ${y - 76 * s} ${x} ${y - 75 * s} Q ${x + 16 * s} ${y - 76 * s} ${x + 16 * s} ${y - 60 * s} Q ${x + 6 * s} ${y - 70 * s} ${x - 16 * s} ${y - 58 * s} Z" fill="${hair}"/>
    <circle cx="${x - 10 * s}" cy="${y - 52 * s}" r="${3 * s}" fill="#ff9aa2" opacity=".55"/><circle cx="${x + 10 * s}" cy="${y - 52 * s}" r="${3 * s}" fill="#ff9aa2" opacity=".55"/>
    ${eyes}
  </g>`;
};

const wrap = (inner, defs = '', filter = '') =>
  `<svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><defs>${defs}
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  <radialGradient id="vig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".35"/></radialGradient>
  </defs><g ${filter}>${inner}</g><rect width="320" height="240" fill="url(#vig)"/><rect width="320" height="240" filter="url(#grain)" opacity=".8"/></svg>`;

function petals(n, seed) {
  let s = seed, out = '';
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const x = r() * 320, y = r() * 230;
    out += `<ellipse cx="${x}" cy="${y}" rx="${2 + r() * 2.5}" ry="${1.2 + r() * 1.2}" fill="#ffc7d9" opacity="${0.6 + r() * 0.4}" transform="rotate(${r() * 180} ${x} ${y})"/>`;
  }
  return out;
}

export const MEMORIES = {
  m1: {
    title: '처음 만난 날',
    caption: '우산도 없이 벚꽃 아래서 웃던 너. 그날, 반했어.',
    svg: () => wrap(`
      <rect width="320" height="240" fill="url(#sky1)"/>
      <rect y="185" width="320" height="55" fill="#b9a7a0"/>
      <rect x="205" y="70" width="100" height="8" rx="3" fill="#6d7a8a"/>
      <rect x="212" y="78" width="5" height="108" fill="#6d7a8a"/><rect x="293" y="78" width="5" height="108" fill="#6d7a8a"/>
      <rect x="222" y="95" width="66" height="60" fill="#dfe8f0" opacity=".5"/>
      <rect x="226" y="160" width="58" height="8" rx="2" fill="#8a6a5a"/>
      <rect x="236" y="100" width="38" height="16" rx="3" fill="#3b6fb6"/><text x="255" y="112" font-size="10" text-anchor="middle" fill="#fff" font-family="sans-serif">정류장</text>
      <path d="M40 190 Q 48 140 44 100" stroke="#6a4a3a" stroke-width="9" fill="none"/>
      <path d="M44 120 Q 70 110 88 96" stroke="#6a4a3a" stroke-width="5" fill="none"/>
      ${[[20, 80, 34], [60, 70, 38], [96, 88, 30], [38, 108, 26], [82, 110, 24], [8, 110, 22]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffc2d6"/><circle cx="${x - 6}" cy="${y - 6}" r="${r * 0.6}" fill="#ffd6e4"/>`).join('')}
      ${person(150, 196, 1.25)}
      ${petals(34, 11)}`,
      `<linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9e6"/><stop offset=".7" stop-color="#ffeedd"/><stop offset="1" stop-color="#fff6e8"/></linearGradient>`),
  },
  m2: {
    title: '첫 데이트',
    caption: '무섭다면서 회전목마를 세 번이나 탄 너.',
    svg: () => wrap(`
      <rect width="320" height="240" fill="url(#sky2)"/>
      ${Array.from({ length: 16 }, (_, i) => `<circle cx="${10 + i * 20}" cy="${16 + (i % 2) * 5}" r="3" fill="#ffe08f"/>`).join('')}
      <path d="M40 60 L160 18 L280 60 Z" fill="#e2577f"/>
      ${Array.from({ length: 8 }, (_, i) => `<path d="M${40 + i * 30} 60 q 15 14 30 0" fill="${i % 2 ? '#fff0f4' : '#e2577f'}"/>`).join('')}
      ${[70, 125, 195, 250].map((x) => `<rect x="${x}" y="62" width="4" height="140" fill="#e8c890"/>`).join('')}
      <rect x="30" y="200" width="260" height="14" rx="6" fill="#c0507a"/>
      <rect y="214" width="320" height="26" fill="#3a2848"/>
      <g transform="translate(160 176)"><ellipse cx="0" cy="0" rx="34" ry="14" fill="#fff4e6"/><circle cx="30" cy="-14" r="11" fill="#fff4e6"/><rect x="-24" y="8" width="5" height="20" fill="#fff4e6"/><rect x="18" y="8" width="5" height="20" fill="#fff4e6"/><path d="M36 -22 q 8 -2 6 8" stroke="#e2577f" stroke-width="4" fill="none"/></g>
      ${person(158, 170, 1.0, { wave: true })}
      <rect x="159" y="62" width="3" height="94" fill="#e8c890"/>
      <circle cx="60" cy="120" r="18" fill="#ffe08f" opacity=".25"/><circle cx="270" cy="130" r="22" fill="#ffe08f" opacity=".2"/>`,
      `<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f4a"/><stop offset="1" stop-color="#7a4a8a"/></linearGradient>`),
  },
  m3: {
    title: '우리 집',
    caption: '영화 시작 10분 만에 잠든 너. 코코아는 두 잔이었는데.',
    svg: () => wrap(`
      <rect width="320" height="240" fill="#d99a6a"/>
      <rect x="18" y="20" width="84" height="70" rx="4" fill="#2b3a6b"/><circle cx="80" cy="40" r="9" fill="#fff2c0"/><path d="M60 20 v70 M18 55 h84" stroke="#b07a52" stroke-width="4"/>
      <rect x="220" y="40" width="84" height="58" rx="4" fill="#1d2440"/><rect x="226" y="46" width="72" height="46" fill="#7fb6ff" opacity=".85"/>
      <path d="M226 46 L298 92 L226 92 Z" fill="#fff" opacity=".12"/>
      <rect y="185" width="320" height="55" fill="#8a5a3a"/>
      <rect x="30" y="118" width="190" height="70" rx="22" fill="#6a8a9a"/>
      <rect x="22" y="104" width="206" height="36" rx="18" fill="#7a9aaa"/>
      <path d="M50 150 Q 120 118 200 146 L 204 176 L 46 176 Z" fill="#f2d7a8"/>
      ${person(82, 168, 0.85, { sleep: true }).replace('<g>', '<g transform="rotate(-72 82 150)">')}
      <text x="140" y="118" font-size="16" fill="#fff" opacity=".85" font-family="serif">z z</text>
      <rect x="200" y="176" width="100" height="10" rx="3" fill="#5a3a26"/>
      <g transform="translate(222 158)"><rect width="16" height="18" rx="3" fill="#fff"/><path d="M16 5 q 7 4 0 9" stroke="#fff" stroke-width="3" fill="none"/><path d="M5 -4 q 3 -6 0 -12 M11 -4 q 3 -6 0 -12" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/></g>
      <g transform="translate(252 158)"><rect width="16" height="18" rx="3" fill="#ff9fc8"/><path d="M16 5 q 7 4 0 9" stroke="#ff9fc8" stroke-width="3" fill="none"/><path d="M5 -4 q 3 -6 0 -12 M11 -4 q 3 -6 0 -12" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/></g>`),
  },
  m4: {
    title: '그날 밤',
    caption: '우산을 들고 쫓아갔는데. 조금만, 조금만 더 빨랐더라면.',
    torn: true,
    svg: () => wrap(`
      <rect width="320" height="240" fill="#141b2e"/>
      <rect y="170" width="320" height="70" fill="#1f2638"/>
      <circle cx="120" cy="140" r="70" fill="url(#hl)"/><circle cx="215" cy="140" r="70" fill="url(#hl)"/>
      <circle cx="120" cy="140" r="12" fill="#fffbe8"/><circle cx="215" cy="140" r="12" fill="#fffbe8"/>
      ${Array.from({ length: 70 }, (_, i) => `<line x1="${(i * 47) % 320}" y1="${(i * 29) % 240}" x2="${((i * 47) % 320) - 6}" y2="${((i * 29) % 240) + 22}" stroke="#a9c1ee" stroke-width="1" opacity=".45"/>`).join('')}
      <g transform="translate(70 205) rotate(-18)"><path d="M0 0 A 34 34 0 0 1 68 0 Q 59 -6 51 0 Q 42 -6 34 0 Q 25 -6 17 0 Q 8 -6 0 0 Z" fill="#ff9fc8"/><path d="M34 0 v 22 q 0 6 -6 6" stroke="#ddd" stroke-width="3" fill="none"/></g>
      <ellipse cx="170" cy="215" rx="80" ry="6" fill="#fff" opacity=".08"/>`,
      `<radialGradient id="hl"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset=".3" stop-color="#ffe7a0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></radialGradient>`,
      'style="filter:saturate(.55)"'),
  },
  m5: {
    title: '약속',
    caption: '다음엔 등대 보러 가자. 꼭, 같이.',
    svg: () => wrap(`
      <rect width="320" height="240" fill="url(#sky5)"/>
      <circle cx="110" cy="112" r="30" fill="#fff0c8" opacity=".95"/>
      <rect y="118" width="320" height="50" fill="#5a6aa0"/>
      ${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 34} ${128 + (i % 3) * 10} q 10 -4 20 0" stroke="#ffd0b0" stroke-width="2" fill="none" opacity=".6"/>`).join('')}
      <rect x="92" y="120" width="36" height="46" fill="#ffe0b0" opacity=".35"/>
      <g transform="translate(250 40)"><path d="M-12 110 L-7 20 L7 20 L12 110 Z" fill="#f4efe6"/><rect x="-9" y="40" width="18" height="12" fill="#d9463f"/><rect x="-10" y="72" width="20" height="12" fill="#d9463f"/><rect x="-10" y="8" width="20" height="14" fill="#333"/><circle cx="0" cy="14" r="5" fill="#fff6c0"/><path d="M-10 6 L0 -4 L10 6 Z" fill="#d9463f"/><circle cx="0" cy="14" r="26" fill="#fff6c0" opacity=".25"/></g>
      <rect y="166" width="320" height="74" fill="#f0c9a0"/>
      <path d="M118 240 L 150 176 L 162 176 L 146 240 Z" fill="#6a4a5a" opacity=".55"/>
      <path d="M186 240 L 172 176 L 184 176 L 214 240 Z" fill="#6a4a5a" opacity=".55"/>
      <path d="M160 196 q -6 -8 0 -12 q 6 4 0 12 z" fill="#ff8fb0" opacity=".7"/>`,
      `<linearGradient id="sky5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a4a9a"/><stop offset=".5" stop-color="#ff9a7a"/><stop offset="1" stop-color="#ffd0a0"/></linearGradient>`),
  },
};
