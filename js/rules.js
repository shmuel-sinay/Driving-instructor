'use strict';
// ===== בוחן: בדיקת חוקי תנועה והוראות נסיעה =====

const Rules = {
  score: 100, log: [], cool: {}, failed: false, good: 0,
  loc: null, entry: null, lane: null, blinkHist: [], lastHistT: -1,
  stopped: {}, overTimer: 0, wrongTimer: 0, offTimer: 0, islandTimer: 0,
  pendingLane: null, instr: null, lastLim: 50, lastT: null, lastEdge: null,
  onEvent: null,

  reset() {
    Object.assign(this, {
      score: 100, log: [], cool: {}, failed: false, good: 0, loc: null, entry: null, lane: null,
      blinkHist: [], lastHistT: -1e9, stopped: {}, overTimer: 0, wrongTimer: 0, offTimer: 0, islandTimer: 0,
      pendingLane: null, instr: null, lastT: null, lastEdge: null, rb: null, rbStop: 0,
      parkRolled: null, unparkAt: null, parkedAt: null, didReverseTask: false,
      distTimer: 0, keepTimer: 0, saidBackRight: false, cwStopTimer: 0, slowTimer: 0, lesson: null, recorded: false,
    });
    if (typeof Plugins !== 'undefined') Plugins.reset();
  },

  report(key, text, severe, time, cd = 6) {
    if (this.cool[key] && time < this.cool[key]) return;
    this.cool[key] = time + cd;
    const pts = severe ? 15 : 5;
    this.score = Math.max(0, this.score - pts);
    if (severe) this.failed = true;
    const item = { key, text, severe, pts, time };
    this.log.unshift(item);
    if (this.onEvent) this.onEvent('bad', item);
  },
  praise(text) { this.good++; if (this.onEvent) this.onEvent('good', { text }); },

  wasOn(side, t0, t1) { return this.blinkHist.some(b => b.side === side && b.t >= t0 && b.t <= t1); },

  update(dt, time, p, vehicles) {
    // היסטוריית איתות
    if (p.blinker && (time - this.lastHistT > 0.1 || time < this.lastHistT)) { this.blinkHist.push({ t: time, side: p.blinker }); this.lastHistT = time; }
    while (this.blinkHist.length && this.blinkHist[0].t < time - 20) this.blinkHist.shift();

    const loc = locate(p);
    const prev = this.loc;
    if (loc && loc.kind === 'node' && !(prev && prev.kind === 'node' && prev.node === loc.node)) {
      this.enterNode(loc.node, prev && prev.kind === 'edge' ? prev.edge : null, time, p, vehicles);
    }
    if (loc && loc.kind === 'edge' && prev && prev.kind === 'node') this.exitNode(prev.node, loc.edge, time, p);
    if (loc && loc.kind === 'edge' && prev && prev.kind === 'edge' && prev.edge !== loc.edge) { this.lane = null; this.lastT = null; }
    if (loc) this.loc = loc;

    const kmh = Math.abs(p.v) * 3.6;
    this.emergencyChecks(dt, time, p, vehicles, loc);
    if (loc && loc.kind === 'edge') this.edgeChecks(loc, dt, time, p, kmh);
    else this.overTimer = 0;
    if (loc && loc.kind === 'node') this.nodeChecks(loc.node, dt, time, p, kmh);

    // יציאה מהכביש
    const corners = boxCorners(p);
    let off = 0, island = 0;
    for (const c of corners) { const s = surfaceAt(c); if (s === 'off') off++; if (s === 'island') island++; }
    this.offTimer = off ? this.offTimer + dt : 0;
    this.islandTimer = island ? this.islandTimer + dt : 0;
    if (this.offTimer > 0.25 && Math.abs(p.v) > 0.3) this.report('off', 'עלייה על המדרכה / יציאה משולי הכביש', false, time, 5);
    if (this.islandTimer > 0.2) this.report('island', 'עלייה על אי התנועה בכיכר', true, time, 6);

    // התנגשויות
    for (const o of vehicles) {
      if (o === p) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < 6 && boxesOverlap(p, o)) {
        this.report('crash', 'תאונה! התנגשות ברכב אחר', true, time, 3);
        p.x -= Math.cos(p.h) * Math.sign(p.v || 1) * 0.6; p.y -= Math.sin(p.h) * Math.sign(p.v || 1) * 0.6;
        p.v = 0; o.v = 0;
      }
    }
    for (const cw of crosswalks) for (const pd of cw.peds) {
      if (pd.state !== 'leave' && pointInBox(p, pd, 0.35)) {
        this.report('pedhit', 'פגיעה בהולך רגל!', true, time, 4);
        pd.state = 'leave'; pd.wait = 0; p.v = 0;
      }
    }
    this.checkReverseTask(time, p);
    this.updateInstructor(time, p);
    Plugins.tick(time, dt, p, vehicles);
  },

  // רכב ביטחון עם סירנה: מפנים את הדרך (סוטים ימינה ומאטים/עוצרים), ואחריו שומרים 100 מ'
  emergencyChecks(dt, time, p, vehicles, loc) {
    const em = vehicles.find(o => o.siren);
    if (!em) { this.emTimer = 0; this.emYielded = false; this.emWarned = false; this.emFollow = 0; return; }
    const hx = Math.cos(p.h), hy = Math.sin(p.h);
    const rx = em.x - p.x, ry = em.y - p.y;
    const fwd = rx * hx + ry * hy, sameDir = Math.cos(em.h - p.h) > 0.6;
    if (!sameDir) return;
    if (fwd < -3 && fwd > -90 && !em.passed) {
      if (!this.emWarned) {
        this.emWarned = true;
        if (this.onSay) this.onSay('emergency');
        if (typeof apHint === 'function') apHint('רכב ביטחון מאחוריך! סטה ימינה והאט', 6);
      }
      // פינוי דרך: בנתיב הימני ביותר (או בנתיב יחיד) ובמהירות נמוכה
      let right = true;
      if (loc && loc.kind === 'edge') {
        const e = loc.edge, dir = hx * e.d.x + hy * e.d.y > 0 ? 1 : -1;
        const { s } = edgeLocal(e, p), L = laneFromST(e, dir, s * dir);
        right = L.idx === L.n - 1;
      }
      if (right && Math.abs(p.v) < 4) {
        if (!this.emYielded) { this.emYielded = true; this.praise('פינית את הדרך לרכב הביטחון. יפה!'); }
      } else if (!this.emYielded) {
        this.emTimer = (this.emTimer || 0) + dt;
        if (this.emTimer > 10) { this.report('emergency', 'לא פינית את הדרך לרכב ביטחון: סוטים ימינה ככל האפשר, מאטים ועוצרים אם צריך', true, time, 60); this.emTimer = 0; this.emYielded = true; }
      }
    }
    // אחרי שעבר: לא נצמדים אליו
    if (em.passed && fwd > 5 && fwd < 100 && Math.abs(-rx * hy + ry * hx) < 4 && p.v > 6) {
      this.emFollow = (this.emFollow || 0) + dt;
      if (this.emFollow > 5) { this.report('emergencyfollow', `נסעת קרוב מדי אחרי רכב ביטחון (${Math.round(fwd)} מ'; צריך לפחות 100)`, false, time, 30); this.emFollow = 0; }
    } else this.emFollow = 0;
  },

  edgeChecks(loc, dt, time, p, kmh) {
    const e = loc.edge;
    const hd = Math.cos(p.h) * e.d.x + Math.sin(p.h) * e.d.y;
    this.lastLim = e.lim;
    // מהירות
    if (kmh > e.lim + 3) {
      this.overTimer += dt;
      if (this.overTimer > 1.5) {
        const severe = kmh > e.lim + 20;
        this.report('speed', `מהירות מופרזת: ${Math.round(kmh)} קמ"ש במקום שמותר ${e.lim}`, severe, time, 10);
      }
    } else this.overTimer = 0;
    // כביש רטוב: מאטים מתחת למהירות המרבית
    const wet = typeof View3D !== 'undefined' && View3D.weather === 'rain';
    if (wet && kmh > e.lim * 0.85 + 2 && kmh <= e.lim + 3) {
      this.wetTimer = (this.wetTimer || 0) + dt;
      if (this.wetTimer > 5) { this.report('wetspeed', `בכביש רטוב צריך להאט: נסעת ${Math.round(kmh)} קמ"ש (מומלץ עד ${Math.round(e.lim * 0.85)})`, false, time, 25); this.wetTimer = 0; }
    } else this.wetTimer = 0;

    if (Math.abs(hd) < 0.55) { this.lastT = loc.t; return; }
    const dir = hd > 0 ? 1 : -1;
    const sT = loc.s * dir;
    const inMid = loc.t > e.t0 + 4 && loc.t < e.t1 - 4;

    // כיוון נסיעה
    if (e.oneway && dir < 0 && inMid && p.v > 0.5) {
      this.report('wrongway', `נסיעה נגד כיוון התנועה ברחוב חד-סטרי`, true, time, 8);
    } else if (!e.oneway && inMid && sT < -0.2 && p.v > 0.5) {
      this.wrongTimer += dt;
      const limit = e.pass ? 9 : 0.6;
      if (this.wrongTimer > limit) this.report('wrongside', e.pass ? 'נסיעה ממושכת בצד השמאלי של הכביש' : 'חציית קו הפרדה רצוף / נסיעה בצד השמאלי', true, time, 8);
    } else this.wrongTimer = 0;

    // נתיבים
    if (!(e.oneway && dir < 0) && sT > -0.2) {
      const L = laneFromST(e, dir, sT);
      if (L.frac > 0.22 && L.frac < 0.78) {
        const key = e.id + dir;
        if (this.lane && this.lane.key === key && this.lane.idx !== L.idx && inMid) {
          const side = L.idx > this.lane.idx ? 1 : -1;
          const distToNode = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
          if (!this.wasOn(side, time - 6, time)) this.report('lanechg', 'החלפת נתיב ללא איתות', false, time, 4);
          else if (distToNode < 22) this.report('solidlane', 'החלפת נתיב על קו רצוף לפני צומת', false, time, 4);
          else if (p.blinker === side) { p.blinkArmed = true; }
        }
        this.lane = { key, idx: L.idx, n: L.n };
      }
      // בדיקת נתיב אחרי פנייה
      if (this.pendingLane && this.pendingLane.edge === e) {
        const done = dir > 0 ? loc.t - e.t0 : e.t1 - loc.t;
        if (done > 14) {
          const want = this.pendingLane.side > 0 ? L.n - 1 : 0;
          if (L.idx !== want) this.report('turnlane', this.pendingLane.side > 0 ? 'בפנייה ימינה יש להיכנס לנתיב הימני ביותר' : 'בפנייה שמאלה יש להיכנס לנתיב השמאלי ביותר', false, time, 4);
          this.pendingLane = null;
        }
      }
    }

    // עצירה לפני תמרור "עצור"
    const node = toNodeOf(e, dir);
    const dStop = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
    if (control(node, e) === 'stop' && dStop < 14 && dStop > -1 && Math.abs(p.v) < 0.3) this.stopped[e.id + node.id] = true;

    // מעבר חציה
    if (this.lastT != null && this.lastEdge === e) {
      for (const cw of e.crosswalks) {
        if ((this.lastT - cw.t) * (loc.t - cw.t) <= 0 && this.lastT !== loc.t && pedOnRoad(cw)) {
          this.report('ped', 'לא נתת זכות קדימה להולך רגל במעבר חציה', true, time, 5);
        }
      }
    }
    // פסי האטה
    if (this.lastT != null && this.lastEdge === e) {
      for (const bt of e.bumps) {
        if ((this.lastT - bt) * (loc.t - bt) <= 0 && this.lastT !== loc.t && kmh > 25) this.report('bump', `מעבר מהיר על פס האטה (${Math.round(kmh)} קמ"ש)`, false, time, 3);
      }
    }
    this.moreEdgeChecks(e, loc, dir, dStop, node, dt, time, p, kmh);
    this.lastT = loc.t; this.lastEdge = e;
  },

  // ===== בדיקות נוספות בדרך: מרחק, נתיב ימני, קו עצירה, מעבר חציה, איטיות =====
  moreEdgeChecks(e, loc, dir, dStop, node, dt, time, p, kmh) {
    const list = typeof npcs !== 'undefined' ? npcs : [];
    const hx = Math.cos(p.h), hy = Math.sin(p.h);
    // הרכב שלפניי באותו נתיב
    let lead = null;
    for (const o of list) {
      const dx = o.x - p.x, dy = o.y - p.y;
      const ahead = dx * hx + dy * hy, lat = Math.abs(-dx * hy + dy * hx);
      if (ahead > 0 && ahead < 70 && lat < 1.6 && Math.cos(o.h - p.h) > 0.7 && (!lead || ahead < lead.ahead)) lead = { o, ahead };
    }
    // 1. שמירת מרחק: לפחות שנייה לפי החוק
    if (lead && p.v > 5.5) {
      const gap = (lead.ahead - 4.4) / p.v;
      this.distTimer = gap < 1.0 ? (this.distTimer || 0) + dt : 0;
      // בגשם הבוחן מצפה לרווח גדול יותר (שתי שניות)
      const wet = typeof View3D !== 'undefined' && View3D.weather === 'rain';
      this.wetDistTimer = wet && gap >= 1.0 && gap < 2.0 ? (this.wetDistTimer || 0) + dt : 0;
      if (this.wetDistTimer > 4) { this.report('wetdist', `בכביש רטוב הגדל את הרווח: ${gap.toFixed(1)} שניות מהרכב שלפניך (בגשם לפחות שתיים)`, false, time, 20); this.wetDistTimer = 0; }
      if (this.distTimer > 2.5) { this.report('distance', `לא שמרת מרחק מהרכב שלפניך (${gap.toFixed(1)} שניות; החוק: לפחות שנייה, מומלץ שתיים)`, false, time, 12); this.distTimer = 0; }
    } else this.distTimer = 0;

    // 2. נסיעה בנתיב הימני (הטיימר נמשך גם מעבר לצומת, כי גושי הבניינים קצרים)
    const L = this.lane && this.lane.key === e.id + dir ? this.lane : null;
    if (L) {
      const turningLeft = (assist.on && assist.intent === 'left') || (this.instr && this.instr.kind === 'turn' && this.instr.node === node && this.instr.turn === 'left');
      if (L.n >= 2 && L.idx < L.n - 1 && kmh > 15 && dStop > 60 && !turningLeft) {
        const sRight = laneS(e, dir, L.n - 1);
        const rightBusy = list.some(o => {
          const lo = edgeLocal(e, o); const ahead = (lo.t - loc.t) * dir;
          return Math.abs(lo.s - sRight) < 1.7 && ahead > -8 && ahead < 50;
        });
        this.keepTimer = rightBusy ? 0 : (this.keepTimer || 0) + dt;
      } else if (L.idx === L.n - 1 || L.n < 2 || turningLeft) { this.keepTimer = 0; this.saidBackRight = false; }
      if (this.keepTimer > 5 && !this.saidBackRight) { this.saidBackRight = true; if (this.onSay) this.onSay('back_right'); }
      if (this.keepTimer > 12) { this.report('keepright', 'נסיעה בנתיב השמאלי בלי סיבה: יש לנסוע בנתיב הימני הפנוי', false, time, 25); this.keepTimer = 0; }
    }

    // 3. עצירה אחרי קו העצירה (ב"עצור" או באדום)
    const ctrl = control(node, e);
    const mustStop = ctrl === 'stop' || (ctrl === 'light' && ['red', 'redyellow'].includes(lightState(node, axisOf(e), time)));
    if (Math.abs(p.v) < 0.3 && mustStop && dStop - p.len / 2 < -0.7 && dStop > -3) this.report('stopline', 'עצירה אחרי קו העצירה: עוצרים לפני הקו', false, time, 15);

    // 4. עצירה על מעבר חציה
    const stoppedOnCw = Math.abs(p.v) < 0.3 && e.crosswalks.some(cw => Math.abs(loc.t - cw.t) < 1.8 + p.len / 2);
    this.cwStopTimer = stoppedOnCw ? (this.cwStopTimer || 0) + dt : 0;
    if (this.cwStopTimer > 1.5) { this.report('stopcross', 'עצירה על מעבר החציה', false, time, 15); this.cwStopTimer = 0; }

    // 5. הולך רגל שעומד לחצות
    if (this.lastT != null && this.lastEdge === e && kmh > 12) {
      for (const cw of e.crosswalks) {
        if ((this.lastT - cw.t) * (loc.t - cw.t) <= 0 && this.lastT !== loc.t && !pedOnRoad(cw) && cw.peds.some(pd => pd.state === 'wait')) {
          this.report('pedwait', 'לא האטת להולך רגל שעמד ליד המעבר ועמד לחצות', false, time, 8);
        }
      }
    }

    // 6. נסיעה איטית מדי בלי סיבה
    const clearAhead = !lead || lead.ahead > 45;
    const nearCw = e.crosswalks.some(cw => Math.abs(cw.t - loc.t) < 30);
    if (kmh > 3 && kmh < e.lim * 0.45 && e.lim >= 40 && !e.school && clearAhead && dStop > 70 && !nearCw && (!assist.on || (assist.st && assist.st.kind === 'edge'))) {
      this.slowTimer = (this.slowTimer || 0) + dt;
      if (this.slowTimer > 12) { this.report('slow', `נסיעה איטית מדי ללא סיבה (${Math.round(kmh)} קמ"ש בדרך של ${e.lim}) מעכבת את התנועה`, false, time, 40); this.slowTimer = 0; }
    } else this.slowTimer = 0;
  },

  nodeChecks(node, dt, time, p, kmh) {
    if (kmh > this.lastLim + 3) {
      this.overTimer += dt;
      if (this.overTimer > 1.5) this.report('speed', `מהירות מופרזת בצומת: ${Math.round(kmh)} קמ"ש`, kmh > this.lastLim + 20, time, 10);
    } else this.overTimer = 0;
    if (this.entry && this.entry.node === node) this.entry.maxV = Math.max(this.entry.maxV || 0, Math.abs(p.v));
    if (node.type === 'roundabout') this.trackRing(node, dt, time, p);
    if (node.type === 'roundabout' && p.v > 1) {
      const rx = p.x - node.x, ry = p.y - node.y, r = Math.hypot(rx, ry);
      if (r > RB_IN + 1) {
        const tx = ry / r, ty = -rx / r;   // כיוון התנועה בכיכר
        if (Math.cos(p.h) * tx + Math.sin(p.h) * ty < -0.35) this.report('rbwrong', 'נסיעה נגד כיוון התנועה בכיכר', true, time, 8);
      }
    }
  },

  // מעקב בכיכר: אילו יציאות עברת ומתי, באיזה נתיב בטבעת, ועצירות מיותרות
  trackRing(node, dt, time, p) {
    const rb = this.rb;
    if (!rb || rb.node !== node || !rb.edge) return;
    const a = Math.atan2(p.y - node.y, p.x - node.x);
    rb.angle += angNorm(rb.lastAng - a);
    rb.lastAng = a;
    const o = otherEnd(rb.edge, node);
    const thIn = Math.atan2(o.y - node.y, o.x - node.x);
    for (const x of node.edges) {
      if (x === rb.edge || rb.passed.has(x)) continue;
      const q = otherEnd(x, node);
      let d = thIn - Math.atan2(q.y - node.y, q.x - node.x);
      while (d <= 0) d += 2 * Math.PI;
      if (d + 0.35 < rb.angle) { rb.passed.add(x); rb.passTimes[rbExitNumber(node, rb.edge, x)] = time; }
    }
    const r = Math.hypot(p.x - node.x, p.y - node.y);
    if (node.rbLanes === 2 && r < RB_OUT - 2.5 && r > RB_IN + 0.5) {
      const lane = r < RB_RING ? 'inner' : 'outer';
      if (rb.lane && lane !== rb.lane) {
        const side = lane === 'inner' ? -1 : 1;
        if (!this.wasOn(side, time - 5, time)) this.report('rblane', 'החלפת נתיב בתוך הכיכר ללא איתות', false, time, 4);
      }
      rb.lane = lane;
    }
    // עצירה בתוך הכיכר בלי רכב מלפנים
    if (Math.abs(p.v) < 0.3 && r < RB_OUT - 2) {
      const blocked = (typeof npcs !== 'undefined' ? npcs : []).some(n => {
        const dx = n.x - p.x, dy = n.y - p.y, f = dx * Math.cos(p.h) + dy * Math.sin(p.h);
        return f > 0 && Math.hypot(dx, dy) < 12;
      });
      this.rbStop = blocked ? 0 : this.rbStop + dt;
      if (this.rbStop > 2.5) { this.report('rbstop', 'עצירה מיותרת בתוך הכיכר', false, time, 10); this.rbStop = 0; }
    } else this.rbStop = 0;
  },

  enterNode(node, edge, time, p, vehicles) {
    this.entry = { node, edge, time, valid: false };
    Plugins.enterJunction(node, edge, time, p);
    if (this.instr && this.instr.kind === 'turn' && this.instr.node !== node) this.instr = null;
    if (this.instr && this.instr.kind === 'park') { const ins = this.instr; this.report('instr', 'לא ביצעת את הוראת הבוחן לחנות', false, time, 3); this.instr = null; this.stepDone(ins, false, time); }
    this.rb = node.type === 'roundabout' ? { node, edge, time, angle: 0, lastAng: Math.atan2(p.y - node.y, p.x - node.x), passed: new Set(), passTimes: {}, lane: null } : null;
    if (!edge) return;
    const dirIn = node === edge.b ? edge.d : { x: -edge.d.x, y: -edge.d.y };
    if (Math.cos(p.h) * dirIn.x + Math.sin(p.h) * dirIn.y < 0.4 || p.v <= 0) return;
    Object.assign(this.entry, { valid: true, dirIn, lane: this.lane && this.lane.key === edge.id + (node === edge.b ? 1 : -1) ? this.lane.idx : null, nLanes: laneCount(edge, node === edge.b ? 1 : -1) });
    const ctrl = control(node, edge);
    this.entry.maxV = Math.abs(p.v);
    if (ctrl === 'roundabout' && Math.abs(p.v) * 3.6 > 32) this.report('rbfast', `כניסה מהירה מדי לכיכר (${Math.round(Math.abs(p.v) * 3.6)} קמ"ש)`, false, time, 6);
    if (ctrl === 'light') {
      const st = lightState(node, axisOf(edge), time);
      if (st === 'red' || st === 'redyellow') this.report('red', 'נסיעה באור אדום ברמזור', true, time, 5);
    }
    if (ctrl === 'stop') {
      if (!this.stopped[edge.id + node.id]) this.report('stop', 'לא עצרת עצירה מוחלטת בתמרור "עצור"', true, time, 5);
      delete this.stopped[edge.id + node.id];
    }
    if ((ctrl === 'stop' || ctrl === 'yield' || ctrl === 'roundabout') && hasConflict(node, edge, p, vehicles)) {
      this.report('yield', ctrl === 'roundabout' ? 'לא נתת זכות קדימה לרכב בתוך הכיכר' : 'לא נתת זכות קדימה לרכב בדרך הראשית', true, time, 5);
    }
  },

  exitNode(node, edge, time, p) {
    Plugins.exitJunction(node, edge, time, p);
    const en = this.entry;
    this.entry = null;
    const dirOut = node === edge.a ? edge.d : { x: -edge.d.x, y: -edge.d.y };
    const facing = Math.cos(p.h) * dirOut.x + Math.sin(p.h) * dirOut.y;
    if (facing < 0.4 || p.v <= 0) return;
    if (edge.oneway && node === edge.b) {
      this.report('noentry', 'כניסה לרחוב חד-סטרי בניגוד לתמרור "אין כניסה"', true, time, 6);
      this.cool.wrongway = time + 10;
    }
    const instr = this.instr; this.instr = null;
    if (!en || en.node !== node || !en.valid) return;
    const turn = edge === en.edge ? 'uturn' : turnType(en.dirIn, dirOut);
    const isJunction = node.edges.length >= 3;
    if (isBanned(node, en.edge, turn)) this.report('ban', `פנייה ${{ left: 'שמאלה', right: 'ימינה', uturn: 'פרסה', straight: 'ישר' }[turn]} בניגוד לתמרור`, true, time, 5);
    if (node.type === 'roundabout') {
      this.ringExitChecks(node, en, edge, time, p);
    } else if (isJunction) {
      if (turn === 'left' || turn === 'uturn') {
        if (!this.wasOn(-1, en.time - 7, en.time + 0.8)) this.report('signal', 'פנייה שמאלה ללא איתות מוקדם', false, time, 4);
      } else if (turn === 'right') {
        if (!this.wasOn(1, en.time - 7, en.time + 0.8)) this.report('signal', 'פנייה ימינה ללא איתות מוקדם', false, time, 4);
      } else if (turn === 'straight' && (this.wasOn(1, en.time, time) || this.wasOn(-1, en.time, time))) {
        this.report('falsesig', 'איתות מטעה: נסעת ישר עם אות פנייה', false, time, 4);
      }
      if (en.nLanes > 1 && en.lane != null) {
        if (turn === 'right' && en.lane !== en.nLanes - 1) this.report('fromlane', 'פנייה ימינה שלא מהנתיב הימני', false, time, 4);
        if ((turn === 'left' || turn === 'uturn') && en.lane !== 0) this.report('fromlane', 'פנייה שמאלה שלא מהנתיב השמאלי', false, time, 4);
      }
      if ((turn === 'left' || turn === 'right') && (en.maxV || 0) * 3.6 > 32) this.report('turnfast', `פנייה מהירה מדי (${Math.round(en.maxV * 3.6)} קמ"ש): מאטים לפני הפנייה`, false, time, 5);
      const nOut = laneCount(edge, exitDirFrom(node, edge));
      if (nOut > 1 && (turn === 'right' || turn === 'left')) this.pendingLane = { edge, side: turn === 'right' ? 1 : -1 };
    }
    if (turn !== 'straight') p.blinker = 0;
    if (instr && instr.kind === 'turn' && instr.node === node) {
      if (instr.edge !== edge) this.report('instr', 'לא ביצעת את הוראת הבוחן', false, time, 3);
      else this.praise('יפה! ביצעת את ההוראה');
      this.stepDone(instr, instr.edge === edge, time);
    }
  },

  // חוקי יציאה מכיכר: תזמון האיתות, בחירת נתיב בכיכר דו-נתיבית, וחיתוך בנתיב החיצוני
  ringExitChecks(node, en, edge, time, p) {
    const rb = this.rb && this.rb.node === node ? this.rb : null;
    this.rb = null;
    const k = rbExitNumber(node, en.edge, edge);
    // איתות ימינה: ביציאה הראשונה כבר בכניסה; אחרת רק אחרי שעברת את היציאה הקודמת
    if (k <= 1) {
      if (!this.wasOn(1, en.time - 6, time)) this.report('rbsignal', 'לא איתתת ימינה לפני היציאה מהכיכר', false, time, 4);
    } else {
      const tPrev = rb && rb.passTimes[k - 1] != null ? rb.passTimes[k - 1] : null;
      if (!this.wasOn(1, (tPrev != null ? tPrev : en.time) - 0.5, time)) this.report('rbsignal', 'לא איתתת ימינה לפני היציאה מהכיכר', false, time, 4);
      else if (tPrev != null && this.wasOn(1, en.time - 1, tPrev - 1)) this.report('rbearly', 'איתות ימינה מוקדם מדי: מאותתים רק אחרי היציאה שלפני היציאה שלך', false, time, 4);
    }
    // כיכר דו-נתיבית: יציאה 1-2 מהנתיב הימני, יציאה 3 ומעלה מהשמאלי
    if (node.rbLanes === 2 && en.nLanes >= 2 && en.lane != null) {
      const wantRight = k <= 2;
      if (wantRight && en.lane !== en.nLanes - 1) this.report('rbentry', `בכיכר דו-נתיבית, ליציאה ה-${k} נכנסים מהנתיב הימני`, false, time, 4);
      if (!wantRight && en.lane !== 0) this.report('rbentry', `בכיכר דו-נתיבית, ליציאה ה-${k} נכנסים מהנתיב השמאלי`, false, time, 4);
    }
    // יציאה מהנתיב הפנימי כשרכב מתקרב בנתיב החיצוני
    if (node.rbLanes === 2 && rb && rb.lane === 'inner') {
      const thMe = Math.atan2(p.y - node.y, p.x - node.x);
      const cut = (typeof npcs !== 'undefined' ? npcs : []).some(n => {
        const r = Math.hypot(n.x - node.x, n.y - node.y);
        if (r < RB_RING || r > RB_OUT + 1 || n.v < 1.5) return false;
        const diff = angNorm(Math.atan2(n.y - node.y, n.x - node.x) - thMe);
        return diff > 0 && diff < 1.0;
      });
      if (cut) this.report('rbcut', 'חיתוך רכב בנתיב החיצוני ביציאה מהכיכר', true, time, 5);
    }
  },

  // ===== חניה =====
  onParkStart(e, dir, side, t, time) {
    const sgn = side === 'right' ? 1 : -1;
    if (!this.wasOn(sgn, time - 6, time + 0.2)) this.report('parksig', `חניה ללא איתות ${side === 'right' ? 'ימינה' : 'שמאלה'}`, false, time, 4);
    const strip = parkStripOf(e, dir, side);
    const rule = parkingRule(e, t, strip ? strip.dir : dir);
    if (rule === 'junction') this.report('parkspot', 'חניה פחות מ-12 מטר מצומת (אבן שפה אדום-לבן)', false, time, 4);
    else if (rule === 'crosswalk') this.report('parkspot', 'חניה על מעבר חציה או בתחום 12 מטר לפניו', false, time, 4);
    else if (rule === 'bump') this.report('parkspot', 'חניה על פס האטה', false, time, 4);
  },
  onParked(e, dir, side, t, time) {
    this.parkedAt = time;
    if (this.instr && this.instr.kind === 'park') {
      const ins = this.instr;
      if (ins.side === side) this.praise('חנית יפה');
      else this.report('instr', 'חנית בצד הלא נכון', false, time, 3);
      this.instr = null;
      this.unparkAt = time + 4;
      this.stepDone(ins, ins.side === side, time);
    }
  },
  onUnpark(e, dir, side, time) {
    const away = side === 'right' ? -1 : 1;
    if (player.blinker !== away && !this.wasOn(away, time - 6, time + 0.2)) this.report('unparksig', `יציאה מחניה ללא איתות ${away < 0 ? 'שמאלה' : 'ימינה'}`, false, time, 4);
    // רכב שמתקרב מאחור בנתיב שאליו יוצאים
    const hx = Math.cos(player.h), hy = Math.sin(player.h);
    const near = (typeof npcs !== 'undefined' ? npcs : []).some(n => {
      const dx = n.x - player.x, dy = n.y - player.y;
      const ahead = dx * hx + dy * hy, sideOff = Math.abs(-dx * hy + dy * hx);
      return ahead < 2 && ahead > -40 && sideOff < 5.5 && Math.cos(n.h - player.h) > 0.7 && n.v > 3;
    });
    if (near) this.report('unparkyield', 'יציאה מחניה בלי לתת זכות קדימה לרכב שמתקרב', true, time, 5);
    if (this.instr && this.instr.kind === 'unpark') { const ins = this.instr; this.praise('יצאת מהחניה'); this.instr = null; this.stepDone(ins, true, time); }
    this.unparkAt = null;
  },
  // הוראת פנייה (משותף להוראות אקראיות ולשיעורים)
  issueTurn(node, e, dir, pick, time, lessonStep) {
    const din0 = dirVec(e, dir);
    const opts = node.edges.filter(x => x !== e && canExit(node, x) && !isBanned(node, e, turnType(din0, dirVec(x, exitDirFrom(node, x)))));
    const din = din0, dout = dirVec(pick, exitDirFrom(node, pick));
    const turn = pick === e ? 'uturn' : turnType(din, dout);
    let voice, text;
    const word = { right: 'ימינה', left: 'שמאלה', straight: 'ישר', uturn: 'פרסה' }[turn];
    if (node.type === 'roundabout') {
      const k = rbExitNumber(node, e, pick);
      voice = `rb_${k}_${turn}`;
      const ord = ['', 'הראשונה', 'השנייה', 'השלישית', 'הרביעית', 'החמישית'][k] || k;
      text = VOICE_LINES[voice] || `במעגל התנועה, צא ביציאה ${ord} (${word}).`;
    } else {
      // צומת T: אין דרך ישר
      const hasStraight = opts.some(x => turnType(din0, dirVec(x, exitDirFrom(node, x))) === 'straight');
      voice = node.type === 'light' ? `light_${turn}` : (!hasStraight && turn !== 'straight' ? `t_${turn}` : `junc_${turn}`);
      text = VOICE_LINES[voice] || `בצומת הקרוב, ${turn === 'straight' ? 'המשך ישר' : 'פנה ' + word}.`;
    }
    if (!VOICE_LINES[voice]) voice = null;
    this.newInstr({ kind: 'turn', node, edge: pick, text, turn, time, voice, fromEdge: e, dir, lessonStep });
  },

  // ===== שיעורים מודרכים =====
  stepDone(ins, ok, time) {
    const ls = this.lesson;
    if (!ls || !ins || !ins.lessonStep) return;
    ls.results.push(ok);
    ls.i++;
    if (this.onLessonStep) this.onLessonStep();
    if (ls.i >= ls.def.steps.length) ls.doneAt = time + 3;
  },
  lessonInstructor(time, p) {
    const ls = this.lesson;
    if (ls.doneAt != null) { if (time > ls.doneAt && this.onLessonDone) this.onLessonDone(); return; }
    const step = ls.def.steps[ls.i];
    if (this.instr) return;
    const st = assist.st;
    if (step.unpark || step.reverse) {
      if (!st || st.kind !== 'parked' || (this.parkedAt != null && time - this.parkedAt < 2.5)) return;
      if (step.reverse) this.newInstr({ kind: 'reverse', voice: 'reverse_line', text: VOICE_LINES.reverse_line, time, startT: st.t, need: this.reverseRoom(st), lessonStep: true });
      else this.newInstr({ kind: 'unpark', voice: 'ready', text: VOICE_LINES.ready, time, lessonStep: true });
      return;
    }
    const loc = this.loc;
    if (!loc || loc.kind !== 'edge') return;
    const e = loc.edge;
    const hd = Math.cos(p.h) * e.d.x + Math.sin(p.h) * e.d.y;
    if (Math.abs(hd) < 0.7) return;
    const dir = hd > 0 ? 1 : -1;
    const node = toNodeOf(e, dir);
    const dist = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
    const fromStart = dir > 0 ? loc.t - e.t0 : e.t1 - loc.t;
    if (step.park) {
      if (parkStripOf(e, dir, step.park) && dist > 50 && fromStart > 3) {
        const right = step.park === 'right';
        this.newInstr({ kind: 'park', side: step.park, voice: right ? 'stop_side' : 'park_left', text: right ? VOICE_LINES.stop_side : VOICE_LINES.park_left, time, lessonStep: true });
      }
      return;
    }
    if (node.edges.length < 3 || dist > 170 || dist < 25) return;
    const din = dirVec(e, dir);
    const opts = node.edges.filter(x => x !== e && canExit(node, x) && !isBanned(node, e, turnType(din, dirVec(x, exitDirFrom(node, x)))));
    if (!opts.length) return;
    let pick = null, counted = false;
    if (step.rb && node.type === 'roundabout') {
      const all = node.edges.filter(x => x !== e);
      pick = all.find(x => rbExitNumber(node, e, x) === step.rb) || null;
      if (step.rb > all.length) pick = e;   // פרסה: היציאה אחרי כל היציאות
      counted = !!pick;
    } else if (step.turn && node.type !== 'roundabout') {
      pick = opts.find(x => turnType(din, dirVec(x, exitDirFrom(node, x))) === step.turn) || null;
      counted = !!pick;
    }
    if (!pick) pick = opts.find(x => turnType(din, dirVec(x, exitDirFrom(node, x))) === 'straight') || opts[0];
    this.issueTurn(node, e, dir, pick, time, counted);
  },

  // משימת נסיעה לאחור לאורך המדרכה: לפחות 6 מטר, בלי לפגוע ברכב חונה
  checkReverseTask(time, p) {
    const ins = this.instr;
    if (!ins || ins.kind !== 'reverse' || !assist.st || assist.st.kind !== 'parked') return;
    const moved = Math.abs(assist.st.t - ins.startT);
    if (moved >= (ins.need || 6) && p.gear === 'D') {
      this.praise('נסיעה לאחור בקו ישר: בוצע');
      this.instr = null;
      this.unparkAt = time + 2;
      this.stepDone(ins, true, time);
    }
  },
  // כמה מטרים אפשר לנסוע לאחור מהחניה (עד הרכב שמאחור או עד הצומת), בין 3 ל-6
  reverseRoom(st) {
    let room = (st.t - (st.dir > 0 ? st.e.t0 : st.e.t1)) * st.dir - 3;
    for (const c of st.e.parked) if (c.key === st.key) { const d = (st.t - c.t) * st.dir; if (d > 0) room = Math.min(room, d - 5); }
    return Math.max(3, Math.min(6, Math.floor(room * 10) / 10 - 0.3));
  },
  newInstr(ins) { this.instr = ins; if (this.onInstr) this.onInstr(ins); },

  // ===== הוראות הבוחן =====
  instructorOn: true,
  updateInstructor(time, p) {
    if (this.lesson) { this.lessonInstructor(time, p); return; }
    if (!this.instructorOn) { this.instr = null; return; }
    // אחרי חניה: הוראה לצאת
    if (this.unparkAt && time > this.unparkAt && !this.instr && assist.on && assist.st && assist.st.kind === 'parked') {
      // לפעמים קודם נסיעה לאחור לאורך המדרכה, ואחר כך יציאה מהחניה
      if (!this.didReverseTask && Math.random() < 0.5) {
        this.didReverseTask = true;
        this.newInstr({ kind: 'reverse', voice: 'reverse_line', text: VOICE_LINES.reverse_line, time, startT: assist.st.t, need: this.reverseRoom(assist.st) });
      } else {
        this.newInstr({ kind: 'unpark', voice: 'ready', text: VOICE_LINES.ready, time });
        this.unparkAt = null;
      }
    }
    if (this.instr) return;
    const loc = this.loc;
    if (!loc || loc.kind !== 'edge') return;
    const e = loc.edge;
    const hd = Math.cos(p.h) * e.d.x + Math.sin(p.h) * e.d.y;
    if (Math.abs(hd) < 0.7) return;
    const dir = hd > 0 ? 1 : -1;
    const node = toNodeOf(e, dir);
    const dist = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
    const fromStart = dir > 0 ? loc.t - e.t0 : e.t1 - loc.t;
    // הוראת חניה (בערך בשליש מהרחובות שיש בהם חניה)
    const rollKey = e.id + dir;
    if (assist.on && this.parkRolled !== rollKey && fromStart > 10 && dist > 110) {
      this.parkRolled = rollKey;
      const sides = ['right', 'left'].filter(sd => parkStripOf(e, dir, sd));
      if (sides.length && Math.random() < 0.4) {
        const side = sides[Math.floor(Math.random() * sides.length)];
        this.newInstr({ kind: 'park', side, voice: side === 'right' ? 'stop_side' : 'park_left', text: side === 'right' ? VOICE_LINES.stop_side : VOICE_LINES.park_left, time });
        return;
      }
    }
    if (node.edges.length < 3 || dist > 160 || dist < 45) return;
    const din0 = dirVec(e, dir);
    const opts = node.edges.filter(x => x !== e && canExit(node, x) && !isBanned(node, e, turnType(din0, dirVec(x, exitDirFrom(node, x)))));
    if (!opts.length) return;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    this.issueTurn(node, e, dir, pick, time, false);
  },
};
