'use strict';
// ===== נהיגה מסייעת =====
// הרכב מחזיק את הנתיב לבד. הנהג מחליט על כל השאר:
// - גז ובלם: מהירות, האטה לפני פניות, עצירה ב"עצור", ברמזור ולפני הולכי רגל.
// - חיצים = ההגה: החלפת נתיב (אף פעם לא אל המדרכה). כשאין נתיב נוסף לכיוון הזה,
//   החץ קובע את הפנייה בצומת הבא. חץ לכיוון ההפוך מבטל את הפנייה.
//   בכיכר: → יוצא ביציאה הבאה. בכיכר דו-נתיבית ← / → עוברים בין הנתיב הפנימי לחיצוני.
// - Q / E: איתות בלבד (לחיצה נוספת מכבה). האיתות לא מזיז את הרכב, והבוחן בודק אותו.
// - P / O: חניה בצד ימין / שמאל במקום הפנוי הבא. גז מתוך חניה = יציאה מהחניה.

const assist = { on: true, st: null, hint: null, hintUntil: 0, intent: null };

function apLaneCount(e, dir) { return Math.max(1, laneCount(e, dir)); }
// היסט הנתיב; גם בנסיעה נגד הכיוון בחד-סטרי
function apLaneS(e, dir, i) {
  if (laneCount(e, dir)) return laneS(e, dir, i);
  return laneS(e, -dir, Math.max(0, laneCount(e, -dir) - 1 - i));
}
function apHint(text, secs = 3) { assist.hint = text; assist.hintUntil = (typeof time !== 'undefined' ? time : 0) + secs; }

function apStartEdge(e, dir, lane, t, lat) {
  lane = Math.max(0, Math.min(apLaneCount(e, dir) - 1, lane));
  assist.st = { kind: 'edge', e, dir, lane, t, lat: lat == null ? apLaneS(e, dir, lane) : lat };
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
  if (st.kind === 'edge' || st.kind === 'parked') return edgePoint(st.e, st.t, st.lat);
  if (st.kind === 'ring') return { x: st.node.x + Math.cos(st.th) * st.r, y: st.node.y + Math.sin(st.th) * st.r };
  // מסלול של הסרן האחורי (יציאה מחניה): מרכז הרכב נמצא חצי בסיס גלגלים לפניו, בכיוון הרכב
  if (st.axle) { const a = pathAt(st.path, st.s); return { x: a.x + Math.cos(a.h) * st.axle, y: a.y + Math.sin(a.h) * st.axle, h: a.h }; }
  return pathAt(st.path, st.s);
}
function apPlace(h0, snap) {
  const p = player, q = apPos();
  const dx = q.x - p.x, dy = q.y - p.y, moved = Math.hypot(dx, dy);
  p.x = q.x; p.y = q.y;
  if (snap) { p.h = h0; p.steer = 0; return; }
  if (q.h != null && assist.st.axle) { const dh = angNorm(q.h - p.h); p.h = angNorm(p.h + dh); p.steer = Math.max(-0.6, Math.min(0.6, Math.atan(p.wb * dh / Math.max(moved, 0.05)))); return; }
  if (moved > 1e-4) {
    const target = p.v < 0 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);   // ברוורס החזית נשארת קדימה
    const dh = angNorm(target - p.h);
    p.h = angNorm(p.h + dh * Math.min(1, 0.45 + moved * 0.4));
    p.steer = Math.max(-0.6, Math.min(0.6, Math.atan(p.wb * dh / Math.max(moved, 0.05))));
  } else p.steer *= 0.9;
}

