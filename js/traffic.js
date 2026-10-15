'use strict';
// ===== תנועה: רכבים אחרים והולכי רגל =====

const NPC_COLORS = ['#d9d4c7', '#2f5d8a', '#8a2f2f', '#3f6b45', '#c9a227', '#555b66', '#e8e6e1', '#6b4f8a', '#a8552c'];

// בדיקת קונפליקט בכניסה לצומת (מי שמגיע עליו לתת זכות קדימה)
function hasConflict(node, approachEdge, self, vehicles) {
  for (const o of vehicles) {
    if (o === self || Math.abs(o.v) < 0.8) continue;
    const dx = o.x - node.x, dy = o.y - node.y;
    const dist = Math.hypot(dx, dy);
    if (node.type === 'roundabout') {
      if (dist > RB_OUT + 1 || dist < RB_IN - 1) continue;
      // תנועה בכיכר נעה בזווית יורדת; מי שנמצא "לפני" נקודת הכניסה בכיוון הזרימה – מגיע אלינו
      const entryDir = approachEdge.a === node ? approachEdge.d : { x: -approachEdge.d.x, y: -approachEdge.d.y };
      const thEntry = Math.atan2(entryDir.y, entryDir.x);
      const thV = Math.atan2(dy, dx);
      const diff = angNorm(thV - thEntry);
      if (diff > -0.6 && diff < 2.0) return true;
    } else {
      if (dist > 34) continue;
      // רכב שבתוך הצומת
      if (nodeContains(node, o, 1)) return true;
      // רכב שמתקרב בדרך אחרת
      const loc = locate(o);
      if (!loc || loc.kind !== 'edge' || loc.edge === approachEdge || !loc.edge.a || (loc.edge.a !== node && loc.edge.b !== node)) continue;
      if (control(node, loc.edge) !== 'none') continue;      // גם הוא צריך לעצור/לתת זכות
      const hx = Math.cos(o.h), hy = Math.sin(o.h);
      const toward = (-dx * hx - dy * hy) * Math.sign(o.v || 1);
      if (toward > dist * 0.6 && dist < 34) return true;
    }
  }
  return false;
}

