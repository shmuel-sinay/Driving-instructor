'use strict';
// ===== לולאת המשחק, ממשק ושליטה =====

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const $ = id => document.getElementById(id);

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  const mw = mini.clientWidth, mh = mini.clientHeight;
  mini.width = mw * DPR; mini.height = mh * DPR;
  if (typeof View3D !== 'undefined') View3D.resize(W, H);
  // מיקום הרכב במבט מלמעלה: מעל לוח המחוונים
  const dash = document.querySelector('.dash');
  carScreenY = dash ? Math.min(H * 0.7, dash.getBoundingClientRect().top - 70) : H * 0.7;
  const tb = document.querySelector('.topbar');
  if (tb) document.documentElement.style.setProperty('--top', tb.getBoundingClientRect().height + 'px');
}
let carScreenY = 0;
window.addEventListener('resize', resize);
resize();

let npcs = [];
let parkedList = [];
// מיקום המראה האחורית על המסך (לפי האלמנט #mirror)
function mirrorRect() {
  const el = $('mirror'), app = $('app');
  if (!el || el.hidden) return null;
  const r = el.getBoundingClientRect(), a = app.getBoundingClientRect();
  return { x: Math.round(r.left - a.left), y: Math.round(r.top - a.top), w: Math.round(r.width), h: Math.round(r.height) };
}
let time = 0;
let paused = true;
let soundOn = true;

// ===== פעולות נהיגה (משותפות למקלדת ולכפתורים) =====
const act = {
  blink(side) { setBlinker(side); tick(true); },
  blinkOff() { if (player.blinker) { player.blinker = 0; tick(false); } },
  lane(side) { if (assist.on) apLane(side); },
  park(side) { if (assist.on) apPark(side); else Rules.onEvent('good', { text: 'חניה אוטומטית עובדת בהיגוי אוטומטי' }); },
  gear() { if (!toggleGear()) Rules.onEvent('good', { text: 'עצור לגמרי לפני החלפת הילוך' }); else tick(false); },
  horn(on) { player.horn = on; if (on) beep(392, 0.35, 0.07, 'sawtooth'); },
  reset() { resetPlayer(); Rules.loc = null; Rules.entry = null; Rules.rb = null; },
};

// ===== שליטה במקלדת =====
const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('textarea, input')) return;
  if (!$('maps').hidden) { if (e.code === 'Escape') closeMaps(); return; }
  if (!$('plugins').hidden) { if (e.code === 'Escape') closePlugins(); return; }
  if (!$('book').hidden) { if (e.code === 'Escape') closeBook(); return; }
  if (!$('quiz').hidden) { if (e.code === 'Escape') closeQuiz(); return; }
  const k = keyMap[e.code];
  // בהיגוי אוטומטי החיצים מחליפים נתיב / בוחרים פנייה
  if (assist.on && (k === 'left' || k === 'right')) {
    e.preventDefault();
    if (!e.repeat) act.lane(k === 'left' ? -1 : 1);
    return;
  }
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyQ': case 'Comma': act.blink(-1); break;
    case 'KeyE': case 'Period': act.blink(1); break;
    case 'KeyX': act.blinkOff(); break;
    case 'KeyR': act.gear(); break;
    case 'KeyP': act.park('right'); break;
    case 'KeyO': act.park('left'); break;
    case 'KeyC': toggleCamera(); break;
    case 'KeyG': toggleSteer(); break;
    case 'KeyV': toggleVoice(); break;
    case 'KeyI': toggleInstructor(); break;
    case 'KeyL': toggleLog(); break;
    case 'Backspace': act.reset(); e.preventDefault(); break;
    case 'Escape': if (!$('help').hidden) startDriving(); else showHelp(); break;
    case 'Equal': case 'NumpadAdd': cam.userZoom = Math.min(2, cam.userZoom * 1.15); break;
    case 'Minus': case 'NumpadSubtract': cam.userZoom = Math.max(0.45, cam.userZoom / 1.15); break;
    case 'Space': e.preventDefault(); act.horn(true); break;
  }
});
window.addEventListener('keyup', e => {
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
  if (e.code === 'Space') act.horn(false);
});
window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.userZoom = Math.max(0.45, Math.min(2, cam.userZoom * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });

