'use strict';
// ===== עולם: מפת הכבישים והגיאומטריה =====
// יחידות: מטרים. ציר y כלפי מטה (כמו במסך). תנועה בצד ימין (ישראל).

const LW = 3.5;          // רוחב נתיב
const SIDEWALK = 2.6;    // רוחב מדרכה
const RB_OUT = 19;       // רדיוס חיצוני של כיכר
const RB_IN = 8.5;       // רדיוס אי התנועה
const RB_RING = (RB_OUT + RB_IN) / 2;

// המפה נבנית מנתוני JSON (ראו js/maps.js ו-docs/map-format.md)
const nodes = {};
const nodeList = [];
const edges = [];
const edgeById = {};
const crosswalks = [];
const WORLD = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
const START = { x: 0, y: 0, h: 0, lim: 50 };
let currentMap = null;

function buildWorld(map) {
  for (const k in nodes) delete nodes[k];
  nodeList.length = 0; edges.length = 0; crosswalks.length = 0;
  for (const k in edgeById) delete edgeById[k];

  for (const nd of map.nodes) {
    const n = { id: nd.id, x: nd.x, y: nd.y, edges: [], hx: LW, hy: LW, minor: {}, offset: nd.lightOffset || 0 };
    n.type = { light: 'light', roundabout: 'roundabout', allstop: 'allstop' }[nd.type] || 'plain';
    nodes[n.id] = n; nodeList.push(n);
  }
  for (const r of map.roads) {
    const A = nodes[r.from], B = nodes[r.to];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    const d = { x: dx / len, y: dy / len };
    const nf = r.lanesForward, nb = r.lanesBackward || 0;
    const e = {
      id: r.from + '-' + r.to, a: A, b: B, len, d,
      n: { x: -d.y, y: d.x },            // נורמל: צד ימין של כיוון a→b
      nf, nb, lim: r.speed, name: r.name || 'רחוב ללא שם',
      W: (nf + nb) * LW,
      oneway: nb === 0,
      pass: !!r.overtaking,
      school: !!r.school,
      horizontal: Math.abs(d.y) < 0.01,
      crosswalks: [],
    };
    e.crossDef = r.crosswalks || [];
    edges.push(e); edgeById[e.id] = e;
    A.edges.push(e); B.edges.push(e);
    // תמרור "עצור" / "תן זכות קדימה" בקצה הדרך
    if (r.signAtFrom && r.signAtFrom !== 'none') A.minor[e.id] = r.signAtFrom;
    if (r.signAtTo && r.signAtTo !== 'none') B.minor[e.id] = r.signAtTo;
  }
  for (const n of nodeList) if (n.type === 'plain' && Object.keys(n.minor).length) n.type = 'priority';

  // גודל אזור הצומת
  for (const n of nodeList) {
    let hx = 0, hy = 0;
    for (const e of n.edges) {
      if (e.horizontal) hy = Math.max(hy, e.W / 2);
      else hx = Math.max(hx, e.W / 2);
    }
    n.hx = hx || hy || LW; n.hy = hy || hx || LW;
  }
  for (const e of edges) {
    e.t0 = trimAt(e.a, e);
    e.t1 = e.len - trimAt(e.b, e);
    for (const t of e.crossDef) { const cw = { edge: e, t, peds: [], timer: 2 + Math.random() * 5 }; e.crosswalks.push(cw); crosswalks.push(cw); }
  }
  WORLD.minX = Math.min(...nodeList.map(n => n.x)) - 60; WORLD.maxX = Math.max(...nodeList.map(n => n.x)) + 60;
  WORLD.minY = Math.min(...nodeList.map(n => n.y)) - 60; WORLD.maxY = Math.max(...nodeList.map(n => n.y)) + 60;

  const st = map.start || {};
  const se = edgeById[st.road] || edges[0];
  let dir = st.direction === 'backward' ? -1 : 1;
  if (!laneCount(se, dir)) dir = -dir;
  const dist = Math.min(Math.max(st.distance || 30, 5), se.t1 - se.t0 - 5);
  const p = edgePoint(se, dir > 0 ? se.t0 + dist : se.t1 - dist, laneS(se, dir, laneCount(se, dir) - 1));
  Object.assign(START, { x: p.x, y: p.y, h: Math.atan2(se.d.y * dir, se.d.x * dir), lim: se.lim });
  currentMap = map;
}

function trimAt(node, e) {
  if (node.type === 'roundabout') return Math.sqrt(RB_OUT * RB_OUT - (e.W / 2) ** 2);
  return e.horizontal ? node.hx : node.hy;
}

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
