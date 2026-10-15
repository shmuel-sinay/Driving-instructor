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

    this.interior(c, W, H);
    // --- הטמבון: לוח כהה עם קצה עליון מעוגל ---
    const top = H * 0.78, mid = H * 0.74;
    const gr = c.createLinearGradient(0, mid, 0, H);
    gr.addColorStop(0, '#2b2e33'); gr.addColorStop(0.18, '#1d1f23'); gr.addColorStop(1, '#0d0e10');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(0, top + H * 0.03);
    c.bezierCurveTo(W * 0.25, top - H * 0.005, W * 0.75, top - H * 0.005, W, top + H * 0.03);
    c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
    // פס אור על קצה הלוח (השתקפות של השמשה)
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, top + H * 0.03); c.bezierCurveTo(W * 0.25, top - H * 0.005, W * 0.75, top - H * 0.005, W, top + H * 0.03); c.stroke();
    // פתחי מיזוג משני הצדדים
    for (const x of [W * 0.1, W * 0.9]) {
      c.fillStyle = '#121315'; this.round(c, x - W * 0.045, top + H * 0.06, W * 0.09, H * 0.05, 8); c.fill();
      c.strokeStyle = '#2a2d31'; c.lineWidth = 2;
      for (let i = 1; i < 5; i++) { const y = top + H * 0.06 + i * H * 0.01; c.beginPath(); c.moveTo(x - W * 0.04, y); c.lineTo(x + W * 0.04, y); c.stroke(); }
    }

    // --- קונסולה מרכזית מימין להגה: מסך מולטימדיה ופתחי מיזוג ---
    {
      const sx = W * 0.79, sw = Math.min(W * 0.16, 260), sh = sw * 0.58, sy = top + H * 0.035;
      c.fillStyle = '#0e0f11'; this.round(c, sx - sw / 2 - 8, sy - 8, sw + 16, sh + 16, 12); c.fill();
      const sg = c.createLinearGradient(sx - sw / 2, sy, sx + sw / 2, sy + sh);
      sg.addColorStop(0, '#10243a'); sg.addColorStop(1, '#0a1522');
      c.fillStyle = sg; this.round(c, sx - sw / 2, sy, sw, sh, 8); c.fill();
      // מפת ניווט קטנה על המסך
      c.strokeStyle = 'rgba(120,190,255,0.55)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(sx - sw * 0.3, sy + sh * 0.85); c.lineTo(sx - sw * 0.05, sy + sh * 0.45); c.lineTo(sx + sw * 0.3, sy + sh * 0.3); c.stroke();
      c.fillStyle = '#4fc3ff'; c.beginPath(); c.arc(sx - sw * 0.05, sy + sh * 0.45, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = `${Math.max(11, sh * 0.11)}px Arial`; c.textAlign = 'center';
      c.fillText(new Date().toTimeString().slice(0, 5), sx + sw * 0.3, sy + sh * 0.15);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(sx - sw / 2, sy, sw, sh * 0.12);
    }
    // --- גומחת השעונים מול הנהג ---
    const R = Math.min(H * 0.105, W * 0.085, 105), cx = W / 2, cy = top + R * 0.62;
    c.fillStyle = '#141518';
    this.round(c, cx - R * 3.05, cy - R * 1.22, R * 6.1, R * 2.35, R * 0.9); c.fill();
    c.strokeStyle = '#33373c'; c.lineWidth = 3; c.stroke();
    // מד סיבובים (טורים) משמאל ומד מהירות מימין
    this.gauge(c, cx - R * 1.75, cy, R, this.rpm / 1000, 8, 1, 'x1000 סל"ד', 6.5);
    this.gauge(c, cx + R * 1.75, cy, R, kmh, 200, 20, 'קמ"ש', null, opts.lim);
    // מסך קטן באמצע
    c.fillStyle = '#0a1622'; this.round(c, cx - R * 0.62, cy - R * 0.75, R * 1.24, R * 1.5, 10); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = player.gear === 'R' ? '#ff453a' : '#7fd4ff'; c.font = `bold ${R * 0.42}px Rubik, Arial`;
    c.fillText(this.gearNo || 'D', cx, cy - R * 0.45);
    c.fillStyle = '#ffffff'; c.font = `bold ${R * 0.36}px Rubik, Arial`;
    c.fillText(Math.round(kmh) + '', cx, cy - R * 0.02);
    // מד דלק קטן
    c.fillStyle = '#2a3a48'; c.fillRect(cx - R * 0.42, cy + R * 0.3, R * 0.84, R * 0.08);
    c.fillStyle = '#7fd4ff'; c.fillRect(cx - R * 0.42, cy + R * 0.3, R * 0.84 * this.fuel, R * 0.08);
    c.fillStyle = '#7f8c99'; c.font = `${R * 0.13}px Arial`; c.fillText('דלק', cx, cy + R * 0.48);
    // נורות איתות ירוקות מעל השעונים
    const on = opts.blinkOn;
    this.arrow(c, cx - R * 0.95, cy - R * 0.98, -1, R * 0.2, player.blinker === -1 && on);
    this.arrow(c, cx + R * 0.95, cy - R * 0.98, 1, R * 0.2, player.blinker === 1 && on);
    // נורית בלם יד / אור גבוה לגיוון
    if (opts.lights) { c.fillStyle = '#4fa3ff'; c.font = `bold ${R * 0.16}px Arial`; c.fillText('◐', cx, cy - R * 0.98); }

    // --- הגה: שפה עבה, שלושה חישורים, מסתובב לפי ההיגוי ---
    const wr = R * 2.25, wx = cx, wy = cy + R * 2.55;
    c.save(); c.translate(wx, wy); c.rotate((player.steer || 0) * 6);
    c.lineWidth = R * 0.32; c.strokeStyle = '#121314';
    c.beginPath(); c.arc(0, 0, wr, 0, Math.PI * 2); c.stroke();
    c.lineWidth = R * 0.06; c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.arc(0, 0, wr + R * 0.1, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.fillStyle = '#1b1c1f';
    for (const a of [Math.PI, 0]) { c.save(); c.rotate(a); c.fillRect(R * 0.5, -R * 0.13, wr - R * 0.55, R * 0.26); c.restore(); }
    c.beginPath(); c.arc(0, 0, R * 0.62, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9aa3ab'; c.beginPath(); c.arc(0, -R * 0.05, R * 0.14, 0, Math.PI * 2); c.fill();
    c.restore();
  },

  // הפנים של הרכב סביב השמשה: תקרה בהירה עם מגני שמש, עמודי שמשה רחבים, וזרוע של המראה האחורית
  interior(c, W, H) {
    const beige = '#c8bea9', beigeD = '#a99f8a';
    // תקרה
    const hh = H * 0.11;
    let g = c.createLinearGradient(0, 0, 0, hh * 1.4);
    g.addColorStop(0, '#d9d0bd'); g.addColorStop(1, beigeD);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, hh * 1.35);
    c.bezierCurveTo(W * 0.7, hh * 0.95, W * 0.3, hh * 0.95, 0, hh * 1.35); c.closePath(); c.fill();
    // מגני שמש (מקופלים)
    for (const [x, w] of [[W * 0.06, W * 0.3], [W * 0.64, W * 0.3]]) {
      g = c.createLinearGradient(0, hh * 0.4, 0, hh * 1.2);
      g.addColorStop(0, '#cfc5b1'); g.addColorStop(1, '#b3a994');
      c.fillStyle = g; this.round(c, x, hh * 0.35, w, hh * 0.75, 14); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; c.stroke();
    }
    // זרוע המראה האחורית (המראה עצמה מוצגת מעליה)
    const mr = document.getElementById('mirror'), mTop = mr && !mr.hidden ? mr.getBoundingClientRect().top : hh * 1.25;
    c.fillStyle = '#8f8676'; c.fillRect(W / 2 - 7, 0, 14, Math.max(0, mTop - 2));
    // עמודי השמשה: רחבים, בהירים, נוטים פנימה למעלה
    for (const side of [-1, 1]) {
      const xb = side < 0 ? 0 : W, inner = side < 0 ? 1 : -1;
      g = c.createLinearGradient(xb, 0, xb + inner * W * 0.2, 0);
      g.addColorStop(0, beigeD); g.addColorStop(1, beige);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(xb, hh * 1.2);
      c.lineTo(xb + inner * W * 0.06, hh * 1.25);
      c.lineTo(xb + inner * W * 0.2, H * 0.8);
      c.lineTo(xb + inner * W * 0.13, H * 0.82);
      c.lineTo(xb, H * 0.6);
      c.closePath(); c.fill();
      // גומי השמשה: קו כהה בצד הפנימי של העמוד
      c.strokeStyle = 'rgba(20,20,20,0.6)'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(xb + inner * W * 0.06, hh * 1.25); c.lineTo(xb + inner * W * 0.2, H * 0.8); c.stroke();
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