// ===== לוח כפתורים (עכבר ומגע) =====
document.querySelectorAll('[data-hold]').forEach(btn => {
  const k = btn.dataset.hold;
  const on = e => { e.preventDefault(); input[k] = true; btn.classList.add('pressed'); };
  const off = () => { input[k] = false; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off); btn.addEventListener('pointercancel', off);
});
// חיצים: בהיגוי אוטומטי לחיצה = נתיב/פנייה, בהיגוי ידני החזקה = הגה
document.querySelectorAll('[data-steer]').forEach(btn => {
  const side = +btn.dataset.steer, k = side < 0 ? 'left' : 'right';
  btn.addEventListener('pointerdown', e => { e.preventDefault(); if (assist.on) act.lane(side); else { input[k] = true; btn.classList.add('pressed'); } });
  const off = () => { if (!assist.on) { input[k] = false; btn.classList.remove('pressed'); } };
  btn.addEventListener('pointerup', off); btn.addEventListener('pointerleave', off); btn.addEventListener('pointercancel', off);
});
const clickAct = (id, fn) => $(id).addEventListener('click', e => { e.currentTarget.blur(); fn(); });
clickAct('cBlinkL', () => act.blink(-1));
clickAct('cBlinkR', () => act.blink(1));
clickAct('cBlinkOff', () => act.blinkOff());
clickAct('cParkR', () => act.park('right'));
clickAct('cParkL', () => act.park('left'));
clickAct('cGear', () => act.gear());
clickAct('blinkL', () => act.blink(-1));
clickAct('blinkR', () => act.blink(1));
$('cHorn').addEventListener('pointerdown', e => { e.preventDefault(); act.horn(true); });
$('cHorn').addEventListener('pointerup', () => act.horn(false));
$('cHorn').addEventListener('pointerleave', () => act.horn(false));

