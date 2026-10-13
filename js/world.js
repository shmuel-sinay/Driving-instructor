'use strict';
// ===== עולם: מפת הכבישים והגיאומטריה =====
// יחידות: מטרים. ציר y כלפי מטה (כמו במסך). תנועה בצד ימין (ישראל).

const LW = 3.5;          // רוחב נתיב
const SIDEWALK = 2.6;    // רוחב מדרכה
const RB_OUT = 19;       // רדיוס חיצוני של כיכר
const RB_IN = 8.5;       // רדיוס אי התנועה
const RB_RING = (RB_OUT + RB_IN) / 2;

const NODE_DEF = {
  A: { x: 0,   y: 0,   type: 'plain' },
  B: { x: 230, y: 0,   type: 'priority', minor: { 'B-F': 'stop' } },
  C: { x: 460, y: 0,   type: 'light', offset: 0 },
  D: { x: 690, y: 0,   type: 'plain' },
  E: { x: 0,   y: 210, type: 'priority', minor: { 'F-E': 'yield' } },
  F: { x: 230, y: 210, type: 'light', offset: 9 },
  G: { x: 460, y: 210, type: 'roundabout' },
  H: { x: 690, y: 210, type: 'allstop' },
  I: { x: 0,   y: 420, type: 'plain' },
  J: { x: 230, y: 420, type: 'priority', minor: { 'F-J': 'stop' } },
  K: { x: 460, y: 420, type: 'light', offset: 20 },
  L: { x: 690, y: 420, type: 'plain' },
};

// nf = נתיבים בכיוון a→b, nb = נתיבים בכיוון b→a, lim = מהירות מותרת
const EDGE_DEF = [
  ['A', 'B', { nf: 1, nb: 1, lim: 50, name: 'רחוב הרצל' }],
  ['B', 'C', { nf: 2, nb: 2, lim: 60, name: 'שדרות בן גוריון' }],
  ['C', 'D', { nf: 1, nb: 1, lim: 50, name: 'רחוב ויצמן' }],
  ['A', 'E', { nf: 1, nb: 1, lim: 30, name: 'רחוב הגפן (אזור מגורים)', cross: [105] }],
  ['E', 'I', { nf: 1, nb: 1, lim: 50, name: 'רחוב הזית' }],
  ['B', 'F', { nf: 1, nb: 1, lim: 40, name: 'רחוב התאנה' }],
  ['C', 'G', { nf: 2, nb: 2, lim: 50, name: 'דרך השלום' }],
  ['D', 'H', { nf: 1, nb: 1, lim: 70, name: 'דרך הים', pass: true }],
  ['F', 'E', { nf: 2, nb: 0, lim: 50, name: 'רחוב יפו (חד-סטרי)' }],
  ['F', 'G', { nf: 2, nb: 2, lim: 60, name: 'שדרות רוטשילד', cross: [115] }],
  ['G', 'H', { nf: 1, nb: 1, lim: 50, name: 'רחוב הנביאים' }],
  ['F', 'J', { nf: 1, nb: 1, lim: 30, name: 'רחוב בית הספר', cross: [70, 140], school: true }],
  ['K', 'G', { nf: 1, nb: 0, lim: 40, name: 'רחוב הדקל (חד-סטרי)' }],
  ['H', 'L', { nf: 1, nb: 1, lim: 80, name: 'כביש עוקף', pass: true }],
  ['I', 'J', { nf: 1, nb: 1, lim: 50, name: 'רחוב אלנבי' }],
  ['J', 'K', { nf: 2, nb: 2, lim: 70, name: 'דרך מנחם בגין' }],
  ['K', 'L', { nf: 1, nb: 1, lim: 50, name: 'רחוב הירקון' }],
];

const nodes = {};
const nodeList = [];
for (const id in NODE_DEF) {
  const n = Object.assign({ id, edges: [], hx: LW, hy: LW }, NODE_DEF[id]);
  nodes[id] = n;
  nodeList.push(n);
}

const edges = [];
const edgeById = {};
for (const [a, b, o] of EDGE_DEF) {
  const A = nodes[a], B = nodes[b];
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);
  const d = { x: dx / len, y: dy / len };
  const e = {
    id: a + '-' + b, a: A, b: B, len, d,
    n: { x: -d.y, y: d.x },            // נורמל: צד ימין של כיוון a→b
    nf: o.nf, nb: o.nb, lim: o.lim, name: o.name,
    W: (o.nf + o.nb) * LW,
    oneway: o.nb === 0,
    pass: !!o.pass,
    school: !!o.school,
    horizontal: Math.abs(d.y) < 0.01,
    crosswalks: [],
  };
  e.crossDef = o.cross || [];
  edges.push(e);
  edgeById[e.id] = e;
  A.edges.push(e);
  B.edges.push(e);
}

