'use strict';
// ===== ציור =====

const COL = {
  grass: '#6f9a4a', grassDark: '#5f8a3e', sidewalk: '#c9c4b8', curb: '#9d978a',
  asphalt: '#3d4045', asphaltNode: '#3a3d42', line: '#f2f0ea', yellow: '#f2c230', parking: '#46494f',
  island: '#7fae55',
};

// ===== סצנה סטטית: בניינים, עצים, תמרורים =====
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const scenery = { buildings: [], trees: [] };
function buildScenery() {
  scenery.buildings.length = 0; scenery.trees.length = 0;
  const rnd = seeded(1234);
  const rbs = nodeList.filter(n => n.type === 'roundabout');
  const nearRb = (x, y, w, h) => rbs.some(n => Math.max(Math.abs(n.x - (x + w / 2)) - w / 2, 0) ** 2 + Math.max(Math.abs(n.y - (y + h / 2)) - h / 2, 0) ** 2 < 26 * 26);
  const xs = [...new Set(nodeList.map(n => n.x))].sort((a, b) => a - b);
  const ys = [...new Set(nodeList.map(n => n.y))].sort((a, b) => a - b);
  const cells = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) cells.push([xs[i], ys[j], xs[i + 1], ys[j + 1]]);
  for (let i = 0; i < xs.length - 1; i++) { cells.push([xs[i], ys[0] - 110, xs[i + 1], ys[0]]); cells.push([xs[i], ys[ys.length - 1], xs[i + 1], ys[ys.length - 1] + 110]); }
  for (let j = 0; j < ys.length - 1; j++) { cells.push([xs[0] - 110, ys[j], xs[0], ys[j + 1]]); cells.push([xs[xs.length - 1], ys[j], xs[xs.length - 1] + 110, ys[j + 1]]); }
  const roofs = ['#b5651d', '#a0522d', '#8c8c8c', '#c2b280', '#9e9e9e', '#d2b48c', '#7a6a5a', '#b0a090'];
  for (const [x0, y0, x1, y1] of cells) {
    if (x1 - x0 < 70 || y1 - y0 < 70) continue;
    const m = 20;
    let x = x0 + m;
    while (x < x1 - m - 10) {
      const w = 14 + rnd() * 18;
      if (x + w > x1 - m) break;
      const hTop = 12 + rnd() * 14, hBot = 12 + rnd() * 14;
      const c1 = roofs[Math.floor(rnd() * roofs.length)], c2 = roofs[Math.floor(rnd() * roofs.length)];
      if (y1 - y0 > 2 * m + hTop + hBot + 6) {
        if (!nearRb(x, y0 + m, w, hTop)) scenery.buildings.push({ x, y: y0 + m, w, h: hTop, c: c1 });
        if (!nearRb(x, y1 - m - hBot, w, hBot)) scenery.buildings.push({ x, y: y1 - m - hBot, w, h: hBot, c: c2 });
      }
      x += w + 4 + rnd() * 8;
    }
    for (let k = 0; k < 10; k++) {
      const tx = x0 + 25 + rnd() * (x1 - x0 - 50), ty = y0 + 50 + rnd() * (y1 - y0 - 100);
      if (ty > y0 + 45 && ty < y1 - 45 && !nearRb(tx, ty, 0, 0)) scenery.trees.push({ x: tx, y: ty, r: 2.5 + rnd() * 2.5 });
    }
  }
}