// ===== כפתורים =====
const CAM_LABEL = { driver: 'מבט: מכיסא הנהג', follow: 'מבט: מאחורי הרכב', chase: 'מבט: מלמעלה', north: 'מבט: מפה' };
function setCamera(mode) {
  if ((mode === 'driver' || mode === 'follow') && !View3D.ok) mode = 'chase';
  cam.mode = mode;
  $('btnCam').textContent = CAM_LABEL[mode];
  const is3d = mode === 'driver' || mode === 'follow';
  document.body.classList.toggle('view3d', is3d);
  $('mirror').hidden = mode !== 'driver';
  document.body.classList.toggle('drivercam', mode === 'driver');
  try { localStorage.setItem('driving-practice.cam', mode); } catch (e) { /* לא חובה */ }
}
function toggleCamera() {
  const order = View3D.ok ? ['driver', 'follow', 'chase', 'north'] : ['chase', 'north'];
  setCamera(order[(order.indexOf(cam.mode) + 1) % order.length]);
}
function toggleSteer() {
  if (!assist.on) {
    if (!apSnap()) { Rules.onEvent('good', { text: 'אפשר לעבור להיגוי אוטומטי רק כשהרכב על כביש, לא בתוך צומת' }); return; }
    assist.on = true;
  } else { assist.on = false; assist.st = null; }
  for (const k in input) input[k] = false;
  $('btnSteer').textContent = assist.on ? 'היגוי: אוטומטי' : 'היגוי: ידני';
  document.body.classList.toggle('manual', !assist.on);
}
function toggleInstructor() {
  Rules.instructorOn = !Rules.instructorOn;
  $('btnInstr').textContent = Rules.instructorOn ? 'הוראות בוחן: פועל' : 'הוראות בוחן: כבוי';
  $('btnInstr').setAttribute('aria-pressed', Rules.instructorOn);
}
function toggleLog() { $('log').hidden = !$('log').hidden; }
function showHelp() { paused = true; $('help').hidden = false; }
let testStarted = false;
function startDriving() {
  $('help').hidden = true; paused = false; ensureAudio(); canvas.focus();
  if (!testStarted) { testStarted = true; Voice.say('start'); lastSpeakAt = time; }
}
$('btnCam').addEventListener('click', toggleCamera);
$('btnSteer').addEventListener('click', toggleSteer);
$('btnInstr').addEventListener('click', toggleInstructor);
$('btnVoice').addEventListener('click', toggleVoice);
// איכות גרפיקה: גבוהה (צללים, הולכי רגל על המדרכות) או מהירה למחשבים חלשים
function showQuality() { $('btnQuality').textContent = View3D.quality === 'high' ? 'גרפיקה: גבוהה' : 'גרפיקה: מהירה'; }
$('btnQuality').addEventListener('click', () => { View3D.setQuality(View3D.quality === 'high' ? 'fast' : 'high'); showQuality(); });
showQuality();
$('btnReset').addEventListener('click', () => { act.reset(); $('settings').open = false; });
$('btnLog').addEventListener('click', toggleLog);
$('btnHelp').addEventListener('click', showHelp);
$('btnStart').addEventListener('click', startDriving);
$('btnSound').addEventListener('click', () => { soundOn = !soundOn; $('btnSound').textContent = soundOn ? 'צלילים: פועל' : 'צלילים: כבוי'; });
$('btnFinish').addEventListener('click', showSummary);
$('btnNew').addEventListener('click', newTest);
$('btnResume').addEventListener('click', () => { $('summary').hidden = true; paused = false; });

// ===== קול הבוחן (קבצי קול מוקלטים, ראו js/voice.js) =====
function speak(text) { Voice.say(text); }
function toggleVoice() {
  Voice.on = !Voice.on;
  if (!Voice.on) Voice.stop();
  $('btnVoice').textContent = Voice.on ? 'קול בוחן: פועל' : 'קול בוחן: כבוי';
}
let lastSpeakAt = -10;
Rules.onInstr = ins => {
  Voice.say(ins.voice || ins.text);
  lastSpeakAt = time;
  // אם הנהג לא בנתיב שמתאים לפנייה, הבוחן מזכיר (כמו בטסט)
  if (ins.kind === 'turn' && ins.node.type !== 'roundabout' && (ins.turn === 'left' || ins.turn === 'right') && assist.on && assist.st && assist.st.kind === 'edge') {
    const n = apLaneCount(assist.st.e, assist.st.dir);
    const want = ins.turn === 'left' ? 0 : n - 1;
    if (n > 1 && assist.st.lane !== want) setTimeout(() => Voice.say(ins.turn === 'left' ? 'lane_left_turn' : 'lane_right_turn'), 3200);
  }
};
// הערה קצרה בקול על עבירה (רק אם הבוחן לא באמצע הוראה)
const REMARKS = { speed: 'warn_speed', signal: 'warn_signal', lanechg: 'warn_signal', rbsignal: 'warn_signal', parksig: 'warn_signal', unparksig: 'warn_signal',
  ped: 'warn_ped', pedhit: 'warn_ped', red: 'warn_red', stop: 'warn_stop', yield: 'warn_yield', rbcut: 'warn_yield', unparkyield: 'warn_yield',
  fromlane: 'warn_lane', turnlane: 'warn_lane', rbentry: 'warn_lane', keepright: 'back_right', distance: 'warn_distance',
  stopline: 'warn_stopline', stopcross: 'warn_stopline', pedwait: 'warn_ped', slow: 'warn_slow', rbfast: 'warn_speed', turnfast: 'warn_speed' };
