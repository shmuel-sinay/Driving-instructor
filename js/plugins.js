'use strict';
// ===== תוספים: חוקים חדשים לבוחן, כתובים בקוד (למשל על ידי Gemini) =====
// תוסף הוא קוד JavaScript שמקבל אובייקט DP ומוסיף חוקים עם DP.addRule(...).
// המסמך המלא לכותבי תוספים: docs/gemini-plugin-prompt.md (ו-PLUGIN_PROMPT ב-js/prompt.js)

const Plugins = {
  list: [],          // { key, name, description, code, enabled, builtin, error, rules, drawers }
  loading: null,
  visit: null,       // מעקב אחרי הצומת שבו הרכב נמצא עכשיו
  prevV: new Map(),
  lastSense: null,
  evalOK: (() => { try { return new Function('return 1')() === 1; } catch (e) { return false; } })(),
};

const PLUGIN_STORE = 'driving-practice.plugins';

// ===== עזרים =====
const blinkName = b => (b === -1 ? 'left' : b === 1 ? 'right' : null);
const lightName = st => (st === 'redyellow' ? 'redYellow' : st);
const nodeTypeName = n => (n.type === 'plain' || n.type === 'priority' ? 'junction' : n.type);

function junctionInfo(node, edge, time) {
  const info = {
    id: node.id, type: nodeTypeName(node), control: edge ? control(node, edge) : 'none',
    light: null, roadCount: node.edges.length, exits: [],
  };
  if (edge && node.type === 'light') info.light = lightName(lightState(node, axisOf(edge), time));
  if (edge) {
    const din = node === edge.b ? edge.d : { x: -edge.d.x, y: -edge.d.y };
    for (const x of node.edges) {
      if (x === edge || !canExit(node, x)) continue;
      const ex = { roadId: x.id, roadName: x.name, turn: turnType(din, dirVec(x, exitDirFrom(node, x))), lanes: laneCount(x, exitDirFrom(node, x)) };
      if (node.type === 'roundabout') ex.exitNumber = rbExitNumber(node, edge, x);
      info.exits.push(ex);
    }
  }
  return info;
}

function ringLaneAt(node, x, y) {
  const r = Math.hypot(x - node.x, y - node.y);
  return r < RB_IN ? 'island' : r < RB_RING ? 'inner' : 'outer';
}

function whereIs(v) {
  const loc = locate(v);
  if (!loc) return { where: 'off' };
  if (loc.kind === 'node') {
    const w = { where: 'junction', junctionId: loc.node.id };
    if (loc.node.type === 'roundabout') w.ringLane = ringLaneAt(loc.node, v.x, v.y);
    return w;
  }
  const e = loc.edge, hd = Math.cos(v.h) * e.d.x + Math.sin(v.h) * e.d.y, dir = hd >= 0 ? 1 : -1;
  const n = laneCount(e, dir);
  const L = n ? laneFromST(e, dir, Math.max(0, loc.s * dir)) : null;
  return { where: 'road', roadId: e.id, lane: L ? L.idx : null, lanes: n, distanceToJunction: dir > 0 ? e.t1 - loc.t : loc.t - e.t0, nextJunctionId: toNodeOf(e, dir).id };
}