// גודל אזור הצומת
for (const n of nodeList) {
  let hx = 0, hy = 0;
  for (const e of n.edges) {
    if (e.horizontal) hy = Math.max(hy, e.W / 2);
    else hx = Math.max(hx, e.W / 2);
  }
  n.hx = hx || hy; n.hy = hy || hx;
}

function trimAt(node, e) {
  if (node.type === 'roundabout') return Math.sqrt(RB_OUT * RB_OUT - (e.W / 2) ** 2);
  return e.horizontal ? node.hx : node.hy;
}
for (const e of edges) {
  e.t0 = trimAt(e.a, e);
  e.t1 = e.len - trimAt(e.b, e);
  for (const t of e.crossDef) e.crosswalks.push({ edge: e, t, peds: [], timer: 2 + Math.random() * 5 });
}
const crosswalks = edges.flatMap(e => e.crosswalks);

// ===== עזרים =====
function edgeLocal(e, p) {
  const rx = p.x - e.a.x, ry = p.y - e.a.y;
  return { t: rx * e.d.x + ry * e.d.y, s: rx * e.n.x + ry * e.n.y };
}
function edgePoint(e, t, s) {
  return { x: e.a.x + e.d.x * t + e.n.x * s, y: e.a.y + e.d.y * t + e.n.y * s };
}
function laneCount(e, dir) { return dir > 0 ? e.nf : e.nb; }
// היסט נתיב i (0 = שמאלי ביותר) ביחס לנורמל של הקטע
function laneS(e, dir, i) {
  let sT;
  if (e.oneway) sT = -e.W / 2 + (i + 0.5) * LW;
  else sT = (i + 0.5) * LW;
  return sT * dir;
}
// מספר נתיב לפי היסט בכיוון הנסיעה (sT); 0 = שמאלי
function laneFromST(e, dir, sT) {
  const n = laneCount(e, dir);
  let k;
  if (e.oneway) k = (sT + e.W / 2) / LW;
  else k = sT / LW;
  return { idx: Math.max(0, Math.min(n - 1, Math.floor(k))), frac: k - Math.floor(k), n };
}
function dirVec(e, dir) { return dir > 0 ? e.d : { x: -e.d.x, y: -e.d.y }; }
function toNodeOf(e, dir) { return dir > 0 ? e.b : e.a; }
function exitDirFrom(node, e) { return e.a === node ? 1 : -1; }
function canExit(node, e) { return e.a === node ? e.nf > 0 : e.nb > 0; }
function otherEnd(e, node) { return e.a === node ? e.b : e.a; }

function control(node, e) {
  switch (node.type) {
    case 'light': return 'light';
    case 'roundabout': return 'roundabout';
    case 'allstop': return 'stop';
    case 'priority': return (node.minor && node.minor[e.id]) || 'none';
    default: return 'none';
  }
}

function turnType(din, dout) {
  const dot = din.x * dout.x + din.y * dout.y;
  if (dot > 0.7) return 'straight';
  if (dot < -0.7) return 'uturn';
  const cross = din.x * dout.y - din.y * dout.x;
  return cross > 0 ? 'right' : 'left';
}

function angNorm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