Rules.onSay = id => { if (time - lastSpeakAt > 3) { lastSpeakAt = time; Voice.say(id); } };
function remark(key) {
  const id = REMARKS[key];
  if (!id || time - lastSpeakAt < 3.5) return;
  lastSpeakAt = time;
  Voice.say(id);
}


function newTest() {
  loadMap(currentMap);
  Voice.say('start'); lastSpeakAt = time;
  $('summary').hidden = true;
  paused = false;
}

// ===== מפות =====
function loadMap(map) {
  buildWorld(map); buildSigns(); buildScenery();
  View3D.build();
  Rules.reset(); Rules.lastLim = START.lim;
  resetPlayer();
  npcs = spawnNPCs(map.traffic == null ? 12 : map.traffic, player);
  parkedList = parkedCars();
  cam.x = player.x; cam.y = player.y; cam.rot = cam.mode === 'north' ? 0 : -Math.PI / 2 - player.h;
  lastLimit = null; time = 0;
  $('toasts').innerHTML = '';
  $('mapTitle').textContent = map.name;
  $('lessonBar').hidden = true;
  renderLog();
}

const STORE_KEY = 'driving-practice.maps';
function savedMaps() {
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function storeMaps(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }

function openMaps() { paused = true; renderMapList(); $('maps').hidden = false; }
function closeMaps() { $('maps').hidden = true; if ($('help').hidden && $('summary').hidden) paused = false; }

function renderMapList() {
  const box = $('mapList'); box.innerHTML = '';
  const add = (map, custom, idx) => {
    const el = document.createElement('div');
    el.className = 'mapcard' + (currentMap && currentMap.name === map.name ? ' current' : '');
    const roadsKm = (map.roads.reduce((s, r) => { const a = map.nodes.find(n => n.id === r.from), b = map.nodes.find(n => n.id === r.to); return s + Math.hypot(a.x - b.x, a.y - b.y); }, 0) / 1000).toFixed(1);
    el.innerHTML = `<div class="mapinfo"><strong></strong><span class="desc"></span><span class="meta">${map.nodes.length} צמתים · ${map.roads.length} דרכים · ${roadsKm} ק"מ${custom ? ' · שמורה אצלך' : ''}</span></div><div class="mapbtns"><button type="button" class="primary">נסע במפה</button></div>`;
    el.querySelector('strong').textContent = map.name;
    el.querySelector('.desc').textContent = map.description || '';
    el.querySelector('.primary').addEventListener('click', () => { loadMap(map); closeMaps(); });
    if (custom) {
      const del = document.createElement('button'); del.type = 'button'; del.textContent = 'מחק';
      del.addEventListener('click', () => {
        if (del.dataset.armed) { const l = savedMaps(); l.splice(idx, 1); storeMaps(l); renderMapList(); }
        else { del.dataset.armed = '1'; del.textContent = 'בטוח? לחץ שוב'; }
      });
      el.querySelector('.mapbtns').appendChild(del);
    }
    box.appendChild(el);
  };
  BUILTIN_MAPS.forEach(m => add(m, false));
  savedMaps().forEach((m, i) => { const r = validateMap(m); if (r.map) add(r.map, true, i); });
}

function showMapMsgs(errors, warnings, okText) {
  const box = $('mapMsg'); box.innerHTML = '';
  const addList = (items, cls, title) => {
    if (!items.length) return;
    const h = document.createElement('p'); h.className = 'msgtitle ' + cls; h.textContent = title; box.appendChild(h);
    const ul = document.createElement('ul'); ul.className = 'msglist ' + cls;
    for (const t of items) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
    box.appendChild(ul);
  };
  if (okText) { const p = document.createElement('p'); p.className = 'msgtitle good'; p.textContent = okText; box.appendChild(p); }
  addList(errors, 'bad', `המפה לא נטענה. יש ${errors.length} שגיאות. אפשר להעתיק אותן ולבקש מ-Gemini לתקן:`);
  addList(warnings, 'warn', 'הערות (המפה תעבוד, אבל כדאי לבדוק):');
  if (errors.length) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'העתק בקשת תיקון ל-Gemini';
    b.addEventListener('click', () => copyText('המפה שהחזרת נדחתה בגלל השגיאות הבאות. תקן אותן והחזר את המפה המלאה כ-JSON בלבד, באותו פורמט:\n- ' + errors.join('\n- '), b));
    box.appendChild(b);
  }
}