// ===== חיישנים: תמונת מצב שמועברת לכל חוק בכל פריים =====
function sense(time, dt, p, vehicles) {
  const loc = locate(p);
  const hx = Math.cos(p.h), hy = Math.sin(p.h);
  const rx = -hy, ry = hx;   // ימין של הרכב
  const s = {
    time, dt,
    car: {
      x: p.x, y: p.y, heading: p.h, speed: p.v, speedKmh: Math.abs(p.v) * 3.6,
      gear: p.gear === 'R' ? 'reverse' : 'drive', blinker: blinkName(p.blinker),
      steering: p.steer, braking: p.braking, gas: input.up, length: p.len, width: p.wid,
    },
    blinkerUsed: (side, secondsBack) => Rules.wasOn(side === 'left' ? -1 : 1, time - secondsBack, time),
    where: !loc ? 'off' : loc.kind === 'edge' ? 'road' : 'junction',
    road: null, junction: null, nextJunction: null, crosswalkAhead: null,
    vehicles: [], pedestrians: [],
    instruction: !Rules.instr ? null : Rules.instr.kind === 'turn'
      ? { kind: 'turn', junctionId: Rules.instr.node.id, toRoadId: Rules.instr.edge.id, turn: Rules.instr.turn, text: Rules.instr.text }
      : { kind: Rules.instr.kind, side: Rules.instr.side || null, text: Rules.instr.text },
    parking: assist.on && assist.st ? (assist.st.kind === 'parked' ? 'parked' : assist.st.kind === 'park-in' ? 'parking' : assist.st.kind === 'park-out' ? 'leaving' : null) : null,
    score: Rules.score, mapName: currentMap ? currentMap.name : '',
  };
  if (loc && loc.kind === 'edge') {
    const e = loc.edge, hd = hx * e.d.x + hy * e.d.y, dir = hd >= 0 ? 1 : -1;
    const n = laneCount(e, dir), sT = loc.s * dir;
    const L = n ? laneFromST(e, dir, Math.max(0, sT)) : null;
    const distToEnd = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
    s.road = {
      id: e.id, name: e.name, speedLimit: e.lim, oneWay: e.oneway, school: e.school, overtakingAllowed: e.pass,
      lanes: n, lanesOpposite: laneCount(e, -dir),
      lane: L ? L.idx : null, laneFromRight: L ? n - 1 - L.idx : null,
      isRightmostLane: L ? L.idx === n - 1 : false, isLeftmostLane: L ? L.idx === 0 : false,
      offsetFromCenter: sT, width: e.W,
      onWrongSide: e.oneway ? dir < 0 : sT < 0,
      alignedWithRoad: Math.abs(hd) > 0.85,
      distanceToJunction: distToEnd, distanceFromJunction: dir > 0 ? loc.t - e.t0 : e.t1 - loc.t, length: e.t1 - e.t0,
    };
    const node = toNodeOf(e, dir);
    s.nextJunction = Object.assign(junctionInfo(node, e, time), { distance: distToEnd, distanceToStopLine: distToEnd });
    let best = null;
    for (const cw of e.crosswalks) {
      const d = (dir > 0 ? cw.t - loc.t : loc.t - cw.t) - 1.8;
      if (d > -4 && (!best || d < best.distance)) {
        best = {
          distance: d,
          pedestriansCrossing: cw.peds.filter(q => q.state === 'cross').length,
          pedestriansWaiting: cw.peds.filter(q => q.state === 'wait').length,
          pedestrianOnRoad: pedOnRoad(cw),
        };
      }
    }
    s.crosswalkAhead = best;
  }
  if (loc && loc.kind === 'node') {
    const n = loc.node, v = Plugins.visit && Plugins.visit.node === n ? Plugins.visit : null;
    s.junction = {
      id: n.id, type: nodeTypeName(n), roadCount: n.edges.length,
      timeInside: v ? time - v.time : 0, enteredFromRoadId: v && v.fromEdge ? v.fromEdge.id : null,
      stops: v ? v.stops : 0, stoppedSeconds: v ? v.stoppedTime : 0,
    };
    if (n.type === 'roundabout') {
      s.junction.ringLane = ringLaneAt(n, p.x, p.y);
      s.junction.distanceFromCenter = Math.hypot(p.x - n.x, p.y - n.y);
      s.junction.exitsPassed = v ? v.exitsPassed : 0;
      s.junction.ringLaneChanges = v ? v.ringChanges.slice() : [];
    }
  }
  for (const o of vehicles) {
    if (o === p) continue;
    const dx = o.x - p.x, dy = o.y - p.y;
    const prev = Plugins.prevV.get(o);
    s.vehicles.push(Object.assign({
      ahead: dx * hx + dy * hy, side: dx * rx + dy * ry, distance: Math.hypot(dx, dy),
      speedKmh: Math.abs(o.v) * 3.6, accel: prev == null || !dt ? 0 : (o.v - prev) / dt,
      braking: !!o.braking, blinker: blinkName(o.blinker), heading: o.h,
      sameDirection: Math.cos(o.h - p.h) > 0.7, oppositeDirection: Math.cos(o.h - p.h) < -0.7, parked: !!o.isParked,
      x: o.x, y: o.y,
    }, whereIs(o)));
  }
  for (const cw of crosswalks) for (const pd of cw.peds) {
    const dx = pd.x - p.x, dy = pd.y - p.y;
    s.pedestrians.push({
      roadId: cw.edge.id, state: pd.state === 'wait' ? 'waiting' : pd.state === 'cross' ? 'crossing' : 'leaving',
      onRoad: pd.state === 'cross' && pd.s < cw.edge.sMax + 0.6 && pd.s > cw.edge.sMin - 0.6,
      ahead: dx * hx + dy * hy, side: dx * rx + dy * ry, distance: Math.hypot(dx, dy), x: pd.x, y: pd.y,
    });
  }
  return s;
}