const signs = [];
function buildSigns() {
  signs.length = 0;
  const add = (p, o) => signs.push(Object.assign(p, o));
  for (const e of edges) {
    for (const dir of [1, -1]) {
      if (!laneCount(e, dir)) continue;
      // שוליים ימניים לכיוון הנסיעה
      const side = dir > 0 ? e.sMax + 1.6 : -e.sMin + 1.6;
      const span = e.t1 - e.t0;
      const tStart = dir > 0 ? e.t0 + 12 : e.t1 - 12;
      const tEnd = dir > 0 ? e.t1 - 6 : e.t0 + 6;
      const at = (t, off = 0) => edgePoint(e, t, (side + off) * dir);
      const back = (m) => tEnd - m * dir;          // m מטרים לפני הצומת
      const fwd = (m) => tStart + m * dir;         // m מטרים אחרי ההתחלה
      add(at(tStart), { kind: 'speed', val: e.lim, dir, edge: e });
      if (e.school) add(at(fwd(7)), { kind: 'school', dir, edge: e });
      if (e.oneway) add(at(fwd(7)), { kind: 'oneway', ang: Math.atan2(e.d.y, e.d.x), dir, edge: e });
      const rs = parkStripOf(e, dir, 'right');
      if (rs) add(at(fwd(14)), { kind: 'parking', dir, edge: e });
      else if (e.lim <= 50 && span > 120) add(at(fwd(14)), { kind: 'noparking', dir, edge: e });
      const node = toNodeOf(e, dir);
      const ctrl = control(node, e);
      // תמרורי אזהרה לפני צומת
      if (span > 140) {
        if (ctrl === 'light') add(at(back(65)), { kind: 'lightahead', dir, edge: e });
        else if (ctrl === 'roundabout') add(at(back(65)), { kind: 'rbahead', dir, edge: e });
        else if (ctrl === 'stop' || ctrl === 'yield') add(at(back(65)), { kind: 'junctionahead', dir, edge: e });
      }
      if (ctrl === 'none' && node.type === 'priority') add(at(back(30)), { kind: 'priority', dir, edge: e });
      if (ctrl === 'stop') add(at(tEnd), { kind: 'stop', dir, edge: e });
      else if (ctrl === 'yield') add(at(tEnd), { kind: 'yield', dir, edge: e });
      else if (ctrl === 'roundabout') { add(at(back(4)), { kind: 'roundabout', dir, edge: e }); add(at(tEnd), { kind: 'yield', dir, edge: e }); }
      else if (ctrl === 'light') add(at(dir > 0 ? e.t1 - 1 : e.t0 + 1, -0.4), { kind: 'light', node, edge: e, dir, ang: Math.atan2(e.d.y * dir, e.d.x * dir) });
      // איסורי פנייה
      const bans = dir > 0 ? e.banTo : e.banFrom;
      bans.forEach((turn, i) => add(at(back(10 + i * 3)), { kind: 'ban', val: turn, dir, edge: e }));
      for (const cw of e.crosswalks) {
        add(at(cw.t - 6 * dir), { kind: 'cross', dir, edge: e });
        const tw = cw.t - 45 * dir;
        if ((tw - e.t0) * (e.t1 - tw) > 0 && Math.abs(tw - (dir > 0 ? e.t0 : e.t1)) > 20) add(at(tw), { kind: 'crossahead', dir, edge: e });
      }
      for (const bt of e.bumps) {
        const tw = bt - 25 * dir;
        if ((tw - e.t0) * (e.t1 - tw) > 0) add(at(tw), { kind: 'bump', dir, edge: e });
      }
    }
    // אין כניסה בקצה של רחוב חד-סטרי
    if (e.oneway) {
      add(edgePoint(e, e.t1 - 4, e.sMin - 1.6), { kind: 'noentry', dir: -1, edge: e });
      add(edgePoint(e, e.t1 - 4, e.sMax + 1.6), { kind: 'noentry', dir: -1, edge: e });
    }
  }
}

// ===== מצלמה =====
const cam = { x: player.x, y: player.y, rot: -Math.PI / 2, zoom: 9, mode: 'chase', userZoom: 1 };

function updateCamera(dt, W, H) {
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (player.x - cam.x) * k;
  cam.y += (player.y - cam.y) * k;
  const targetRot = cam.mode === 'chase' ? -Math.PI / 2 - player.h : 0;
  cam.rot += angNorm(targetRot - cam.rot) * (1 - Math.exp(-dt * 3.5));
  const base = Math.min(W, H) / 58;
  const z = base * (1.15 - Math.min(0.4, Math.abs(player.v) * 0.018)) * cam.userZoom;
  cam.zoom += (z - cam.zoom) * (1 - Math.exp(-dt * 2));
}

function upright(ctx, x, y, fn) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-cam.rot); fn(); ctx.restore();
}

// ===== ציור הכבישים =====
function drawRoads(ctx) {
  // מדרכות
  ctx.fillStyle = COL.sidewalk;
  for (const e of edges) rectAlong(ctx, e, 0, e.len, e.sMin - SIDEWALK, e.sMax + SIDEWALK);
  for (const n of nodeList) {
    if (n.type === 'roundabout') { circle(ctx, n.x, n.y, RB_OUT + SIDEWALK); ctx.fill(); }
    else ctx.fillRect(n.x - n.hx - SIDEWALK, n.y - n.hy - SIDEWALK, 2 * (n.hx + SIDEWALK), 2 * (n.hy + SIDEWALK));
  }
  // אספלט
  ctx.fillStyle = COL.asphalt;
  for (const e of edges) rectAlong(ctx, e, 0, e.len, e.sMin, e.sMax);
  // רצועות חניה בגוון מעט שונה
  ctx.fillStyle = COL.parking;
  for (const e of edges) {
    if (e.pf) rectAlong(ctx, e, e.t0, e.t1, e.laneR, e.sMax);
    if (e.pb) rectAlong(ctx, e, e.t0, e.t1, e.sMin, -e.laneL);
  }
  for (const n of nodeList) {
    ctx.fillStyle = COL.asphaltNode;
    if (n.type === 'roundabout') { circle(ctx, n.x, n.y, RB_OUT); ctx.fill(); }
    else ctx.fillRect(n.x - n.hx, n.y - n.hy, 2 * n.hx, 2 * n.hy);
  }
}