function tryLoadText(text) {
  let raw;
  try { raw = extractJSON(text); } catch (e) { showMapMsgs([e.message], []); return; }
  const r = validateMap(raw);
  if (!r.map) { showMapMsgs(r.errors, r.warnings); return; }
  const list = savedMaps().filter(m => m.name !== r.map.name);
  list.push(r.map);
  const saved = storeMaps(list);
  loadMap(r.map);
  renderMapList();
  showMapMsgs([], r.warnings, `המפה "${r.map.name}" נטענה${saved ? ' ונשמרה ברשימה' : ''}. סגור את החלון כדי לנסוע.`);
}

function copyText(text, btn) {
  const done = ok => {
    if (!btn) return;
    const old = btn.dataset.label || btn.textContent; btn.dataset.label = old;
    btn.textContent = ok ? 'הועתק ✓' : 'סמן והעתק ידנית מהתיבה למטה';
    setTimeout(() => { btn.textContent = old; }, 2200);
  };
  const boxId = !$('plugins').hidden ? 'copyOut2' : 'copyOut';
  const fallback = () => { const box = $(boxId); box.hidden = false; box.value = text; box.focus(); box.select(); done(false); };
  try {
    navigator.clipboard.writeText(text).then(() => { $(boxId).hidden = true; done(true); }, fallback);
  } catch (e) { fallback(); }
}

$('btnMaps').addEventListener('click', openMaps);
$('btnCloseMaps').addEventListener('click', closeMaps);
$('btnLoadMap').addEventListener('click', () => tryLoadText($('mapInput').value));
$('btnCopyPrompt').addEventListener('click', e => copyText(GEMINI_PROMPT, e.currentTarget));
$('btnCopyMap').addEventListener('click', e => copyText(JSON.stringify(currentMap, null, 2), e.currentTarget));
$('mapFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { $('mapInput').value = rd.result; tryLoadText(rd.result); };
  rd.readAsText(f);
  e.target.value = '';
});

// ===== צלילים =====
let actx = null;
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
}
function beep(freq, dur, vol = 0.05, type = 'square') {
  if (!soundOn || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
}
function tick(hi) { beep(hi ? 1400 : 1000, 0.03, 0.04); }

// ===== הודעות =====
Rules.onEvent = (kind, item) => {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'bad' ? (item.severe ? 'severe' : 'minor') : 'good');
  if (kind === 'bad') {
    el.innerHTML = `<span class="tag">${item.severe ? 'עבירה חמורה' : 'עבירה'} · −${item.pts}</span><span class="msg"></span>`;
    el.querySelector('.msg').textContent = item.text;
    remark(item.key);
    const rule = ruleForKey(item.key);
    if (rule) {
      const why = document.createElement('p'); why.className = 'why';
      why.textContent = 'המורה: ' + rule.text;
      el.appendChild(why);
    }
    beep(item.severe ? 220 : 330, 0.25, 0.06, 'sawtooth');
  } else {
    el.innerHTML = '<span class="msg"></span>';
    el.querySelector('.msg').textContent = item.text;
    beep(880, 0.12, 0.04, 'sine');
  }
  const box = $('toasts');
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
  renderLog();
};