// ===== מעקב אחרי ביקור בצומת =====
function startVisit(node, edge, time, p) {
  const v = {
    node, fromEdge: edge, time, stops: 0, stoppedTime: 0, wasStopped: false,
    minSpeedKmh: Math.abs(p.v) * 3.6, maxSpeedKmh: Math.abs(p.v) * 3.6,
    exitsPassed: 0, ringChanges: [], ringLane: null, ringLaneAtEntry: null, angle: 0,
    lastAng: Math.atan2(p.y - node.y, p.x - node.x),
    entryLane: null, entryLanes: edge ? laneCount(edge, node === edge.b ? 1 : -1) : 0,
  };
  const lastRoad = Plugins.lastSense && Plugins.lastSense.road;
  if (edge && lastRoad && lastRoad.id === edge.id) v.entryLane = lastRoad.lane;
  Plugins.visit = v;
}
function trackVisit(time, dt, p) {
  const v = Plugins.visit;
  if (!v || !nodeContains(v.node, p)) return;
  const kmh = Math.abs(p.v) * 3.6;
  v.minSpeedKmh = Math.min(v.minSpeedKmh, kmh); v.maxSpeedKmh = Math.max(v.maxSpeedKmh, kmh);
  const stopped = Math.abs(p.v) < 0.3;
  if (stopped) { v.stoppedTime += dt; if (!v.wasStopped) v.stops++; }
  v.wasStopped = stopped;
  if (v.node.type === 'roundabout' && v.fromEdge) {
    const lane = ringLaneAt(v.node, p.x, p.y);
    const r = Math.hypot(p.x - v.node.x, p.y - v.node.y);
    if (r < RB_OUT - 2) {
      if (!v.ringLaneAtEntry) v.ringLaneAtEntry = lane;
      if (v.ringLane && lane !== v.ringLane && lane !== 'island') v.ringChanges.push({ time, from: v.ringLane, to: lane, blinker: blinkName(p.blinker) });
      if (lane !== 'island') v.ringLane = lane;
    }
    const a = Math.atan2(p.y - v.node.y, p.x - v.node.x);
    v.angle += angNorm(v.lastAng - a);   // כיוון התנועה בכיכר = זווית יורדת
    v.lastAng = a;
    const o = otherEnd(v.fromEdge, v.node);
    const thIn = Math.atan2(o.y - v.node.y, o.x - v.node.x);
    v.exitsPassed = v.node.edges.filter(x => {
      if (x === v.fromEdge) return false;
      const q = otherEnd(x, v.node);
      let d = thIn - Math.atan2(q.y - v.node.y, q.x - v.node.x);
      while (d <= 0) d += 2 * Math.PI;
      return d + 0.35 < v.angle;
    }).length;
  }
}

