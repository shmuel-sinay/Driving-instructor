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
    // צבעים כמו של מצלמה אמיתית
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
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

  mat(color, opts = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0 }, opts)); },

  // ===== בניית הסצנה למפה הנוכחית =====
  build() {
    if (!this.ok) return;
    const T = THREE;
    if (this.scene) this.dispose();
    const scene = this.scene = new T.Scene();
    scene.background = new T.Color(0xa9cfe8);
    scene.fog = new T.Fog(0xa9cfe8, 140, 520);
    this.hemi = new T.HemisphereLight(0xeef6ff, 0x5a7040, 0.95);
    scene.add(this.hemi);
    const sun = this.sun = new T.DirectionalLight(0xfff4e0, 1.0);
    sun.position.set(-40, 100, 30);
    scene.add(sun, sun.target);
    // צללים: מצלמת צל קטנה שעוקבת אחרי הרכב
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 10; sc.far = 260;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;

    // קרקע ודשא
    const ground = new T.Mesh(new T.PlaneGeometry(6000, 6000, 40, 40), this.mat(0x6f9a4a));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; ground.receiveShadow = true;   // מתחת לכביש, כדי שלא יבצבץ מעליו
    scene.add(ground);

    // טקסטורת הכביש של כל המפה (רזולוציה בינונית, לנוף הרחוק)
    const wx = WORLD.maxX - WORLD.minX, wy = WORLD.maxY - WORLD.minY;
    const k = Math.min(3072 / wx, 3072 / wy, 5);
    const far = document.createElement('canvas');
    far.width = Math.ceil(wx * k); far.height = Math.ceil(wy * k);
    this.paintRoads(far.getContext('2d'), WORLD.minX, WORLD.minY, k, far.width, far.height);
    const farTex = new T.CanvasTexture(far);
    farTex.anisotropy = this.aniso; farTex.colorSpace = T.SRGBColorSpace;
    const farMesh = new T.Mesh(new T.PlaneGeometry(wx, wy), new T.MeshStandardMaterial({ map: farTex, roughness: 0.95 }));
    farMesh.rotation.x = -Math.PI / 2;
    farMesh.position.set(WORLD.minX + wx / 2, 0, WORLD.minY + wy / 2);
    farMesh.receiveShadow = true;
    scene.add(farMesh);

    // טקסטורה חדה סביב הרכב (מתעדכנת כשנוסעים)
    this.NEAR = 150;
    this.nearCv = document.createElement('canvas');
    this.nearCv.width = this.nearCv.height = 2048;
    this.nearTex = new T.CanvasTexture(this.nearCv);
    this.nearTex.anisotropy = this.aniso; this.nearTex.colorSpace = T.SRGBColorSpace;
    this.nearMesh = new T.Mesh(new T.PlaneGeometry(this.NEAR, this.NEAR),
      new T.MeshStandardMaterial({ map: this.nearTex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.nearMesh.rotation.x = -Math.PI / 2;
    this.nearMesh.position.y = 0.01;
    this.nearMesh.receiveShadow = true;
    scene.add(this.nearMesh);
    this.nearAt = null;

    this.buildSky();
    this.buildEnv();
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
    this.buildStreetSigns();
    this.buildBusStops();
    this.buildWalkers();
    this.buildPalms();
    this.applyQuality();
    this.applyWeather();
  },

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.userData.shared) return; if (m.map && !m.map.userData.cached) m.map.dispose(); m.dispose(); });
    });
  },

  paintRoads(c, x0, y0, k, w, h) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = COL.grass; c.fillRect(0, 0, w, h);
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    // דשא עם עלים וכתמים במקום צבע אחיד
    c.fillStyle = this.texPattern(c, 'grass'); c.fillRect(x0, y0, w / k, h / k);
    drawRoads(c);
    if (k >= 6) this.paintDetail(c, k, x0, y0, w, h);
    drawMarkings(c);
  },

  // מרקמים שחוזרים על עצמם, בקנה מידה של העולם (מטרים)
  texCanvas(kind) {
    this.texCv = this.texCv || {};
    if (this.texCv[kind]) return this.texCv[kind];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), rnd = seeded({ grass: 11, pave: 23, asph: 37 }[kind]);
    if (kind === 'grass') {
      g.fillStyle = '#5d8a3c'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++) {   // כתמים בהירים וכהים
        const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 40, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rnd() < 0.5 ? 'rgba(120,150,60,.35)' : 'rgba(40,70,30,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 5000; i++) {   // עלי דשא
        const x = rnd() * 256, y = rnd() * 256, l = 2 + rnd() * 4, v = rnd();
        g.strokeStyle = v < 0.33 ? 'rgba(130,170,70,.55)' : v < 0.66 ? 'rgba(60,100,40,.5)' : 'rgba(95,135,55,.5)';
        g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y - l); g.stroke();
      }
    } else if (kind === 'pave') {
      // מרצפות 60x60 ס"מ בגוונים שונים
      for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
        const v = 196 + Math.floor((rnd() - 0.5) * 26), t = Math.floor((rnd() - 0.5) * 8);
        g.fillStyle = `rgb(${v + t},${v},${v - 8 - t})`; g.fillRect(q * 64, r * 64, 64, 64);
        for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.fillRect(q * 64 + rnd() * 64, r * 64 + rnd() * 64, 2, 2); }
      }
      g.strokeStyle = 'rgba(80,75,65,.55)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    } else {
      // חצץ באספלט: נקודות בהירות וכהות
      for (let i = 0; i < 9000; i++) {
        const v = rnd();
        g.fillStyle = v < 0.5 ? `rgba(255,255,255,${0.04 + rnd() * 0.1})` : `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
        const sz = rnd() < 0.9 ? 1 : 2;
        g.fillRect(rnd() * 256, rnd() * 256, sz, sz);
      }
    }
    return (this.texCv[kind] = c);
  },
  texPattern(c, kind) {
    const pat = c.createPattern(this.texCanvas(kind), 'repeat');
    const size = { grass: 4, pave: 2.4, asph: 1.6 }[kind];
    pat.setTransform(new DOMMatrix().scale(size / 256));
    return pat;
  },

  // פרטים שנראים רק מקרוב: מרצפות במדרכה, עקבות צמיגים, טלאים, מכסי ביוב ומרקם של אספלט
  noisePattern(c) {
    if (!this.noiseCv) {
      const n = this.noiseCv = document.createElement('canvas'); n.width = n.height = 256;
      const g = n.getContext('2d'), img = g.createImageData(256, 256), rnd = seeded(4242);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 200 + rnd() * 55;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    return c.createPattern(this.noiseCv, 'repeat');
  },
  paintDetail(c, k, x0, y0, w, h) {
    const inView = e => {
      const xs = [e.a.x, e.b.x], ys = [e.a.y, e.b.y];
      return Math.max(...xs) > x0 - 20 && Math.min(...xs) < x0 + w / k + 20 && Math.max(...ys) > y0 - 20 && Math.min(...ys) < y0 + h / k + 20;
    };
    const vis = edges.filter(inView);
    // מרקם מרצפות במדרכות ומרקם חצץ על האספלט
    c.fillStyle = this.texPattern(c, 'pave');
    for (const e of vis) { rectAlong(c, e, e.t0, e.t1, e.sMax + 0.2, e.sMax + SIDEWALK); rectAlong(c, e, e.t0, e.t1, e.sMin - SIDEWALK, e.sMin - 0.2); }
    c.fillStyle = this.texPattern(c, 'asph');
    for (const e of vis) rectAlong(c, e, 0, e.len, e.sMin, e.sMax);
    for (const n of nodeList) {
      if (n.type === 'roundabout') { circle(c, n.x, n.y, RB_OUT); c.fill(); }
      else c.fillRect(n.x - n.hx, n.y - n.hy, 2 * n.hx, 2 * n.hy);
    }
    // עקבות צמיגים כהים במרכז כל נתיב
    c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 0.55;
    c.beginPath();
    for (const e of vis) for (const dir of [1, -1]) for (let i = 0; i < laneCount(e, dir); i++) {
      const sc = laneS(e, dir, i);
      for (const off of [-0.8, 0.8]) { const p = edgePoint(e, e.t0, sc + off), q = edgePoint(e, e.t1, sc + off); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
    }
    c.stroke();
    // טלאים וסדקים במקומות קבועים (לפי מספר הקטע)
    for (const e of vis) {
      const rnd = seeded([...e.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100000, 7) + 1);
      for (let t = e.t0 + 8; t < e.t1 - 8; t += 14 + rnd() * 30) {
        const s0 = e.sMin + rnd() * (e.sMax - e.sMin - 3);
        c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.04)';
        rectAlong(c, e, t, t + 2 + rnd() * 5, s0, s0 + 1 + rnd() * 2.5);
        if (rnd() < 0.4) {
          c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.05; c.beginPath();
          let p = edgePoint(e, t, s0); c.moveTo(p.x, p.y);
          for (let j = 1; j < 6; j++) { p = edgePoint(e, t + j * 0.6, s0 + (rnd() - 0.5) * 0.8); c.lineTo(p.x, p.y); }
          c.stroke();
        }
      }
      // מכסה ביוב
      for (let t = e.t0 + 20 + rnd() * 20; t < e.t1 - 10; t += 55 + rnd() * 30) {
        const p = edgePoint(e, t, laneS(e, 1, 0) * (rnd() < 0.5 ? 1 : -1) || 0);
        c.fillStyle = '#2a2c2f'; circle(c, p.x, p.y, 0.4); c.fill();
        c.strokeStyle = '#55585c'; c.lineWidth = 0.06; c.stroke();
      }
    }
    // מרקם עדין על הכל
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = this.noisePattern(c);
    c.fillRect(0, 0, w, h);
    c.restore();
  },

  updateNear(px, py) {
    if (this.nearAt && Math.hypot(px - this.nearAt.x, py - this.nearAt.y) < 38) return;
    const N = this.NEAR, S = this.nearCv.width;
    this.nearAt = { x: px, y: py };
    this.paintRoads(this.nearCv.getContext('2d'), px - N / 2, py - N / 2, S / N, S, S);
    this.nearTex.needsUpdate = true;
    this.nearMesh.position.x = px; this.nearMesh.position.z = py;
  },

  // סביבה להשתקפויות (צבע רכב מבריק, זכוכית): כיפת שמיים קטנה עם אדמה, מעובדת פעם אחת
  buildEnv() {
    const T = THREE;
    if (!this.pmrem) this.pmrem = new T.PMREMGenerator(this.renderer);
    const env = new T.Scene();
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#5f9fd8'); gr.addColorStop(0.45, '#d8ecf8'); gr.addColorStop(0.52, '#8e8a80'); gr.addColorStop(1, '#3a3c3e');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    env.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ map: tex, side: T.BackSide })));
    const sunBall = new T.Mesh(new T.SphereGeometry(4, 12, 8), new T.MeshBasicMaterial({ color: 0xfff4e0 }));
    sunBall.position.set(-20, 40, 15); env.add(sunBall);
    if (this.photoEnv) { this.scene.environment = this.photoEnv; return; }
    if (this.envTex) this.envTex.dispose();
    this.envTex = this.pmrem.fromScene(env, 0.02).texture;
    this.envTex.userData.cached = true;
    this.scene.environment = this.envTex;
    // השתקפויות מצילום 360° אמיתי (נטען ברקע, ובינתיים משתמשים בשמיים המצוירים)
    if (typeof ENV_JPG !== 'undefined' && !this.photoLoading) {
      this.photoLoading = true;
      const img = new Image();
      img.onload = () => {
        const tex = new T.Texture(img); tex.mapping = T.EquirectangularReflectionMapping; tex.colorSpace = T.SRGBColorSpace; tex.needsUpdate = true;
        this.photoEnv = this.pmrem.fromEquirectangular(tex).texture; this.photoEnv.userData.cached = true;
        tex.dispose();
        if (this.scene && this.weather !== 'night') this.scene.environment = this.photoEnv;
      };
      img.src = ENV_JPG;
    }
  },

  // שמיים: כיפה עם מעבר צבע מהאופק לכחול
  buildSky() {
    const T = THREE;
    // שמיים עם עננים לבנים (כיפה), ורכסי גבעות רחוקים באופק
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const g = c.getContext('2d'), rnd = seeded(2024);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5f9fd8'); gr.addColorStop(0.55, '#9cc8ea'); gr.addColorStop(0.8, '#d9ecf7'); gr.addColorStop(1, '#eef6fb');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * 1024, cy = 60 + rnd() * 120, sz = 10 + rnd() * 22;
      for (let k = 0; k < 9; k++) {
        const x = cx + (rnd() - 0.5) * sz * 5, y = cy + (rnd() - 0.5) * sz * 0.8, r = sz * (0.6 + rnd() * 0.7);
        const cg = g.createRadialGradient(x, y, 0, x, y, r);
        cg.addColorStop(0, 'rgba(255,255,255,0.75)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cg; g.fillRect(x - r, y - r, r * 2, r * 2);
        for (const dx of [-1024, 1024]) if (x + dx > -r && x + dx < 1024 + r) g.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const sky = new T.Mesh(new T.SphereGeometry(800, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ map: tex, side: T.BackSide, fog: false, depthWrite: false }));
    sky.position.set((WORLD.minX + WORLD.maxX) / 2, -5, (WORLD.minY + WORLD.maxY) / 2);
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
    // שמיים מצילום אמיתי של עננים (נטען ברקע)
    if (typeof SKY_JPG !== 'undefined') {
      const apply = t => { sky.material.map = t; sky.material.needsUpdate = true; };
      if (this.skyPhoto) apply(this.skyPhoto);
      else {
        const img = new Image();
        img.onload = () => { const t = new T.Texture(img); t.colorSpace = T.SRGBColorSpace; t.needsUpdate = true; t.userData.cached = true; this.skyPhoto = t; if (this.sky) { this.sky.material.map = t; this.sky.material.needsUpdate = true; } };
        img.src = SKY_JPG;
      }
    }
    const hc = document.createElement('canvas'); hc.width = 2048; hc.height = 64;
    const hg = hc.getContext('2d');
    for (const [col, base, amp, f] of [['#9fb3a6', 30, 18, 3], ['#8aa38c', 42, 14, 5]]) {
      hg.fillStyle = col; hg.beginPath(); hg.moveTo(0, 64);
      for (let x = 0; x <= 2048; x += 16) hg.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x / 2048 * Math.PI * 2 * f + base)) - 6 * Math.sin(x / 90 + f));
      hg.lineTo(2048, 64); hg.fill();
    }
    const htex = new T.CanvasTexture(hc); htex.colorSpace = T.SRGBColorSpace; htex.wrapS = T.RepeatWrapping;
    const hills = new T.Mesh(new T.CylinderGeometry(700, 700, 60, 48, 1, true), new T.MeshBasicMaterial({ map: htex, transparent: true, side: T.BackSide, fog: false, depthWrite: false }));
    hills.position.y = 22; hills.renderOrder = -1;
    sky.add(hills);
  },

  // אבני שפה מוגבהות בין הכביש למדרכה
  buildCurbs() {
    const T = THREE, list = [];
    // אבני שפה צבועות בקטעים של 0.9 מ' (אדום-לבן / כחול-לבן) או אפורות
    const white = new T.Color(0xf2f0ea), grey = new T.Color(0xd8d4cc), cols = { red: new T.Color(CURB_COL.red), blue: new T.Color(CURB_COL.blue) };
    for (const e of edges) for (const key of ['f', 'b']) {
      const s = key === 'f' ? e.sMax + 0.1 : e.sMin - 0.1;
      const segs = curbSegments(e, key);
      const colorAt = t => { const sg = segs.find(q => t >= q.t0 && t < q.t1); return sg ? (Math.floor((t - sg.t0) / 0.9) % 2 ? white : cols[sg.col]) : grey; };
      for (let t = e.t0; t < e.t1 - 0.05; t += 0.9) {
        const len = Math.min(0.9, e.t1 - t);
        const mid = edgePoint(e, t + len / 2, s);
        list.push({ x: mid.x, y: mid.y, len, ang: Math.atan2(e.d.y, e.d.x), c: colorAt(t + 0.01) });
      }
    }
    const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 0.16, 0.22), this.mat(0xffffff), list.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
    list.forEach((c, i) => { q.setFromAxisAngle(up, -c.ang); m.compose(new T.Vector3(c.x, 0.08, c.y), q, new T.Vector3(c.len - 0.02, 1, 1)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.c); });
    mesh.receiveShadow = true;
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
    wm.receiveShadow = true;
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
    this.lampHeadMat = this.mat(0x4a5056);
    const head = new T.InstancedMesh(new T.BoxGeometry(1.4, 0.18, 0.4), this.lampHeadMat, list.length);
    const m = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0);
    list.forEach((l, i) => {
      m.compose(new T.Vector3(l.x, 3.5, l.y), q, one); pole.setMatrixAt(i, m);
      const hq = new T.Quaternion().setFromAxisAngle(up, -Math.atan2(l.inY, l.inX));
      m.compose(new T.Vector3(l.x + l.inX * 0.6, 7, l.y + l.inY * 0.6), hq, one); head.setMatrixAt(i, m);
    });
    this.scene.add(pole, head);
  },

  // בניינים בסגנון ישראלי: אבן ירושלמית או טיח, תריסים, מרפסות, חנויות עם סוככים ושלטים,
  // ודודי שמש וקולטים על הגג
  // מפת חספוס לחזית: הזכוכית חלקה ומשקפת, הקיר מחוספס (באותם מקומות כמו החלונות בטקסטורה)
  glassRough() {
    if (this.texCache.glassRough) return this.texCache.glassRough;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#1a1a1a';
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) g.fillRect(28 + q * 128, 30 + r * 128, 72, 74);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.userData.cached = true;
    return (this.texCache.glassRough = tex);
  },
  facadeTex(style) {
    const key = 'facade:' + style;
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), rnd = seeded(style.length * 97 + 3);
    const base = { stone: '#dccaa2', stone2: '#e6d9bc', plaster: '#ece8df', shikun: '#cfc9bb' }[style];
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    if (style.startsWith('stone')) {
      // אבנים בגדלים שונים עם גוונים
      for (let y = 0; y < 256; y += 16) for (let x = -(y / 16 % 2) * 20; x < 256; x += 40) {
        const v = (rnd() - 0.5) * 26;
        g.fillStyle = `rgb(${220 + v},${202 + v},${162 + v * 0.8})`;
        if (style === 'stone2') g.fillStyle = `rgb(${232 + v},${218 + v},${188 + v * 0.8})`;
        g.fillRect(x + 1, y + 1, 38, 14);
      }
    } else {
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.04})`; g.fillRect(rnd() * 256, rnd() * 256, 3, 3); }
    }
    // שתי קומות × שני חלונות; לכל חלון תריס שמוגף בחלקו
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) {
      const x = 28 + q * 128, y = 30 + r * 128, w = 72, h = 74;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 3, y - 3, w + 6, h + 8);
      g.fillStyle = '#5d7385'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 4, y + 4, w / 2 - 6, h - 8);
      const sh = h * (0.15 + rnd() * 0.75);
      g.fillStyle = style === 'shikun' ? '#9aa39c' : '#e9e6df'; g.fillRect(x, y, w, sh);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < sh; k += 5) g.fillRect(x, y + k, w, 1);
      g.fillStyle = style.startsWith('stone') ? '#c9b48a' : '#d8d3c8'; g.fillRect(x - 5, y + h + 2, w + 10, 6);   // אדן
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso; tex.userData.cached = true;
    return (this.texCache[key] = tex);
  },
  // חלונות מוארים בלילה (באותם מקומות כמו בטקסטורת החזית)
  litTex(style) {
    const key = 'lit:' + style;
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), rnd = seeded(style.length * 13 + 5);
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) {
      if (rnd() < 0.45) continue;
      g.fillStyle = rnd() < 0.75 ? '#ffd27a' : '#a9c4e6';
      g.fillRect(28 + q * 128, 30 + r * 128 + 74 * 0.4, 72, 74 * 0.6);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.userData.cached = true;
    return (this.texCache[key] = tex);
  },
  shopSignTex(text, bg, fg) {
    const key = 'shop:' + text;
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 48);
    g.fillStyle = fg; g.font = 'bold 32px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillText(text, 128, 26);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso; tex.userData.cached = true;
    return (this.texCache[key] = tex);
  },
  buildBuildings() {
    const T = THREE, rnd = seeded(77);
    const styles = ['stone', 'stone', 'stone2', 'plaster', 'shikun'];
    const wallMat = {};
    for (const st of styles) wallMat[st] = wallMat[st] || new T.MeshStandardMaterial({ map: this.facadeTex(st), emissiveMap: this.litTex(st), emissive: 0x000000, roughness: 1, roughnessMap: this.glassRough(), metalness: 0.05 });
    this.wallMats = Object.values(wallMat);
    const roofMat = this.mat(0xb9b6ae), slabMat = this.mat(0xe9e5dc), railMat = this.mat(0xf4f4f2);
    const trimMat = this.mat(0xd9d2c1), plinthMat = this.mat(0x8f8676), doorMat = new T.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.5, metalness: 0.2 });
    const glassMat = this.mat(0x2a3a46), heaterMat = this.mat(0xf2f2f2), panelMat = this.mat(0x1f3d66), acMat = this.mat(0xe7e7e7);
    const SHOPS = [['מכולת', '#1b5e20', '#fff'], ['פלאפל', '#f9a825', '#3e2723'], ['מספרה', '#283593', '#fff'], ['פיצה', '#c62828', '#fff'], ['קפה', '#4e342e', '#ffe0b2'],
      ['בית מרקחת', '#00695c', '#fff'], ['סופר', '#e65100', '#fff'], ['שווארמה', '#6a1b9a', '#fff'], ['פרחים', '#ad1457', '#fff'], ['חומרי בניין', '#37474f', '#ffeb3b'],
      ['מאפייה', '#795548', '#fff'], ['סלולר', '#0d47a1', '#fff'], ['ירקות ופירות', '#2e7d32', '#fff'], ['קיוסק', '#f57f17', '#000']];
    const awnCols = [0xc62828, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6d4c41].map(c => this.mat(c));
    const signMats = SHOPS.map(([t, bg, fg]) => new T.MeshBasicMaterial({ map: this.shopSignTex(t, bg, fg) }));
    const box = (w, h, d) => new T.BoxGeometry(w, h, d);
    const cyl = new T.CylinderGeometry(0.32, 0.32, 1.5, 10);
    const chunks = new Map();
    for (const b of scenery.buildings) {
      const floors = 2 + Math.floor(rnd() * 5), hgt = floors * 3 + 0.4;
      const st = styles[Math.floor(rnd() * styles.length)];
      const grp = new T.Group();
      const geo = box(b.w, hgt, b.h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        const sx = face < 2 ? b.h : b.w;
        uv.setXY(i, uv.getX(i) * sx / 8, uv.getY(i) * hgt / 6);
      }
      const walls = new T.Mesh(geo, wallMat[st]); walls.position.y = hgt / 2; grp.add(walls);
      const roof = new T.Mesh(box(b.w + 0.3, 0.35, b.h + 0.3), roofMat); roof.position.y = hgt + 0.1; grp.add(roof);
      const f = b.f || 1, fz = f * (b.h / 2);
      // מעקה סביב הגג, בסיס אבן כהה וכרכובים דקים בין הקומות (נותנים לחזית עומק)
      for (const [w, d, x, z] of [[b.w + 0.3, 0.18, 0, b.h / 2 + 0.06], [b.w + 0.3, 0.18, 0, -b.h / 2 - 0.06], [0.18, b.h + 0.3, b.w / 2 + 0.06, 0], [0.18, b.h + 0.3, -b.w / 2 - 0.06, 0]]) {
        const pr = new T.Mesh(box(w, 0.9, d), trimMat); pr.position.set(x, hgt + 0.55, z); grp.add(pr);
      }
      const plinth = new T.Mesh(box(b.w + 0.12, 0.7, b.h + 0.12), plinthMat); plinth.position.y = 0.35; grp.add(plinth);
      for (let fl = 1; fl < floors; fl++) { const cb = new T.Mesh(box(b.w + 0.1, 0.12, 0.14), trimMat); cb.position.set(0, fl * 3 - 0.05, fz + f * 0.05); grp.add(cb); }
      // חנויות בקומת הקרקע בצד הרחוב
      const shop = rnd() < 0.7;
      if (!shop) {
        // כניסה לבניין: דלת, גגון ומנורה
        const door = new T.Mesh(box(1.4, 2.3, 0.08), doorMat); door.position.set(0, 1.15, fz + f * 0.03); grp.add(door);
        const canopy = new T.Mesh(box(2.2, 0.1, 1.1), trimMat); canopy.position.set(0, 2.6, fz + f * 0.55); grp.add(canopy);
        const num = new T.Mesh(box(0.3, 0.22, 0.04), this.mat(0x1d4f91)); num.position.set(1.0, 2.0, fz + f * 0.04); grp.add(num);
      }
      if (shop) {
        const front = new T.Mesh(box(b.w - 1.2, 2.6, 0.12), glassMat); front.position.set(0, 1.35, fz + f * 0.04); grp.add(front);
        const awn = new T.Mesh(box(b.w - 0.6, 0.12, 1.6), awnCols[Math.floor(rnd() * awnCols.length)]);
        awn.position.set(0, 3.05, fz + f * 0.8); awn.rotation.x = f * 0.22; grp.add(awn);
        const sw = Math.min(b.w - 2, 7);
        const sign = new T.Mesh(new T.PlaneGeometry(sw, sw * 48 / 256), signMats[Math.floor(rnd() * signMats.length)]);
        sign.position.set(0, 3.75, fz + f * 0.08); if (f < 0) sign.rotation.y = Math.PI; grp.add(sign);
      }
      // מרפסות בחזית
      const cols = Math.max(1, Math.floor(b.w / 8));
      if (rnd() < 0.8) for (let fl = 1; fl < floors; fl++) for (let q = 0; q < cols; q++) {
        if (rnd() < 0.25) continue;
        const x = -b.w / 2 + (q + 0.5) * (b.w / cols);
        const slab = new T.Mesh(box(3.2, 0.18, 1.3), slabMat); slab.position.set(x, fl * 3 + 0.1, fz + f * 0.65); grp.add(slab);
        const rail = new T.Mesh(box(3.2, 1.0, 0.06), railMat); rail.position.set(x, fl * 3 + 0.65, fz + f * 1.28); grp.add(rail);
      }
      // מזגנים על הקירות
      for (let k = 0; k < floors; k++) if (rnd() < 0.45) {
        const ac = new T.Mesh(box(0.8, 0.55, 0.3), acMat);
        ac.position.set((rnd() - 0.5) * (b.w - 2), k * 3 + 1.6, -f * (b.h / 2 + 0.15)); grp.add(ac);
      }
      // דודי שמש וקולטים על הגג
      const nh = 1 + Math.floor(rnd() * Math.min(6, b.w / 4));
      for (let k = 0; k < nh; k++) {
        const hx = -b.w / 2 + 2 + k * ((b.w - 4) / Math.max(1, nh - 1 || 1)), hz = -f * (b.h / 2 - 3);
        const tank = new T.Mesh(cyl, heaterMat); tank.rotation.x = Math.PI / 2; tank.position.set(hx, hgt + 1.25, hz - f * 0.6); grp.add(tank);
        const panel = new T.Mesh(box(1.0, 0.06, 1.9), panelMat); panel.position.set(hx, hgt + 0.85, hz + f * 0.7); panel.rotation.x = f * 0.6; grp.add(panel);
      }
      grp.position.set(b.x + b.w / 2, 0, b.y + b.h / 2);
      const ck = Math.floor(b.x / 180) + ':' + Math.floor(b.y / 180);
      if (!chunks.has(ck)) chunks.set(ck, new T.Group());
      chunks.get(ck).add(grp);
    }
    // איחוד לפי אזורים: מעט קריאות ציור, ועדיין מסתירים אזורים שלא בתמונה
    for (const g of chunks.values()) {
      this.scene.add(g);
      for (const m of Models.merge(g)) m.receiveShadow = true;
    }
  },

  // שלטי שם רחוב כחולים בפינות, מקבילים לרחוב (כמו בערים בישראל)
  streetSignTex(name) {
    const key = 'street:' + name;
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 72;
    const g = c.getContext('2d');
    g.fillStyle = '#1d4f91'; g.fillRect(0, 0, 256, 72);
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(6, 6, 244, 60);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    let size = 34; g.font = `bold ${size}px Arial`;
    while (g.measureText(name).width > 226 && size > 14) { size -= 2; g.font = `bold ${size}px Arial`; }
    g.fillText(name, 128, 38);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso; tex.userData.cached = true;
    return (this.texCache[key] = tex);
  },
  buildStreetSigns() {
    const T = THREE, all = new T.Group(), mats = {};
    const pole = new T.CylinderGeometry(0.04, 0.04, 2.9, 6), poleMat = this.mat(0x8f969c);
    const plate = new T.PlaneGeometry(1.2, 0.34);
    for (const e of edges) {
      if (!e.name || e.t1 - e.t0 < 20) continue;
      const name = e.name.replace(/\s*\(.*?\)\s*/g, '').trim();
      const mat = mats[name] || (mats[name] = new T.MeshBasicMaterial({ map: this.streetSignTex(name) }));
      for (const [t, sd] of [[e.t0 + 2.5, e.sMax + SIDEWALK - 0.5], [e.t1 - 2.5, e.sMin - SIDEWALK + 0.5]]) {
        const p = edgePoint(e, t, sd);
        const pl = new T.Mesh(pole, poleMat); pl.position.set(p.x, 1.45, p.y); all.add(pl);
        for (const side of [1, -1]) {
          const m = new T.Mesh(plate, mat);
          m.position.set(p.x + e.n.x * side * 0.03, 2.75, p.y + e.n.y * side * 0.03);
          m.rotation.y = Math.atan2(side * e.n.x, side * e.n.y);
          all.add(m);
        }
      }
    }
    this.scene.add(all);
    Models.merge(all);
  },

  // תחנות אוטובוס עם סככה, ספסל ושלט, בצד שאין בו חניה
  buildBusStops() {
    const T = THREE, all = new T.Group(), rnd = seeded(808);
    const roofMat = this.mat(0x5d6d7e), glassMat = new T.MeshLambertMaterial({ color: 0xbcd6e6, transparent: true, opacity: 0.45 });
    const benchMat = this.mat(0x8d6e4f), poleMat = this.mat(0x9aa0a6);
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#1565c0'; g.fillRect(0, 0, 64, 22);
    g.fillStyle = '#fff'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillText('תחנה', 32, 16);
    g.fillStyle = '#1565c0'; g.font = 'bold 26px Arial'; g.fillText('🚌', 32, 52);
    const signTex = new T.CanvasTexture(c); signTex.colorSpace = T.SRGBColorSpace;
    const signMat = new T.MeshBasicMaterial({ map: signTex });
    let n = 0;
    for (const e of edges) {
      const len = e.t1 - e.t0;
      if (len < 110 || e.school || n > 14 || rnd() < 0.35) continue;
      for (const side of [1, -1]) {
        if (side > 0 ? e.pf : e.pb) continue;
        if (side < 0 && laneCount(e, -1) === 0) continue;
        const t = side > 0 ? e.t0 + len * 0.62 : e.t1 - len * 0.62;
        if (e.crosswalks.some(cw => Math.abs(cw.t - t) < 20)) continue;
        const s = side > 0 ? e.sMax + SIDEWALK - 0.9 : e.sMin - SIDEWALK + 0.9;
        const p = edgePoint(e, t, s);
        const grp = new T.Group();
        const roof = new T.Mesh(new T.BoxGeometry(4.2, 0.1, 1.6), roofMat); roof.position.y = 2.5; grp.add(roof);
        const back = new T.Mesh(new T.BoxGeometry(4.0, 1.9, 0.05), glassMat); back.position.set(0, 1.4, 0.7); grp.add(back);
        for (const x of [-2, 2]) { const pl = new T.Mesh(new T.BoxGeometry(0.08, 2.5, 0.08), poleMat); pl.position.set(x, 1.25, 0.7); grp.add(pl); }
        const bench = new T.Mesh(new T.BoxGeometry(2.6, 0.08, 0.45), benchMat); bench.position.set(0, 0.5, 0.4); grp.add(bench);
        const sp = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.8, 6), poleMat); sp.position.set(2.8, 1.4, -0.5); grp.add(sp);
        const sg = new T.Mesh(new T.BoxGeometry(0.04, 0.6, 0.6), signMat); sg.position.set(2.8, 2.6, -0.5); grp.add(sg);
        grp.position.set(p.x, 0.1, p.y);
        // הגב של הסככה לכיוון הבתים
        const ox = e.n.x * side, oy = e.n.y * side;
        grp.rotation.y = Math.atan2(ox, oy);
        all.add(grp); n++;
        // מחכים בתחנה
        for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
          const h = Models.human();
          h.group.position.set(p.x + e.d.x * (rnd() - 0.5) * 3 - ox * 0.1, 0.1, p.y + e.d.y * (rnd() - 0.5) * 3 - oy * 0.1);
          h.group.rotation.y = -Math.atan2(-oy, -ox);
          this.scene.add(h.group);
        }
      }
    }
    this.scene.add(all);
    Models.merge(all);
  },

  // עצי דקל: באי של כל כיכר ובחלק מהעצים שבין הבתים
  buildPalms() {
    const rnd = seeded(5150);
    let n = 0;
    for (const id in nodes) {
      const nd = nodes[id];
      if (nd.type !== 'roundabout') continue;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2 + rnd(), r = i ? RB_IN * 0.45 : 0;
        const p = Models.palm(); p.position.set(nd.x + Math.cos(a) * r, 0, nd.y + Math.sin(a) * r); this.scene.add(p); n++;
      }
    }
    for (const t of scenery.palms || []) { if (n++ > 60) break; const p = Models.palm(); p.position.set(t.x, 0, t.y); this.scene.add(p); }
  },

  // ===== מזג אוויר ושעה: יום, גשם, לילה =====
  weather: (() => { try { return localStorage.getItem('driving-practice.weather') || 'day'; } catch (e) { return 'day'; } })(),
  setWeather(w) {
    this.weather = w;
    try { localStorage.setItem('driving-practice.weather', w); } catch (e) { /* לא חובה */ }
    this.applyWeather();
  },
  applyWeather() {
    if (!this.ok || !this.scene) return;
    const T = THREE, w = this.weather, sc = this.scene;
    const P = {
      day: { bg: 0xa9cfe8, fog: [160, 620], hemi: 0.5, sun: 2.4, sky: 0xffffff, road: 0xffffff },
      rain: { bg: 0x8e979f, fog: [40, 260], hemi: 0.55, sun: 0.35, sky: 0x8a939b, road: 0xb4b8bd },
      night: { bg: 0x0a1020, fog: [30, 300], hemi: 0.12, sun: 0.06, sky: 0x10182c, road: 0xffffff },
    }[w] || {};
    sc.background = new T.Color(P.bg);
    sc.fog.color.setHex(P.bg); sc.fog.near = P.fog[0]; sc.fog.far = P.fog[1];
    this.hemi.intensity = P.hemi; this.sun.intensity = P.sun;
    this.sky.material.color.setHex(P.sky);
    for (const c of this.sky.children) c.material.color.setHex(P.sky);
    for (const m of [this.nearMesh.material]) m.color.setHex(P.road);
    const night = w === 'night';
    // בלילה אין השתקפות של שמיים מוארים
    sc.environment = night ? null : (this.photoEnv || this.envTex);
    for (const m of this.wallMats || []) m.emissive.setHex(night ? 0xa8a8a8 : 0x000000);
    if (this.lampHeadMat) this.lampHeadMat.emissive.setHex(night ? 0xffe6a8 : 0x000000);
    // פנסים של הרכב שלנו
    if (!this.headlight) {
      const hl = this.headlight = new T.SpotLight(0xfff3d6, 0, 120, 0.5, 0.45, 1.3);
      this.scene.add(hl, hl.target);
    }
    this.headlight.intensity = night ? 400 : w === 'rain' ? 60 : 0;
    // טיפות גשם סביב המצלמה
    if (w === 'rain' && !this.rain) {
      const N = 2500, pos = new Float32Array(N * 6);
      this.rainDrops = Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * 70, y: Math.random() * 22, z: (Math.random() - 0.5) * 70, v: 16 + Math.random() * 6 }));
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      this.rain = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.55 }));
      this.rain.frustumCulled = false;
      sc.add(this.rain);
    }
    if (this.rain) this.rain.visible = w === 'rain';
  },
  updateRain(dt, cx, cz) {
    if (!this.rain || !this.rain.visible) return;
    const a = this.rain.geometry.attributes.position.array;
    this.rainDrops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) { d.y = 20 + Math.random() * 2; d.x = (Math.random() - 0.5) * 70; d.z = (Math.random() - 0.5) * 70; }
      const x = cx + d.x, z = cz + d.z, o = i * 6;
      a[o] = x; a[o + 1] = d.y; a[o + 2] = z; a[o + 3] = x + 0.04; a[o + 4] = d.y + 0.55; a[o + 5] = z;
    });
    this.rain.geometry.attributes.position.needsUpdate = true;
  },

  // איכות גרפיקה: גבוהה = צללים וחלקות; רגילה = מהירה יותר במחשבים חלשים
  quality: (() => { try { return localStorage.getItem('driving-practice.quality') || 'high'; } catch (e) { return 'high'; } })(),
  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('driving-practice.quality', q); } catch (e) { /* לא חובה */ }
    this.applyQuality();
  },
  applyQuality() {
    if (!this.ok || !this.scene) return;
    const hi = this.quality === 'high';
    this.renderer.shadowMap.enabled = hi;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = hi;
    this.renderer.setPixelRatio(hi ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
    if (this.w) this.renderer.setSize(this.w, this.h, false);
    for (const w of this.walkers || []) w.m.group.visible = hi;
    this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  },

  buildTrees() {
    const T = THREE, rndp = seeded(31);
    scenery.palms = [];
    const list = [];
    for (const t of scenery.trees) (rndp() < 0.25 ? scenery.palms : list).push(t);
    if (!list.length) return;
    // עלווה: כדור עם בליטות לא סדירות (אותה הזזה לכל נקודה באותו מקום, כדי שלא ייפתחו חורים)
    const leafGeo = new T.IcosahedronGeometry(1, 2), pos = leafGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + 0.18 * Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 - x * 2.1) + 0.1 * Math.sin(y * 9.3 + z * 7.7);
      pos.setXYZ(i, x * n, y * n * 0.85, z * n);
    }
    Models.smoothNormals(leafGeo, 1.2);
    const CL = 4;   // גושים לכל עץ
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.14, 0.26, 3.2, 8), this.mat(0x5e4630), list.length);
    const crown = new T.InstancedMesh(leafGeo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), list.length * CL);
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), col = new T.Color(), rnd = seeded(404);
    const greens = [0x3f6f2a, 0x4a7d31, 0x56893a, 0x355f24, 0x5f8f3f];
    let k = 0;
    list.forEach((t, i) => {
      m.compose(new T.Vector3(t.x, 1.6, t.y), q, sc.set(1, 1, 1)); trunk.setMatrixAt(i, m);
      const base = greens[Math.floor(rnd() * greens.length)];
      for (let j = 0; j < CL; j++) {
        const a = rnd() * Math.PI * 2, d = j ? t.r * (0.35 + rnd() * 0.3) : 0, r = t.r * (j ? 0.55 + rnd() * 0.25 : 0.8);
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * 6);
        m.compose(new T.Vector3(t.x + Math.cos(a) * d, 2.9 + t.r * 0.55 + (j ? (rnd() - 0.3) * t.r * 0.6 : 0), t.y + Math.sin(a) * d), q, sc.set(r, r, r));
        crown.setMatrixAt(k, m);
        col.setHex(base).offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.08); crown.setColorAt(k, col);
        k++;
      }
    });
    q.identity();
    trunk.castShadow = crown.castShadow = true;
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
    const all = new T.Group(), faceMats = {};
    for (const s of signs) {
      const v = s.edge ? dirVec(s.edge, s.dir || 1) : { x: 1, y: 0 };
      const face = Math.atan2(-v.x, -v.y);
      if (s.kind === 'light') { this.buildLight(s, face); continue; }
      const pole = new T.Mesh(poleGeo, poleMat);
      pole.position.set(s.x, 1.35, s.y);
      const fk = s.kind + ':' + s.val;
      const front = new T.Mesh(plateGeo, faceMats[fk] || (faceMats[fk] = new T.MeshBasicMaterial({ map: this.signTexture(s.kind, s.val), transparent: true, alphaTest: 0.2, fog: true })));
      front.position.set(s.x, 2.35, s.y); front.rotation.y = face;
      front.translateZ(0.06);
      const back = new T.Mesh(plateGeo, backMat);
      back.position.set(s.x, 2.35, s.y); back.rotation.y = face + Math.PI;
      back.translateZ(-0.04);
      all.add(pole, front, back);
    }
    this.scene.add(all);
    Models.merge(all);
  },

  // רמזור: עמוד בצד הדרך ועוד ראש רמזור על זרוע מעל הנתיבים, עם הילה זוהרת לאור הדולק
  buildLight(s, face) {
    const T = THREE;
    const g = new T.Group();
    const poleMat = this.mat(0x3a3f44), boxMat = this.mat(0x1d1f22);
    if (!this.haloTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this.haloTex = new T.CanvasTexture(c); this.haloTex.userData.cached = true;
    }
    const pole = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 5.6, 8), poleMat);
    pole.position.y = 2.8; g.add(pole);
    // הזרוע מעל הכביש (לכיוון מרכז הכביש = x שלילי)
    const loc = s.edge ? edgeLocal(s.edge, s) : { s: 6 };
    const arm = Math.max(2.5, Math.min(7, Math.abs(loc.s) - 1.5));
    const beam = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, arm, 6), poleMat);
    beam.rotation.z = Math.PI / 2; beam.position.set(-arm / 2, 5.5, 0); g.add(beam);
    const head = (x, y, scale) => {
      const box = new T.Mesh(new T.BoxGeometry(0.55 * scale, 1.5 * scale, 0.35), boxMat);
      box.position.set(x, y, 0); g.add(box);
      const visor = new T.Mesh(new T.BoxGeometry(0.75 * scale, 1.7 * scale, 0.04), boxMat);
      visor.position.set(x, y, -0.18); g.add(visor);
      return ['#ff3b30', '#ffcc00', '#34c759'].map((c, i) => {
        const on = new T.MeshBasicMaterial({ color: c });
        const off = this.mat(0x2b2b2b);
        const l = new T.Mesh(new T.CircleGeometry(0.18 * scale, 18), off);
        l.position.set(x, y + (0.46 - i * 0.46) * scale, 0.18);
        g.add(l);
        const halo = new T.Sprite(new T.SpriteMaterial({ map: this.haloTex, color: c, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        halo.scale.setScalar(1.3 * scale); halo.position.set(x, l.position.y, 0.25); halo.visible = false; g.add(halo);
        return { mesh: l, on, off, halo };
      });
    };
    const lamps1 = head(0, 3.4, 1), lamps2 = head(-arm + 0.2, 4.8, 1.15);
    g.position.set(s.x, 0, s.y);
    g.rotation.y = face;
    this.scene.add(g);
    this.lights.push({ node: s.node, edge: s.edge, lamps: lamps1 }, { node: s.node, edge: s.edge, lamps: lamps2 });
  },

  makeCar(color, isPlayer, type) {
    const car = Models.car(color, type || (isPlayer ? 'hatch' : Models.randomCarType()), isPlayer);
    if (isPlayer) {
      // שלט "ל" על הגג של רכב לימוד
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#c62828'; g.lineWidth = 5; g.strokeRect(3, 3, 58, 58);
      g.fillStyle = '#c62828'; g.font = 'bold 50px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ל', 32, 35);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.5), [new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ map: tex }), this.mat(0xffffff), this.mat(0xffffff), this.mat(0xffffff), this.mat(0xffffff)]);
      const top = Models.CAR_TYPES.hatch.cab[1][1];
      sign.position.set(-0.6, top + 0.24, 0);
      car.cabin.add(sign);
      // שלט "לימוד נהיגה" על שתי הדלתות
      const dc = document.createElement('canvas'); dc.width = 256; dc.height = 64;
      const dg = dc.getContext('2d');
      dg.fillStyle = '#ffffff'; dg.fillRect(0, 0, 256, 64); dg.strokeStyle = '#c62828'; dg.lineWidth = 6; dg.strokeRect(3, 3, 250, 58);
      dg.fillStyle = '#c62828'; dg.font = 'bold 34px Arial'; dg.textAlign = 'center'; dg.textBaseline = 'middle'; dg.direction = 'rtl'; dg.fillText('לימוד נהיגה', 128, 34);
      const dtex = new THREE.CanvasTexture(dc); dtex.colorSpace = THREE.SRGBColorSpace;
      const P = Models.CAR_TYPES.hatch;
      for (const z of [1, -1]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshStandardMaterial({ map: dtex, roughness: 0.4 }));
        d.position.set(0.1, 0.62, z * (P.W / 2 + 0.012)); d.rotation.y = z > 0 ? 0 : Math.PI;
        car.group.add(d);
      }
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

  // רכבים חונים לא זזים: מאחדים את כולם לכמה רשתות בודדות
  buildParked() {
    const all = new THREE.Group();
    for (const c of parkedCars()) {
      const car = this.makeCar(new THREE.Color(c.color), false);
      for (const side of ['1', '-1']) for (const b of car.blink[side]) b.parent.remove(b);
      this.syncCar(car, c, {});
      all.add(car.group);
    }
    this.scene.add(all);
    Models.merge(all);
  },

  syncPeds() {
    const seen = new Set();
    for (const cw of crosswalks) for (const pd of cw.peds) {
      seen.add(pd);
      let m = this.pedMeshes.get(pd);
      if (!m) {
        m = Models.human({ shirt: new THREE.Color(pd.color).getHex() });
        this.scene.add(m.group); this.pedMeshes.set(pd, m);
      }
      m.group.position.set(pd.x, 0.1, pd.y);
      // פונה לכיוון החצייה
      const n = cw.edge.n;
      m.group.rotation.y = -Math.atan2(-pd.side * n.y, -pd.side * n.x);
      Models.walk(m, pd.phase || 0, pd.state === 'cross');
    }
    for (const [pd, m] of this.pedMeshes) if (!seen.has(pd)) { this.scene.remove(m.group); this.pedMeshes.delete(pd); }
  },

  // הולכי רגל על המדרכות (רק לנוף, לא חוצים את הכביש)
  buildWalkers() {
    this.walkers = [];
    const rnd = seeded(913);
    for (const e of edges) {
      const len = e.t1 - e.t0;
      if (len < 25) continue;
      const n = Math.min(4, Math.floor(len / 45) + (rnd() < 0.5 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const side = rnd() < 0.5 ? 1 : -1;
        const w = Models.human();
        const wk = { e, side, s: side > 0 ? e.sMax + 0.9 + rnd() * 1.2 : e.sMin - 0.9 - rnd() * 1.2,
          t: e.t0 + 6 + rnd() * (len - 12), dir: rnd() < 0.5 ? 1 : -1, speed: 0.9 + rnd() * 0.6, phase: rnd() * 6, m: w,
          pause: 0 };
        this.scene.add(w.group);
        this.walkers.push(wk);
      }
    }
  },
  updateWalkers(dt) {
    if (!this.walkers || this.quality !== 'high') return;
    const cx = this.camera.position.x, cz = this.camera.position.z;
    for (const w of this.walkers) {
      const e = w.e;
      // הולכי רגל רחוקים לא מצוירים (חוסך הרבה עבודה למחשב)
      const far = (w.m.group.position.x - cx) ** 2 + (w.m.group.position.z - cz) ** 2 > 110 * 110;
      w.m.group.visible = !far;
      if (w.pause > 0) { w.pause -= dt; Models.walk(w.m, 0, false); }
      else {
        w.t += w.dir * w.speed * dt; w.phase += dt * w.speed * 6;
        if (w.t > e.t1 - 5 || w.t < e.t0 + 5) { w.dir = -w.dir; w.pause = 1 + Math.random() * 3; }
        else if (Math.random() < dt * 0.02) w.pause = 2 + Math.random() * 4;   // עוצר לרגע (מסתכל בחלון ראווה...)
        Models.walk(w.m, w.phase, true);
      }
      const p = edgePoint(e, w.t, w.s);
      w.m.group.position.set(p.x, 0.1, p.y);
      w.m.group.rotation.y = -Math.atan2(e.d.y * w.dir, e.d.x * w.dir);
    }
  },

  syncNPCs(list, blinkOn) {
    const seen = new Set();
    for (const n of list) {
      seen.add(n);
      let car = this.npcMeshes.get(n);
      if (!car) { car = n.rider ? Models.rider(n.rider, new THREE.Color(n.color).getHex()) : n.siren ? Models.emergency(n.siren) : n.type === 'bus' ? Models.bus(new THREE.Color(n.color)) : this.makeCar(new THREE.Color(n.color), false, n.type); this.scene.add(car.group); this.npcMeshes.set(n, car); }
      if (car.person) Models.walk(car.person, n.phase, n.rider === 'bike' && n.v > 0.5);
      if (car.bar) { const ph = (performance.now() / 250 | 0) % 2; car.bar.forEach((L, i) => { L.m.material = (i === ph) ? L.on : L.off; }); }
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
    this.updateWalkers(dt);
    this.syncCar(this.player, p, { braking: p.braking || (p.v === 0 && !(p.gear === 'R' ? input.down : input.up)), blinker: p.blinker, blinkOn });
    const driver = mode === 'driver';
    // תא הנהג: הגה שמסתובב ושעונים חיים
    if (driver && this.player.dash.userData.wheel) {
      const ud = this.player.dash.userData;
      ud.wheel.rotation.x = -(p.steer || 0) * 7;
      if (!this.gaugeT || time - this.gaugeT > 0.06 || time < this.gaugeT) {
        this.gaugeT = time;
        const loc = typeof Rules !== 'undefined' && Rules.lastLim ? Rules.lastLim : 50;
        Models.drawGauge(ud.gauge, Math.abs(p.v) * 3.6, p.blinker, blinkOn, p.gear, loc);
      }
    }
    // במבט נהג מסתירים את גוף הרכב ומשאירים רק את מכסה המנוע
    if (this.player.driverView !== driver) {
      this.player.driverView = driver;
      for (const o of this.player.group.children) o.visible = driver ? o === this.player.dash : o !== this.player.dash;
    }
    for (const L of this.lights) {
      const st = lightState(L.node, axisOf(L.edge), time);
      const on = [st === 'red' || st === 'redyellow', st === 'yellow' || st === 'redyellow', st === 'green'];
      L.lamps.forEach((l, i) => { l.mesh.material = on[i] ? l.on : l.off; if (l.halo) l.halo.visible = on[i]; });
    }
    // קפיצה קטנה על פס האטה
    this.bounce *= Math.exp(-dt * 6);
    const hx = Math.cos(p.h), hy = Math.sin(p.h);
    const cam = this.camera;
    if (driver) {
      // הנהג יושב משמאל (ישראל)
      const lx = hy, ly = -hx;
      cam.fov = 58;
      // העיניים קרובות לשמשה, והמבט מעט כלפי מטה כדי שהכביש ייראה מעל לוח המכשירים
      cam.position.set(p.x + lx * 0.38 + hx * 0.45, 1.3 + this.bounce * Math.sin(time * 40) * 0.05, p.y + ly * 0.38 + hy * 0.45);
      cam.lookAt(p.x + hx * 30 + lx * 0.38, -0.3, p.y + hy * 30 + ly * 0.38);
    } else {
      this.camH += angNorm(p.h - this.camH) * (1 - Math.exp(-dt * 3));
      const ch = Math.cos(this.camH), sh = Math.sin(this.camH);
      cam.fov = 60;
      cam.position.set(p.x - ch * 10, 4.2, p.y - sh * 10);
      cam.lookAt(p.x + ch * 8, 0.8, p.y + sh * 8);
    }
    cam.updateProjectionMatrix();
    this.updateRain(dt, cam.position.x, cam.position.z);
    if (this.headlight && this.headlight.intensity > 0) {
      this.headlight.position.set(p.x + hx * 2.3, 0.8, p.y + hy * 2.3);
      this.headlight.target.position.set(p.x + hx * 25, -0.5, p.y + hy * 25);
    }
    if (this.sun) { this.sun.position.set(p.x - 40, 100, p.y + 30); this.sun.target.position.set(p.x, 0, p.y); }
    if (this.sky) { this.sky.position.x = cam.position.x; this.sky.position.z = cam.position.z; }
    const R = this.renderer;
    R.setScissorTest(false);
    R.setViewport(0, 0, this.w, this.h);
    R.render(this.scene, cam);
    // מראה אחורית: מצלמה הפוכה בעולם משוקף, כדי שימין יופיע מימין כמו במראה אמיתית
    // מראות: המצלמה מסתכלת אחורה, והעולם משוקף (scale.x = -1) כדי שימין יופיע מימין כמו במראה אמיתית
    if (driver && mirrorRect) {
      const rects = mirrorRect.rear !== undefined ? mirrorRect : { rear: mirrorRect };
      const lx = hy, ly = -hx;   // כיוון שמאל של הרכב
      const views = [];
      if (rects.rear) { const ex = p.x + hx * 0.3, ey = p.y + hy * 0.3; views.push({ r: rects.rear, fov: 42, pos: [ex, 1.45, ey], look: [ex - hx * 30, 1.1, ey - hy * 30] }); }
      for (const [k, side] of [['left', 1], ['right', -1]]) {
        if (!rects[k]) continue;
        const mx = p.x + hx * 0.9 + lx * side * 1.05, my = p.y + hy * 0.9 + ly * side * 1.05;
        views.push({ r: rects[k], fov: 30, pos: [mx, 1.1, my], look: [mx - hx * 30 + lx * side * 4.5, 0.9, my - hy * 30 + ly * side * 4.5] });
      }
      if (views.length) {
        const mc = this.mirrorCam;
        this.scene.scale.x = -1; this.scene.updateMatrixWorld(true);
        this.player.group.visible = false;
        R.setScissorTest(true);
        for (const v of views) {
          mc.fov = v.fov; mc.aspect = v.r.w / v.r.h; mc.updateProjectionMatrix();
          mc.position.set(-v.pos[0], v.pos[1], v.pos[2]);
          mc.lookAt(-v.look[0], v.look[1], v.look[2]);
          const y = this.h - v.r.y - v.r.h;
          R.setScissor(v.r.x, y, v.r.w, v.r.h);
          R.setViewport(v.r.x, y, v.r.w, v.r.h);
          R.render(this.scene, mc);
        }
        R.setScissorTest(false);
        this.scene.scale.x = 1; this.scene.updateMatrixWorld(true);
        this.player.group.visible = true;
      }
    }
  },
};
View3D.init();