function renderLog() {
  const ul = $('logList');
  ul.innerHTML = '';
  if (!Rules.log.length) { ul.innerHTML = '<li class="empty">עדיין אין עבירות. סע בזהירות!</li>'; }
  for (const it of Rules.log) {
    const li = document.createElement('li');
    li.className = it.severe ? 'severe' : 'minor';
    const m = Math.floor(it.time / 60), s = Math.floor(it.time % 60);
    li.innerHTML = `<span class="when">${m}:${String(s).padStart(2, '0')}</span><span class="what"></span><span class="pts">−${it.pts}</span>`;
    li.querySelector('.what').textContent = it.text;
    const rule = ruleForKey(it.key);
    if (rule) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'whybtn'; b.textContent = 'למה?';
      b.title = rule.title;
      b.addEventListener('click', () => openBook(rule.id));
      li.querySelector('.what').appendChild(b);
    }
    ul.appendChild(li);
  }
  $('btnLog').textContent = `יומן עבירות (${Rules.log.length})`;
}
renderLog();

function showSummary() {
  paused = true;
  if (typeof recordTest === 'function') recordTest();
  Voice.say(assist.on && assist.st && assist.st.kind === 'parked' ? 'end_full' : 'end_here');
  const sc = Rules.score;
  let verdict, cls;
  if (Rules.failed) { verdict = 'נכשל: בוצעה עבירה חמורה'; cls = 'bad'; }
  else if (sc >= 85) { verdict = 'עבר! נהיגה טובה'; cls = 'good'; }
  else if (sc >= 70) { verdict = 'גבולי: יש על מה לעבוד'; cls = 'warn'; }
  else { verdict = 'נכשל: יותר מדי טעויות'; cls = 'bad'; }
  $('sumScore').textContent = sc;
  $('sumVerdict').textContent = verdict;
  $('sumVerdict').className = 'verdict ' + cls;
  const m = Math.floor(time / 60), s = Math.floor(time % 60);
  $('sumMeta').textContent = `זמן נהיגה ${m}:${String(s).padStart(2, '0')} · ${Rules.log.length} עבירות · ${Rules.good} הוראות בוצעו נכון`;
  const groups = {};
  for (const it of Rules.log) { groups[it.text] = groups[it.text] || { n: 0, severe: it.severe }; groups[it.text].n++; }
  const ul = $('sumList'); ul.innerHTML = '';
  const entries = Object.entries(groups).sort((a, b) => b[1].severe - a[1].severe || b[1].n - a[1].n);
  if (!entries.length) ul.innerHTML = '<li class="empty">אין עבירות. כל הכבוד!</li>';
  for (const [text, g] of entries) {
    const li = document.createElement('li'); li.className = g.severe ? 'severe' : 'minor';
    li.innerHTML = `<span class="what"></span><span class="pts">×${g.n}</span>`;
    li.querySelector('.what').textContent = text; ul.appendChild(li);
  }
  $('summary').hidden = false;
}

// ===== תצוגת לוח מחוונים =====
const limitCanvas = $('limitSign');
const lctx = limitCanvas.getContext('2d');
let lastLimit = null;
function drawLimit(val) {
  if (val === lastLimit) return;
  lastLimit = val;
  const s = limitCanvas.width = limitCanvas.height = 64 * DPR;
  lctx.setTransform(s / 4, 0, 0, s / 4, s / 2, s / 2);
  drawSignGlyph(lctx, 'speed', val, 1.85);
}