// ===== הפעלת החוקים =====
function pluginReport(pl, rule, res, time) {
  if (!res) return;
  const text = typeof res === 'string' ? res : res.text;
  if (!text) return;
  const severe = typeof res === 'object' && res.severe != null ? !!res.severe : rule.severity === 'severe';
  Rules.report('plugin:' + pl.key + ':' + rule.id, String(text).slice(0, 140), severe, time, rule.cooldown == null ? 6 : rule.cooldown);
}
function runHook(pl, rule, fnName, args, time) {
  if (pl.error || rule.disabled || typeof rule[fnName] !== 'function') return;
  try { pluginReport(pl, rule, rule[fnName](...args, rule.mem), time); }
  catch (err) {
    rule.fails = (rule.fails || 0) + 1;
    if (rule.fails >= 3) {
      rule.disabled = true;
      pl.error = `החוק "${rule.id}" נכשל ב-${fnName}: ${err.message}`;
      if (Rules.onEvent) Rules.onEvent('bad', { text: `התוסף "${pl.name}" הושבת בגלל שגיאה. פרטים במסך התוספים.`, severe: false, pts: 0, time });
    }
  }
}
function activeRules() {
  const out = [];
  for (const pl of Plugins.list) if (pl.enabled && !pl.error) for (const r of pl.rules) out.push([pl, r]);
  return out;
}

Plugins.tick = function (time, dt, p, vehicles) {
  trackVisit(time, dt, p);
  const s = sense(time, dt, p, vehicles);
  Plugins.lastSense = s;
  for (const [pl, r] of activeRules()) runHook(pl, r, 'check', [s], time);
  for (const o of vehicles) Plugins.prevV.set(o, o.v);
};
Plugins.enterJunction = function (node, edge, time, p) {
  const before = Plugins.lastSense;
  startVisit(node, edge, time, p);
  const s = before || sense(time, 0, p, [p]);
  const ev = Object.assign(junctionInfo(node, edge, time), {
    junctionId: node.id, fromRoadId: edge ? edge.id : null, speedKmh: Math.abs(p.v) * 3.6,
    lane: Plugins.visit.entryLane, lanes: Plugins.visit.entryLanes,
    stoppedBeforeLine: edge ? !!Rules.stopped[edge.id + node.id] : false,
  });
  for (const [pl, r] of activeRules()) runHook(pl, r, 'onEnterJunction', [s, ev], time);
};
Plugins.exitJunction = function (node, edge, time, p) {
  const v = Plugins.visit;
  Plugins.visit = null;
  if (!v || v.node !== node) return;
  const dirOut = node === edge.a ? edge.d : { x: -edge.d.x, y: -edge.d.y };
  let turn = null;
  if (v.fromEdge) {
    const din = node === v.fromEdge.b ? v.fromEdge.d : { x: -v.fromEdge.d.x, y: -v.fromEdge.d.y };
    turn = edge === v.fromEdge ? 'uturn' : turnType(din, dirOut);
  }
  const s = sense(time, 0, p, [p, ...(typeof npcs !== 'undefined' ? npcs : [])]);
  const ev = {
    junctionId: node.id, type: nodeTypeName(node), fromRoadId: v.fromEdge ? v.fromEdge.id : null, toRoadId: edge.id,
    turn, exitNumber: node.type === 'roundabout' && v.fromEdge ? rbExitNumber(node, v.fromEdge, edge) : null,
    entryLane: v.entryLane, entryLanes: v.entryLanes,
    exitLanes: laneCount(edge, exitDirFrom(node, edge)),
    timeInside: time - v.time, minSpeedKmh: v.minSpeedKmh, maxSpeedKmh: v.maxSpeedKmh,
    stops: v.stops, stoppedSeconds: v.stoppedTime,
    ringLaneAtEntry: v.ringLaneAtEntry, ringLaneAtExit: v.ringLane, ringLaneChanges: v.ringChanges,
    wrongExitDirection: edge.oneway && node === edge.b,
    instructionFollowed: Rules.instr && Rules.instr.kind === 'turn' && Rules.instr.node === node ? Rules.instr.edge === edge : null,
  };
  for (const [pl, r] of activeRules()) runHook(pl, r, 'onExitJunction', [s, ev], time);
};
Plugins.draw = function (ctx) {
  const s = Plugins.lastSense;
  if (!s) return;
  for (const pl of Plugins.list) {
    if (!pl.enabled || pl.error) continue;
    for (const d of pl.drawers) {
      try { ctx.save(); d(ctx, s); } catch (err) { pl.error = 'שגיאה בציור: ' + err.message; } finally { ctx.restore(); }
    }
  }
};
Plugins.reset = function () {
  Plugins.visit = null; Plugins.prevV = new Map(); Plugins.lastSense = null;
  for (const pl of Plugins.list) for (const r of pl.rules) { r.mem = {}; r.fails = 0; }
};

