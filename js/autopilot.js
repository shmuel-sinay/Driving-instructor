'use strict';
// ===== נהיגה מסייעת =====
// הרכב נוסע לבד במרכז הנתיב. הנהג שולט בגז ובבלם, והאיתות קובע לאן הרכב ייסע:
// - בכביש עם כמה נתיבים: איתות של שנייה מעביר נתיב לכיוון האיתות.
// - בצומת: איתות שמאלה = פנייה שמאלה, ימינה = פנייה ימינה, בלי איתות = ישר.
// - בכיכר: הרכב מקיף עד שמאותתים ימינה, ואז יוצא ביציאה הבאה.

const assist = { on: true, st: null, hint: null, blinkHeld: 0, lastBlink: 0, blinkUsed: false };

function apLaneCount(e, dir) { return Math.max(1, laneCount(e, dir)); }
// היסט הנתיב; גם בנסיעה נגד הכיוון בחד-סטרי (כדי שהבוחן יוכל לרשום את העבירה)
function apLaneS(e, dir, i) {
  if (laneCount(e, dir)) return laneS(e, dir, i);
  return laneS(e, -dir, Math.max(0, laneCount(e, -dir) - 1 - i));
}

function apStartEdge(e, dir, lane, t, lat) {
  lane = Math.max(0, Math.min(apLaneCount(e, dir) - 1, lane));
  assist.st = { kind: 'edge', e, dir, lane, t, lat: lat == null ? apLaneS(e, dir, lane) : lat, changing: false };
}
function apReset() {
  if (!START.edge) return;
  apStartEdge(START.edge, START.dir, START.lane, START.t);
  assist.hint = null;
  apPlace(START.h, true);
}
// מעבר מנהיגה ידנית: מצמידים את הרכב לנתיב הקרוב
function apSnap() {
  const loc = locate(player);
  if (!loc || loc.kind !== 'edge') return false;
  const e = loc.edge, hd = Math.cos(player.h) * e.d.x + Math.sin(player.h) * e.d.y, dir = hd >= 0 ? 1 : -1;
  const n = laneCount(e, dir);
  const lane = n ? laneFromST(e, dir, Math.max(0, loc.s * dir)).idx : 0;
  apStartEdge(e, dir, lane, loc.t, loc.s);
  player.gear = 'D';
  return true;
}

function apPos() {
  const st = assist.st;
  if (st.kind === 'edge') return edgePoint(st.e, st.t, st.lat);
  if (st.kind === 'ring') return { x: st.node.x + Math.cos(st.th) * st.r, y: st.node.y + Math.sin(st.th) * st.r };
  return pathAt(st.path, st.s);
}
function apPlace(h0, snap) {
  const p = player, q = apPos();
  const dx = q.x - p.x, dy = q.y - p.y, moved = Math.hypot(dx, dy);
  p.x = q.x; p.y = q.y;
  if (snap) { p.h = h0; p.steer = 0; return; }
  if (moved > 1e-4) {
    const target = Math.atan2(dy, dx);
    const dh = angNorm(target - p.h);
    p.h = angNorm(p.h + dh * Math.min(1, 0.45 + moved * 0.4));
    p.steer = Math.max(-0.6, Math.min(0.6, Math.atan(p.wb * dh / Math.max(moved, 0.05))));
  } else p.steer *= 0.9;
}

// בחירת היציאה מהצומת לפי האיתות. null = אין כיוון ברור, צריך לעצור ולבחור
function apChooseExit(e, dir) {
  const node = toNodeOf(e, dir);
  if (node.type === 'roundabout') return { ring: true, node };
  const din = dirVec(e, dir);
  const opts = node.edges.filter(x => x !== e).map(x => {
    const d = exitDirFrom(node, x);
    return { x, d, node, turn: turnType(din, dirVec(x, d)) };
  });
  if (!opts.length) return { x: e, d: -dir, node, turn: 'uturn' };   // רחוב ללא מוצא
  if (opts.length === 1) return opts[0];                            // פינה: ממשיכים עם הדרך
  const want = player.blinker === -1 ? 'left' : player.blinker === 1 ? 'right' : 'straight';
  return opts.find(o => o.turn === want) || (want !== 'straight' && opts.find(o => o.turn === 'straight')) || null;
}

function uTurnPath(p0, din, p1) {
  const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2, r = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2;
  const ux = (p0.x - cx) / (r || 1), uy = (p0.y - cy) / (r || 1);
  const reach = Math.max(r, 4);
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * i / 16;
    pts.push({ x: cx + ux * r * Math.cos(a) + din.x * reach * Math.sin(a), y: cy + uy * r * Math.cos(a) + din.y * reach * Math.sin(a) });
  }
  return makePath(pts);
}

function apEnterNode(plan, leftover) {
  const p = player, st = assist.st;
  const din = dirVec(st.e, st.dir);
  if (plan.ring) {
    const n = plan.node;
    assist.st = { kind: 'ring', node: n, th: Math.atan2(p.y - n.y, p.x - n.x), r: Math.hypot(p.x - n.x, p.y - n.y), entryEdge: st.e, traveled: 0 };
    apStep(leftover);
    return;
  }
  const n2 = apLaneCount(plan.x, plan.d);
  const lane2 = plan.turn === 'right' ? n2 - 1 : (plan.turn === 'left' || plan.turn === 'uturn') ? 0 : Math.min(st.lane, n2 - 1);
  const p1 = edgePoint(plan.x, plan.d > 0 ? plan.x.t0 : plan.x.t1, apLaneS(plan.x, plan.d, lane2));
  const p0 = { x: p.x, y: p.y };
  const path = plan.turn === 'uturn' ? uTurnPath(p0, din, p1) : nodePath({ type: 'plain' }, p0, din, p1, dirVec(plan.x, plan.d));
  assist.st = { kind: 'node', path, s: 0, next: { x: plan.x, d: plan.d, lane: lane2 } };
  apStep(leftover);
}