class NPC {
  constructor(edge, dir, lane, t) {
    this.len = 4.4; this.wid = 1.8;
    this.color = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
    // בערך אחד מכל 12 רכבים הוא אוטובוס (ירוק או כחול)
    if (Math.random() < 0.08) { this.type = 'bus'; this.len = 11.5; this.wid = 2.5; this.color = Math.random() < 0.5 ? '#2e7d32' : '#1565c0'; }
    this.v = 6; this.blinker = 0; this.braking = false;
    this.startEdge(edge, dir, lane, t);
  }
  planNext(edge, dir) {
    const node = toNodeOf(edge, dir);
    const din = dirVec(edge, dir);
    let opts = node.edges.filter(e => e !== edge && canExit(node, e) && !isBanned(node, edge, turnType(din, dirVec(e, exitDirFrom(node, e)))));
    if (!opts.length) opts = [edge];
    // אוטובוס ממשיך ישר כשאפשר (פנייה של רכב ארוך חותכת את הפינה)
    if (this.type === 'bus') { const st = opts.filter(o => turnType(din, dirVec(o, exitDirFrom(node, o))) === 'straight'); if (st.length) opts = st; }
    const e2 = opts[Math.floor(Math.random() * opts.length)];
    const d2 = exitDirFrom(node, e2);
    const plan = { node, edge: e2, dir: d2, turn: e2 === edge ? 'uturn' : turnType(dirVec(edge, dir), dirVec(e2, d2)) };
    if (node.type === 'roundabout') {
      plan.exitNumber = rbExitNumber(node, edge, e2);
      plan.ring = node.rbLanes === 2 && plan.exitNumber >= 3 ? 'inner' : 'outer';
    }
    return plan;
  }
  startEdge(edge, dir, lane, t = 0) {
    this.next = this.planNext(edge, dir);
    const n = laneCount(edge, dir);
    if (lane == null && this.next.ring) lane = this.next.ring === 'inner' ? 0 : n - 1;
    if (lane == null) {
      if (this.next.turn === 'right') lane = n - 1;
      else if (this.next.turn === 'left' || this.next.turn === 'uturn') lane = 0;
      else lane = Math.floor(Math.random() * n);
    }
    lane = Math.min(lane, n - 1);
    const s = laneS(edge, dir, lane);
    const tFrom = dir > 0 ? edge.t0 : edge.t1, tTo = dir > 0 ? edge.t1 : edge.t0;
    this.leg = { kind: 'edge', edge, dir, lane, tFrom, path: makePath([edgePoint(edge, tFrom, s), edgePoint(edge, tTo, s)]) };
    this.s = t; this.stopDone = false; this.stopTimer = 0; this.committed = false;
    this.place();
  }
  startNode() {
    const { edge, dir, lane, path } = this.leg;
    const nx = this.next;
    const n2 = laneCount(nx.edge, nx.dir);
    let lane2;
    if (nx.ring) lane2 = nx.ring === 'inner' ? 0 : n2 - 1;
    else if (nx.turn === 'right') lane2 = n2 - 1;
    else if (nx.turn === 'left' || nx.turn === 'uturn') lane2 = 0;
    else lane2 = Math.min(lane, n2 - 1);
    const t2 = nx.dir > 0 ? nx.edge.t0 : nx.edge.t1;
    const p1 = edgePoint(nx.edge, t2, laneS(nx.edge, nx.dir, lane2));
    const p0 = path.pts[path.pts.length - 1];
    this.leg = { kind: 'node', node: nx.node, lane2, path: nodePath(nx.node, p0, dirVec(edge, dir), p1, dirVec(nx.edge, nx.dir), ringRadius(nx.node, nx.ring)) };
    this.s = 0;
  }
  place() {
    const p = pathAt(this.leg.path, this.s);
    this.x = p.x; this.y = p.y;
    // החלקת כיוון
    if (this.h == null) this.h = p.h;
    else this.h += angNorm(p.h - this.h) * 0.35;
    // היסט הצידה (רכב ביטחון שעוקף משמאל)
    if (this.off) { this.x += Math.sin(this.h) * this.off; this.y -= Math.cos(this.h) * this.off; }
  }
  update(dt, time, vehicles) {
    const leg = this.leg;
    let stopDist = Infinity;
    let vT;
    if (leg.kind === 'edge') {
      const e = leg.edge, node = toNodeOf(e, leg.dir);
      // רכב ארוך (אוטובוס) עוצר כשהחזית שלו בקו, לא המרכז
      const remaining = leg.path.len - this.s - (this.len - 4.4) / 2;
      vT = e.lim * 0.9 / 3.6;
      const ctrl = this.siren ? 'none' : control(node, e);
      // רכב ביטחון: מהיר יותר, ומאט רק לפני הצומת כדי לחצות בזהירות
      if (this.siren) vT = Math.min((e.lim + 20) / 3.6, Math.sqrt(64 + 2 * 3 * Math.max(0, remaining)));
      if (ctrl === 'light' && !this.committed) {
        const st = lightState(node, axisOf(e), time);
        if (st === 'green') { if (remaining < 3) this.committed = true; }
        else if (st === 'yellow' && remaining < this.v * this.v / 8 + 1) this.committed = true;
        else stopDist = remaining - 1.2;
      } else if (ctrl === 'stop' && !this.stopDone) {
        stopDist = remaining - 1.2;
        if (remaining < 4 && this.v < 0.3) {
          this.stopTimer += dt;
          if (this.stopTimer > 1.3 && !hasConflict(node, e, this, vehicles)) this.stopDone = true;
        }
      } else if ((ctrl === 'yield' || ctrl === 'roundabout') && !this.committed) {
        if (remaining < 14) {
          if (hasConflict(node, e, this, vehicles)) stopDist = remaining - 1.2;
          else if (remaining < 3) this.committed = true;
        }
      }
      // מעברי חציה
      for (const cw of e.crosswalks) {
        const tNow = leg.tFrom + (this.s + (this.len - 4.4) / 2) * leg.dir;
        const dcw = leg.dir > 0 ? cw.t - 3 - tNow : tNow - (cw.t + 3);
        if (dcw > -1 && cw.peds.some(pd => pd.state === 'cross')) stopDist = Math.min(stopDist, dcw - 0.5);
      }
      // האטה לפני פנייה
      if (this.next.turn !== 'straight') vT = Math.min(vT, Math.sqrt((5.5) ** 2 + 2 * 2.2 * Math.max(0, remaining)));
      this.blinker = (remaining < 45 && (this.next.turn === 'left' || this.next.turn === 'uturn')) ? -1 :
        (remaining < 45 && this.next.turn === 'right') ? 1 : 0;
      if (this.next.node.type === 'roundabout') this.blinker = (remaining < 45 && this.next.turn === 'right') ? 1 : 0;
    } else {
      vT = leg.node.type === 'roundabout' ? 7 : (this.next.turn === 'straight' ? 11 : 6);
      if (leg.node.type === 'roundabout') this.blinker = this.s > leg.path.len - 14 ? 1 : 0;
    }
    if (this.rider) vT = Math.min(vT, this.maxV);
    // רכב מלפנים
    const hx = Math.cos(this.h), hy = Math.sin(this.h);
    for (const o of vehicles) {
      if (o === this) continue;
      const rx = o.x - this.x, ry = o.y - this.y;
      const fwd = rx * hx + ry * hy;
      if (fwd <= 0 || fwd > 32) continue;
      const lat = Math.abs(-rx * hy + ry * hx);
      const sameDir = Math.cos(o.h - this.h) > 0.2;
      if (o.rider && !this.rider && lat > 1.3) continue;   // רכב חולף על פני רוכב בצד הנתיב
      if (this.rider && !o.isPlayer && lat > (this.wid + (o.wid || 1.8)) / 2 + 0.1) continue;   // רוכב בצד הנתיב נחסם רק ממה שבקו שלו
      if (lat < (o.isPlayer ? 2.6 : 2.0) && (sameDir || o.isPlayer)) stopDist = Math.min(stopDist, fwd - 2.6 - (this.len + (o.len || 4.4)) / 2);
      // רכב רגיל שרכב ביטחון מאחוריו מאט (נותן לו לעבור)
    }
    if (!this.siren) for (const o of vehicles) {
      if (!o.siren) continue;
      const rx = o.x - this.x, ry = o.y - this.y, back = -(rx * hx + ry * hy);
      if (back > 0 && back < 40 && Math.cos(o.h - this.h) > 0.5) vT = Math.min(vT, 3);
    }
    let vDes = Math.min(vT, Math.sqrt(Math.max(0, 2 * 3.2 * stopDist)));
    if (stopDist < 0.4) vDes = 0;
    if (this.v < vDes) this.v = Math.min(vDes, this.v + 2.4 * dt);
    else this.v = Math.max(vDes, this.v - 7 * dt);
    this.braking = this.v > 0.1 && vDes < this.v - 0.3 || this.v < 0.1;

    this.s += this.v * dt;
    while (this.s >= this.leg.path.len) {
      const over = this.s - this.leg.path.len;
      if (this.leg.kind === 'edge') { this.startNode(); this.s = over; }
      else { const nx = this.next; this.startEdge(nx.edge, nx.dir, this.leg.lane2, over); }
    }
    this.place();
  }
}