// ===== טעינת תוסף =====
function extractCode(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return t;
}
function pluginMeta(code) {
  const get = k => { const m = code.match(new RegExp('//\\s*@' + k + '\\s+(.+)')); return m ? m[1].trim() : ''; };
  return { name: get('name'), description: get('description') };
}

function compilePlugin(code, opts = {}) {
  const meta = pluginMeta(code);
  const pl = {
    key: opts.key || ('p' + Math.random().toString(36).slice(2, 9)), code,
    name: (meta.name || 'תוסף ללא שם').slice(0, 60), description: meta.description.slice(0, 200),
    enabled: opts.enabled !== false, builtin: !!opts.builtin, error: null, rules: [], drawers: [],
  };
  if (!Plugins.evalOK) { pl.error = 'בגרסה שפתוחה באתר אי אפשר להריץ תוספים. הורד את הקובץ driving-practice.html ופתח אותו מהמחשב.'; return pl; }
  const errors = [];
  const api = {
    addRule(r) {
      if (!r || typeof r !== 'object') { errors.push('DP.addRule קיבל משהו שאינו אובייקט.'); return; }
      if (!r.id || typeof r.id !== 'string') errors.push('לכל חוק חייב להיות "id" (מחרוזת).');
      else if (pl.rules.some(x => x.id === r.id)) errors.push(`ה-id "${r.id}" מופיע פעמיים.`);
      if (!['minor', 'severe'].includes(r.severity)) errors.push(`בחוק "${r.id}": "severity" חייב להיות "minor" או "severe".`);
      if (!['check', 'onEnterJunction', 'onExitJunction'].some(k => typeof r[k] === 'function')) errors.push(`בחוק "${r.id}" חסרה פונקציה: check, onEnterJunction או onExitJunction.`);
      pl.rules.push(Object.assign({}, r, { mem: {}, fails: 0 }));
    },
    onDraw(fn) { if (typeof fn === 'function') pl.drawers.push(fn); else errors.push('DP.onDraw צריך לקבל פונקציה.'); },
    say(text) { if (Rules.onEvent) Rules.onEvent('good', { text: String(text).slice(0, 120) }); },
    lightState(junctionId, roadId) {
      const n = nodes[junctionId], e = edgeById[roadId];
      return n && e && n.type === 'light' ? lightName(lightState(n, axisOf(e), Plugins.lastSense ? Plugins.lastSense.time : 0)) : null;
    },
    get map() { return currentMap ? JSON.parse(JSON.stringify(currentMap)) : null; },
    angleDiff: (a, b) => angNorm(a - b),
  };
  try { new Function('DP', '"use strict";\n' + code)(api); }
  catch (err) { pl.error = 'שגיאה בקוד: ' + err.message; return pl; }
  if (!errors.length && !pl.rules.length && !pl.drawers.length) errors.push('התוסף לא הוסיף אף חוק. צריך לקרוא ל-DP.addRule({...}).');
  if (errors.length) { pl.error = errors.join(' '); return pl; }
  // הרצת ניסיון אחת כדי לתפוס שגיאות מוקדם
  const s = Plugins.lastSense || sense(0, 0, player, [player]);
  for (const r of pl.rules) {
    if (typeof r.check !== 'function') continue;
    try { r.check(s, {}); } catch (err) { pl.error = `החוק "${r.id}" נכשל בהרצת ניסיון: ${err.message}`; break; }
  }
  return pl;
}