// התקדמות לאורך המסלול במרחק dist
function apStep(dist) {
  const p = player;
  for (let guard = 0; guard < 4 && dist >= 0; guard++) {
    const st = assist.st;
    if (st.kind === 'edge') {
      const e = st.e, dir = st.dir, n = apLaneCount(e, dir);
      const tEnd = dir > 0 ? e.t1 : e.t0;
      const remain = (tEnd - st.t) * dir;
      // החלפת נתיב לפי איתות
      // כל הפעלה של האיתות = החלפת נתיב אחת. קרוב לצומת האיתות נשאר דולק ומשמש גם לפנייה
      if (p.blinker && assist.blinkHeld > 1.0 && !assist.blinkUsed && !st.changing && remain > 12) {
        const target = st.lane + p.blinker;
        if (target >= 0 && target < n) { st.lane = target; st.changing = true; st.cancelAfter = remain > 130; assist.blinkUsed = true; }
      }
      const targetS = apLaneS(e, dir, st.lane);
      const rate = Math.min(1.5, 0.2 * Math.abs(p.v) + 0.15);
      const dl = targetS - st.lat;
      st.lat += Math.sign(dl) * Math.min(Math.abs(dl), rate * Math.abs(dist) / Math.max(Math.abs(p.v), 0.5));
      if (st.changing && Math.abs(targetS - st.lat) < 0.05) { st.changing = false; if (st.cancelAfter && p.blinker) p.blinker = 0; }
      if (dist < remain) { st.t += dist * dir; return; }
      const plan = apChooseExit(e, dir);
      st.t = tEnd;
      if (!plan) { p.v = 0; return; }
      apEnterNode(plan, dist - remain);
      return;
    }
    if (st.kind === 'node') {
      st.s += dist;
      if (st.s < st.path.len) return;
      dist = st.s - st.path.len;
      const nx = st.next;
      apStartEdge(nx.x, nx.d, nx.lane, nx.d > 0 ? nx.x.t0 : nx.x.t1);
      if (nx.cancelBlink) p.blinker = 0;
      continue;
    }
    if (st.kind === 'ring') {
      const node = st.node;
      const dth = dist / Math.max(st.r, 1);
      st.th -= dth; st.traveled += dth;
      st.r += (RB_RING - st.r) * Math.min(1, dist / 5);
      if (p.blinker === 1 && st.traveled > 0.5) {
        for (const x of node.edges) {
          if (x === st.entryEdge && st.traveled < Math.PI) continue;
          const d = exitDirFrom(node, x);
          const lane2 = apLaneCount(x, d) - 1;
          const p1 = edgePoint(x, d > 0 ? x.t0 : x.t1, apLaneS(x, d, lane2));
          const thx = Math.atan2(p1.y - node.y, p1.x - node.x) + 0.32;
          const dlt = angNorm(st.th - thx);
          if (dlt <= 0 && dlt > -0.25) {
            const q = apPos();
            const tan = { x: Math.sin(st.th), y: -Math.cos(st.th) };
            const path = nodePath({ type: 'plain' }, q, tan, p1, dirVec(x, d));
            assist.st = { kind: 'node', path, s: 0, next: { x, d, lane: lane2, cancelBlink: true } };
            return;
          }
        }
      }
      return;
    }
    return;
  }
}

function apUpdate(dt) {
  const p = player;
  if (!assist.st) { if (!apSnap()) apReset(); }
  if (p.blinker && p.blinker === assist.lastBlink) assist.blinkHeld += dt; else { assist.blinkHeld = 0; assist.blinkUsed = false; }
  assist.lastBlink = p.blinker;
  const st = assist.st;
  assist.hint = null;
  // לפני צומת בלי כיוון ברור (למשל צומת T בלי איתות): עוצרים בקו ומבקשים לבחור
  if (st.kind === 'edge') {
    const remain = ((st.dir > 0 ? st.e.t1 : st.e.t0) - st.t) * st.dir;
    if (remain < 60 && !apChooseExit(st.e, st.dir)) {
      assist.hint = 'אין דרך ישר: אותת ימינה או שמאלה כדי לבחור כיוון';
      const vmax = Math.sqrt(2 * 5 * Math.max(0, remain - 0.3));
      if (p.v > vmax) p.v = vmax;
    }
  }
  apStep(Math.max(0, p.v) * dt);
  apPlace();
}

// טקסט לתצוגה: מה הרכב יעשה בצומת הבא
function apPlanText() {
  const st = assist.st;
  if (!assist.on || !st) return null;
  if (assist.hint) return assist.hint;
  if (st.kind === 'ring') return player.blinker === 1 ? 'יוצא ביציאה הבאה' : 'מקיף את הכיכר: אותת ימינה כדי לצאת';
  if (st.kind !== 'edge') return null;
  const plan = apChooseExit(st.e, st.dir);
  if (!plan) return null;
  if (plan.ring) return 'בכיכר: אותת ימינה לפני היציאה שלך';
  return { left: 'הרכב יפנה שמאלה', right: 'הרכב יפנה ימינה', straight: 'הרכב ימשיך ישר', uturn: 'סוף הדרך: פרסה' }[plan.turn];
}
