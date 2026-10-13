'use strict';
// ===== תצוגת תלת-ממד (Three.js) =====
// מבט מכיסא הנהג (עם מראה אחורית) או מאחורי הרכב.
// הכביש עצמו (נתיבים, סימונים, מעברי חציה, אבני שפה) מצויר בעזרת אותו קוד של המפה הדו-ממדית
// על טקסטורה, וכל השאר (בניינים, תמרורים, רמזורים, רכבים, הולכי רגל) הם עצמים תלת-ממדיים.
// מערכת צירים: x של העולם = X, y של העולם = Z, וגובה = Y.

const View3D = {
  ok: false,
  init() {
    const cv = document.getElementById('view3d');
    if (!cv || typeof THREE === 'undefined') return;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { this.ok = false; return; }
    this.cv = cv;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
    this.mirrorCam = new THREE.PerspectiveCamera(42, 3.2, 0.5, 300);
    this.aniso = this.renderer.capabilities.getMaxAnisotropy();
    this.texCache = {};
    this.camH = 0;
    this.bounce = 0;
    this.ok = true;
  },

  resize(w, h) {
    if (!this.ok) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  },

  mat(color, opts = {}) { return new THREE.MeshLambertMaterial(Object.assign({ color }, opts)); },

  // ===== בניית הסצנה למפה הנוכחית =====
  build() {
    if (!this.ok) return;
    const T = THREE;
    if (this.scene) this.dispose();
    const scene = this.scene = new T.Scene();
    scene.background = new T.Color(0xa9cfe8);
    scene.fog = new T.Fog(0xa9cfe8, 140, 520);
    scene.add(new T.HemisphereLight(0xeef6ff, 0x5a7040, 0.95));
    const sun = new T.DirectionalLight(0xffffff, 0.9);
    sun.position.set(-0.4, 1, 0.3);
    scene.add(sun);

    // קרקע ודשא
    const ground = new T.Mesh(new T.PlaneGeometry(6000, 6000), this.mat(0x6f9a4a));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    scene.add(ground);

    // טקסטורת הכביש של כל המפה (רזולוציה בינונית, לנוף הרחוק)
    const wx = WORLD.maxX - WORLD.minX, wy = WORLD.maxY - WORLD.minY;
    const k = Math.min(3072 / wx, 3072 / wy, 5);
    const far = document.createElement('canvas');
    far.width = Math.ceil(wx * k); far.height = Math.ceil(wy * k);
    this.paintRoads(far.getContext('2d'), WORLD.minX, WORLD.minY, k, far.width, far.height);
    const farTex = new T.CanvasTexture(far);
    farTex.anisotropy = this.aniso; farTex.colorSpace = T.SRGBColorSpace;
    const farMesh = new T.Mesh(new T.PlaneGeometry(wx, wy), new T.MeshLambertMaterial({ map: farTex }));
    farMesh.rotation.x = -Math.PI / 2;
    farMesh.position.set(WORLD.minX + wx / 2, 0, WORLD.minY + wy / 2);
    scene.add(farMesh);

    // טקסטורה חדה סביב הרכב (מתעדכנת כשנוסעים)
    this.NEAR = 150;
    this.nearCv = document.createElement('canvas');
    this.nearCv.width = this.nearCv.height = 2048;
    this.nearTex = new T.CanvasTexture(this.nearCv);
    this.nearTex.anisotropy = this.aniso; this.nearTex.colorSpace = T.SRGBColorSpace;
    this.nearMesh = new T.Mesh(new T.PlaneGeometry(this.NEAR, this.NEAR),
      new T.MeshLambertMaterial({ map: this.nearTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.nearMesh.rotation.x = -Math.PI / 2;
    this.nearMesh.position.y = 0.01;
    scene.add(this.nearMesh);
    this.nearAt = null;

    this.buildSky();
    this.buildCurbs();
    this.buildLamps();
    this.buildBuildings();
    this.buildTrees();
    this.buildSigns();
    this.buildParked();
    this.npcMeshes = new Map();
    this.pedMeshes = new Map();
    this.player = this.makeCar(0xf4f1e8, true);
    scene.add(this.player.group);
  },

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && !m.map.userData.cached) m.map.dispose(); m.dispose(); });
    });
  },

  paintRoads(c, x0, y0, k, w, h) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = COL.grass; c.fillRect(0, 0, w, h);
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    drawRoads(c);
    drawMarkings(c);
  },

  updateNear(px, py) {
    if (this.nearAt && Math.hypot(px - this.nearAt.x, py - this.nearAt.y) < 38) return;
    const N = this.NEAR, S = this.nearCv.width;
    this.nearAt = { x: px, y: py };
    this.paintRoads(this.nearCv.getContext('2d'), px - N / 2, py - N / 2, S / N, S, S);
    this.nearTex.needsUpdate = true;
    this.nearMesh.position.x = px; this.nearMesh.position.z = py;
  },

  // שמיים: כיפה עם מעבר צבע מהאופק לכחול
  buildSky() {
    const T = THREE;
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5f9fd8'); gr.addColorStop(0.55, '#9cc8ea'); gr.addColorStop(0.8, '#d9ecf7'); gr.addColorStop(1, '#eef6fb');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const sky = new T.Mesh(new T.SphereGeometry(800, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false }));
    sky.position.set((WORLD.minX + WORLD.maxX) / 2, -5, (WORLD.minY + WORLD.maxY) / 2);
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
  },

  // אבני שפה מוגבהות בין הכביש למדרכה
  buildCurbs() {
    const T = THREE, list = [];
    for (const e of edges) for (const s of [e.sMax + 0.1, e.sMin - 0.1]) {
      const len = e.t1 - e.t0;
      if (len < 2) continue;
      const mid = edgePoint(e, (e.t0 + e.t1) / 2, s);
      list.push({ x: mid.x, y: mid.y, len, ang: Math.atan2(e.d.y, e.d.x) });
    }
    const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 0.16, 0.22), this.mat(0xd8d4cc), list.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
    list.forEach((c, i) => { q.setFromAxisAngle(up, -c.ang); m.compose(new T.Vector3(c.x, 0.08, c.y), q, new T.Vector3(c.len, 1, 1)); mesh.setMatrixAt(i, m); });
    this.scene.add(mesh);
    // מדרכה מעט מוגבהת
    const walks = [];
    for (const e of edges) for (const [a, b] of [[e.sMax + 0.2, e.sMax + SIDEWALK], [e.sMin - SIDEWALK, e.sMin - 0.2]]) {
      const len = e.t1 - e.t0; if (len < 2) continue;
      const mid = edgePoint(e, (e.t0 + e.t1) / 2, (a + b) / 2);
      walks.push({ x: mid.x, y: mid.y, len, w: b - a, ang: Math.atan2(e.d.y, e.d.x) });
    }
    const wm = new T.InstancedMesh(new T.BoxGeometry(1, 0.1, 1), this.mat(0xc9c4b8), walks.length);
    walks.forEach((c, i) => { q.setFromAxisAngle(up, -c.ang); m.compose(new T.Vector3(c.x, 0.05, c.y), q, new T.Vector3(c.len, 1, c.w)); wm.setMatrixAt(i, m); });
    this.scene.add(wm);
  },

  // עמודי תאורה לאורך הרחובות, לסירוגין משני הצדדים
  buildLamps() {
    const T = THREE, list = [];
    for (const e of edges) {
      let side = 1;
      for (let t = e.t0 + 15; t < e.t1 - 10; t += 38) {
        const s = side > 0 ? e.sMax + 1.0 : e.sMin - 1.0;
        const p = edgePoint(e, t, s);
        list.push({ x: p.x, y: p.y, inX: -e.n.x * side, inY: -e.n.y * side });
        side = -side;
      }
    }
    if (!list.length) return;
    const pole = new T.InstancedMesh(new T.CylinderGeometry(0.07, 0.1, 7, 6), this.mat(0x6c737a), list.length);
    const head = new T.InstancedMesh(new T.BoxGeometry(1.4, 0.18, 0.4), this.mat(0x4a5056), list.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0);
    list.forEach((l, i) => {
      m.compose(new T.Vector3(l.x, 3.5, l.y), q, one); pole.setMatrixAt(i, m);
      const hq = new T.Quaternion().setFromAxisAngle(up, -Math.atan2(l.inY, l.inX));
      m.compose(new T.Vector3(l.x + l.inX * 0.6, 7, l.y + l.inY * 0.6), hq, one); head.setMatrixAt(i, m);
    });
    this.scene.add(pole, head);
  },

  buildBuildings() {
    const T = THREE;
    const win = document.createElement('canvas'); win.width = win.height = 64;
    const g = win.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#7d8a96';
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) g.fillRect(4 + q * 16, 4 + r * 16, 8, 9);
    const wtex = new T.CanvasTexture(win); wtex.wrapS = wtex.wrapT = T.RepeatWrapping; wtex.colorSpace = T.SRGBColorSpace;
    const mats = {};
    const rnd = seeded(77);
    for (const b of scenery.buildings) {
      const hgt = 6 + Math.floor(rnd() * 6) * 3;
      let m = mats[b.c];
      if (!m) {
        const side = new T.MeshLambertMaterial({ color: b.c, map: wtex });
        const top = this.mat(new T.Color(b.c).multiplyScalar(0.8));
        m = mats[b.c] = [side, side, top, top, side, side];
      }
      const geo = new T.BoxGeometry(b.w, hgt, b.h);
      // חלונות בקנה מידה קבוע (כ-4 מטר לחלון)
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        const sx = face < 2 ? b.h : b.w;
        uv.setXY(i, uv.getX(i) * sx / 16, uv.getY(i) * hgt / 12);
      }
      const mesh = new T.Mesh(geo, m);
      mesh.position.set(b.x + b.w / 2, hgt / 2, b.y + b.h / 2);
      this.scene.add(mesh);
    }
  },

  buildTrees() {
    const T = THREE, list = scenery.trees;
    if (!list.length) return;
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.25, 2.2, 6), this.mat(0x6b4f35), list.length);
    const crown = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), this.mat(0x447a2e), list.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3();
    list.forEach((t, i) => {
      m.compose(new T.Vector3(t.x, 1.1, t.y), q, sc.set(1, 1, 1)); trunk.setMatrixAt(i, m);
      m.compose(new T.Vector3(t.x, 2.2 + t.r * 0.7, t.y), q, sc.set(t.r * 0.9, t.r, t.r * 0.9)); crown.setMatrixAt(i, m);
    });
    this.scene.add(trunk, crown);
  },

  signTexture(kind, val) {
    const key = kind + ':' + val;
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.setTransform(32, 0, 0, 32, 64, 64);
    drawSignGlyph(g, kind, val, 1.85, kind === 'oneway' ? -Math.PI / 2 : 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso; tex.userData.cached = true;
    return (this.texCache[key] = tex);
  },

  buildSigns() {
    const T = THREE;
    const poleGeo = new T.CylinderGeometry(0.05, 0.05, 2.7, 6), poleMat = this.mat(0x8f969c);
    const plateGeo = new T.PlaneGeometry(0.95, 0.95), backMat = this.mat(0x9aa0a6);
    this.lights = [];
    for (const s of signs) {
      const v = s.edge ? dirVec(s.edge, s.dir || 1) : { x: 1, y: 0 };
      const face = Math.atan2(-v.x, -v.y);
      if (s.kind === 'light') { this.buildLight(s, face); continue; }
      const pole = new T.Mesh(poleGeo, poleMat);
      pole.position.set(s.x, 1.35, s.y);
      const front = new T.Mesh(plateGeo, new T.MeshBasicMaterial({ map: this.signTexture(s.kind, s.val), transparent: true, alphaTest: 0.2, fog: true }));
      front.position.set(s.x, 2.35, s.y); front.rotation.y = face;
      front.translateZ(0.06);
      const back = new T.Mesh(plateGeo, backMat);
      back.position.set(s.x, 2.35, s.y); back.rotation.y = face + Math.PI;
      back.translateZ(-0.04);
      this.scene.add(pole, front, back);
    }
  },

  buildLight(s, face) {
    const T = THREE;
    const g = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 3.4, 6), this.mat(0x3a3f44));
    pole.position.y = 1.7; g.add(pole);
    const box = new T.Mesh(new T.BoxGeometry(0.42, 1.15, 0.3), this.mat(0x1d1f22));
    box.position.y = 3.6; g.add(box);
    const lamps = ['#ff3b30', '#ffcc00', '#34c759'].map((c, i) => {
      const on = new T.MeshBasicMaterial({ color: c });
      const off = this.mat(0x2b2b2b);
      const l = new T.Mesh(new T.CircleGeometry(0.13, 14), off);
      l.position.set(0, 3.95 - i * 0.35, 0.16);
      g.add(l);
      return { mesh: l, on, off };
    });
    g.position.set(s.x, 0, s.y);
    g.rotation.y = face;
    this.scene.add(g);
    this.lights.push({ node: s.node, edge: s.edge, lamps });
  },

  makeCar(color, isPlayer) {
    const T = THREE, g = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(4.4, 0.75, 1.8), this.mat(color));
    body.position.y = 0.58; g.add(body);
    const cabin = new T.Mesh(new T.BoxGeometry(2.3, 0.62, 1.64), [this.mat(0x22303d), this.mat(0x22303d), this.mat(color), this.mat(color), this.mat(0x22303d), this.mat(0x22303d)]);
    cabin.position.set(-0.3, 1.26, 0); g.add(cabin);
    const wheelGeo = new T.CylinderGeometry(0.34, 0.34, 0.24, 12), wheelMat = this.mat(0x1b1b1b);
    for (const [x, z] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) {
      const w = new T.Mesh(wheelGeo, wheelMat); w.rotation.x = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w);
    }
    const lampGeo = new T.BoxGeometry(0.06, 0.16, 0.38);
    const head = new T.MeshBasicMaterial({ color: 0xfff6c8 });
    for (const z of [0.6, -0.6]) { const h = new T.Mesh(lampGeo, head); h.position.set(2.21, 0.7, z); g.add(h); }
    const tailOff = this.mat(0x6a1a1a), tailOn = new T.MeshBasicMaterial({ color: 0xff2d2d });
    const tails = [0.6, -0.6].map(z => { const t = new T.Mesh(lampGeo, tailOff); t.position.set(-2.21, 0.72, z); g.add(t); return t; });
    const blinkMat = new T.MeshBasicMaterial({ color: 0xffa31a });
    const bl = (side) => [2.15, -2.15].map(x => { const b = new T.Mesh(new T.BoxGeometry(0.2, 0.12, 0.08), blinkMat); b.position.set(x, 0.72, side * 0.93); b.visible = false; g.add(b); return b; });
    // צד ימין של הרכב: z חיובי (כמו y חיובי בעולם הדו-ממדי)
    const car = { group: g, cabin, tails, tailOn, tailOff, blink: { '1': bl(1), '-1': bl(-1) } };
    car.body = body;
    if (isPlayer) {
      // במבט נהג רואים רק מכסה מנוע כהה ונמוך, כדי שהכביש יישאר גלוי
      const hood = new T.Mesh(new T.BoxGeometry(1.5, 0.08, 1.7), this.mat(0x2c3640));
      hood.position.set(1.45, 0.9, 0); g.add(hood);
      car.dash = hood;
    }
    return car;
  },

  syncCar(car, v, opts) {
    car.group.position.set(v.x, 0, v.y);
    car.group.rotation.y = -v.h;
    const brake = !!opts.braking;
    for (const t of car.tails) t.material = brake ? car.tailOn : car.tailOff;
    for (const side of ['1', '-1']) for (const b of car.blink[side]) b.visible = opts.blinker === +side && opts.blinkOn;
  },

  buildParked() {
    for (const c of parkedCars()) {
      const car = this.makeCar(new THREE.Color(c.color), false);
      this.syncCar(car, c, {});
      this.scene.add(car.group);
    }
  },

  syncPeds() {
    const T = THREE, seen = new Set();
    for (const cw of crosswalks) for (const pd of cw.peds) {
      seen.add(pd);
      let m = this.pedMeshes.get(pd);
      if (!m) {
        m = new T.Group();
        const body = new T.Mesh(new T.CylinderGeometry(0.22, 0.25, 1.1, 8), this.mat(new T.Color(pd.color)));
        body.position.y = 0.95; m.add(body);
        const head = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), this.mat(0xe9c39b));
        head.position.y = 1.65; m.add(head);
        const legs = new T.Mesh(new T.BoxGeometry(0.3, 0.45, 0.2), this.mat(0x2d3640));
        legs.position.y = 0.22; m.add(legs);
        this.scene.add(m); this.pedMeshes.set(pd, m);
      }
      m.position.set(pd.x, Math.abs(Math.sin(pd.phase || 0)) * 0.05, pd.y);
    }
    for (const [pd, m] of this.pedMeshes) if (!seen.has(pd)) { this.scene.remove(m); this.pedMeshes.delete(pd); }
  },

  syncNPCs(list, blinkOn) {
    const seen = new Set();
    for (const n of list) {
      seen.add(n);
      let car = this.npcMeshes.get(n);
      if (!car) { car = this.makeCar(new THREE.Color(n.color), false); this.scene.add(car.group); this.npcMeshes.set(n, car); }
      this.syncCar(car, n, { braking: n.braking, blinker: n.blinker, blinkOn });
    }
    for (const [n, car] of this.npcMeshes) if (!seen.has(n)) { this.scene.remove(car.group); this.npcMeshes.delete(n); }
  },

  // ===== ציור פריים =====
  render(dt, time, list, mode, mirrorRect) {
    if (!this.ok || !this.scene) return;
    const p = player;
    this.updateNear(p.x, p.y);
    const blinkOn = (time % 0.8) < 0.45;
    this.syncNPCs(list, blinkOn);
    this.syncPeds();
    this.syncCar(this.player, p, { braking: p.braking || (p.v === 0 && !input.up), blinker: p.blinker, blinkOn });
    const driver = mode === 'driver';
    this.player.cabin.visible = !driver;
    this.player.body.visible = !driver;
    this.player.dash.visible = driver;
    for (const L of this.lights) {
      const st = lightState(L.node, axisOf(L.edge), time);
      const on = [st === 'red' || st === 'redyellow', st === 'yellow' || st === 'redyellow', st === 'green'];
      L.lamps.forEach((l, i) => { l.mesh.material = on[i] ? l.on : l.off; });
    }
    // קפיצה קטנה על פס האטה
    this.bounce *= Math.exp(-dt * 6);
    const hx = Math.cos(p.h), hy = Math.sin(p.h);
    const cam = this.camera;
    if (driver) {
      // הנהג יושב משמאל (ישראל)
      const lx = hy, ly = -hx;
      cam.fov = 64;
      cam.position.set(p.x + lx * 0.38 + hx * 0.2, 1.3 + this.bounce * Math.sin(time * 40) * 0.05, p.y + ly * 0.38 + hy * 0.2);
      cam.lookAt(p.x + hx * 30 + lx * 0.38, 0.75, p.y + hy * 30 + ly * 0.38);
    } else {
      this.camH += angNorm(p.h - this.camH) * (1 - Math.exp(-dt * 3));
      const ch = Math.cos(this.camH), sh = Math.sin(this.camH);
      cam.fov = 60;
      cam.position.set(p.x - ch * 10, 4.2, p.y - sh * 10);
      cam.lookAt(p.x + ch * 8, 0.8, p.y + sh * 8);
    }
    cam.updateProjectionMatrix();
    if (this.sky) { this.sky.position.x = cam.position.x; this.sky.position.z = cam.position.z; }
    const R = this.renderer;
    R.setScissorTest(false);
    R.setViewport(0, 0, this.w, this.h);
    R.render(this.scene, cam);
    // מראה אחורית: מצלמה הפוכה בעולם משוקף, כדי שימין יופיע מימין כמו במראה אמיתית
    if (driver && mirrorRect) {
      const mc = this.mirrorCam;
      mc.aspect = mirrorRect.w / mirrorRect.h; mc.updateProjectionMatrix();
      const ex = p.x + hx * 0.3, ey = p.y + hy * 0.3;
      mc.position.set(-ex, 1.45, ey);
      mc.lookAt(-(ex - hx * 30), 1.1, ey - hy * 30);
      this.scene.scale.x = -1; this.scene.updateMatrixWorld(true);
      this.player.group.visible = false;
      const y = this.h - mirrorRect.y - mirrorRect.h;
      R.setScissorTest(true);
      R.setScissor(mirrorRect.x, y, mirrorRect.w, mirrorRect.h);
      R.setViewport(mirrorRect.x, y, mirrorRect.w, mirrorRect.h);
      R.render(this.scene, mc);
      R.setScissorTest(false);
      this.scene.scale.x = 1; this.scene.updateMatrixWorld(true);
      this.player.group.visible = true;
    }
  },
};
View3D.init();