// ===== רכב ביטחון (אמבולנס / משטרה) עם סירנה =====
// מגיע מאחורי הנהג באותו כיוון. כשהנהג מאט ומפנה את הדרך, עוקף אותו משמאל וממשיך.
class Emergency extends NPC {
  constructor(edge, dir, lane, t, kind) {
    super(edge, dir, lane, t);
    this.siren = kind; this.type = null; this.len = 4.6; this.wid = 1.9;
    this.color = '#ffffff';
    this.off = 0; this.age = 0; this.passed = false;
  }
  update(dt, time, vehicles) {
    this.age += dt;
    const pl = vehicles.find(o => o.isPlayer);
    let want = 0;
    if (pl) {
      const hx = Math.cos(this.h), hy = Math.sin(this.h);
      const rx = pl.x - this.x, ry = pl.y - this.y;
      const fwd = rx * hx + ry * hy, lat = -rx * hy + ry * hx - this.off;
      // הנהג מלפנים באותו נתיב: עוקפים משמאל אחרי שהוא האט
      if (fwd > -6 && fwd < 30 && Math.abs(lat) < 2.6 && Math.abs(pl.v) < 4 && this.leg.kind === 'edge') want = 3.4;
      if (fwd < -14) this.passed = true;
      if (this.off > 0.5 && fwd > -12 && fwd < 30) want = 3.4;
    }
    this.off += Math.max(-dt * 1.6, Math.min(dt * 1.6, want - this.off));
    super.update(dt, time, vehicles);
  }
}
// ===== רוכבי אופניים וקורקינטים חשמליים: נוסעים לאט בצד ימין של הנתיב הימני =====
class Rider extends NPC {
  constructor(edge, dir, lane, t, kind) {
    super(edge, dir, lane, t);
    this.rider = kind; this.type = null;
    this.len = 1.8; this.wid = 0.7;
    this.maxV = (kind === 'bike' ? 18 : 22) / 3.6;
    this.color = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#212121'][Math.floor(Math.random() * 5)];
    this.off = 0; this.phase = 0;
  }
  update(dt, time, vehicles) {
    // על הכביש: צמוד לימין (0.3 מ' משפת הנתיב); בצומת: במרכז המסלול
    const want = this.leg.kind === 'edge' ? -(LW / 2 - 0.3 - this.wid / 2) : 0;
    this.off += Math.max(-dt * 1.2, Math.min(dt * 1.2, want - this.off));
    this.phase += dt * this.v * 2.2;
    super.update(dt, time, vehicles);
  }
}
function spawnRiders(count, player) {
  const list = [];
  for (let tries = 0; list.length < count && tries < 300; tries++) {
    const e = edges[Math.floor(Math.random() * edges.length)];
    const dir = e.oneway ? 1 : (Math.random() < 0.5 ? 1 : -1);
    const n = laneCount(e, dir);
    if (!n || e.lim > 60 || e.t1 - e.t0 < 60) continue;
    const t = 10 + Math.random() * (e.t1 - e.t0 - 40);
    const p = edgePoint(e, dir > 0 ? e.t0 + t : e.t1 - t, laneS(e, dir, n - 1));
    if (Math.hypot(p.x - player.x, p.y - player.y) < 60) continue;
    list.push(new Rider(e, dir, n - 1, t, Math.random() < 0.55 ? 'scooter' : 'bike'));
  }
  return list;
}
function emergencyDone(em, player) {
  return em.age > 120 || (em.passed && Math.hypot(em.x - player.x, em.y - player.y) > 220);
}
// יוצר רכב ביטחון 80 מ' מאחורי הנהג באותו נתיב, אם אפשר
function spawnEmergency(player) {
  const loc = locate(player);
  if (!loc || loc.kind !== 'edge' || player.v < 4) return null;
  const e = loc.edge, { t, s } = edgeLocal(e, player);
  const dir = Math.cos(player.h) * e.d.x + Math.sin(player.h) * e.d.y > 0 ? 1 : -1;
  if (laneCount(e, dir) === 0) return null;
  const tb = t - dir * 80;
  if (tb < e.t0 + 5 || tb > e.t1 - 5) return null;
  const lane = laneFromST(e, dir, s * dir).idx;
  const em = new Emergency(e, dir, lane, dir > 0 ? tb - e.t0 : e.t1 - tb, Math.random() < 0.6 ? 'ambulance' : 'police');
  em.v = player.v + 4;
  return em;
}