// ===== שליטה =====
function apLane(side) {
  const st = assist.st;
  if (!st) return;
  const name = side < 0 ? 'left' : 'right';
  if (st.kind === 'ring') {
    // בכיכר החיצים רק מחליפים נתיב. יוצאים עם איתות ימינה (כמו במציאות)
    const two = st.node.rbLanes === 2;
    if (side < 0) {
      if (two && st.ringLane === 'outer') st.ringLane = 'inner';
      else apHint(two ? 'אתה כבר בנתיב הפנימי' : 'בכיכר הזאת יש נתיב אחד');
    } else {
      if (two && st.ringLane === 'inner') st.ringLane = 'outer';
      else apHint('כדי לצאת מהכיכר: אותת ימינה (C), והרכב ייצא ביציאה הבאה');
    }
    return;
  }
  if (st.kind !== 'edge') return;
  // ביטול פנייה שנבחרה
  if (assist.intent && assist.intent !== name) { assist.intent = null; return; }
  const n = apLaneCount(st.e, st.dir);
  const target = st.lane + side;
  if (target >= 0 && target < n) { st.lane = target; return; }
  assist.intent = name;   // אין נתיב נוסף: זו פנייה בצומת הבא
}

function apPark(side) {
  const st = assist.st, p = player;
  if (!st) return;
  if (st.kind === 'parked') { apHint('כדי לצאת מהחניה: אותת ולחץ גז'); return; }
  if (st.kind !== 'edge') { apHint('אפשר לחנות רק בכביש, לא בתוך צומת'); return; }
  const e = st.e, dir = st.dir;
  const strip = parkStripOf(e, dir, side);
  if (!strip) { apHint(side === 'left' && !e.oneway ? 'חניה בצד שמאל מותרת רק ברחוב חד-סטרי' : `אין מקומות חניה בצד ${side === 'right' ? 'ימין' : 'שמאל'} ברחוב הזה`); return; }
  const n = apLaneCount(e, dir);
  if ((side === 'right' && st.lane !== n - 1) || (side === 'left' && st.lane !== 0)) { apHint(`כדי לחנות, עבור קודם לנתיב ה${side === 'right' ? 'ימני' : 'שמאלי'}`); return; }
  if (Math.abs(p.v) * 3.6 > 30) { apHint('האט מתחת ל-30 קמ"ש כדי לחנות'); return; }
  // המקום הפנוי הבא: צריך מקום לרכב ועוד מרווח כניסה מאחור (חניה בנסיעה קדימה)
  const taken = e.parked.filter(c => c.key === strip.key).map(c => c.t);
  const IN = 9;   // אורך קטע הכניסה האלכסונית
  let spot = null;
  for (let k = IN + 2; k < 90; k += 0.5) {
    const c = st.t + k * dir;
    if ((c - e.t0) < 3 || (e.t1 - c) < 3) break;
    if (taken.every(tc => { const ahead = (tc - c) * dir; return ahead > 5.2 || ahead < -(IN + 2.6); })) { spot = c; break; }
  }
  if (spot == null) { apHint('אין מקום חניה פנוי בקרבת מקום'); return; }
  const dv = dirVec(e, dir);
  const pA = { x: p.x, y: p.y };
  const p0 = edgePoint(e, spot - IN * dir, st.lat), p3 = edgePoint(e, spot, strip.s - 0.1 * Math.sign(strip.s));
  const p1 = { x: p0.x + dv.x * IN * 0.5, y: p0.y + dv.y * IN * 0.5 }, p2 = { x: p3.x - dv.x * IN * 0.5, y: p3.y - dv.y * IN * 0.5 };
  const pts = [pA];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
    pts.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
  assist.st = { kind: 'park-in', path: makePath(pts), s: 0, e, dir, side, spot, lat: strip.s - 0.1 * Math.sign(strip.s), key: strip.key, lane: st.lane };
  Rules.onParkStart(e, dir, side, spot, time);
}