function upcoming() {
  const loc = Rules.loc;
  if (!loc || loc.kind !== 'edge') return null;
  const e = loc.edge;
  const hd = Math.cos(player.h) * e.d.x + Math.sin(player.h) * e.d.y;
  if (Math.abs(hd) < 0.5) return null;
  const dir = hd > 0 ? 1 : -1;
  const node = toNodeOf(e, dir);
  const dist = dir > 0 ? e.t1 - loc.t : loc.t - e.t0;
  const ctrl = control(node, e);
  let text = null, state = null;
  if (ctrl === 'light') {
    const st = lightState(node, axisOf(e), time);
    state = st;
    text = 'רמזור · ' + { red: 'אדום', yellow: 'צהוב', green: 'ירוק', redyellow: 'אדום-צהוב' }[st];
  } else if (ctrl === 'stop') text = node.type === 'allstop' ? 'צומת "עצור" מכל הכיוונים' : 'תמרור "עצור": עצירה מוחלטת';
  else if (ctrl === 'yield') text = 'תן זכות קדימה';
  else if (ctrl === 'roundabout') text = 'כיכר: תן זכות קדימה לבאים מתוכה';
  else if (node.edges.length >= 3) text = 'צומת: אתה בדרך הראשית';
  else text = 'עיקול';
  for (const cw of e.crosswalks) {
    const d = dir > 0 ? cw.t - loc.t : loc.t - cw.t;
    if (d > 0 && d < dist && d < 60) return { text: 'מעבר חציה' + (pedOnRoad(cw) ? ': הולך רגל חוצה!' : ''), dist: d, state: pedOnRoad(cw) ? 'red' : null, street: e.name };
  }
  return { text, dist, state, street: e.name };
}

let hudT = 0, lastBlinkPhase = false;
function updateHUD(dt) {
  const kmh = Math.round(Math.abs(player.v) * 3.6);
  $('speed').textContent = kmh;
  $('gear').textContent = player.gear;
  const lim = Rules.lastLim;
  drawLimit(lim);
  $('speedBox').classList.toggle('over', kmh > lim + 3);
  const blinkPhase = (time % 0.8) < 0.45;
  $('blinkL').classList.toggle('on', player.blinker === -1 && blinkPhase);
  $('blinkR').classList.toggle('on', player.blinker === 1 && blinkPhase);
  if (player.blinker && blinkPhase !== lastBlinkPhase && !paused) tick(blinkPhase);
  lastBlinkPhase = blinkPhase;
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  $('score').textContent = Rules.score;
  $('scoreBox').classList.toggle('failed', Rules.failed);
  const up = upcoming();
  if (up) {
    $('nextText').textContent = up.text;
    $('nextDist').textContent = up.dist < 400 ? `${Math.max(0, Math.round(up.dist))} מ'` : '';
    $('nextBox').dataset.state = up.state || '';
    $('street').textContent = up.street;
  }
  const plan = apPlanText();
  $('plan').hidden = !plan;
  if (plan) { $('plan').textContent = plan; $('plan').classList.toggle('warn', plan === assist.hint); }
  const ins = $('instr');
  if (Rules.instr) { ins.hidden = false; $('instrText').textContent = Rules.instr.text; }
  else ins.hidden = true;
}

// ===== לולאה =====
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    const steps = 2, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      time += h;
      updatePlayer(h);
      const vehicles = [player, ...npcs, ...parkedList];
      for (const n of npcs) n.update(h, time, vehicles);
      updatePeds(h, player);
      Rules.update(h, time, player, vehicles);
    }
  }
  if (cam.mode === 'driver' || cam.mode === 'follow') {
    View3D.render(dt, time, npcs, cam.mode, cam.mode === 'driver' ? mirrorRect() : null);
  } else {
    updateCamera(dt, W, H);
    renderWorld(ctx, W, H, time, npcs);
  }
  mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  renderMinimap(mctx, mini.clientWidth, mini.clientHeight, npcs);
  updateHUD(dt);
  requestAnimationFrame(frame);
}
// ===== מסך תוספים =====
function openPlugins() { paused = true; $('evalNote').hidden = Plugins.evalOK; renderPluginList(); $('plugins').hidden = false; }
function closePlugins() { $('plugins').hidden = true; if ($('help').hidden && $('summary').hidden && $('maps').hidden) paused = false; }

function fixRequest(pl) {
  return 'התוסף שכתבת נכשל בשגיאה הבאה:\n' + pl.error + '\n\nתקן את השגיאה והחזר את התוסף המלא, באותו פורמט (בלוק javascript אחד עם // @name ו-// @description). זה הקוד הנוכחי:\n```javascript\n' + pl.code + '\n```';
}