function spawnNPCs(count, player) {
  const list = [];
  let tries = 0;
  while (list.length < count && tries++ < 500) {
    const e = edges[Math.floor(Math.random() * edges.length)];
    const dir = e.oneway ? 1 : (Math.random() < 0.5 ? 1 : -1);
    const n = laneCount(e, dir);
    const lane = Math.floor(Math.random() * n);
    const span = e.t1 - e.t0;
    if (span < 60) continue;
    const t = 15 + Math.random() * (span - 50);
    const s = laneS(e, dir, lane);
    const p = edgePoint(e, dir > 0 ? e.t0 + t : e.t1 - t, s);
    if (Math.hypot(p.x - player.x, p.y - player.y) < 70) continue;
    if (list.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 14)) continue;
    list.push(new NPC(e, dir, lane, t));
  }
  return list;
}

// ===== מנהל תנועה: רכבים שמגיעים לצומת או לכיכר שהנהג מתקרב אליהם =====
// כדי שיהיה צריך לתת זכות קדימה כמעט בכל צומת, שולחים רכבים מהכיוונים האחרים כך שיגיעו בערך יחד עם הנהג
const director = { timer: 2, node: null, sent: 0 };
function trafficDirector(dt, player, list, base) {
  director.timer -= dt;
  if (director.timer > 0) return;
  director.timer = 1.5;
  // מחזור: רכב רחוק מאוד מפנה מקום (רק כשיש יותר מהכמות הבסיסית)
  const plain = list.filter(o => o.constructor === NPC);
  if (plain.length > base) {
    const far = plain.find(o => Math.hypot(o.x - player.x, o.y - player.y) > 260);
    if (far) list.splice(list.indexOf(far), 1);
  }
  const loc = locate(player);
  if (!loc || loc.kind !== 'edge' || player.v < 1) return;
  const e = loc.edge, hd = Math.cos(player.h) * e.d.x + Math.sin(player.h) * e.d.y, dir = hd > 0 ? 1 : -1;
  const node = toNodeOf(e, dir);
  const distP = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
  if (distP < 25 || distP > 150) return;
  if (director.node !== node) { director.node = node; director.sent = 0; }
  const want = node.type === 'roundabout' ? 3 : 2;
  if (director.sent >= want || plain.length >= base + 8) return;
  // רכבים שכבר בדרך לצומת הזה מכיוונים אחרים
  const coming = list.filter(o => o.leg && o.leg.kind === 'edge' && o.leg.edge !== e && toNodeOf(o.leg.edge, o.leg.dir) === node).length;
  if (coming >= want) return;
  const opts = node.edges.filter(x => x !== e && laneCount(x, exitDirFrom(node, x) * -1) > 0);
  if (!opts.length) return;
  const ex = opts[Math.floor(Math.random() * opts.length)], d2 = -exitDirFrom(node, ex);
  const span = ex.t1 - ex.t0;
  // זמן ההגעה של הנהג, והמרחק שהרכב האחר יעבור באותו זמן
  const tArrive = distP / Math.max(player.v, 5);
  const dist = Math.max(30, Math.min(span - 10, tArrive * ex.lim / 3.6 * 0.8 + (Math.random() - 0.3) * 15));
  if (dist < 25) return;
  const lane = Math.floor(Math.random() * laneCount(ex, d2));
  const s0 = laneS(ex, d2, lane), pt = edgePoint(ex, d2 > 0 ? ex.t1 - dist : ex.t0 + dist, s0);
  if (Math.hypot(pt.x - player.x, pt.y - player.y) < 35) return;
  if (list.some(o => Math.hypot(o.x - pt.x, o.y - pt.y) < 14)) return;
  const npc = new NPC(ex, d2, null, span - dist);
  if (npc.type === 'bus') return;
  list.push(npc);
  director.sent++;
}