// ===== רמזורים =====
// מחזור: אדום-צהוב, ירוק, צהוב, אדום כללי – לכל ציר
const LIGHT_PHASES = [
  ['h', 'redyellow', 1.5], ['h', 'green', 13], ['h', 'yellow', 3], ['-', 'red', 2],
  ['v', 'redyellow', 1.5], ['v', 'green', 13], ['v', 'yellow', 3], ['-', 'red', 2],
];
const LIGHT_CYCLE = LIGHT_PHASES.reduce((s, p) => s + p[2], 0);
function lightState(node, axis, time) {
  let t = ((time + (node.offset || 0)) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;
  for (const [ax, col, dur] of LIGHT_PHASES) {
    if (t < dur) return ax === axis ? col : 'red';
    t -= dur;
  }
  return 'red';
}
function axisOf(e) { return e.horizontal ? 'h' : 'v'; }

// ===== איתור מיקום =====
function nodeContains(n, p, m = 0) {
  if (n.type === 'roundabout') return Math.hypot(p.x - n.x, p.y - n.y) <= RB_OUT + m;
  return Math.abs(p.x - n.x) <= n.hx + m && Math.abs(p.y - n.y) <= n.hy + m;
}
function locate(p) {
  for (const n of nodeList) if (nodeContains(n, p)) return { kind: 'node', node: n };
  let best = null, bestEx = Infinity;
  for (const e of edges) {
    const { t, s } = edgeLocal(e, p);
    if (t < 0 || t > e.len) continue;
    const ex = Math.abs(s) - e.W / 2;
    if (ex < 2.5 && ex < bestEx) { bestEx = ex; best = { kind: 'edge', edge: e, t, s }; }
  }
  return best;
}
// 'road' | 'island' | 'off'
function surfaceAt(p) {
  for (const n of nodeList) {
    if (n.type === 'roundabout') {
      const r = Math.hypot(p.x - n.x, p.y - n.y);
      if (r < RB_IN) return 'island';
      if (r <= RB_OUT) return 'road';
    } else if (nodeContains(n, p, 0.15)) return 'road';
  }
  for (const e of edges) {
    const { t, s } = edgeLocal(e, p);
    if (t >= 0 && t <= e.len && Math.abs(s) <= e.W / 2 + 0.15) return 'road';
  }
  return 'off';
}

// פינות של מלבן מסובב
function boxCorners(v) {
  const c = Math.cos(v.h), s = Math.sin(v.h);
  const hl = v.len / 2, hw = v.wid / 2;
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([a, b]) => ({ x: v.x + c * a - s * b, y: v.y + s * a + c * b }));
}
function boxesOverlap(a, b) {
  const ca = boxCorners(a), cb = boxCorners(b);
  const axes = [a.h, a.h + Math.PI / 2, b.h, b.h + Math.PI / 2];
  for (const ang of axes) {
    const ax = Math.cos(ang), ay = Math.sin(ang);
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) { const d = p.x * ax + p.y * ay; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const p of cb) { const d = p.x * ax + p.y * ay; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}
function pointInBox(v, p, margin = 0) {
  const c = Math.cos(v.h), s = Math.sin(v.h);
  const rx = p.x - v.x, ry = p.y - v.y;
  const a = rx * c + ry * s, b = -rx * s + ry * c;
  return Math.abs(a) <= v.len / 2 + margin && Math.abs(b) <= v.wid / 2 + margin;
}

// מסלול פוליליין עם אורכים מצטברים
function makePath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1] };
}
function pathAt(path, s) {
  const { pts, cum } = path;
  if (s <= 0) s = 0;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const k = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
  const p0 = pts[i - 1], p1 = pts[i];
  return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, h: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
}

// מסלול מעבר בצומת – מנקודת קצה נתיב כניסה לנקודת תחילת נתיב יציאה
function nodePath(node, p0, din, p1, dout) {
  const pts = [];
  if (node.type === 'roundabout') {
    const th0 = Math.atan2(p0.y - node.y, p0.x - node.x) - 0.32;
    let th1 = Math.atan2(p1.y - node.y, p1.x - node.x) + 0.32;
    while (th1 > th0 - 0.4) th1 -= 2 * Math.PI;        // נגד כיוון השעון במסך = זווית יורדת
    pts.push(p0);
    for (let th = th0; th > th1; th -= 0.12) pts.push({ x: node.x + Math.cos(th) * RB_RING, y: node.y + Math.sin(th) * RB_RING });
    pts.push({ x: node.x + Math.cos(th1) * RB_RING, y: node.y + Math.sin(th1) * RB_RING });
    pts.push(p1);
    return makePath(pts);
  }
  const dot = din.x * dout.x + din.y * dout.y;
  if (dot > 0.9) return makePath([p0, p1]);
  // נקודת חיתוך של שני הקווים כנקודת בקרה לעקומת בזייה
  const den = din.x * dout.y - din.y * dout.x;
  let c;
  if (Math.abs(den) < 1e-6) c = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  else {
    const t = ((p1.x - p0.x) * dout.y - (p1.y - p0.y) * dout.x) / den;
    c = { x: p0.x + din.x * t, y: p0.y + din.y * t };
  }
  for (let i = 0; i <= 12; i++) {
    const k = i / 12, u = 1 - k;
    pts.push({ x: u * u * p0.x + 2 * u * k * c.x + k * k * p1.x, y: u * u * p0.y + 2 * u * k * c.y + k * k * p1.y });
  }
  return makePath(pts);
}

// גבולות העולם
const WORLD = {
  minX: Math.min(...nodeList.map(n => n.x)) - 60, maxX: Math.max(...nodeList.map(n => n.x)) + 60,
  minY: Math.min(...nodeList.map(n => n.y)) - 60, maxY: Math.max(...nodeList.map(n => n.y)) + 60,
};