function apUnparkPath(st) {
  const e = st.e, dir = st.dir, n = apLaneCount(e, dir);
  const lane = st.side === 'right' ? n - 1 : 0;
  const sLane = apLaneS(e, dir, lane), D = Math.abs(sLane - st.lat), sg = Math.sign(sLane - st.lat) || 1;
  // יציאה כמו ברכב אמיתי (מודל אופניים): הגה עד הסוף לכיוון הנתיב, קטע ישר באלכסון, הגה חזרה עד שמתיישרים.
  // הגלגלים האחוריים כמעט לא זזים הצידה, כך שהרכב לא עולה על המדרכה ולא פוגע ברכב שלפנים.
  // זווית היציאה: חדה רק כשהרכב שלפנים קרוב, אחרת מתונה (כדי לא להגיע לצד השני של רחוב צר)
  const ahead = e.parked.filter(c => c.key === st.key).map(c => (c.t - st.t) * dir).filter(d => d > 0);
  const gap = ahead.length ? Math.min(...ahead) : 99;
  const WB = 2.6, R = 3.9, TH = gap < 7.5 ? 0.6 : 0.42, STEP = 0.2;
  const wCurve = R * (1 - Math.cos(TH));
  const straight = Math.max(0, (D - 2 * wCurve) / Math.sin(TH));
  let u = -WB / 2, w = 0, th = 0;
  const pts = [];
  const push = () => pts.push(edgePoint(e, st.t + dir * u, st.lat + sg * w));
  push();
  const arc = (k, until) => { while ((k > 0 ? th < until : th > until)) { th += k * STEP; th = k > 0 ? Math.min(th, until) : Math.max(th, until); u += Math.cos(th) * STEP; w += Math.sin(th) * STEP; push(); } };
  arc(1 / R, TH);
  for (let d = 0; d < straight; d += STEP) { u += Math.cos(th) * STEP; w += Math.sin(th) * STEP; push(); }
  arc(-1 / R, 0);
  for (let d = 0; d < 3; d += STEP) { u += STEP; push(); }
  const tEnd = st.t + dir * (u + WB / 2);
  return { kind: 'park-out', path: makePath(pts), s: 0, axle: WB / 2, next: { e, dir, lane, t: tEnd } };
}

