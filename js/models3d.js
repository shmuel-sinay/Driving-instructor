'use strict';
// ===== מודלים תלת-ממדיים: רכבים, אנשים, עצים, ריהוט רחוב =====
// הכל נבנה מצורות פשוטות בקוד (בלי קבצים חיצוניים), כדי שהקובץ יעבוד גם בלי אינטרנט.
// כיוון: ציר x של המודל = קדימה, z חיובי = ימין הרכב.

const Models = {
  _mat: {}, _geo: {},
  guidesOn: (() => { try { return localStorage.getItem('driving-practice.guides') !== 'off'; } catch (e) { return true; } })(),
  mat(color, opts) {
    color = color && color.isColor ? color.getHex() : new THREE.Color(color).getHex();
    const key = color + JSON.stringify(opts || {});
    if (!this._mat[key]) { this._mat[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, opts || {})); this._mat[key].userData.shared = true; }
    return this._mat[key];
  },
  basic(color) {
    const key = 'b' + color;
    if (!this._mat[key]) { this._mat[key] = new THREE.MeshBasicMaterial({ color }); this._mat[key].userData.shared = true; }
    return this._mat[key];
  },
  geo(key, make) { if (!this._geo[key]) { this._geo[key] = make(); this._geo[key].userData.shared = true; } return this._geo[key]; },

  // חומר מבריק (צבע רכב, זכוכית, מתכת) שמחזיר את השמיים
  pbr(color, metal, rough, opts) {
    color = color && color.isColor ? color.getHex() : new THREE.Color(color).getHex();
    const key = 'pbr' + color + ':' + metal + ':' + rough + JSON.stringify(opts || {});
    if (!this._mat[key]) { this._mat[key] = new THREE.MeshStandardMaterial(Object.assign({ color, metalness: metal, roughness: rough }, opts || {})); this._mat[key].userData.shared = true; }
    return this._mat[key];
  },
  // החלקת פינות של פרופיל (Chaikin) כדי שהרכב ייראה מעוגל ולא קופסה
  smooth(points, it = 2) {
    let pts = points;
    for (let k = 0; k < it; k++) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      pts = out;
    }
    return pts;
  },
  // נורמלים חלקים: ממצע נורמלים של פאות שנוגעות באותה נקודה (עד זווית מסוימת), כדי שגוף הרכב ייראה חלק ולא משושה
  smoothNormals(geo, maxAngle = 0.9) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count;
    const key = i => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    const map = new Map();
    for (let i = 0; i < n; i++) { const k = key(i); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
    const out = new Float32Array(n * 3), cos = Math.cos(maxAngle);
    for (const list of map.values()) for (const i of list) {
      const ax = nor.getX(i), ay = nor.getY(i), az = nor.getZ(i);
      let sx = 0, sy = 0, sz = 0;
      for (const j of list) { const bx = nor.getX(j), by = nor.getY(j), bz = nor.getZ(j); if (ax * bx + ay * by + az * bz >= cos) { sx += bx; sy += by; sz += bz; } }
      const l = Math.hypot(sx, sy, sz) || 1;
      out[i * 3] = sx / l; out[i * 3 + 1] = sy / l; out[i * 3 + 2] = sz / l;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
    return geo;
  },
  // צורה מפרופיל צד (x אורך, y גובה), נמתחת לרוחב w
  extrude(points, w, bevel = 0.06) {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
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

  // צל מגע רך מתחת לרכב או לאדם (כמו בצילום: הקרקע כהה ממש מתחתיו)
  blob(l, w, op = 0.6) {
    const T = THREE;
    if (!this._blobTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 8, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      this._blobTex = new T.CanvasTexture(c); this._blobTex.userData.cached = true;
    }
    const key = 'blob' + op;
    if (!this._mat[key]) { this._mat[key] = new T.MeshBasicMaterial({ map: this._blobTex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); this._mat[key].userData.shared = true; }
    const m = new T.Mesh(this.geo('blobPlane', () => { const q = new T.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2); return q; }), this._mat[key]);
    m.scale.set(l, 1, w); m.position.y = 0.025; m.renderOrder = 1;
    return m;
  },

  // ===== רכבים =====
  // פרופיל צד של כל סוג רכב: low = גוף תחתון (עד קו החלונות), cab = תא הנוסעים [בסיס שמשה, גג קדמי, גג אחורי, בסיס חלון אחורי]
  CAR_TYPES: {
    sedan: { L: 4.6, W: 1.82, low: [[-2.3, 0.3], [2.3, 0.3], [2.33, 0.64], [2.2, 0.76], [1.35, 0.86], [-1.65, 0.9], [-2.27, 0.86], [-2.34, 0.6]],
      cab: [[1.35, 0.86], [0.42, 1.4], [-0.85, 1.42], [-1.65, 0.9]] },
    hatch: { L: 4.1, W: 1.76, low: [[-2.05, 0.3], [2.05, 0.3], [2.08, 0.64], [1.96, 0.76], [1.15, 0.86], [-1.92, 0.92], [-2.08, 0.62]],
      cab: [[1.15, 0.86], [0.3, 1.44], [-1.62, 1.42], [-1.92, 0.94]] },
    suv: { L: 4.65, W: 1.9, low: [[-2.32, 0.42], [2.32, 0.42], [2.35, 0.8], [2.25, 0.94], [1.45, 1.04], [-2.22, 1.07], [-2.34, 0.76]],
      cab: [[1.42, 1.04], [0.62, 1.72], [-1.95, 1.74], [-2.22, 1.09]] },
    van: { L: 4.7, W: 1.92, low: [[-2.35, 0.4], [2.35, 0.4], [2.38, 0.78], [2.28, 0.96], [1.78, 1.06], [-2.35, 1.1]],
      cab: [[1.75, 1.06], [1.08, 1.92], [-2.25, 1.94], [-2.33, 1.12]] },
  },
  randomCarType() { const r = Math.random(); return r < 0.45 ? 'sedan' : r < 0.72 ? 'hatch' : r < 0.9 ? 'suv' : 'van'; },

  car(color, type = 'sedan', isPlayer = false) {
    const T = THREE, P = this.CAR_TYPES[type] || this.CAR_TYPES.sedan, g = new T.Group();
    const paint = this.pbr(color, 0.5, 0.28);
    const body = new T.Mesh(this.geo('low-' + type, () => this.smoothNormals(this.extrude(this.smooth(P.low, 1), P.W, 0.1))), paint);
    g.add(body);
    // תא הנוסעים: צר יותר מהגוף, בצבע הרכב, ועליו שמשות וחלונות זכוכית מבריקה
    const WG = P.W - 0.16, glass = this.pbr(0x0b1118, 0.95, 0.04, { side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const cabin = new T.Group();
    cabin.add(new T.Mesh(this.geo('gh-' + type, () => this.smoothNormals(this.extrude(this.smooth(P.cab, 1), WG, 0.07))), paint));
    // שמשה קדמית ואחורית: מלבן על השיפוע, מעט מעל המשטח
    const pane = (A, B, w) => {
      const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = dy / l, ny = -dx / l;
      const o = 0.082, i0 = 0.16, a0 = [A[0] + ux * i0 + nx * o, A[1] + uy * i0 + ny * o], b0 = [B[0] - ux * i0 + nx * o, B[1] - uy * i0 + ny * o];
      const q = new T.BufferGeometry();
      q.setAttribute('position', new T.BufferAttribute(new Float32Array([a0[0], a0[1], -w / 2, a0[0], a0[1], w / 2, b0[0], b0[1], w / 2, a0[0], a0[1], -w / 2, b0[0], b0[1], w / 2, b0[0], b0[1], -w / 2]), 3));
      q.computeVertexNormals();
      return q;
    };
    const cp = this.smooth(P.cab, 1);
    cabin.add(new T.Mesh(this.geo('ws-' + type, () => pane(P.cab[0], P.cab[1], WG - 0.16)), glass));
    cabin.add(new T.Mesh(this.geo('rw-' + type, () => pane(P.cab[2], P.cab[3], WG - 0.2)), glass));
    // חלונות צד: צורת התא מוקטנת סביב המרכז, משני הצדדים, עם עמוד בין הדלתות
    const sideGeo = this.geo('side-' + type, () => {
      const cx = P.cab.reduce((a, q) => a + q[0], 0) / 4, cy = P.cab.reduce((a, q) => a + q[1], 0) / 4;
      const pts = this.smooth(P.cab, 1).map(([x, y]) => [cx + (x - cx) * 0.86, cy + (y - cy) * 0.78 + 0.02]);
      const sh = new T.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
      return new T.ShapeGeometry(sh);
    });
    for (const z of [1, -1]) { const sw = new T.Mesh(sideGeo, glass); sw.position.z = z * (WG / 2 + 0.006); sw.scale.z = z; cabin.add(sw); }
    const bpX = (P.cab[0][0] + P.cab[3][0]) / 2 - 0.05;
    const bp = this.geo('bpillar-' + type, () => new T.BoxGeometry(0.09, (P.cab[1][1] - P.cab[0][1]) * 0.8, WG + 0.03));
    const bpm = new T.Mesh(bp, paint); bpm.position.set(bpX, (P.cab[1][1] + P.cab[0][1]) / 2, 0); cabin.add(bpm);
    const roofY = P.cab[1][1];
    g.add(cabin);
    // גלגלים עם חישוקים
    const tire = this.geo('tire', () => new T.CylinderGeometry(0.34, 0.34, 0.24, 24));
    const rim = this.geo('rim', () => new T.CylinderGeometry(0.22, 0.22, 0.25, 20));
    const wx = P.L / 2 - 0.85;
    for (const [x, z] of [[wx, P.W / 2 - 0.12], [wx, -(P.W / 2 - 0.12)], [-wx + 0.1, P.W / 2 - 0.12], [-wx + 0.1, -(P.W / 2 - 0.12)]]) {
      const t = new T.Mesh(tire, this.pbr(0x141414, 0, 0.9)); t.rotation.x = Math.PI / 2; t.position.set(x, 0.34, z); g.add(t);
      const r = new T.Mesh(rim, this.pbr(0xc8ccd0, 1, 0.28)); r.rotation.x = Math.PI / 2; r.position.set(x, 0.34, z + Math.sign(z) * 0.02); g.add(r);
      // חמישה חישורים כהים על החישוק
      for (let k = 0; k < 5; k++) { const sp = new T.Mesh(this.geo('spoke', () => new T.BoxGeometry(0.05, 0.17, 0.02)), this.pbr(0x2a2d30, 0.6, 0.4)); sp.position.set(x + Math.sin(k * 1.2566) * 0.09, 0.34 + Math.cos(k * 1.2566) * 0.09, z + Math.sign(z) * 0.15); sp.rotation.z = -k * 1.2566; g.add(sp); }
    }
    // קשתות גלגלים כהות, פגושים, גריל, קו דלתות וידיות
    const dark = this.pbr(0x1b1d20, 0.1, 0.7), chrome = this.pbr(0xd0d4d8, 1, 0.25);
    // קשת כהה מעל כל גלגל (חצי טבעת על דופן הרכב)
    const arch = this.geo('arch2', () => new T.TorusGeometry(0.4, 0.035, 6, 18, Math.PI));
    for (const [x, z] of [[wx, 1], [wx, -1], [-wx + 0.1, 1], [-wx + 0.1, -1]]) { const a = new T.Mesh(arch, dark); a.position.set(x, 0.34, z * (P.W / 2 + 0.005)); g.add(a); }
    const front0 = Math.max(...P.low.map(q => q[0])) + 0.06, rear0 = Math.min(...P.low.map(q => q[0])) - 0.06;
    const bumper = this.geo('bumper-' + type, () => { const q = new T.CapsuleGeometry(0.1, P.W - 0.35, 4, 10); q.rotateX(Math.PI / 2); return q; });
    for (const x of [front0 - 0.04, rear0 + 0.04]) { const b = new T.Mesh(bumper, dark); b.position.set(x, P.low[0][1] + 0.1, 0); g.add(b); }
    const grille = new T.Mesh(this.geo('grille', () => new T.BoxGeometry(0.03, 0.12, 0.62)), dark); grille.position.set(front0 + 0.01, P.low[2][1] - 0.06, 0); g.add(grille);
    const seam = this.geo('seam-' + type, () => new T.BoxGeometry(0.012, P.cab[0][1] - P.low[0][1] - 0.15, 0.01));
    const handle = this.geo('handle2', () => new T.BoxGeometry(0.14, 0.025, 0.02));
    const doorX = (P.cab[0][0] + P.cab[3][0]) / 2 - 0.1;
    for (const z of [1, -1]) {
      const sm = new T.Mesh(seam, dark); sm.position.set(doorX, (P.cab[0][1] + P.low[0][1]) / 2 + 0.05, z * (P.W / 2 + 0.002)); g.add(sm);
      for (const x of [doorX + 0.45, doorX - 0.5]) { const hd = new T.Mesh(handle, chrome); hd.position.set(x, P.cab[0][1] - 0.12, z * (P.W / 2 + 0.008)); g.add(hd); }
    }
    // פנסים, מראות, לוחית רישוי צהובה
    const lamp = this.geo('lamp', () => new T.BoxGeometry(0.06, 0.13, 0.36));
    // הגוף מעוגל ובולט 0.1 מ' מהפרופיל, אז הפנסים והלוחיות יושבים על פני השטח
    const front = Math.max(...P.low.map(q => q[0])) + 0.1, rear = Math.min(...P.low.map(q => q[0])) - 0.1;
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
    g.add(this.blob(P.L + 0.5, P.W + 0.5, 0.75));
    if (!isPlayer) Models.merge(g, [...tails, ...car.blink['1'], ...car.blink['-1']]);
    if (isPlayer) car.dash = this.cockpit(g, P, paint);
    return car;
  },

  // ===== תא הנהג (רואים אותו רק במבט מכיסא הנהג) =====
  // הנהג יושב משמאל: עין בגובה 1.3 מ', 0.2 מ' לפני מרכז הרכב ו-0.38 מ' שמאלה (z שלילי).
  cockpit(g, P, paint) {
    const T = THREE, dash = new T.Group(), W = P.W - 0.1;
    const plastic = this.mat(0x24272b), trim = this.mat(0x3a3f45), roofIn = this.basic(0x8f8b84);
    // פלסטיק רך עם מרקם עדין ותפר, כמו בלוח של רכב אמיתי
    const gr = document.createElement('canvas'); gr.width = gr.height = 128;
    const gx = gr.getContext('2d'), rr = Math.random;
    gx.fillStyle = '#34383d'; gx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2500; i++) { gx.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * 0.06})`; gx.fillRect(rr() * 128, rr() * 128, 1, 1); }
    const grain = new T.CanvasTexture(gr); grain.wrapS = grain.wrapT = T.RepeatWrapping; grain.repeat.set(6, 6); grain.colorSpace = T.SRGBColorSpace;
    const soft = new T.MeshStandardMaterial({ map: grain, roughness: 0.75 });
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
    // מראות צד: גוף בצבע הרכב וזכוכית כהה משקפת, משני הצדדים
    for (const z of [1, -1]) {
      const housing = new T.Mesh(this.geo('sideMirror', () => new T.BoxGeometry(0.1, 0.13, 0.22)), plastic);
      housing.position.set(1.05, 1.14, z * (P.W / 2 + 0.16)); housing.scale.setScalar(0.75); dash.add(housing);
      const glassM = new T.Mesh(this.geo('sideMirrorGlass', () => new T.PlaneGeometry(0.19, 0.1)), this.pbr(0x8fa3b5, 1, 0.05));
      glassM.position.set(1.01, 1.14, z * (P.W / 2 + 0.16)); glassM.scale.setScalar(0.75); glassM.rotation.y = -Math.PI / 2; dash.add(glassM);
      const arm = new T.Mesh(this.geo('mirrorArm', () => new T.BoxGeometry(0.06, 0.03, 0.12)), plastic); arm.position.set(1.07, 1.1, z * (P.W / 2 + 0.06)); dash.add(arm);
    }
    // ידית הילוכים וקונסולה מרכזית
    const console1 = new T.Mesh(new T.BoxGeometry(0.6, 0.18, 0.22), soft); console1.position.set(0.25, 0.82, 0.02); dash.add(console1);
    const knob = new T.Mesh(new T.SphereGeometry(0.035, 12, 8), this.pbr(0x111111, 0.3, 0.4)); knob.position.set(0.15, 0.97, 0.02); dash.add(knob);
    const header = new T.Mesh(new T.BoxGeometry(0.4, 0.03, W), roofIn); header.position.set(0.4, 1.5, 0); dash.add(header);
    // קווי עזר על הכביש: איפה הרכב נגמר מימין, משמאל ומלפנים (כמו מצלמת חניה)
    const guideMat = new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, depthWrite: false });
    const guides = new T.Group();
    for (const z of [P.W / 2, -P.W / 2]) {
      const strip = new T.Mesh(new T.PlaneGeometry(9, 0.1), guideMat);
      strip.rotation.x = -Math.PI / 2; strip.position.set(P.L / 2 + 4.5, 0.03, z); guides.add(strip);
    }
    for (const [x, op] of [[P.L / 2 + 0.05, 0.6], [P.L / 2 + 3, 0.3], [P.L / 2 + 6, 0.2]]) {
      const m = new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: op, depthWrite: false });
      const cross = new T.Mesh(new T.PlaneGeometry(0.07, P.W), m);
      cross.rotation.x = -Math.PI / 2; cross.position.set(x, 0.03, 0); guides.add(cross);
    }
    guides.visible = Models.guidesOn;
    dash.add(guides);
    g.add(dash);
    dash.userData = { guides, wheel: spin, gauge: { ctx: gc.getContext('2d'), tex: gtex } };
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
    helmet.position.y = 1.72; p.group.add(helmet);
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
  BLONDE: [0xe8c77a, 0xf0d99a, 0xd9b26a, 0xf5e1b0],
  CLOTH: [0x2f5d8a, 0x8a2f2f, 0x3f6b45, 0xc9a227, 0x555b66, 0xe8e6e1, 0x6b4f8a, 0xa8552c, 0x1f2937, 0xd96c8a],
  pick(a) { return a[Math.floor(Math.random() * a.length)]; },

  // חלקי גוף בצבעים שונים מאוחדים לרשת אחת (צבע לכל קודקוד), כדי שכל אדם יהיה מעט קריאות ציור
  colored(parts) {
    const T = THREE, geos = [];
    for (const { g, c, m } of parts) {
      let q = g.index ? g.toNonIndexed() : g.clone();
      if (m) q.applyMatrix4(m);
      const col = new T.Color(c), n = q.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      q.setAttribute('color', new T.BufferAttribute(arr, 3));
      geos.push(q);
    }
    const out = new T.BufferGeometry();
    for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3]]) {
      const total = geos.reduce((a, q) => a + q.attributes.position.count, 0), arr = new Float32Array(total * k);
      let off = 0;
      for (const q of geos) { arr.set(q.attributes[name].array, off); off += q.attributes.position.count * k; }
      out.setAttribute(name, new T.BufferAttribute(arr, k));
    }
    geos.forEach(q => q.dispose());
    if (!this._skinMat) { this._skinMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }); this._skinMat.userData.shared = true; }
    const mesh = new T.Mesh(out, this._skinMat);
    mesh.castShadow = true;
    return mesh;
  },
  M(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const T = THREE;
    return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
  },
  SHOES: [0x1a1a1a, 0x3b2a1e, 0xf2f2f2, 0x5a5f66],
  SHIRTS: [0xffffff, 0x2f5d8a, 0x8a2f2f, 0x3f6b45, 0xc9a227, 0x555b66, 0xe8e6e1, 0x6b4f8a, 0xa8552c, 0x1f2937, 0xd96c8a, 0x87ceeb, 0xf4a261],
  PANTS: [0x1f2937, 0x2d3640, 0x3b4a5c, 0x5b4636, 0x222222, 0x6b7b8c, 0xc2b280],

  // אדם עם מפרקים (ירכיים, ברכיים, כתפיים, מרפקים), פנים ושיער. פונה ל-x חיובי.
  human(opts = {}) {
    const T = THREE, g = new T.Group(), P = this.pick.bind(this);
    const female = opts.female != null ? opts.female : false;
    const skin = opts.skin || P(this.SKIN), shirt = opts.shirt || P(this.SHIRTS), pants = opts.pants || P(this.PANTS);
    const hair = female && Math.random() < 0.45 ? P(this.BLONDE) : P(this.HAIR), shoes = P(this.SHOES);
    const dress = female && Math.random() < 0.3, skirt = dress || (female && Math.random() < 0.4), longSleeve = Math.random() < 0.35;
    const hairStyle = female ? P(['long', 'long', 'ponytail', 'bun', 'wavy']) : (Math.random() < 0.12 ? 'bald' : 'short');
    const h = opts.height || (female ? 1.58 + Math.random() * 0.15 : 1.68 + Math.random() * 0.2), sc = h / 1.75;
    const cap = (r, l) => this.geo('cap' + r + ':' + l, () => new T.CapsuleGeometry(r, l, 4, 10));
    const sph = r => this.geo('sph' + r, () => new T.SphereGeometry(r, 12, 8));
    const M = this.M.bind(this);
    // גוף, צוואר, ראש, פנים ושיער (חלק אחד שלא זז)
    const W = female ? 0.9 : 1;   // רוחב כתפיים
    const body = [
      // חזה וכתפיים, מותניים (צרים יותר אצל נשים) ואגן
      { g: cap(0.15, 0.16), c: shirt, m: M(0, 1.34, 0, 0, 0, 0, 0.72, 1, 1.22 * W) },
      { g: cap(female ? 0.11 : 0.13, 0.1), c: shirt, m: M(0, 1.13, 0, 0, 0, 0, 0.78, 1, female ? 1.05 : 1.12) },
      { g: cap(female ? 0.14 : 0.13, 0.1), c: skirt ? shirt : pants, m: M(0, 0.97, 0, Math.PI / 2, 0, 0, 0.82, female ? 1.15 : 1.05, 1) },
      { g: sph(0.06), c: shirt, m: M(0, 1.43, 0.2 * W) }, { g: sph(0.06), c: shirt, m: M(0, 1.43, -0.2 * W) },
      { g: this.geo('neck', () => new T.CylinderGeometry(0.045, 0.052, 0.13, 14)), c: skin, m: M(0, 1.54, 0) },
      // ראש בצורת ביצה, לסת, אוזניים
      { g: sph(0.1), c: skin, m: M(0, 1.675, 0, 0, 0, 0, 1.02, 1.2, 0.92) },
      { g: sph(0.06), c: skin, m: M(0.018, 1.612, 0, 0, 0, 0, 0.9, 0.75, 1.05) },
      { g: sph(0.022), c: skin, m: M(-0.005, 1.67, 0.092, 0, 0, 0, 0.6, 1.2, 0.5) }, { g: sph(0.022), c: skin, m: M(-0.005, 1.67, -0.092, 0, 0, 0, 0.6, 1.2, 0.5) },
      // אף, עיניים (לבן + אישון), גבות
      { g: this.geo('nose2', () => new T.ConeGeometry(0.014, 0.04, 8)), c: skin, m: M(0.1, 1.665, 0, 0, 0, -Math.PI / 2) },
      { g: sph(0.016), c: 0xf5f5f5, m: M(0.086, 1.695, 0.034, 0, 0, 0, 0.5, 0.75, 1) }, { g: sph(0.016), c: 0xf5f5f5, m: M(0.086, 1.695, -0.034, 0, 0, 0, 0.5, 0.75, 1) },
      { g: sph(0.008), c: P([0x3b2a1e, 0x2f5d8a, 0x3f6b45, 0x1a1a1a]), m: M(0.094, 1.695, 0.034) }, { g: sph(0.008), c: 0x2a1c12, m: M(0.094, 1.695, -0.034) },
      { g: this.geo('brow', () => new T.BoxGeometry(0.008, 0.007, 0.034)), c: hair, m: M(0.09, 1.72, 0.035, 0.12) }, { g: this.geo('brow', () => new T.BoxGeometry(0.008, 0.007, 0.034)), c: hair, m: M(0.09, 1.72, -0.035, -0.12) },
    ];
    if (!female) body.push({ g: this.geo('mouthM', () => new T.BoxGeometry(0.006, 0.006, 0.032)), c: 0x8a4a3a, m: M(0.088, 1.625, 0) });
    else {
      // שיער נשי מלא: צדדים, גב, ולפעמים פוני
      if (hairStyle === 'long' || hairStyle === 'wavy') for (const z of [0.075, -0.075]) body.push({ g: cap(0.04, 0.16), c: hair, m: M(-0.01, 1.6, z, 0, 0, 0, 0.9, 1, 1) });
      if (Math.random() < 0.4 && hairStyle !== 'bun') body.push({ g: this.geo('bangs', () => new T.SphereGeometry(0.104, 14, 6, -Math.PI / 2.4, Math.PI / 1.2, 0, Math.PI * 0.32)), c: hair, m: M(0.012, 1.7, 0, 0, Math.PI / 2, 0.2) });
    }
    if (hairStyle !== 'bald') body.push({ g: this.geo('hairCap', () => new T.SphereGeometry(0.113, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), c: hair, m: M(-0.012, 1.69, 0, 0, 0, 0.25, 1, 1.12, 1) });
    if (hairStyle === 'long') body.push({ g: cap(0.085, 0.24), c: hair, m: M(-0.07, 1.55, 0, 0, 0, 0, 0.8, 1, 1.25) });
    if (hairStyle === 'wavy') body.push({ g: cap(0.1, 0.16), c: hair, m: M(-0.06, 1.58, 0, 0, 0, 0, 0.9, 1, 1.45) });
    if (hairStyle === 'ponytail') body.push({ g: cap(0.04, 0.2), c: hair, m: M(-0.13, 1.6, 0, 0, 0, -0.35) });
    if (hairStyle === 'bun') body.push({ g: sph(0.06), c: hair, m: M(-0.08, 1.79, 0) });
    if (female) body.push({ g: sph(0.012), c: P([0xb5354a, 0xc4566a, 0x9c3b3b, 0xd47a7a]), m: M(0.088, 1.625, 0, 0, 0, 0, 0.6, 0.55, 1.7) });
    // שמלה: אותו צבע כמו החולצה; חצאית: צבע משלה
    if (skirt) body.push({ g: this.geo('skirt', () => new T.CylinderGeometry(0.14, 0.26, 0.46, 16, 1, true)), c: dress ? shirt : P([0x6b4f8a, 0x1f2937, 0xa8552c, 0x2f5d8a, 0xd96c8a, 0x222222]), m: M(0, 0.77, 0) });
    // תיק צד
    if (female && Math.random() < 0.4) body.push({ g: this.geo('bag', () => new T.BoxGeometry(0.22, 0.17, 0.07)), c: P([0x5b3a29, 0x111111, 0xc9a227, 0x8a2f2f]), m: M(-0.02, 0.98, 0.25) });
    const torso = this.colored(body); g.add(torso);
    // רגליים: ירך ← ברך ← שוק ונעל
    const legs = [], knees = [];
    for (const z of [0.09, -0.09]) {
      const hip = new T.Group(); hip.position.set(0, 0.93, z); g.add(hip);
      hip.add(this.colored([{ g: cap(0.072, 0.3), c: skirt ? skin : pants, m: M(0, -0.21, 0) }]));
      const knee = new T.Group(); knee.position.y = -0.44; hip.add(knee);
      knee.add(this.colored([
        { g: cap(0.056, 0.32), c: skirt ? skin : pants, m: M(0, -0.21, 0) },
        { g: cap(0.05, 0.14), c: shoes, m: M(0.05, -0.44, 0, 0, 0, Math.PI / 2, 1, 1, 1.1) },
      ]));
      legs.push(hip); knees.push(knee);
    }
    // ידיים: כתף ← מרפק ← אמה וכף יד
    const arms = [], elbows = [];
    for (const z of [0.21, -0.21]) {
      const sh = new T.Group(); sh.position.set(0, 1.43, z * (female ? 0.88 : 1)); g.add(sh);
      sh.add(this.colored([{ g: cap(0.05, 0.2), c: shirt, m: M(0, -0.14, 0) }]));
      const el = new T.Group(); el.position.y = -0.29; sh.add(el);
      el.add(this.colored([
        { g: cap(0.042, 0.18), c: longSleeve ? shirt : skin, m: M(0, -0.12, 0) },
        { g: sph(0.045), c: skin, m: M(0, -0.27, 0, 0, 0, 0, 1, 1.2, 0.7) },
      ]));
      arms.push(sh); elbows.push(el);
    }
    g.add(this.blob(0.7, 0.6, 0.45));
    g.scale.setScalar(sc);
    return { group: g, legs, knees, arms, elbows };
  },
  // הליכה טבעית: רגל מתנדנדת, ברך מתכופפת כשהרגל עוברת קדימה, ידיים נגדיות
  walk(p, phase, moving) {
    const sw = moving ? Math.sin(phase) * 0.42 : 0, cs = Math.cos(phase);
    p.legs[0].rotation.z = sw; p.legs[1].rotation.z = -sw;
    if (p.knees) {
      p.knees[0].rotation.z = moving ? -(Math.max(0, cs) * 0.75 + 0.05) : 0;
      p.knees[1].rotation.z = moving ? -(Math.max(0, -cs) * 0.75 + 0.05) : 0;
      p.elbows[0].rotation.z = p.elbows[1].rotation.z = moving ? 0.35 : 0.12;
    }
    p.arms[0].rotation.z = -sw * 0.8; p.arms[1].rotation.z = sw * 0.8;
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