// ===== הולכי רגל =====
const PED_COLORS = ['#e05a47', '#3a7bd5', '#f2c14e', '#7b5ea7', '#2a9d8f', '#f28482'];

function updatePeds(dt, player) {
  for (const cw of crosswalks) {
    const e = cw.edge;
    cw.timer -= dt;
    // הולכי רגל מגיעים בקבוצות ולא ברצף, כדי שהתנועה לא תיתקע לנצח במעבר רחב
    if (cw.timer <= 0 && !cw.peds.some(pd => pd.state === 'cross')) {
      cw.timer = 12 + Math.random() * 16;
      const side = Math.random() < 0.5 ? 1 : -1;
      cw.peds.push({
        side, s: side > 0 ? e.sMax + 1.3 : e.sMin - 1.3, jit: (Math.random() - 0.5) * 2.2,
        state: 'wait', wait: 1 + Math.random() * 2, speed: 1.2 + Math.random() * 0.4,
        color: PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)], phase: Math.random() * 6,
      });
    }
    for (const pd of cw.peds) {
      if (pd.state === 'wait') {
        pd.wait -= dt;
        if (pd.wait <= 0) {
          // הולך רגל לא יקפוץ ממש מול רכב קרוב ומהיר
          const { t } = edgeLocal(e, player);
          const near = Math.abs(t - cw.t) < 16 && Math.abs(player.v) > 3 && Math.abs(edgeLocal(e, player).s) < e.half + 2;
          if (!near) pd.state = 'cross'; else pd.wait = 0.5;
        }
      } else if (pd.state === 'cross') {
        pd.s -= pd.side * pd.speed * dt;
        pd.phase += dt * 8;
        if (pd.side > 0 ? pd.s <= e.sMin - 1.3 : pd.s >= e.sMax + 1.3) { pd.state = 'leave'; pd.wait = 2; }
      } else {
        pd.wait -= dt;
      }
      const p = edgePoint(e, cw.t + pd.jit, pd.s);
      pd.x = p.x; pd.y = p.y;
    }
    cw.peds = cw.peds.filter(pd => !(pd.state === 'leave' && pd.wait <= 0));
  }
}
function pedOnRoad(cw) {
  return cw.peds.some(pd => pd.state === 'cross' && pd.s < cw.edge.sMax + 0.6 && pd.s > cw.edge.sMin - 0.6);
}