function rectAlong(ctx, e, t0, t1, sLo, sHi) {
  const p = [edgePoint(e, t0, sLo), edgePoint(e, t1, sLo), edgePoint(e, t1, sHi), edgePoint(e, t0, sHi)];
  ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y); ctx.closePath(); ctx.fill();
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function lineAlong(ctx, e, t0, t1, s) {
  const a = edgePoint(e, t0, s), b = edgePoint(e, t1, s);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function drawMarkings(ctx) {
  ctx.lineCap = 'butt';
  for (const e of edges) {
    ctx.strokeStyle = COL.line;
    // קווי שוליים
    ctx.lineWidth = 0.15; ctx.setLineDash([]);
    lineAlong(ctx, e, e.t0, e.t1, e.laneR - (e.pf ? 0 : 0.3));
    lineAlong(ctx, e, e.t0, e.t1, -e.laneL + (e.pb ? 0 : 0.3));
    // קו הפרדה בין כיוונים
    if (!e.oneway) {
      if (e.pass) { ctx.setLineDash([3, 5]); ctx.lineWidth = 0.15; lineAlong(ctx, e, e.t0 + 25, e.t1 - 25, 0); ctx.setLineDash([]); lineAlong(ctx, e, e.t0, e.t0 + 25, 0); lineAlong(ctx, e, e.t1 - 25, e.t1, 0); }
      else if (e.nf + e.nb >= 4) { ctx.lineWidth = 0.14; lineAlong(ctx, e, e.t0, e.t1, 0.18); lineAlong(ctx, e, e.t0, e.t1, -0.18); }
      else { ctx.lineWidth = 0.16; lineAlong(ctx, e, e.t0, e.t1, 0); }
    }
    // קווים בין נתיבים באותו כיוון: מקווקו, ורצוף לפני הצומת
    ctx.lineWidth = 0.14;
    for (const dir of [1, -1]) {
      const n = laneCount(e, dir);
      for (let i = 0; i < n - 1; i++) {
        const s = (laneS(e, dir, i) + laneS(e, dir, i + 1)) / 2;
        ctx.setLineDash([3, 6]);
        lineAlong(ctx, e, e.t0 + 22, e.t1 - 22, s);
        ctx.setLineDash([]);
        if (dir > 0) lineAlong(ctx, e, e.t1 - 22, e.t1, s); else lineAlong(ctx, e, e.t0, e.t0 + 22, s);
        if (dir > 0) lineAlong(ctx, e, e.t0, e.t0 + 8, s); else lineAlong(ctx, e, e.t1 - 8, e.t1, s);
      }
      if (!n) continue;
      // קו עצירה / קו מסירת זכות קדימה
      const node = toNodeOf(e, dir);
      const ctrl = control(node, e);
      const tl = dir > 0 ? e.t1 - 0.4 : e.t0 + 0.4;
      const s0 = laneS(e, dir, 0) - (LW / 2) * dir, s1 = laneS(e, dir, n - 1) + (LW / 2) * dir;
      const a = edgePoint(e, tl, s0), b = edgePoint(e, tl, s1);
      if (ctrl === 'stop' || ctrl === 'light') { ctx.lineWidth = 0.5; ctx.setLineDash([]); }
      else if (ctrl === 'yield' || ctrl === 'roundabout') { ctx.lineWidth = 0.4; ctx.setLineDash([0.8, 0.6]); }
      else continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      if (ctrl === 'stop') {
        const q = edgePoint(e, tl - 4 * dir, (s0 + s1) / 2);
        roadText(ctx, q.x, q.y, Math.atan2(e.d.y * dir, e.d.x * dir), 'עצור', 'rgba(242,240,234,0.85)', 1.6);
      }
      // חצים בנתיבים לפני צומת
      if (node.edges.length >= 3 && node.type !== 'roundabout') {
        for (let i = 0; i < n; i++) {
          const pt = edgePoint(e, tl - 9 * dir, laneS(e, dir, i));
          const ang = Math.atan2(e.d.y * dir, e.d.x * dir);
          const kinds = laneArrows(node, e, dir, i, n);
          drawLaneArrow(ctx, pt.x, pt.y, ang, kinds);
        }
      }
    }
    // מעבר חציה
    ctx.fillStyle = COL.line;
    for (const cw of e.crosswalks) {
      for (let s = e.sMin + 0.5; s < e.sMax - 0.4; s += 1.1) {
        const p = [edgePoint(e, cw.t - 1.8, s), edgePoint(e, cw.t + 1.8, s), edgePoint(e, cw.t + 1.8, s + 0.55), edgePoint(e, cw.t - 1.8, s + 0.55)];
        ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y); ctx.fill();
      }
    }
    if (e.school) {
      for (const dir of [1, -1]) {
        if (!laneCount(e, dir)) continue;
        const pt = edgePoint(e, e.len / 2 - 20 * dir, laneS(e, dir, 0));
        roadText(ctx, pt.x, pt.y, Math.atan2(e.d.y * dir, e.d.x * dir), 'האט', 'rgba(242,194,48,0.85)', 1.5);
      }
    }
  }
  // כיכר: אי תנועה עם אבני שפה אדום-לבן
  for (const n of nodeList) {
    if (n.type !== 'roundabout') continue;
    ctx.fillStyle = COL.island; circle(ctx, n.x, n.y, RB_IN); ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#e8e4da'; circle(ctx, n.x, n.y, RB_IN); ctx.stroke();
    ctx.strokeStyle = '#c0392b'; ctx.setLineDash([1.2, 1.2]); circle(ctx, n.x, n.y, RB_IN); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#4e7d33'; for (let k = 0; k < 5; k++) { circle(ctx, n.x + Math.cos(k * 1.3) * 3.5, n.y + Math.sin(k * 1.3) * 3.5, 1.6); ctx.fill(); }
    if (n.rbLanes === 2) { ctx.strokeStyle = 'rgba(242,240,234,0.85)'; ctx.lineWidth = 0.15; ctx.setLineDash([3, 4]); circle(ctx, n.x, n.y, RB_RING); ctx.stroke(); ctx.setLineDash([]); }
  }
  drawCurbsAndParking(ctx);
  drawBumps(ctx);
}

