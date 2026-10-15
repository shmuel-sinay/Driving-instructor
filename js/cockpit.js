'use strict';
// ===== לוח מחוונים במבט נהג =====
// מצויר על קנבס מעל התלת-ממד: טמבון לרוחב המסך, מד סיבובים (טורים) ומד מהירות עגולים עם מחוגים,
// מסך קטן באמצע (הילוך, מהירות, דלק, מהירות מותרת), נורות איתות, והגה שמסתובב לפי ההיגוי.

const Cockpit = {
  cv: null, ctx: null, rpm: 800, fuel: 0.72,
  init() {
    this.cv = document.getElementById('cockpit');
    if (this.cv) this.ctx = this.cv.getContext('2d');
  },
  resize(w, h, dpr) {
    if (!this.cv) return;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
  },
  hide() { if (this.cv && !this.cv.hidden) { this.cv.hidden = true; } },

  // סיבובי מנוע מדומים: גיר אוטומטי לפי המהירות, ועוד קצת כשלוחצים גז
  updateRpm(dt, kmh, gas) {
    const bands = [0, 20, 38, 58, 82, 115, 400];
    let g = 0; while (g < bands.length - 2 && kmh > bands[g + 1]) g++;
    const frac = (kmh - bands[g]) / (bands[g + 1] - bands[g]);
    let target = player.v === 0 ? 800 : 1100 + frac * 2600;
    if (gas) target += 700;
    this.rpm += (target - this.rpm) * Math.min(1, dt * 4);
    this.gearNo = player.gear === 'R' ? 'R' : player.v === 0 ? 'D' : String(g + 1);
  },

  draw(dt, opts) {
    if (!this.ctx) return;
    this.cv.hidden = false;
    const c = this.ctx, W = this.w, H = this.h;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const kmh = Math.abs(player.v) * 3.6;
    this.updateRpm(dt, kmh, opts.gas);

    // מבט מעיני הנהג (יושב משמאל): לוח מכשירים כהה בשליש התחתון, גומחת שעונים והגה גדול מולו,
    // מסך מולטימדיה "צף" באמצע הרכב, ומתחתיו מיזוג, פתחי אוויר וידית ההילוכים
    const top = H * 0.8, cx = W * 0.3;
    // כשמסובבים את הראש הצידה, פנים הרכב זז לצד השני
    const shift = -(opts.yaw || 0) / 1.4 * W * 0.9;
    c.save(); c.translate(shift, 0);
    this.interior(c, W, H, top);
    // --- משטח הלוח העליון: קצה ישר מתחת לשמשה, מעט מתעגל בקצוות לכיוון הדלתות ---
    const edge = x => top + Math.pow(Math.abs(x / W - 0.45) * 2, 3) * H * 0.02;
    const path = off => { c.beginPath(); c.moveTo(0, edge(0) + off); for (let x = 0; x <= W; x += W / 32) c.lineTo(x, edge(x) + off); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); };
    let gr = c.createLinearGradient(0, top, 0, top + H * 0.06);
    gr.addColorStop(0, '#34373c'); gr.addColorStop(1, '#212327');
    c.fillStyle = gr; path(0); c.fill();
    // השתקפות עדינה של הלוח בתחתית השמשה
    gr = c.createLinearGradient(0, top - H * 0.05, 0, top);
    gr.addColorStop(0, 'rgba(40,42,46,0)'); gr.addColorStop(1, 'rgba(40,42,46,0.35)');
    c.fillStyle = gr; c.fillRect(0, top - H * 0.05, W, H * 0.05);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
    c.beginPath(); for (let x = 0; x <= W; x += W / 32) (x ? c.lineTo(x, edge(x)) : c.moveTo(x, edge(x))); c.stroke();
    // חזית הלוח: כהה, עם פס עיטור כסוף וקו תפר
    const faceY = top + H * 0.055;
    gr = c.createLinearGradient(0, faceY, 0, H);
    gr.addColorStop(0, '#1d1f23'); gr.addColorStop(1, '#0d0e10');
    c.fillStyle = gr; path(H * 0.055); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1.5;
    c.beginPath(); for (let x = 0; x <= W; x += W / 32) (x ? c.lineTo(x, edge(x) + H * 0.055) : c.moveTo(x, edge(x) + H * 0.055)); c.stroke();
    const trimY = faceY + H * 0.07;
    gr = c.createLinearGradient(0, trimY - 2, 0, trimY + 3);
    gr.addColorStop(0, '#d6dce2'); gr.addColorStop(1, '#6c747c');
    c.fillStyle = gr; c.fillRect(W * 0.64, trimY, W * 0.33, 3.5);
    c.setLineDash([3, 5]); c.strokeStyle = 'rgba(150,150,150,0.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(W * 0.64, trimY + 12); c.lineTo(W * 0.97, trimY + 12); c.stroke(); c.setLineDash([]);
    // פתחי מיזוג אופקיים
    const vent = (x, y, w, h) => {
      c.fillStyle = '#08090a'; this.round(c, x - w / 2, y, w, h, h * 0.35); c.fill();
      c.strokeStyle = '#7d858d'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = '#262a2f'; c.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) { const yy = y + i * h / 4; c.beginPath(); c.moveTo(x - w * 0.42, yy); c.lineTo(x + w * 0.42, yy); c.stroke(); }
    };
    vent(W * 0.055, faceY + H * 0.025, W * 0.06, H * 0.05);
    vent(W * 0.94, faceY + H * 0.025, W * 0.06, H * 0.05);

    // --- קונסולה מרכזית: מסך צף מעל הלוח, נורת מצוקה, מיזוג וידית הילוכים ---
    const sx = W * 0.58;
    {
      const sw = Math.min(W * 0.1, 170), sh = sw * 0.62, sy = top - sh * 0.62;
      // מסגרת ומסך
      c.fillStyle = '#060708'; this.round(c, sx - sw / 2 - 6, sy - 6, sw + 12, sh + 12, 10); c.fill();
      c.strokeStyle = '#555c63'; c.lineWidth = 1.5; c.stroke();
      const sg = c.createLinearGradient(sx - sw / 2, sy, sx + sw / 2, sy + sh);
      sg.addColorStop(0, '#16324e'); sg.addColorStop(1, '#0a1624');
      c.fillStyle = sg; this.round(c, sx - sw / 2, sy, sw, sh, 5); c.fill();
      // תוכן המסך: מפת ניווט, שעה ופס כפתורים
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(sx - sw / 2, sy, sw * 0.12, sh);
      c.strokeStyle = 'rgba(120,190,255,0.7)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(sx - sw * 0.2, sy + sh * 0.85); c.lineTo(sx + sw * 0.02, sy + sh * 0.5); c.lineTo(sx + sw * 0.35, sy + sh * 0.32); c.stroke();
      c.fillStyle = '#4fc3ff'; c.beginPath(); c.arc(sx + sw * 0.02, sy + sh * 0.5, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = `${Math.max(10, sw * 0.065)}px Arial`; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(new Date().toTimeString().slice(0, 5), sx + sw * 0.46, sy + sh * 0.1);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(sx - sw / 2 + sw * 0.12, sy + sh * 0.84, sw * 0.88, 1);
      // לוח מיזוג מתחת למסך, עם כפתור מצוקה
      const py = faceY + H * 0.02, pw = sw * 0.95;
      c.fillStyle = '#0b0c0e'; this.round(c, sx - pw / 2, py, pw, H * 0.075, 10); c.fill();
      c.strokeStyle = '#8d959d'; c.lineWidth = 2; c.stroke();
      vent(sx - pw * 0.25, py + H * 0.008, pw * 0.4, H * 0.025);
      vent(sx + pw * 0.25, py + H * 0.008, pw * 0.4, H * 0.025);
      c.fillStyle = '#b3261e'; c.beginPath(); c.moveTo(sx, py + H * 0.006); c.lineTo(sx + 8, py + H * 0.024); c.lineTo(sx - 8, py + H * 0.024); c.closePath(); c.fill();
      c.fillStyle = '#7fd4ff'; c.font = `bold ${Math.max(10, H * 0.018)}px Arial`; c.textAlign = 'center';
      c.fillText('22°', sx - pw * 0.3, py + H * 0.055); c.fillText('22°', sx + pw * 0.3, py + H * 0.055);
      for (const kx of [-0.36, 0.36]) { c.fillStyle = '#2a2e33'; c.beginPath(); c.arc(sx + pw * kx * 1.25, py + H * 0.055, H * 0.012, 0, Math.PI * 2); c.fill(); }
      // קונסולה תחתונה וידית ההילוכים
      const cy0 = py + H * 0.08;
      c.fillStyle = '#121316'; c.beginPath(); c.moveTo(sx - pw * 0.45, cy0); c.lineTo(sx + pw * 0.45, cy0); c.lineTo(sx + pw * 0.62, H); c.lineTo(sx - pw * 0.62, H); c.closePath(); c.fill();
      c.strokeStyle = '#80888f'; c.lineWidth = 2; c.stroke();
      const gx = sx, gy = cy0 + (H - cy0) * 0.45;
      c.fillStyle = '#050506'; this.round(c, gx - pw * 0.13, gy, pw * 0.26, H - gy, 8); c.fill();
      c.fillStyle = '#2b2d31'; c.beginPath(); c.ellipse(gx, gy + (H - gy) * 0.2, pw * 0.09, (H - gy) * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c9ced3'; c.font = `bold ${Math.max(9, H * 0.014)}px Arial`; c.textAlign = 'right';
      ['P', 'R', 'N', 'D'].forEach((ch, i) => {
        const cur = (player.gear === 'R' ? 'R' : 'D') === ch;
        c.fillStyle = cur ? '#4fc3ff' : '#6d747b';
        c.fillText(ch, gx - pw * 0.16, cy0 + (gy - cy0) * 0.15 + i * H * 0.017);
      });
    }

    // --- גומחת השעונים מול הנהג, מעל ההגה ---
    const R = Math.min(H * 0.05, W * 0.04, 50), cy = top + R * 0.1;
    // מצחייה מעל השעונים
    c.fillStyle = '#1a1c1f';
    c.beginPath(); c.moveTo(cx - R * 3.4, cy + R * 0.9); c.quadraticCurveTo(cx - R * 3.3, cy - R * 1.45, cx, cy - R * 1.5);
    c.quadraticCurveTo(cx + R * 3.3, cy - R * 1.45, cx + R * 3.4, cy + R * 0.9); c.closePath(); c.fill();
    c.fillStyle = '#07080a'; this.round(c, cx - R * 3.05, cy - R * 1.15, R * 6.1, R * 2.3, R * 0.7); c.fill();
    this.gauge(c, cx - R * 1.8, cy, R, this.rpm / 1000, 8, 1, 'x1000 סל"ד', 6.5);
    this.gauge(c, cx + R * 1.8, cy, R, kmh, 200, 20, 'קמ"ש', null, opts.lim);
    // מסך קטן באמצע: הילוך, מהירות ודלק
    c.fillStyle = '#0a1622'; this.round(c, cx - R * 0.66, cy - R * 0.8, R * 1.32, R * 1.55, 10); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = player.gear === 'R' ? '#ff453a' : '#7fd4ff'; c.font = `bold ${R * 0.42}px Rubik, Arial`;
    c.fillText(this.gearNo || 'D', cx - R * 0.27, cy - R * 0.42);
    c.fillStyle = '#ffffff'; c.font = `bold ${R * 0.36}px Rubik, Arial`;
    c.fillText(Math.round(kmh) + '', cx + R * 0.24, cy - R * 0.42);
    c.fillStyle = '#2a3a48'; c.fillRect(cx - R * 0.44, cy - R * 0.08, R * 0.88, R * 0.08);
    c.fillStyle = '#7fd4ff'; c.fillRect(cx - R * 0.44, cy - R * 0.08, R * 0.88 * this.fuel, R * 0.08);
    c.fillStyle = '#7f8c99'; c.font = `${R * 0.13}px Arial`; c.fillText('דלק', cx, cy + R * 0.1);
    const on = opts.blinkOn;
    this.arrow(c, cx - R * 0.95, cy - R * 1.0, -1, R * 0.2, player.blinker === -1 && on);
    this.arrow(c, cx + R * 0.95, cy - R * 1.0, 1, R * 0.2, player.blinker === 1 && on);
    if (opts.lights) { c.fillStyle = '#4fa3ff'; c.font = `bold ${R * 0.16}px Arial`; c.fillText('◐', cx, cy - R * 1.0); }
    // ידית איתות משמאל להגה
    c.fillStyle = '#16171a'; c.save(); c.translate(cx - R * 4.2, cy + R * 1.6); c.rotate(-0.12 + (player.blinker || 0) * 0.08);
    this.round(c, -R * 1.3, -R * 0.13, R * 1.4, R * 0.26, R * 0.12); c.fill(); c.restore();

    // --- הגה: שפה עבה מעור, שני חישורים צדדיים וחישור תחתון, כרית אוויר עם סמל ---
    const wr = Math.min(H * 0.17, W * 0.13), wx = cx, wy = H * 0.99;
    c.save(); c.translate(wx, wy); c.rotate((player.steer || 0) * 6);
    c.lineWidth = wr * 0.14; c.strokeStyle = '#121315';
    c.beginPath(); c.arc(0, 0, wr, 0, Math.PI * 2); c.stroke();
    c.lineWidth = wr * 0.035; c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.beginPath(); c.arc(0, 0, wr - wr * 0.035, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.setLineDash([4, 6]); c.lineWidth = 1.2; c.strokeStyle = 'rgba(160,160,160,0.35)';
    c.beginPath(); c.arc(0, 0, wr + wr * 0.04, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#1a1b1e';
    for (const sd of [-1, 1]) {
      c.beginPath(); c.moveTo(sd * wr * 0.26, -wr * 0.1); c.lineTo(sd * wr * 0.96, -wr * 0.04); c.lineTo(sd * wr * 0.96, wr * 0.14); c.lineTo(sd * wr * 0.26, wr * 0.2); c.closePath(); c.fill();
      for (let i = 0; i < 4; i++) { c.fillStyle = '#34373c'; c.beginPath(); c.arc(sd * wr * (0.42 + (i % 2) * 0.13), wr * (i < 2 ? -0.0 : 0.09), wr * 0.03, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#1a1b1e';
    }
    c.beginPath(); c.moveTo(-wr * 0.12, wr * 0.2); c.lineTo(wr * 0.12, wr * 0.2); c.lineTo(wr * 0.08, wr * 0.95); c.lineTo(-wr * 0.08, wr * 0.95); c.closePath(); c.fill();
    c.strokeStyle = '#8b939b'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(-wr * 0.12, wr * 0.22); c.lineTo(-wr * 0.08, wr * 0.93); c.moveTo(wr * 0.12, wr * 0.22); c.lineTo(wr * 0.08, wr * 0.93); c.stroke();
    const hub = c.createRadialGradient(0, -wr * 0.06, wr * 0.02, 0, 0, wr * 0.33);
    hub.addColorStop(0, '#2e3035'); hub.addColorStop(1, '#131416');
    c.fillStyle = hub; this.round(c, -wr * 0.3, -wr * 0.24, wr * 0.6, wr * 0.5, wr * 0.18); c.fill();
    c.strokeStyle = '#c3c9cf'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, wr * 0.09, wr * 0.055, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(0, 0, wr * 0.03, wr * 0.055, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
    c.restore();
    // מקום פנוי למראות (הן מצוירות בתלת-ממד מתחת ללוח הזה)
    for (const id of ['mirror', 'mirrorL', 'mirrorR']) {
      const el = document.getElementById(id);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      c.clearRect(r.left, r.top, r.width, r.height);
    }
  },

  // הפנים של הרכב סביב השמשה: תקרה בהירה עם מגני שמש, עמודי שמשה רחבים, וזרוע של המראה האחורית
  interior(c, W, H, top) {
    const beige = '#c8bea9', beigeD = '#a99f8a';
    let gr;
    // תקרה
    const hh = H * 0.055;
    let g = c.createLinearGradient(0, 0, 0, hh * 1.4);
    g.addColorStop(0, '#d9d0bd'); g.addColorStop(1, beigeD);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, hh * 1.35);
    c.bezierCurveTo(W * 0.7, hh * 0.95, W * 0.3, hh * 0.95, 0, hh * 1.35); c.closePath(); c.fill();
    // מגני שמש (מקופלים)
    for (const [x, w] of [[W * 0.1, W * 0.24], [W * 0.66, W * 0.24]]) {
      g = c.createLinearGradient(0, hh * 0.4, 0, hh * 1.2);
      g.addColorStop(0, '#cfc5b1'); g.addColorStop(1, '#b3a994');
      c.fillStyle = g; this.round(c, x, hh * 0.35, w, hh * 0.75, 14); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; c.stroke();
    }
    // זרוע המראה האחורית (המראה עצמה מוצגת מעליה)
    const mr = document.getElementById('mirror'), mTop = mr && !mr.hidden ? mr.getBoundingClientRect().top : hh * 1.25;
    const mx = mr && !mr.hidden ? (mr.getBoundingClientRect().left + mr.getBoundingClientRect().right) / 2 : W * 0.6;
    c.fillStyle = '#8f8676'; c.fillRect(mx - 7, 0, 14, Math.max(0, mTop - 2));
    // הדלתות משני הצדדים (רואים אותן כשמסובבים את הראש): תקרה, חלון צד, אדן ודלת כהה
    for (const x0 of [-W, W]) {
      c.fillStyle = beigeD; c.fillRect(x0, 0, W, hh * 1.3);
      gr = c.createLinearGradient(0, top - H * 0.05, 0, H);
      gr.addColorStop(0, '#3a3d42'); gr.addColorStop(0.08, '#24262a'); gr.addColorStop(1, '#141517');
      c.fillStyle = gr; c.fillRect(x0, top - H * 0.05, W, H);
      c.fillStyle = '#4a4e55'; c.fillRect(x0, top - H * 0.05, W, 4);
      // ידית ומשענת יד בדלת
      const hx0 = x0 < 0 ? x0 + W * 0.35 : x0 + W * 0.45;
      c.fillStyle = '#2e3136'; this.round(c, hx0, top + H * 0.06, W * 0.2, H * 0.05, 10); c.fill();
      c.fillStyle = '#9aa2aa'; this.round(c, hx0 + W * 0.04, top + H * 0.02, W * 0.05, H * 0.018, 6); c.fill();
      // עמוד אמצעי (B) בקצה החלון
      const bx = x0 < 0 ? x0 + W * 0.05 : x0 + W * 0.85;
      c.fillStyle = beigeD; c.fillRect(bx, 0, W * 0.1, H);
    }
    // עמודי השמשה: רחבים, בהירים, נוטים פנימה למעלה
    for (const side of [-1, 1]) {
      const xb = side < 0 ? 0 : W, inner = side < 0 ? 1 : -1;
      g = c.createLinearGradient(xb, 0, xb + inner * W * 0.2, 0);
      g.addColorStop(0, beigeD); g.addColorStop(1, beige);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(xb, hh * 1.2);
      c.lineTo(xb + inner * W * 0.025, hh * 1.25);
      c.lineTo(xb + inner * W * 0.06, top + 2);
      c.lineTo(xb, top + 2);
      c.closePath(); c.fill();
      // גומי השמשה: קו כהה בצד הפנימי של העמוד
      c.strokeStyle = 'rgba(20,20,20,0.6)'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(xb + inner * W * 0.025, hh * 1.25); c.lineTo(xb + inner * W * 0.06, top); c.stroke();
    }
  },

  // שעון עגול עם שנתות, מספרים ומחוג
  gauge(c, x, y, R, val, max, step, label, red, lim) {
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = v => a0 + (Math.min(v, max) / max) * (a1 - a0);
    const bg = c.createRadialGradient(x, y - R * 0.3, R * 0.1, x, y, R);
    bg.addColorStop(0, '#20262d'); bg.addColorStop(1, '#090b0d');
    c.fillStyle = bg; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#4a5560'; c.lineWidth = 2.5; c.stroke();
    if (red) { c.strokeStyle = '#d32f2f'; c.lineWidth = R * 0.07; c.beginPath(); c.arc(x, y, R * 0.86, ang(red), ang(max)); c.stroke(); }
    if (lim) { c.strokeStyle = 'rgba(255,190,60,0.85)'; c.lineWidth = R * 0.05; c.beginPath(); c.arc(x, y, R * 0.86, ang(lim) - 0.025, ang(lim) + 0.025); c.stroke(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = 0; v <= max + 1e-6; v += step / 2) {
      const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      const r1 = R * (major ? 0.76 : 0.82), r2 = R * 0.9;
      c.strokeStyle = major ? '#e8eef4' : '#8996a3'; c.lineWidth = major ? 2.5 : 1.2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); c.stroke();
      if (major) { c.fillStyle = '#e8eef4'; c.font = `${R * 0.15}px Rubik, Arial`; c.fillText(v, x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6); }
    }
    c.fillStyle = '#8996a3'; c.font = `${R * 0.12}px Arial`; c.fillText(label, x, y + R * 0.42);
    // מחוג
    const a = ang(val);
    c.strokeStyle = '#ff6a2b'; c.lineWidth = R * 0.045; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - Math.cos(a) * R * 0.12, y - Math.sin(a) * R * 0.12); c.lineTo(x + Math.cos(a) * R * 0.82, y + Math.sin(a) * R * 0.82); c.stroke();
    c.lineCap = 'butt';
    c.fillStyle = '#2b3138'; c.beginPath(); c.arc(x, y, R * 0.09, 0, Math.PI * 2); c.fill();
  },
  arrow(c, x, y, dir, s, on) {
    c.fillStyle = on ? '#34c759' : '#1f2b22';
    if (on) { c.shadowColor = '#34c759'; c.shadowBlur = 12; }
    c.beginPath(); c.moveTo(x + dir * s, y); c.lineTo(x, y - s * 0.7); c.lineTo(x, y - s * 0.3); c.lineTo(x - dir * s * 0.8, y - s * 0.3);
    c.lineTo(x - dir * s * 0.8, y + s * 0.3); c.lineTo(x, y + s * 0.3); c.lineTo(x, y + s * 0.7); c.closePath(); c.fill();
    c.shadowBlur = 0;
  },
  round(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  },
};
Cockpit.init();