// ===== בחירת הדרך בצומת: לפי החיצים =====
// מחזיר null כשאין דרך ישר ולא נבחר כיוון (צריך לעצור בקו ולבחור)
function apPlanAt(e, dir) {
  const node = toNodeOf(e, dir);
  const din = dirVec(e, dir);
  const all = node.edges.filter(x => x !== e).map(x => {
    const d = exitDirFrom(node, x);
    return { x, d, node, turn: turnType(din, dirVec(x, d)) };
  });
  if (!all.length) return { x: e, d: -dir, node, turn: 'uturn' };   // רחוב ללא מוצא
  if (node.type === 'roundabout') {
    // ימינה = היציאה הראשונה. אחרת נכנסים ומקיפים עד שלוחצים →
    const first = all.slice().sort((a, b) => rbExitNumber(node, e, a.x) - rbExitNumber(node, e, b.x))[0];
    return { node, roundabout: true, first: assist.intent === 'right' ? first : null };
  }
  if (all.length === 1) return all[0];                              // פינה: ממשיכים עם הדרך
  const want = assist.intent || 'straight';
  return all.find(o => o.turn === want) || (want !== 'straight' ? all.find(o => o.turn === 'straight') : null) || null;
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
  const node = plan.node;
  assist.intent = null;
  if (plan.roundabout) {
    const nIn = apLaneCount(st.e, st.dir);
    const ringLane = node.rbLanes === 2 && nIn >= 2 && st.lane === 0 ? 'inner' : 'outer';
    assist.st = { kind: 'ring', node, th: Math.atan2(p.y - node.y, p.x - node.x), r: Math.hypot(p.x - node.x, p.y - node.y), entryEdge: st.e, traveled: 0, ringLane, exit: plan.first, exitNext: !!plan.first };
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
      const e = st.e, dir = st.dir;
      const tEnd = dir > 0 ? e.t1 : e.t0;
      const remain = (tEnd - st.t) * dir;
      // מעבר הדרגתי לנתיב היעד (כ-3 שניות להחלפת נתיב)
      const targetS = apLaneS(e, dir, st.lane);
      const rate = Math.min(1.3, 0.12 * Math.abs(p.v) + 0.4);
      const dl = targetS - st.lat;
      st.lat += Math.sign(dl) * Math.min(Math.abs(dl), rate * Math.abs(dist) / Math.max(Math.abs(p.v), 0.5));
      if (dist < remain) { st.t += dist * dir; return; }
      const plan = apPlanAt(e, dir);
      st.t = tEnd;
      if (!plan) { p.v = 0; return; }
      apEnterNode(plan, dist - remain);
      return;
    }
    if (st.kind === 'node' || st.kind === 'park-out') {
      st.s += dist;
      if (st.s < st.path.len) return;
      dist = st.s - st.path.len;
      const nx = st.next;
      if (st.kind === 'park-out') apStartEdge(nx.e, nx.dir, nx.lane, nx.t);
      else {
        apStartEdge(nx.x, nx.d, nx.lane, nx.d > 0 ? nx.x.t0 : nx.x.t1);
        if (nx.cancelBlink) p.blinker = 0;
      }
      continue;
    }
    if (st.kind === 'park-in') {
      st.s += dist;
      if (st.s >= st.path.len) {
        assist.st = { kind: 'parked', e: st.e, dir: st.dir, side: st.side, t: st.spot, lat: st.lat, key: st.key };
        p.v = 0;
        Rules.onParked(st.e, st.dir, st.side, st.spot, time);
      }
      return;
    }
    if (st.kind === 'ring') {
      const node = st.node;
      const dth = dist / Math.max(st.r, 1);
      st.th -= dth; st.traveled += dth;
      const targetR = ringRadius(node, st.ringLane);
      st.r += (targetR - st.r) * Math.min(1, dist / 6);
      // יציאה ביציאה הבאה כשהאיתות ימינה דולק; כיבוי האיתות לפני היציאה מבטל אותה
      if (p.blinker === 1) st.exitNext = true;
      else if (st.exit && !st.exitLocked) { st.exitNext = false; st.exit = null; }
      if (st.exitNext && !st.exit) {
        let best = null;
        for (const x of node.edges) {
          const d = exitDirFrom(node, x), n2 = apLaneCount(x, d);
          const q = edgePoint(x, d > 0 ? x.t0 : x.t1, apLaneS(x, d, n2 - 1));
          let rem = st.th - (Math.atan2(q.y - node.y, q.x - node.x) + 0.32);
          while (rem <= 0.15) rem += 2 * Math.PI;
          if (x === st.entryEdge && st.traveled + rem < Math.PI) continue;
          if (!best || rem < best.rem) best = { x, d, rem };
        }
        st.exit = best;
      }
      if (!st.exit) return;
      const x = st.exit.x, d = st.exit.d;
      const n2 = apLaneCount(x, d);
      const lane2 = st.ringLane === 'inner' && n2 > 1 ? 0 : n2 - 1;
      const p1 = edgePoint(x, d > 0 ? x.t0 : x.t1, apLaneS(x, d, lane2));
      const thx = Math.atan2(p1.y - node.y, p1.x - node.x) + 0.32;
      const dlt = angNorm(st.th - thx);
      if (dlt > -0.6 && dlt <= 0) st.exitLocked = true;   // כבר ממש ביציאה
      if (st.traveled > 0.4 && dlt <= 0 && dlt > -0.3) {
        const q = apPos();
        const tan = { x: Math.sin(st.th), y: -Math.cos(st.th) };
        assist.st = { kind: 'node', path: nodePath({ type: 'plain' }, q, tan, p1, dirVec(x, d)), s: 0, next: { x, d, lane: lane2 } };
        return;
      }
      return;
    }
    return;
  }
}