// טקסט על הכביש, קריא לנהג שנוסע בכיוון ang
function roadText(ctx, x, y, ang, text, color, size) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = color; ctx.font = `bold ${size}px Assistant, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0); ctx.restore();
}

// אבני שפה: אדום-לבן = אסור לחנות, כחול-לבן = חניה מותרת. וגם סימון מקומות החניה
function drawCurbsAndParking(ctx) {
  for (const e of edges) {
    for (const key of ['f', 'b']) {
      const hasStrip = key === 'f' ? e.pf : e.pb;
      const sc = key === 'f' ? e.sMax + 0.15 : e.sMin - 0.15;
      // מקטעים לפי החוק
      const cuts = [e.t0, e.t1];
      const step = 1;
      let segStart = e.t0, prev = null;
      const flush = (t, rule) => {
        if (prev === null) return;
        let col = null;
        if (prev) col = '#d23b2f';
        else if (hasStrip) col = '#2f6fd2';
        if (col) {
          ctx.lineWidth = 0.32; ctx.setLineDash([]); ctx.strokeStyle = '#f2f0ea'; lineAlong(ctx, e, segStart, t, sc);
          ctx.strokeStyle = col; ctx.setLineDash([0.9, 0.9]); lineAlong(ctx, e, segStart, t, sc); ctx.setLineDash([]);
        }
        segStart = t;
      };
      for (let t = e.t0; t <= e.t1 + 0.01; t += step) {
        const rule = !!parkingRule(e, t) && (hasStrip || t - e.t0 < NO_PARK_JUNCTION || e.t1 - t < NO_PARK_JUNCTION || e.crosswalks.some(c => Math.abs(t - c.t) < NO_PARK_CROSSWALK));
        if (prev !== null && rule !== prev) flush(t, rule);
        prev = rule;
      }
      flush(e.t1, prev);
      // סימון מקומות חניה (קווים קצרים בניצב)
      if (hasStrip) {
        const sIn = key === 'f' ? e.laneR : -e.laneL, sOut = key === 'f' ? e.sMax : e.sMin;
        ctx.strokeStyle = 'rgba(242,240,234,0.55)'; ctx.lineWidth = 0.1;
        for (let t = e.t0 + NO_PARK_JUNCTION; t < e.t1 - NO_PARK_JUNCTION; t += 6.5) {
          if (parkingRule(e, t)) continue;
          const a = edgePoint(e, t, sIn), b = edgePoint(e, t, sOut);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
  }
}
function drawBumps(ctx) {
  for (const e of edges) for (const bt of e.bumps) {
    const n = 10, w = (e.sMax - e.sMin) / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#1d1d1d' : '#f2c230';
      rectAlong(ctx, e, bt - 0.45, bt + 0.45, e.sMin + i * w, e.sMin + (i + 1) * w);
    }
  }
}

function laneArrows(node, e, dir, i, n) {
  const din = dirVec(e, dir);
  const ts = node.edges.filter(x => x !== e && canExit(node, x)).map(x => turnType(din, dirVec(x, exitDirFrom(node, x))));
  const has = t => ts.includes(t);
  if (n === 1) return ts;
  const out = [];
  if (i === 0) { if (has('left')) out.push('left'); if (has('straight')) out.push('straight'); }
  else if (i === n - 1) { if (has('right')) out.push('right'); if (has('straight')) out.push('straight'); }
  else if (has('straight')) out.push('straight');
  return out.length ? out : ['straight'];
}
function drawLaneArrow(ctx, x, y, ang, kinds) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = 'rgba(242,240,234,0.85)'; ctx.fillStyle = 'rgba(242,240,234,0.85)'; ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(0, 0); ctx.stroke();
  for (const k of kinds) {
    ctx.save();
    if (k === 'straight') { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1.6, 0); ctx.stroke(); tri(ctx, 2.4, 0, 0); }
    else { const sy = k === 'right' ? 1 : -1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.9, 0, 0.9, 1.0 * sy); ctx.stroke(); tri(ctx, 0.9, 1.7 * sy, sy * Math.PI / 2); }
    ctx.restore();
  }
  ctx.restore();
}
function tri(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0.1, 0); ctx.lineTo(-0.8, 0.6); ctx.lineTo(-0.8, -0.6); ctx.closePath(); ctx.fill(); ctx.restore();
}

function drawScenery(ctx) {
  for (const b of scenery.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(b.x + 1.2, b.y + 1.2, b.w, b.h);
    ctx.fillStyle = b.c; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.3; ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
  }
}
function drawTrees(ctx) {
  for (const t of scenery.trees) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; circle(ctx, t.x + 0.8, t.y + 0.8, t.r); ctx.fill();
    ctx.fillStyle = '#3f6e2a'; circle(ctx, t.x, t.y, t.r); ctx.fill();
    ctx.fillStyle = '#4f8536'; circle(ctx, t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6); ctx.fill();
  }
}

// ===== תמרורים =====
function drawSigns(ctx, time) {
  for (const s of signs) {
    if (Math.abs(s.x - cam.x) > 140 || Math.abs(s.y - cam.y) > 140) continue;
    if (s.kind === 'light') { drawTrafficLight(ctx, s, time); continue; }
    upright(ctx, s.x, s.y, () => drawSignGlyph(ctx, s.kind, s.val, 1.5, s.ang != null ? s.ang + cam.rot : 0));
  }
}

function drawSignGlyph(ctx, kind, val, r, ang = 0) {
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(ctx, 0.18, 0.18, r * 1.02); ctx.fill();
  switch (kind) {
    case 'speed':
      ctx.fillStyle = '#fff'; circle(ctx, 0, 0, r); ctx.fill();
      ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.22; circle(ctx, 0, 0, r * 0.88); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = `bold ${r * 0.95}px Rubik, sans-serif`; ctx.fillText(val, 0, r * 0.06);
      break;
    case 'stop': {
      ctx.fillStyle = '#d32f2f'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.08; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 0.62}px Assistant, sans-serif`; ctx.fillText('עצור', 0, r * 0.05);
      break;
    }
    case 'yield':
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.2;
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.7); ctx.lineTo(r, -r * 0.7); ctx.lineTo(0, r); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'roundabout':
      ctx.fillStyle = '#1565c0'; circle(ctx, 0, 0, r); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = r * 0.13;
      for (let i = 0; i < 3; i++) {
        const a0 = i * 2.094 + 0.3;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.55, a0 + 1.3, a0, true); ctx.stroke();
        ctx.save(); ctx.rotate(a0); ctx.translate(r * 0.55, 0); ctx.rotate(-Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.25); ctx.lineTo(r * 0.22, r * 0.05); ctx.lineTo(-r * 0.22, r * 0.05); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      break;
    case 'noentry':
      ctx.fillStyle = '#d32f2f'; circle(ctx, 0, 0, r); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.7, -r * 0.18, r * 1.4, r * 0.36);
      break;
    case 'oneway':
      ctx.fillStyle = '#1565c0'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.save(); ctx.rotate(ang); ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.6, -r * 0.13, r * 0.9, r * 0.26);
      ctx.beginPath(); ctx.moveTo(r * 0.75, 0); ctx.lineTo(r * 0.25, -r * 0.45); ctx.lineTo(r * 0.25, r * 0.45); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    case 'cross':
      ctx.fillStyle = '#1565c0'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(r * 0.85, r * 0.7); ctx.lineTo(-r * 0.85, r * 0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; circle(ctx, 0.05 * r, -r * 0.18, r * 0.12); ctx.fill();
      ctx.fillRect(-r * 0.06, -r * 0.05, r * 0.14, r * 0.42);
      ctx.fillRect(-r * 0.3, r * 0.5, r * 0.6, r * 0.1);
      break;
    case 'parking':
      ctx.fillStyle = '#1565c0'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 1.5}px Rubik, sans-serif`; ctx.fillText('P', 0, r * 0.08);
      break;
    case 'noparking':
      ctx.fillStyle = '#1565c0'; circle(ctx, 0, 0, r); ctx.fill();
      ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.2; circle(ctx, 0, 0, r * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.62); ctx.lineTo(r * 0.62, r * 0.62); ctx.stroke();
      break;
    case 'priority':
      ctx.save(); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.fillStyle = '#f2c230'; ctx.fillRect(-r * 0.5, -r * 0.5, r, r);
      ctx.strokeStyle = '#222'; ctx.lineWidth = r * 0.06; ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.restore();
      break;
    case 'lightahead': case 'rbahead': case 'junctionahead': case 'crossahead': case 'bump':
      warnTriangle(ctx, r);
      ctx.fillStyle = '#111'; ctx.strokeStyle = '#111';
      if (kind === 'lightahead') {
        ctx.fillRect(-r * 0.16, -r * 0.35, r * 0.32, r * 0.78);
        [['#e53935', -0.2], ['#fbc02d', 0.05], ['#43a047', 0.3]].forEach(([c, y]) => { ctx.fillStyle = c; circle(ctx, 0, y * r, r * 0.09); ctx.fill(); });
      } else if (kind === 'rbahead') {
        ctx.lineWidth = r * 0.1;
        for (let i = 0; i < 3; i++) { const a0 = i * 2.094; ctx.beginPath(); ctx.arc(0, r * 0.08, r * 0.28, a0 + 1.2, a0, true); ctx.stroke(); }
      } else if (kind === 'junctionahead') {
        ctx.fillRect(-r * 0.07, -r * 0.4, r * 0.14, r * 0.8); ctx.fillRect(-r * 0.35, -r * 0.02, r * 0.7, r * 0.14);
      } else if (kind === 'crossahead') {
        circle(ctx, r * 0.02, -r * 0.3, r * 0.09); ctx.fill();
        ctx.fillRect(-r * 0.05, -r * 0.2, r * 0.12, r * 0.32);
        ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.moveTo(0, r * 0.1); ctx.lineTo(-r * 0.15, r * 0.4); ctx.moveTo(0.05 * r, r * 0.1); ctx.lineTo(r * 0.2, r * 0.4); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-r * 0.45, r * 0.38); ctx.quadraticCurveTo(0, -r * 0.15, r * 0.45, r * 0.38); ctx.closePath(); ctx.fill();
      }
      break;
    case 'ban': {
      ctx.fillStyle = '#fff'; circle(ctx, 0, 0, r); ctx.fill();
      ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.2; circle(ctx, 0, 0, r * 0.9); ctx.stroke();
      ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'; ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      if (val === 'left') { ctx.moveTo(r * 0.15, r * 0.5); ctx.lineTo(r * 0.15, -r * 0.05); ctx.lineTo(-r * 0.3, -r * 0.05); }
      else if (val === 'right') { ctx.moveTo(-r * 0.15, r * 0.5); ctx.lineTo(-r * 0.15, -r * 0.05); ctx.lineTo(r * 0.3, -r * 0.05); }
      else if (val === 'uturn') { ctx.moveTo(r * 0.25, r * 0.5); ctx.lineTo(r * 0.25, -r * 0.1); ctx.arc(0, -r * 0.1, r * 0.25, 0, Math.PI, true); ctx.lineTo(-r * 0.25, r * 0.25); }
      else { ctx.moveTo(0, r * 0.55); ctx.lineTo(0, -r * 0.25); }
      ctx.stroke();
      const tip = { left: [-r * 0.5, -r * 0.05, Math.PI], right: [r * 0.5, -r * 0.05, 0], uturn: [-r * 0.25, r * 0.45, Math.PI / 2], straight: [0, -r * 0.5, -Math.PI / 2] }[val] || [0, -r * 0.5, -Math.PI / 2];
      ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(tip[2]); ctx.beginPath(); ctx.moveTo(r * 0.12, 0); ctx.lineTo(-r * 0.18, r * 0.2); ctx.lineTo(-r * 0.18, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.moveTo(-r * 0.62, -r * 0.62); ctx.lineTo(r * 0.62, r * 0.62); ctx.stroke();
      break;
    }
    case 'school':
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.16;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.75); ctx.lineTo(-r, r * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111'; circle(ctx, -r * 0.2, -r * 0.1, r * 0.12); ctx.fill(); circle(ctx, r * 0.22, 0, r * 0.1); ctx.fill();
      ctx.fillRect(-r * 0.27, 0.02 * r, r * 0.14, r * 0.5); ctx.fillRect(r * 0.16, r * 0.1, r * 0.12, r * 0.42);
      break;
  }
}

function drawTrafficLight(ctx, s, time) {
  const st = lightState(s.node, axisOf(s.edge), time);
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang + Math.PI / 2);
  // עמוד ובית רמזור
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-0.7, -2.1, 1.6, 4.4);
  ctx.fillStyle = '#1d1f22'; ctx.fillRect(-0.8, -2.2, 1.6, 4.4);
  const on = { red: st === 'red' || st === 'redyellow', yellow: st === 'yellow' || st === 'redyellow', green: st === 'green' };
  const lamps = [['red', '#ff3b30', -1.35], ['yellow', '#ffcc00', 0], ['green', '#34c759', 1.35]];
  for (const [k, c, y] of lamps) {
    if (on[k]) { ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12; }
    else { ctx.fillStyle = '#3a3a3a'; ctx.shadowBlur = 0; }
    circle(ctx, 0, y, 0.55); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function warnTriangle(ctx, r) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.75); ctx.lineTo(-r, r * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ===== רכבים והולכי רגל =====
function drawCar(ctx, v, color, opts = {}) {
  ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.h);
  const L = v.len, Wd = v.wid;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, -L / 2 + 0.25, -Wd / 2 + 0.3, L, Wd, 0.5); ctx.fill();
  ctx.fillStyle = color; roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 0.5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.08; ctx.stroke();
  // חלונות
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, 0.25, -Wd / 2 + 0.22, 0.95, Wd - 0.44, 0.2); ctx.fill();
  roundRect(ctx, -1.65, -Wd / 2 + 0.25, 0.6, Wd - 0.5, 0.15); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, -1.0, -Wd / 2 + 0.18, 1.2, Wd - 0.36, 0.2); ctx.fill();
  // פנסים
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(L / 2 - 0.18, -Wd / 2 + 0.15, 0.16, 0.42); ctx.fillRect(L / 2 - 0.18, Wd / 2 - 0.57, 0.16, 0.42);
  const brake = opts.braking;
  ctx.fillStyle = brake ? '#ff2d2d' : '#7a1c1c';
  if (brake) { ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 10; }
  ctx.fillRect(-L / 2 + 0.02, -Wd / 2 + 0.15, 0.16, 0.42); ctx.fillRect(-L / 2 + 0.02, Wd / 2 - 0.57, 0.16, 0.42);
  ctx.shadowBlur = 0;
  if (opts.reverse) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-L / 2 + 0.02, -0.25, 0.14, 0.5); }
  // וינקרים
  if (opts.blinker && opts.blinkOn) {
    ctx.fillStyle = '#ffa31a'; ctx.shadowColor = '#ffa31a'; ctx.shadowBlur = 14;
    const y = opts.blinker > 0 ? Wd / 2 - 0.12 : -Wd / 2 - 0.08;
    ctx.fillRect(L / 2 - 0.5, y, 0.45, 0.2); ctx.fillRect(-L / 2 + 0.05, y, 0.45, 0.2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawPeds(ctx) {
  for (const cw of crosswalks) for (const pd of cw.peds) {
    const bob = Math.sin(pd.phase) * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(ctx, pd.x + 0.15, pd.y + 0.15, 0.45); ctx.fill();
    ctx.fillStyle = pd.color; circle(ctx, pd.x, pd.y + bob, 0.45); ctx.fill();
    ctx.fillStyle = '#e9c39b'; circle(ctx, pd.x, pd.y + bob, 0.24); ctx.fill();
  }
}

// ===== ציור מלא =====
function renderWorld(ctx, W, H, time, npcs) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = COL.grass; ctx.fillRect(0, 0, W, H);
  const cy = cam.mode === 'chase' ? H * 0.72 : H / 2;
  ctx.translate(W / 2, cy); ctx.rotate(cam.rot); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
  drawScenery(ctx);
  drawRoads(ctx);
  drawMarkings(ctx);
  // הדגשת הצומת שבו צריך לבצע את הוראת הבוחן
  if (Rules.instr && Rules.instr.kind === 'turn') {
    const n = Rules.instr.node, e = Rules.instr.edge;
    const o = otherEnd(e, n), dx = o.x - n.x, dy = o.y - n.y, L = Math.hypot(dx, dy);
    const pulse = 0.35 + 0.25 * Math.sin(time * 4);
    ctx.strokeStyle = `rgba(80,200,255,${pulse})`; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
    const tr = trimAt(n, e);
    ctx.beginPath(); ctx.moveTo(n.x + dx / L * tr, n.y + dy / L * tr); ctx.lineTo(n.x + dx / L * (tr + 22), n.y + dy / L * (tr + 22)); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawPeds(ctx);
  for (const e of edges) for (const c of e.parked) drawCar(ctx, c, c.color, {});
  const blinkOn = (time % 0.8) < 0.45;
  for (const n of npcs) drawCar(ctx, n, n.color, { braking: n.braking, blinker: n.blinker, blinkOn });
  drawCar(ctx, player, '#f4f1e8', { braking: player.braking || (player.v === 0 && !input.up), blinker: player.blinker, blinkOn, reverse: player.gear === 'R' });
  // פס זיהוי לרכב שלך
  ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.h);
  ctx.fillStyle = '#1f6feb'; ctx.fillRect(-1.4, -0.12, 2.4, 0.24); ctx.restore();
  drawTrees(ctx);
  drawSigns(ctx, time);
  Plugins.draw(ctx);
}

// ===== מפה קטנה =====
function renderMinimap(mctx, w, h, npcs) {
  const pad = 8;
  const sx = (w - pad * 2) / (WORLD.maxX - WORLD.minX - 80), sy = (h - pad * 2) / (WORLD.maxY - WORLD.minY - 80);
  const s = Math.min(sx, sy);
  const ox = (w - (WORLD.maxX - WORLD.minX - 80) * s) / 2 - (WORLD.minX + 40) * s;
  const oy = (h - (WORLD.maxY - WORLD.minY - 80) * s) / 2 - (WORLD.minY + 40) * s;
  const X = x => ox + x * s, Y = y => oy + y * s;
  mctx.clearRect(0, 0, w, h);
  mctx.lineCap = 'round';
  for (const e of edges) {
    mctx.strokeStyle = e.oneway ? '#8fa3b8' : '#c8d1da';
    mctx.lineWidth = Math.max(2, e.W * s * 0.9);
    mctx.beginPath(); mctx.moveTo(X(e.a.x), Y(e.a.y)); mctx.lineTo(X(e.b.x), Y(e.b.y)); mctx.stroke();
  }
  for (const n of nodeList) {
    if (n.type === 'roundabout') { mctx.strokeStyle = '#c8d1da'; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(X(n.x), Y(n.y), 5, 0, 7); mctx.stroke(); }
    if (n.type === 'light') { mctx.fillStyle = '#f2c230'; mctx.beginPath(); mctx.arc(X(n.x), Y(n.y), 2.5, 0, 7); mctx.fill(); }
    if (n.type === 'allstop' || (n.minor && Object.values(n.minor).includes('stop'))) { mctx.fillStyle = '#e5484d'; mctx.beginPath(); mctx.arc(X(n.x), Y(n.y), 2.5, 0, 7); mctx.fill(); }
  }
  if (Rules.instr && Rules.instr.kind === 'turn') { mctx.strokeStyle = '#50c8ff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(X(Rules.instr.node.x), Y(Rules.instr.node.y), 7, 0, 7); mctx.stroke(); }
  mctx.fillStyle = '#9aa4ae';
  for (const n of npcs) { mctx.fillRect(X(n.x) - 1.5, Y(n.y) - 1.5, 3, 3); }
  mctx.save(); mctx.translate(X(player.x), Y(player.y)); mctx.rotate(player.h);
  mctx.fillStyle = '#4ea1ff'; mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, 4); mctx.lineTo(-4, -4); mctx.closePath(); mctx.fill();
  mctx.restore();
}
