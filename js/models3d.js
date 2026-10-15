'use strict';
// ===== מודלים תלת-ממדיים: רכבים, אנשים, עצים, ריהוט רחוב =====
// הכל נבנה מצורות פשוטות בקוד (בלי קבצים חיצוניים), כדי שהקובץ יעבוד גם בלי אינטרנט.
// כיוון: ציר x של המודל = קדימה, z חיובי = ימין הרכב.

const Models = {
  _mat: {}, _geo: {},
  mat(color, opts) {
    color = color && color.isColor ? color.getHex() : new THREE.Color(color).getHex();
    const key = color + JSON.stringify(opts || {});
    if (!this._mat[key]) { this._mat[key] = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {})); this._mat[key].userData.shared = true; }
    return this._mat[key];
  },
  basic(color) {
    const key = 'b' + color;
    if (!this._mat[key]) { this._mat[key] = new THREE.MeshBasicMaterial({ color }); this._mat[key].userData.shared = true; }
    return this._mat[key];
  },
  geo(key, make) { if (!this._geo[key]) { this._geo[key] = make(); this._geo[key].userData.shared = true; } return this._geo[key]; },

  // צורה מפרופיל צד (x אורך, y גובה), נמתחת לרוחב w
  extrude(points, w, bevel = 0.06) {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -(w - bevel * 2) / 2);
    return g;
  },

  // מאחד את כל החלקים של אותו חומר לרשת אחת (פחות קריאות ציור = מהיר יותר).
  // keep: חלקים שנשארים נפרדים (פנסים שמשנים צבע, איתותים)
  merge(root, keep = []) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const byMat = new Map(), drop = [];
    root.traverse(o => {
      if (!o.isMesh || keep.includes(o) || Array.isArray(o.material)) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(m);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
      drop.push(o);
    });
    for (const o of drop) o.parent.remove(o);
    const out = [];
    for (const [mat, list] of byMat) {
      const geo = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const n = name === 'uv' ? 2 : 3;
        const total = list.reduce((a, g) => a + g.attributes.position.count, 0);
        const arr = new Float32Array(total * n);
        let off = 0;
        for (const g of list) { const a = g.attributes[name]; if (a) arr.set(a.array.subarray(0, a.count * n), off); off += g.attributes.position.count * n; }
        geo.setAttribute(name, new THREE.BufferAttribute(arr, n));
      }
      list.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      root.add(mesh); out.push(mesh);
    }
    return out;
  },

  // ===== רכבים =====
  CAR_TYPES: {
    sedan: { L: 4.5, W: 1.8, low: [[-2.25, 0.32], [2.25, 0.32], [2.25, 0.62], [2.05, 0.82], [1.05, 0.9], [-1.55, 0.92], [-2.2, 0.86], [-2.25, 0.62]],
      cab: [[0.95, 0.9], [0.25, 1.42], [-0.95, 1.42], [-1.55, 0.92]] },
    hatch: { L: 4.1, W: 1.76, low: [[-2.05, 0.32], [2.05, 0.32], [2.05, 0.62], [1.85, 0.82], [0.95, 0.9], [-1.95, 0.95], [-2.05, 0.7]],
      cab: [[0.85, 0.9], [0.15, 1.45], [-1.7, 1.42], [-1.95, 0.95]] },
    suv: { L: 4.6, W: 1.88, low: [[-2.3, 0.4], [2.3, 0.4], [2.3, 0.78], [2.1, 0.98], [1.15, 1.04], [-2.2, 1.06], [-2.3, 0.8]],
      cab: [[1.05, 1.04], [0.45, 1.72], [-2.0, 1.72], [-2.2, 1.06]] },
    van: { L: 4.6, W: 1.9, low: [[-2.3, 0.38], [2.3, 0.38], [2.3, 0.8], [2.15, 1.02], [1.55, 1.08], [-2.3, 1.1]],
      cab: [[1.5, 1.08], [0.95, 1.95], [-2.25, 1.95], [-2.3, 1.1]] },
  },
  randomCarType() { const r = Math.random(); return r < 0.45 ? 'sedan' : r < 0.72 ? 'hatch' : r < 0.9 ? 'suv' : 'van'; },

  car(color, type = 'sedan', isPlayer = false) {
    const T = THREE, P = this.CAR_TYPES[type] || this.CAR_TYPES.sedan, g = new T.Group();
    const paint = this.mat(color);
    const body = new T.Mesh(this.geo('low-' + type, () => this.extrude(P.low, P.W, 0.08)), paint);
    g.add(body);
    // תא הנוסעים: זכוכית מכל הצדדים וגג בצבע הרכב
    const glass = this.mat(0x1c2a36, { polygonOffset: true, polygonOffsetFactor: -1 });
    const cab = new T.Mesh(this.geo('cab-' + type, () => this.extrude(P.cab, P.W - 0.18, 0.04)), glass);
    const roofY = P.cab[1][1];
    const roofLen = Math.abs(P.cab[1][0] - P.cab[2][0]);
    const roof = new T.Mesh(this.geo('roof-' + type, () => new T.BoxGeometry(roofLen + 0.1, 0.06, P.W - 0.14)), paint);
    roof.position.set((P.cab[1][0] + P.cab[2][0]) / 2, roofY + 0.02, 0);
    const cabin = new T.Group(); cabin.add(cab, roof);
    // עמודים בין החלונות
    const pillarGeo = this.geo('pillar', () => new T.BoxGeometry(0.08, 0.5, 0.04));
    for (const z of [P.W / 2 - 0.08, -(P.W / 2 - 0.08)]) {
      const pl = new T.Mesh(pillarGeo, paint);
      pl.position.set((P.cab[0][0] + P.cab[3][0]) / 2 - 0.1, (roofY + P.cab[0][1]) / 2, z); cabin.add(pl);
    }
    g.add(cabin);
    // גלגלים עם חישוקים
    const tire = this.geo('tire', () => new T.CylinderGeometry(0.34, 0.34, 0.24, 18));
    const rim = this.geo('rim', () => new T.CylinderGeometry(0.2, 0.2, 0.25, 12));
    const wx = P.L / 2 - 0.85;
    for (const [x, z] of [[wx, P.W / 2 - 0.12], [wx, -(P.W / 2 - 0.12)], [-wx + 0.1, P.W / 2 - 0.12], [-wx + 0.1, -(P.W / 2 - 0.12)]]) {
      const t = new T.Mesh(tire, this.mat(0x161616)); t.rotation.x = Math.PI / 2; t.position.set(x, 0.34, z); g.add(t);
      const r = new T.Mesh(rim, this.mat(0xb8bec4)); r.rotation.x = Math.PI / 2; r.position.set(x, 0.34, z); g.add(r);
    }
    // פנסים, מראות, לוחית רישוי צהובה
    const lamp = this.geo('lamp', () => new T.BoxGeometry(0.06, 0.13, 0.36));
    const front = P.low[2][0], rear = P.low[0][0];
    for (const z of [P.W / 2 - 0.3, -(P.W / 2 - 0.3)]) { const h = new T.Mesh(lamp, this.basic(0xfff6c8)); h.position.set(front + 0.02, P.low[2][1] - 0.04, z); g.add(h); }
    const tailOff = this.mat(0x6a1a1a), tailOn = this.basic(0xff2d2d);
    const tails = [P.W / 2 - 0.3, -(P.W / 2 - 0.3)].map(z => { const t = new T.Mesh(lamp, tailOff); t.position.set(rear - 0.02, P.low[P.low.length - 1][1] + 0.06, z); g.add(t); return t; });
    const plate = this.geo('plate', () => new T.BoxGeometry(0.03, 0.12, 0.5));
    for (const x of [front + 0.04, rear - 0.04]) { const pl = new T.Mesh(plate, this.mat(0xf2c300)); pl.position.set(x, 0.45, 0); g.add(pl); }
    const mirror = this.geo('mirror', () => new T.BoxGeometry(0.12, 0.12, 0.2));
    for (const z of [P.W / 2 + 0.08, -(P.W / 2 + 0.08)]) { const m = new T.Mesh(mirror, paint); m.position.set(P.cab[0][0] - 0.05, P.cab[0][1] + 0.1, z); g.add(m); }
    const blinkMat = this.basic(0xffa31a);
    const bgeo = this.geo('blink', () => new T.BoxGeometry(0.16, 0.1, 0.06));
    const bl = side => [front - 0.05, rear + 0.05].map(x => { const b = new T.Mesh(bgeo, blinkMat); b.position.set(x, P.low[2][1] - 0.06, side * (P.W / 2 + 0.01)); b.visible = false; g.add(b); return b; });
    const car = { group: g, cabin, body, tails, tailOn, tailOff, blink: { '1': bl(1), '-1': bl(-1) } };
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    if (!isPlayer) Models.merge(g, [...tails, ...car.blink['1'], ...car.blink['-1']]);
    if (isPlayer) car.dash = this.cockpit(g, P, paint);
    return car;
  },

  // ===== תא הנהג (רואים אותו רק במבט מכיסא הנהג) =====
  // הנהג יושב משמאל: עין בגובה 1.3 מ', 0.2 מ' לפני מרכז הרכב ו-0.38 מ' שמאלה (z שלילי).
  cockpit(g, P, paint) {
    const T = THREE, dash = new T.Group(), W = P.W - 0.1;
    const plastic = this.mat(0x24272b), soft = this.mat(0x2e3237), trim = this.mat(0x3a3f45), roofIn = this.basic(0x8f8b84);
    // מכסה מנוע שנראה מעבר ללוח
    dash.add(new T.Mesh(this.extrude([[1.25, 0.88], [2.15, 0.8], [2.25, 0.7], [1.25, 0.7]], W, 0.05), paint));
    // הלוח (טמבון) לכל רוחב הרכב
    const board = new T.Mesh(this.extrude([[0.62, 0.9], [0.62, 0.99], [0.76, 1.03], [1.12, 1.01], [1.28, 0.93], [1.28, 0.86]], W, 0.03), soft);
    dash.add(board);
    // גומחת השעונים מול הנהג, ומסך השעונים
    const hump = new T.Mesh(new T.BoxGeometry(0.2, 0.06, 0.46), plastic); hump.position.set(0.78, 1.06, -0.38); dash.add(hump);
    const gc = document.createElement('canvas'); gc.width = 512; gc.height = 160;
    const gtex = new T.CanvasTexture(gc); gtex.colorSpace = T.SRGBColorSpace;
    const gauge = new T.Mesh(new T.PlaneGeometry(0.42, 0.13), new T.MeshBasicMaterial({ map: gtex }));
    gauge.position.set(0.69, 1.02, -0.38); gauge.rotation.y = -Math.PI / 2; gauge.rotateX(-0.35); dash.add(gauge);
    // מסך מולטימדיה במרכז ופתחי מיזוג
    const scr = new T.Mesh(new T.PlaneGeometry(0.2, 0.11), new T.MeshBasicMaterial({ color: 0x0f2236 }));
    scr.position.set(0.8, 1.06, 0.02); scr.rotation.y = -Math.PI / 2; scr.rotateX(-0.25); dash.add(scr);
    for (const z of [-0.72, -0.08, 0.12, 0.7]) { const v = new T.Mesh(new T.BoxGeometry(0.02, 0.05, 0.13), trim); v.position.set(0.63, 0.96, z); dash.add(v); }
    // הגה: מסתובב לפי ההיגוי
    const wheelG = new T.Group(); wheelG.position.set(0.6, 0.92, -0.38); wheelG.rotation.z = -0.5;
    const spin = new T.Group(); wheelG.add(spin);
    const rim = new T.Mesh(new T.TorusGeometry(0.17, 0.02, 8, 32), this.mat(0x15171a)); rim.rotation.y = Math.PI / 2; spin.add(rim);
    const hub = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.05, 16), trim); hub.rotation.z = Math.PI / 2; spin.add(hub);
    const sp1 = new T.Mesh(new T.BoxGeometry(0.02, 0.022, 0.32), plastic); spin.add(sp1);
    const sp2 = new T.Mesh(new T.BoxGeometry(0.02, 0.15, 0.03), plastic); sp2.position.y = -0.08; spin.add(sp2);
    const logo = new T.Mesh(new T.CircleGeometry(0.025, 16), this.mat(0xc0c4c8)); logo.position.x = -0.03; logo.rotation.y = -Math.PI / 2; spin.add(logo);
    dash.add(wheelG);
    // עמודי השמשה, תקרה ואדני החלונות
    const beam = (a, b, t, mat) => {
      const d = new T.Vector3().subVectors(b, a), m = new T.Mesh(new T.BoxGeometry(t, d.length(), t), mat);
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); dash.add(m);
    };
    for (const z of [W / 2 - 0.03, -(W / 2 - 0.03)]) {
      beam(new T.Vector3(1.3, 0.97, z), new T.Vector3(0.62, 1.47, z * 0.95), 0.035, plastic);
      beam(new T.Vector3(1.0, 0.98, z), new T.Vector3(-0.6, 0.98, z), 0.07, soft);   // אדן החלון
    }
    const header = new T.Mesh(new T.BoxGeometry(0.4, 0.03, W), roofIn); header.position.set(0.4, 1.5, 0); dash.add(header);
    g.add(dash);
    dash.userData = { wheel: spin, gauge: { ctx: gc.getContext('2d'), tex: gtex } };
    return dash;
  },
  // ציור השעונים: מד מהירות, איתותים, הילוך
  drawGauge(G, kmh, blinker, blinkOn, gear, lim) {
    const c = G.ctx;
    c.fillStyle = '#07090b'; c.fillRect(0, 0, 512, 160);
    // מד מהירות עגול
    const cx = 150, cy = 92, r = 64;
    c.strokeStyle = '#3c4650'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
    c.strokeStyle = '#9fb3c8'; c.lineWidth = 2;
    for (let v = 0; v <= 160; v += 20) { const a = Math.PI * 0.75 + v / 160 * Math.PI * 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10)); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    const a = Math.PI * 0.75 + Math.min(kmh, 160) / 160 * Math.PI * 1.5;
    c.strokeStyle = kmh > lim + 3 ? '#ff453a' : '#ff8a3d'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); c.stroke();
    c.fillStyle = '#e8eef4'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText(Math.round(kmh), cx, cy + 46);
    // מסך מרכזי: הילוך ומהירות מותרת
    c.fillStyle = gear === 'R' ? '#ff453a' : '#50c8ff'; c.font = 'bold 54px Arial'; c.fillText(gear, 330, 104);
    c.strokeStyle = '#d32f2f'; c.lineWidth = 6; c.beginPath(); c.arc(440, 82, 30, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(440, 82, 27, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.font = 'bold 26px Arial'; c.fillText(lim, 440, 92);
    // חיצי איתות
    const arrow = (x, dir, on) => {
      c.fillStyle = on ? '#34c759' : '#1d2a22';
      c.beginPath(); c.moveTo(x + dir * 22, 24); c.lineTo(x, 8); c.lineTo(x, 18); c.lineTo(x - dir * 18, 18); c.lineTo(x - dir * 18, 30); c.lineTo(x, 30); c.lineTo(x, 40); c.closePath(); c.fill();
    };
    arrow(40, -1, blinker === -1 && blinkOn); arrow(472, 1, blinker === 1 && blinkOn);
    G.tex.needsUpdate = true;
  },

  // אוטובוס עירוני: גוף ארוך, פס חלונות כהה, שלט קו מואר מלפנים
  bus(color) {
    const T = THREE, g = new T.Group(), L = 11.5, W = 2.5;
    const paint = this.mat(color);
    const body = new T.Mesh(this.geo('busBody', () => new T.BoxGeometry(L, 2.6, W)), paint); body.position.y = 1.75; g.add(body);
    const glass = this.mat(0x1c2a36, { polygonOffset: true, polygonOffsetFactor: -1 });
    const band = new T.Mesh(this.geo('busGlass', () => new T.BoxGeometry(L - 0.6, 1.0, W + 0.02)), glass); band.position.set(0, 2.3, 0); g.add(band);
    const wind = new T.Mesh(this.geo('busWind', () => new T.BoxGeometry(0.04, 1.6, W - 0.2)), glass); wind.position.set(L / 2 + 0.01, 2.1, 0); g.add(wind);
    const roof = new T.Mesh(this.geo('busRoof', () => new T.BoxGeometry(L - 0.4, 0.06, W - 0.1)), this.mat(0xe8e8e8)); roof.position.y = 3.08; g.add(roof);
    const sign = new T.Mesh(this.geo('busSign', () => new T.BoxGeometry(0.05, 0.3, 1.6)), this.basic(0xffb300)); sign.position.set(L / 2 + 0.03, 3.0, 0); g.add(sign);
    const tire = this.geo('busTire', () => new T.CylinderGeometry(0.5, 0.5, 0.3, 16));
    for (const [x, z] of [[3.6, W / 2 - 0.15], [3.6, -(W / 2 - 0.15)], [-3.2, W / 2 - 0.15], [-3.2, -(W / 2 - 0.15)]]) {
      const t = new T.Mesh(tire, this.mat(0x161616)); t.rotation.x = Math.PI / 2; t.position.set(x, 0.5, z); g.add(t);
    }
    const lamp = this.geo('busLamp', () => new T.BoxGeometry(0.06, 0.2, 0.4));
    for (const z of [W / 2 - 0.35, -(W / 2 - 0.35)]) { const h = new T.Mesh(lamp, this.basic(0xfff6c8)); h.position.set(L / 2 + 0.02, 0.8, z); g.add(h); }
    const tailOff = this.mat(0x6a1a1a), tailOn = this.basic(0xff2d2d);
    const tails = [W / 2 - 0.35, -(W / 2 - 0.35)].map(z => { const t = new T.Mesh(lamp, tailOff); t.position.set(-L / 2 - 0.02, 0.9, z); g.add(t); return t; });
    const bgeo = this.geo('blink', () => new T.BoxGeometry(0.16, 0.1, 0.06)), blinkMat = this.basic(0xffa31a);
    const bl = side => [L / 2 - 0.1, -L / 2 + 0.1].map(x => { const b = new T.Mesh(bgeo, blinkMat); b.position.set(x, 1.1, side * (W / 2 + 0.01)); b.visible = false; g.add(b); return b; });
    const car = { group: g, cabin: band, body, tails, tailOn, tailOff, blink: { '1': bl(1), '-1': bl(-1) } };
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    Models.merge(g, [...tails, ...car.blink['1'], ...car.blink['-1']]);
    return car;
  },

  // רוכב אופניים או קורקינט חשמלי (עם קסדה)
  rider(kind, color) {
    const T = THREE, g = new T.Group();
    const dark = this.mat(0x222222), frame = this.mat(color);
    const p = this.human({ shirt: color });
    const parts = [];
    if (kind === 'bike') {
      const wheel = this.geo('bikeWheel', () => new T.TorusGeometry(0.33, 0.035, 6, 16));
      for (const x of [0.55, -0.55]) { const w = new T.Mesh(wheel, dark); w.position.set(x, 0.35, 0); parts.push(w); }
      const bar = new T.Mesh(this.geo('bikeFrame', () => new T.BoxGeometry(1.0, 0.05, 0.05)), frame); bar.position.set(0, 0.62, 0); bar.rotation.z = -0.15; parts.push(bar);
      const fork = new T.Mesh(this.geo('bikeFork', () => new T.BoxGeometry(0.05, 0.6, 0.05)), frame); fork.position.set(0.5, 0.62, 0); fork.rotation.z = 0.25; parts.push(fork);
      const hb = new T.Mesh(this.geo('handle', () => new T.BoxGeometry(0.05, 0.05, 0.55)), dark); hb.position.set(0.45, 0.95, 0); parts.push(hb);
      // יושב על האוכף ונוטה קדימה
      p.group.position.set(-0.2, -0.25, 0); p.group.rotation.z = -0.35;
    } else {
      const wheel = this.geo('scWheel', () => new T.CylinderGeometry(0.1, 0.1, 0.06, 12));
      for (const x of [0.5, -0.5]) { const w = new T.Mesh(wheel, dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.1, 0); parts.push(w); }
      const deck = new T.Mesh(this.geo('scDeck', () => new T.BoxGeometry(1.0, 0.06, 0.18)), dark); deck.position.set(0, 0.16, 0); parts.push(deck);
      const pole = new T.Mesh(this.geo('scPole', () => new T.CylinderGeometry(0.025, 0.025, 1.0, 6)), this.mat(0x9e9e9e)); pole.position.set(0.48, 0.65, 0); pole.rotation.z = 0.1; parts.push(pole);
      const hb = new T.Mesh(this.geo('handle', () => new T.BoxGeometry(0.05, 0.05, 0.55)), dark); hb.position.set(0.44, 1.14, 0); parts.push(hb);
      p.group.position.set(-0.05, 0.19, 0);
    }
    const helmet = new T.Mesh(this.geo('helmet', () => new T.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), this.mat(kind === 'bike' ? 0xffffff : 0x111111));
    helmet.position.y = 1.66; p.group.add(helmet);
    g.add(p.group, ...parts);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { group: g, person: p, body: g, cabin: g, tails: [], tailOn: null, tailOff: null, blink: { '1': [], '-1': [] } };
  },

  // רכב ביטחון: אמבולנס (לבן עם פס אדום) או ניידת (לבנה עם פס כחול), עם מתקן אורות על הגג
  emergency(kind) {
    const T = THREE, type = kind === 'police' ? 'sedan' : 'van';
    const car = this.car(0xffffff, type, false), P = this.CAR_TYPES[type], g = car.group;
    const stripe = new T.Mesh(new T.BoxGeometry(P.L - 0.4, 0.16, P.W + 0.03), this.mat(kind === 'police' ? 0x1e4fa8 : 0xd32f2f));
    stripe.position.set(0, P.low[2][1] - 0.12, 0); g.add(stripe);
    const top = P.cab[1][1];
    const red = this.basic(0xff2a2a), blue = this.basic(0x2f7bff), dim = this.mat(0x553333), dimB = this.mat(0x333355);
    const lg = new T.BoxGeometry(0.3, 0.14, 0.55);
    const a = new T.Mesh(lg, red), b = new T.Mesh(lg, blue);
    const bx = (P.cab[1][0] + P.cab[2][0]) / 2 + 0.3;
    a.position.set(bx, top + 0.12, -0.3); b.position.set(bx, top + 0.12, 0.3);
    g.add(a, b);
    car.bar = [{ m: a, on: kind === 'police' ? blue : red, off: kind === 'police' ? dimB : dim }, { m: b, on: blue, off: dimB }];
    return car;
  },

  // ===== אנשים =====
  SKIN: [0xf1c9a5, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd1a17a],
  HAIR: [0x1b1410, 0x3b2a1e, 0x6b4a2b, 0xb38b5d, 0x111111, 0x8c8c8c],
  CLOTH: [0x2f5d8a, 0x8a2f2f, 0x3f6b45, 0xc9a227, 0x555b66, 0xe8e6e1, 0x6b4f8a, 0xa8552c, 0x1f2937, 0xd96c8a],
  pick(a) { return a[Math.floor(Math.random() * a.length)]; },

  human(opts = {}) {
    const T = THREE, g = new T.Group();
    const skin = this.mat(opts.skin || this.pick(this.SKIN)), shirt = this.mat(opts.shirt || this.pick(this.CLOTH));
    const pants = this.mat(opts.pants || this.pick([0x1f2937, 0x2d3640, 0x3b4a5c, 0x5b4636, 0x222222])), hair = this.mat(this.pick(this.HAIR));
    const h = opts.height || (1.6 + Math.random() * 0.25), s = h / 1.75;
    const legGeo = this.geo('leg', () => { const gg = new T.BoxGeometry(0.15, 0.82, 0.17); gg.translate(0, -0.41, 0); return gg; });
    const armGeo = this.geo('arm', () => { const gg = new T.BoxGeometry(0.11, 0.62, 0.12); gg.translate(0, -0.31, 0); return gg; });
    const legs = [-0.1, 0.1].map(z => { const l = new T.Mesh(legGeo, pants); l.position.set(0, 0.86 * s, z * s); l.scale.setScalar(s); g.add(l); return l; });
    const torso = new T.Mesh(this.geo('torso', () => new T.BoxGeometry(0.26, 0.6, 0.42)), shirt);
    torso.position.y = 1.16 * s; torso.scale.setScalar(s); g.add(torso);
    const arms = [-0.27, 0.27].map(z => { const a = new T.Mesh(armGeo, shirt); a.position.set(0, 1.44 * s, z * s); a.scale.setScalar(s); g.add(a); return a; });
    const head = new T.Mesh(this.geo('head', () => new T.SphereGeometry(0.12, 12, 10)), skin);
    head.position.y = 1.6 * s; head.scale.setScalar(s); g.add(head);
    const hairM = new T.Mesh(this.geo('hair', () => new T.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hair);
    hairM.position.y = 1.62 * s; hairM.scale.setScalar(s); g.add(hairM);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    Models.merge(g, [...legs, ...arms]);
    return { group: g, legs, arms };
  },
  // תנועת הליכה לפי שלב
  walk(p, phase, moving) {
    const a = moving ? Math.sin(phase) * 0.5 : 0;
    p.legs[0].rotation.z = a; p.legs[1].rotation.z = -a;
    p.arms[0].rotation.z = -a * 0.8; p.arms[1].rotation.z = a * 0.8;
  },

  // ===== צמחייה =====
  palm() {
    const T = THREE, g = new T.Group();
    const h = 6 + Math.random() * 4;
    const trunk = new T.Mesh(this.geo('palmTrunk', () => new T.CylinderGeometry(0.16, 0.26, 1, 7)), this.mat(0x8a6f4d));
    trunk.scale.y = h; trunk.position.y = h / 2; g.add(trunk);
    const leafGeo = this.geo('palmLeaf', () => { const gg = new T.ConeGeometry(0.35, 3.2, 4, 1); gg.rotateZ(Math.PI / 2); gg.translate(1.6, 0, 0); gg.scale(1, 0.25, 1); return gg; });
    const leafMat = this.mat(0x3f7a2e);
    for (let i = 0; i < 9; i++) {
      const l = new T.Mesh(leafGeo, leafMat);
      l.position.y = h; l.rotation.y = i / 9 * Math.PI * 2; l.rotation.z = -0.35 - Math.random() * 0.25;
      g.add(l);
    }
    Models.merge(g);
    return g;
  },
};