function apUpdate(dt) {
  const p = player;
  if (!assist.st) { if (!apSnap()) apReset(); }
  const st = assist.st;
  if (assist.hint && time > assist.hintUntil) assist.hint = null;
  if (st.kind === 'parked') {
    // נסיעה לאחור לאורך המדרכה (משימת בוחן)
    if (p.gear === 'R' && input.down) {
      const behind = st.e.parked.some(c => c.key === st.key && (st.t - c.t) * st.dir > 0 && (st.t - c.t) * st.dir < 5.0);
      const tStart = st.dir > 0 ? st.e.t0 : st.e.t1;
      if (behind || (st.t - tStart) * st.dir < 3) { p.v = 0; apHint('יש רכב או צומת מאחור: עצור'); apPlace(); return; }
      st.t -= 1.3 * dt * st.dir; p.v = -1.3; p.braking = false;
      apPlace();
      return;
    }
    p.v = 0;
    if (input.up && player.gear === 'D') { assist.st = apUnparkPath(st); Rules.onUnpark(st.e, st.dir, st.side, time); }
    apPlace();
    return;
  }
  // רוורס: רק לאורך הכביש (לא בתוך צומת או כיכר)
  if (p.v < 0) {
    if (st.kind === 'edge') {
      const tStart = st.dir > 0 ? st.e.t0 : st.e.t1;
      st.t += p.v * dt * st.dir;
      if ((st.t - tStart) * st.dir < 0) { st.t = tStart; p.v = 0; apHint('אי אפשר להמשיך לאחור לתוך הצומת'); }
    } else { p.v = 0; apHint('אפשר לנסוע לאחור רק בכביש, לא בצומת'); }
    apPlace();
    return;
  }
  // לפני צומת בלי דרך ישר ובלי כיוון שנבחר: עוצרים בקו
  if (st.kind === 'edge') {
    const remain = ((st.dir > 0 ? st.e.t1 : st.e.t0) - st.t) * st.dir;
    if (remain < 60 && !apPlanAt(st.e, st.dir)) {
      assist.waiting = true;
      const vmax = Math.sqrt(2 * 5 * Math.max(0, remain - 0.3));
      if (p.v > vmax) p.v = vmax;
    } else assist.waiting = false;
  }
  if (st.kind === 'park-in') {
    // בלימה אוטומטית עדינה כדי לעצור בדיוק במקום החניה
    const rem = st.path.len - st.s;
    const vmax = Math.max(0.6, Math.sqrt(2 * 2.2 * Math.max(0, rem)));
    if (p.v > vmax) p.v = vmax;
    if (p.v < 1.2 && rem > 0.3) p.v = 1.2;
  }
  apStep(Math.max(0, p.v) * dt);
  apPlace();
}

// טקסט לתצוגה: מצב הרכב ורמזים
function apPlanText() {
  const st = assist.st;
  if (!assist.on || !st) return null;
  if (assist.hint) return assist.hint;
  if (st.kind === 'parked') return 'חונה. כדי לצאת: אותת ולחץ גז';
  if (st.kind === 'park-in') return 'נכנס לחניה';
  if (st.kind === 'park-out') return 'יוצא מהחניה';
  if (st.kind === 'ring') {
    const lane = st.node.rbLanes === 2 ? (st.ringLane === 'inner' ? 'נתיב פנימי · ' : 'נתיב חיצוני · ') : '';
    return lane + (st.exit ? 'יוצא ביציאה הבאה' : 'אותת ימינה (C) כדי לצאת ביציאה הבאה');
  }
  if (st.kind === 'edge') {
    if (assist.waiting) return 'אין דרך ישר: בחר כיוון בחיצים ← או →';
    const node = toNodeOf(st.e, st.dir);
    if (assist.intent) return node.type === 'roundabout' ? (assist.intent === 'right' ? 'בכיכר: יציאה ראשונה' : 'בכיכר: לחץ → בתוכה כדי לצאת')
      : `בצומת הבא: ${assist.intent === 'right' ? 'ימינה' : 'שמאלה'}`;
  }
  return null;
}