function renderPluginList() {
  const box = $('pluginList'); box.innerHTML = '';
  for (const pl of Plugins.list) {
    const el = document.createElement('div');
    el.className = 'mapcard' + (pl.enabled ? '' : ' off');
    const rules = pl.rules.map(r => r.name || r.id).join(' · ');
    el.innerHTML = '<div class="mapinfo"><strong></strong><span class="desc"></span><span class="meta"></span><span class="err"></span></div><div class="mapbtns"></div>';
    el.querySelector('strong').textContent = pl.name;
    el.querySelector('.desc').textContent = pl.description;
    el.querySelector('.meta').textContent = (pl.rules.length ? `${pl.rules.length} חוקים: ${rules}` : '') + (pl.builtin ? ' · מובנה' : ' · שמור אצלך');
    el.querySelector('.err').textContent = pl.error ? 'שגיאה: ' + pl.error : '';
    const btns = el.querySelector('.mapbtns');
    const mk = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', () => fn(b)); btns.appendChild(b); return b; };
    mk(pl.enabled ? 'פעיל' : 'כבוי', () => { pl.enabled = !pl.enabled; storePlugins(); renderPluginList(); }, pl.enabled ? 'primary' : '');
    if (pl.error && Plugins.evalOK) mk('העתק בקשת תיקון ל-Gemini', b => copyText(fixRequest(pl), b));
    mk('העתק קוד', b => copyText(pl.code, b));
    if (!pl.builtin) mk('מחק', b => {
      if (b.dataset.armed) { Plugins.list.splice(Plugins.list.indexOf(pl), 1); storePlugins(); renderPluginList(); }
      else { b.dataset.armed = '1'; b.textContent = 'בטוח? לחץ שוב'; }
    });
    box.appendChild(el);
  }
}

function addPluginText(text) {
  const code = extractCode(text);
  const box = $('pluginMsg'); box.innerHTML = '';
  const msg = (t, cls) => { const p = document.createElement('p'); p.className = 'msgtitle ' + cls; p.textContent = t; box.appendChild(p); };
  if (!code) { msg('התיבה ריקה. הדבק את התשובה של Gemini.', 'bad'); return; }
  const pl = compilePlugin(code);
  if (pl.error) {
    msg('התוסף לא נוסף: ' + pl.error, 'bad');
    if (Plugins.evalOK) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'העתק בקשת תיקון ל-Gemini';
      b.addEventListener('click', () => copyText(fixRequest(pl), b)); box.appendChild(b);
    }
    return;
  }
  const old = Plugins.list.findIndex(x => !x.builtin && x.name === pl.name);
  if (old >= 0) { pl.key = Plugins.list[old].key; Plugins.list[old] = pl; } else Plugins.list.push(pl);
  const saved = storePlugins();
  renderPluginList();
  msg(`התוסף "${pl.name}" נוסף עם ${pl.rules.length} חוקים${saved ? ' ונשמר' : ''}${old >= 0 ? ' (החליף גרסה קודמת)' : ''}. הבוחן יבדוק אותם מעכשיו.`, 'good');
  $('pluginInput').value = '';
}

$('btnPlugins').addEventListener('click', openPlugins);
$('btnClosePlugins').addEventListener('click', closePlugins);
$('btnAddPlugin').addEventListener('click', () => addPluginText($('pluginInput').value));
$('btnCopyPluginPrompt').addEventListener('click', e => copyText(PLUGIN_PROMPT, e.currentTarget));
$('pluginFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => addPluginText(rd.result);
  rd.readAsText(f);
  e.target.value = '';
});

initPlugins();
loadMap(BUILTIN_MAPS[0]);
(() => { let m = null; try { m = localStorage.getItem('driving-practice.cam'); } catch (e) { /* לא חובה */ } setCamera(CAM_LABEL[m] ? m : 'driver'); })();
requestAnimationFrame(frame);
