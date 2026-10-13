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
  // דוושת הגז מסיעה בכיוון ההילוך (D קדימה, R אחורה), והבלם תמיד בולם
  const gas = input.up;
  const brake = input.down;
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

  // היגוי
  const maxSteer = 0.62 / (1 + sp * 0.085);
  const target = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * maxSteer;
  const rate = target === 0 ? 3.2 : 2.0;
  const ds = target - p.steer;
  p.steer += Math.sign(ds) * Math.min(Math.abs(ds), rate * dt);
  p.steer = Math.max(-maxSteer, Math.min(maxSteer, p.steer));

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
