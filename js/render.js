'use strict';
// ===== ציור =====

const COL = {
  grass: '#6f9a4a', grassDark: '#5f8a3e', sidewalk: '#c9c4b8', curb: '#9d978a',
  asphalt: '#3d4045', asphaltNode: '#3a3d42', line: '#f2f0ea', yellow: '#f2c230',
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
  for (const e of edges) {
    for (const dir of [1, -1]) {
      if (!laneCount(e, dir)) continue;
      const side = e.W / 2 + 1.6;
      const tStart = dir > 0 ? e.t0 + 12 : e.t1 - 12;
      const tEnd = dir > 0 ? e.t1 - 6 : e.t0 + 6;
      const at = (t, off = 0) => edgePoint(e, t, (side + off) * dir);
      signs.push(Object.assign(at(tStart), { kind: 'speed', val: e.lim }));
      if (e.school) signs.push(Object.assign(at(tStart + 6 * dir), { kind: 'school' }));
      if (e.oneway) signs.push(Object.assign(at(tStart + 6 * dir), { kind: 'oneway', ang: Math.atan2(e.d.y, e.d.x) }));
      const node = toNodeOf(e, dir);
      const ctrl = control(node, e);
      if (ctrl === 'stop') signs.push(Object.assign(at(tEnd), { kind: 'stop' }));
      else if (ctrl === 'yield') signs.push(Object.assign(at(tEnd), { kind: 'yield' }));
      else if (ctrl === 'roundabout') { signs.push(Object.assign(at(tEnd - 4 * dir), { kind: 'roundabout' })); signs.push(Object.assign(at(tEnd), { kind: 'yield' })); }
      else if (ctrl === 'light') signs.push(Object.assign(at(dir > 0 ? e.t1 - 1 : e.t0 + 1, -0.4), { kind: 'light', node, edge: e, ang: Math.atan2(e.d.y * dir, e.d.x * dir) }));
      for (const cw of e.crosswalks) signs.push(Object.assign(at(cw.t - 6 * dir), { kind: 'cross' }));
    }
    // אין כניסה בקצה של רחוב חד-סטרי
    if (e.oneway) {
      const side = e.W / 2 + 1.6;
      signs.push(Object.assign(edgePoint(e, e.t1 - 4, -side), { kind: 'noentry' }));
      signs.push(Object.assign(edgePoint(e, e.t1 - 4, side), { kind: 'noentry' }));
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
  for (const e of edges) rectAlong(ctx, e, 0, e.len, e.W / 2 + SIDEWALK);
  for (const n of nodeList) {
    if (n.type === 'roundabout') { circle(ctx, n.x, n.y, RB_OUT + SIDEWALK); ctx.fill(); }
    else ctx.fillRect(n.x - n.hx - SIDEWALK, n.y - n.hy - SIDEWALK, 2 * (n.hx + SIDEWALK), 2 * (n.hy + SIDEWALK));
  }
  // אספלט
  ctx.fillStyle = COL.asphalt;
  for (const e of edges) rectAlong(ctx, e, 0, e.len, e.W / 2);
  for (const n of nodeList) {
    ctx.fillStyle = COL.asphaltNode;
    if (n.type === 'roundabout') { circle(ctx, n.x, n.y, RB_OUT); ctx.fill(); }
    else ctx.fillRect(n.x - n.hx, n.y - n.hy, 2 * n.hx, 2 * n.hy);
  }
}

function rectAlong(ctx, e, t0, t1, half) {
  const p = [edgePoint(e, t0, -half), edgePoint(e, t1, -half), edgePoint(e, t1, half), edgePoint(e, t0, half)];
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
    lineAlong(ctx, e, e.t0, e.t1, e.W / 2 - 0.3);
    lineAlong(ctx, e, e.t0, e.t1, -e.W / 2 + 0.3);
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
        upright(ctx, edgePoint(e, tl - 4 * dir, (s0 + s1) / 2).x, edgePoint(e, tl - 4 * dir, (s0 + s1) / 2).y, () => {
          ctx.fillStyle = 'rgba(242,240,234,0.85)'; ctx.font = 'bold 1.6px Assistant, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('עצור', 0, 0);
        });
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
      for (let s = -e.W / 2 + 0.5; s < e.W / 2 - 0.4; s += 1.1) {
        const p = [edgePoint(e, cw.t - 1.8, s), edgePoint(e, cw.t + 1.8, s), edgePoint(e, cw.t + 1.8, s + 0.55), edgePoint(e, cw.t - 1.8, s + 0.55)];
        ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y); ctx.fill();
      }
    }
    if (e.school) {
      for (const dir of [1, -1]) {
        const pt = edgePoint(e, e.len / 2 - 20 * dir, laneS(e, dir, 0));
        upright(ctx, pt.x, pt.y, () => { ctx.fillStyle = 'rgba(242,194,48,0.85)'; ctx.font = 'bold 1.5px Assistant, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('האט', 0, 0); });
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
    ctx.strokeStyle = 'rgba(242,240,234,0.5)'; ctx.lineWidth = 0.12; ctx.setLineDash([2, 3]); circle(ctx, n.x, n.y, RB_RING); ctx.stroke(); ctx.setLineDash([]);
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
  if (Rules.instr) {
    const n = Rules.instr.node, e = Rules.instr.edge;
    const o = otherEnd(e, n), dx = o.x - n.x, dy = o.y - n.y, L = Math.hypot(dx, dy);
    const pulse = 0.35 + 0.25 * Math.sin(time * 4);
    ctx.strokeStyle = `rgba(80,200,255,${pulse})`; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
    const tr = trimAt(n, e);
    ctx.beginPath(); ctx.moveTo(n.x + dx / L * tr, n.y + dy / L * tr); ctx.lineTo(n.x + dx / L * (tr + 22), n.y + dy / L * (tr + 22)); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawPeds(ctx);
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
  if (Rules.instr) { mctx.strokeStyle = '#50c8ff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(X(Rules.instr.node.x), Y(Rules.instr.node.y), 7, 0, 7); mctx.stroke(); }
  mctx.fillStyle = '#9aa4ae';
  for (const n of npcs) { mctx.fillRect(X(n.x) - 1.5, Y(n.y) - 1.5, 3, 3); }
  mctx.save(); mctx.translate(X(player.x), Y(player.y)); mctx.rotate(player.h);
  mctx.fillStyle = '#4ea1ff'; mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, 4); mctx.lineTo(-4, -4); mctx.closePath(); mctx.fill();
  mctx.restore();
}