function savedPlugins() {
  try { const v = JSON.parse(localStorage.getItem(PLUGIN_STORE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function storePlugins() {
  const data = Plugins.list.filter(p => !p.builtin).map(p => ({ key: p.key, code: p.code, enabled: p.enabled }));
  const builtinState = Plugins.list.filter(p => p.builtin).map(p => ({ key: p.key, builtin: true, enabled: p.enabled }));
  try { localStorage.setItem(PLUGIN_STORE, JSON.stringify(data.concat(builtinState))); return true; } catch (e) { return false; }
}
function initPlugins() {
  const saved = savedPlugins();
  for (const b of BUILTIN_PLUGINS) {
    const st = saved.find(x => x.builtin && x.key === b.key);
    Plugins.list.push(compilePlugin(b.code, { key: b.key, builtin: true, enabled: st ? st.enabled : true }));
  }
  for (const x of saved) if (!x.builtin && x.code) Plugins.list.push(compilePlugin(x.code, { key: x.key, enabled: x.enabled }));
}

// ===== תוספים לדוגמה (מובנים) =====
const BUILTIN_PLUGINS = [
  {
    key: 'ex-forgot-blinker',
    code: `// @name דוגמה: שכחת לכבות איתות
// @description אם האיתות דולק יותר מ-6 שניות בנסיעה ישרה בכביש, בלי צומת קרוב
DP.addRule({
  id: 'forgot-blinker',
  name: 'איתות שנשאר דולק',
  severity: 'minor',
  cooldown: 15,
  check(s, mem) {
    const r = s.road;
    const straight = r && r.alignedWithRoad && r.distanceToJunction > 100 && s.car.speedKmh > 15;
    if (s.car.blinker && straight) mem.t = (mem.t || 0) + s.dt; else mem.t = 0;
    if (mem.t > 6) { mem.t = 0; return 'איתות דולק בלי סיבה: שכחת לכבות אותו'; }
  },
});`,
  },
  {
    key: 'ex-reverse-junction',
    code: `// @name דוגמה: נסיעה לאחור בצומת
// @description אסור לנסוע לאחור בתוך צומת או פחות מ-12 מטר ממנו
DP.addRule({
  id: 'reverse-near-junction',
  name: 'נסיעה לאחור בצומת',
  severity: 'minor',
  cooldown: 8,
  check(s) {
    if (s.car.gear !== 'reverse' || s.car.speedKmh < 1) return;
    const near = s.where === 'junction' || (s.road && (s.road.distanceToJunction < 12 || s.road.distanceFromJunction < 12));
    if (near) return 'נסיעה לאחור בתוך צומת או קרוב אליו';
  },
});`,
  },
  {
    key: 'ex-fast-turn',
    code: `// @name דוגמה: פנייה מהירה מדי
// @description פנייה ימינה או שמאלה בצומת במהירות מעל 30 קמ"ש
DP.addRule({
  id: 'fast-turn',
  name: 'פנייה מהירה מדי',
  severity: 'minor',
  cooldown: 4,
  onExitJunction(s, ev) {
    if ((ev.turn === 'left' || ev.turn === 'right') && ev.type !== 'roundabout' && ev.maxSpeedKmh > 30) {
      return 'פנייה מהירה מדי (' + Math.round(ev.maxSpeedKmh) + ' קמ"ש). יש להאט לפני הפנייה';
    }
  },
});`,
  },
];
