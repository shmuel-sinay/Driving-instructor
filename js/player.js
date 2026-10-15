'use strict';
// ===== הרכב שלך: פיזיקה ושליטה =====


const player = {
  isPlayer: true, len: 4.4, wid: 1.8, wb: 2.6,
  x: START.x, y: START.y, h: START.h, v: 0, steer: 0,
  gear: 'D', blinker: 0, blinkStartH: 0, blinkArmed: false,
  braking: false, revHold: 0, horn: false,
};

const input = { up: false, down: false, left: false, right: false };

function resetPlayer() {
  Object.assign(player, { x: START.x, y: START.y, h: START.h, v: 0, steer: 0, gear: 'D', blinker: 0, revHold: 0 });
  if (assist.on) apReset();
}

// החלפת הילוך D / R (רק כשהרכב כמעט עומד)
function toggleGear() {
  if (Math.abs(player.v) > 0.5) return false;
  player.v = 0;
  player.gear = player.gear === 'D' ? 'R' : 'D';
  return true;
}

function setBlinker(side) {
  player.blinker = player.blinker === side ? 0 : side;
  player.blinkStartH = player.h;
  player.blinkArmed = false;
}

// גז ובלם (משותף לנהיגה ידנית ולנהיגה מסייעת)
function updatePedals(dt, allowReverse) {
  const p = player;
  let a = 0;
  const fwd = p.gear === 'D';
  // ↑ תמיד קדימה. בהילוך אחורי: ↓ מסיע אחורה, ו-↑ בולם ואז מחזיר להילוך קדימה
  let gas = input.up, brake = input.down;
  if (!fwd) {
    gas = input.down; brake = input.up;
    if (input.up && Math.abs(p.v) < 0.05) { p.gear = 'D'; p.v = 0; return; }
  }
  const sp = Math.abs(p.v);
  p.braking = false;
  if (brake) {
    p.braking = true;
    if (sp > 0.05) a = -8.5 * Math.sign(p.v);
    else {
      p.v = 0;
      p.revHold += dt;
      if (allowReverse && p.revHold > 0.45) { p.gear = fwd ? 'R' : 'D'; p.revHold = 0; }
    }
  } else p.revHold = 0;
  if (gas && !brake) {
    const vmax = fwd ? 42 : 5;
    a = (fwd ? 1 : -1) * 3.4 * Math.max(0, 1 - sp / vmax);
  }
  if (!gas && !brake) a = -Math.sign(p.v) * (0.35 + 0.0009 * p.v * p.v);
  const nv = p.v + a * dt;
  p.v = (brake || !gas) && Math.sign(nv) !== Math.sign(p.v) && p.v !== 0 ? 0 : nv;
  if (p.gear === 'D' && p.v < 0) p.v = 0;
  if (p.gear === 'R' && p.v > 0) p.v = 0;
}

function updatePlayer(dt) {
  if (assist.on) { updatePedals(dt, false); apUpdate(dt); return; }
  updatePedals(dt, true);
  const p = player;
  const sp = Math.abs(p.v);

  // היגוי: הסיבוב המרבי לפי המהירות (תאוצה צידית נוחה), כך שבמהירות ההגה עדין ובמהירות נמוכה אפשר לפנות חד
  const maxSteer = Math.min(0.62, Math.atan(p.wb * 3.2 / Math.max(sp * sp, 1)));
  const key = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let target = key * maxSteer, rate = key ? 1.6 : 3.0;
  // שמירת נתיב: כשלא לוחצים על החיצים, הרכב נשאר במרכז הנתיב שהוא נמצא בו ומתעקל עם הכביש.
  // לא פונה לבד ולא מחליף נתיב. בתוך צומת, ברוורס ובזווית חדה (באמצע פנייה) אין שום עזרה.
  if (!key && p.v > 0.5) {
    const loc = locate(p);
    if (loc && loc.kind === 'edge') {
      const e = loc.edge, hd = Math.cos(p.h) * e.d.x + Math.sin(p.h) * e.d.y, dir = hd > 0 ? 1 : -1;
      const hRoad = Math.atan2(e.d.y * dir, e.d.x * dir), he = angNorm(p.h - hRoad);
      if (laneCount(e, dir) > 0 && Math.abs(he) < 0.7) {
        const { s } = edgeLocal(e, p), lane = laneFromST(e, dir, s * dir).idx;
        const errT = (s - laneS(e, dir, lane)) * dir;   // חיובי = ימינה ממרכז הנתיב
        // כיוון רצוי: מתקן בעדינות לכיוון מרכז הנתיב
        const hWant = -Math.max(-0.25, Math.min(0.25, errT * 0.35));
        const yaw = (hWant - he) * 1.8;                 // קצב סיבוב רצוי
        target = Math.max(-0.62, Math.min(0.62, Math.atan(yaw * p.wb / Math.max(p.v, 1))));
        rate = 2.0;
      }
    } else if (loc && loc.kind === 'node' && loc.node.type === 'roundabout') {
      // בכיכר: הרכב ממשיך סביב האי בנתיב שהוא נמצא בו (פנימי או חיצוני). יוצאים מהכיכר עם החץ הימני
      const n = loc.node, dx = p.x - n.x, dy = p.y - n.y, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const he = angNorm(p.h - (th - Math.PI / 2));            // סטייה מכיוון הנסיעה בטבעת
      if (r > RB_IN + 0.5 && Math.abs(he) < 0.7) {
        const rT = n.rbLanes === 2 ? (r < (ringRadius(n, 'inner') + ringRadius(n, 'outer')) / 2 ? ringRadius(n, 'inner') : ringRadius(n, 'outer')) : RB_RING;
        const errT = r - rT;                                     // חיובי = החוצה (ימינה מכיוון הנסיעה)
        const hWant = -Math.max(-0.25, Math.min(0.25, errT * 0.35));
        const yaw = -p.v / rT + (hWant - he) * 1.8;               // סיבוב קבוע שמאלה סביב האי + תיקון
        target = Math.max(-0.62, Math.min(0.62, Math.atan(yaw * p.wb / Math.max(p.v, 1))));
        rate = 2.0;
      }
    }
  }
  const ds = target - p.steer;
  p.steer += Math.sign(ds) * Math.min(Math.abs(ds), rate * dt);
  p.steer = Math.max(-0.62, Math.min(0.62, p.steer));

  p.h = angNorm(p.h + p.v / p.wb * Math.tan(p.steer) * dt);
  p.x += Math.cos(p.h) * p.v * dt;
  p.y += Math.sin(p.h) * p.v * dt;

  // ביטול אוטומטי של האיתות אחרי שההגה חוזר
  if (p.blinker) {
    const turned = angNorm(p.h - p.blinkStartH);
    if (Math.abs(turned) > 0.9) p.blinkArmed = true;
    if (p.blinkArmed && Math.abs(p.steer) < 0.05) p.blinker = 0;
  }
}
