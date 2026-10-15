'use strict';
// ===== שיעורים מודרכים של המורה הווירטואלי =====
// כל שיעור: מפה, נקודת התחלה, הסבר קצר של המורה, רצף משימות לבוחן ומפתחות העבירות שבמוקד השיעור.
// סוגי משימות (steps):
//   { turn: 'left' | 'right' | 'straight' }  פנייה בצומת הבא שבו הכיוון קיים
//   { rb: 1..4 }                               יציאה מספר k בכיכר הבאה
//   { park: 'right' | 'left' }                 חניה במקום הפנוי הבא
//   { reverse: true }                          נסיעה לאחור לאורך המדרכה (מתוך חניה)
//   { unpark: true }                           יציאה מהחניה

const LESSONS = [
  {
    id: 'l1-start', title: 'יציאה לדרך ושמירה על ימין', map: 'מסלול טסט',
    start: { road: 'A-B', dir: 1, lane: 1, from: 30 },
    brief: [
      'נוסעים בנתיב הימני הפנוי. הנתיב השמאלי רק לעקיפה או לפנייה שמאלה.',
      'ברמזור: עוצרים לפני הקו באדום ובאדום-צהוב.',
      'בכיכר הדו-נתיבית ממשיכים ישר (יציאה שנייה): נכנסים מהנתיב הימני ונשארים בחיצוני.',
    ],
    steps: [{ turn: 'straight' }, { rb: 2 }],
    focus: ['keepright', 'speed', 'red', 'stopline', 'rbentry', 'rbsignal'],
  },
  {
    id: 'l2-right-light', title: 'פנייה ימינה ברמזור', map: 'מסלול טסט',
    start: { road: 'A-B', dir: 1, lane: 0, from: 40 },
    brief: [
      'אתה מתחיל בנתיב השמאלי. עבור לנתיב הימני עם איתות ימינה (C, ואז החץ →).',
      'מאותתים לפני הצומת, מאטים מתחת ל-30 קמ"ש ופונים מהנתיב הימני לנתיב הימני.',
      'ברמזור אדום עוצרים לפני הקו, וממשיכים רק בירוק.',
    ],
    steps: [{ turn: 'right' }],
    focus: ['signal', 'lanechg', 'fromlane', 'turnlane', 'turnfast', 'red', 'stopline'],
  },
  {
    id: 'l3-rb-straight', title: 'כיכר דו-נתיבית: ממשיכים ישר', map: 'מסלול טסט',
    start: { road: 'B-C', dir: 1, lane: 0, from: 30 },
    brief: [
      'ליציאה הראשונה או השנייה נכנסים מהנתיב הימני ונשארים בנתיב החיצוני של הכיכר.',
      'נותנים זכות קדימה לרכבים שכבר בתוך הכיכר.',
      'מאותתים ימינה רק אחרי שעוברים את היציאה הראשונה, ממש לפני היציאה שלך.',
    ],
    steps: [{ rb: 2 }],
    focus: ['rbentry', 'rbsignal', 'rbearly', 'yield', 'rbfast'],
  },
  {
    id: 'l4-rb-uturn', title: 'כיכר דו-נתיבית: פרסה מהנתיב הפנימי', map: 'מסלול טסט',
    start: { road: 'B-C', dir: 1, lane: 1, from: 30 },
    brief: [
      'ליציאה השלישית ומעלה (שמאלה או פרסה) נכנסים מהנתיב השמאלי ונוסעים בנתיב הפנימי. עבור לנתיב השמאלי לפני הכיכר (Z ואז ←).',
      'לפני היציאה: מאותתים ימינה (C), עוברים לנתיב החיצוני בזהירות (→), והרכב יוצא ביציאה הבאה כל עוד האיתות דולק.',
      'אסור לחתוך רכב שנוסע בנתיב החיצוני.',
    ],
    steps: [{ rb: 3 }],
    focus: ['rbentry', 'rblane', 'rbcut', 'rbsignal', 'rbearly', 'lanechg'],
  },
  {
    id: 'l5-double-rb', title: 'שתי כיכרות צמודות', map: 'מסלול טסט',
    start: { road: 'E-F', dir: 1, lane: 0, from: 25 },
    brief: [
      'ביציאה מרחוב הרימון יש תמרור "עצור": עוצרים עצירה מוחלטת לפני הקו.',
      'בכיכר הראשונה ממשיכים ישר, ומיד אחריה מגיעה כיכר נוספת.',
      'בכיכר השנייה היציאה הראשונה היא רחוב חד-סטרי עם "אין כניסה". סופרים יציאות ויוצאים בשנייה.',
    ],
    steps: [{ rb: 2 }, { rb: 2 }],
    focus: ['stop', 'yield', 'rbsignal', 'rbearly', 'noentry', 'rbfast'],
  },
  {
    id: 'l6-stop-ban', title: '"עצור" ותמרור איסור פנייה', map: 'מסלול טסט',
    start: { road: 'H-I', dir: 1, lane: 1, from: 40 },
    brief: [
      'בסוף השדרה יש תמרור "עצור" ותמרור "אסור לפנות שמאלה".',
      'עוצרים עצירה מוחלטת לפני הקו, נותנים זכות קדימה לתנועה בדרך הראשית, ופונים ימינה.',
      'מאותתים ימינה לפני הצומת.',
    ],
    steps: [{ turn: 'right' }],
    focus: ['stop', 'stopline', 'yield', 'ban', 'signal'],
  },
  {
    id: 'l7-left-multi', title: 'פנייה שמאלה מכביש עם שני נתיבים', map: 'מסלול טסט',
    start: { road: 'C-H', dir: 1, lane: 1, from: 30 },
    brief: [
      'פונים שמאלה מהנתיב השמאלי: מאותתים שמאלה (Z), בודקים ועוברים נתיב (←).',
      'הפונה שמאלה נותן זכות קדימה לבאים ממול.',
      'אחרי הפנייה נכנסים לנתיב השמאלי, וכשאפשר חוזרים ימינה.',
    ],
    steps: [{ turn: 'left' }],
    focus: ['fromlane', 'turnlane', 'signal', 'lanechg', 'red', 'turnfast'],
  },
  {
    id: 'l8-park-right', title: 'חניה בצד ימין ויציאה מחניה', map: 'מסלול טסט',
    start: { road: 'A-B', dir: 1, lane: 1, from: 20 },
    brief: [
      'כשהבוחן אומר "עצור בבטחה בצד הדרך": מאותתים ימינה (C), מאטים מתחת ל-30 ולוחצים N.',
      'שים לב לאבני השפה: אדום-לבן אסור (12 מטר מצומת ולפני מעבר חציה), כחול-לבן מותר.',
      'ביציאה מהחניה: מאותתים שמאלה, מוודאים שאין רכב שמתקרב, ורק אז לוחצים גז.',
    ],
    steps: [{ park: 'right' }, { unpark: true }],
    focus: ['parksig', 'parkspot', 'unparksig', 'unparkyield'],
  },
  {
    id: 'l9-park-left', title: 'חניה בצד שמאל ונסיעה לאחור', map: 'מסלול טסט',
    start: { road: 'N-G', dir: 1, lane: 0, from: 15 },
    brief: [
      'ברחוב חד-סטרי מותר לחנות גם בצד שמאל. מאותתים שמאלה (Z) ולוחצים B.',
      'נסיעה לאחור לאורך המדרכה: עוברים להילוך R (מקש M), נוסעים לאט עם ↓ לפחות 6 מטר ועוצרים. בסוף חוזרים ל-D.',
      'יציאה מחניה בצד שמאל: מאותתים ימינה.',
    ],
    steps: [{ park: 'left' }, { reverse: true }, { unpark: true }],
    focus: ['parksig', 'parkspot', 'unparksig', 'unparkyield', 'crash'],
  },
  {
    id: 'l10-school', title: 'אזור בית ספר, פסי האטה והולכי רגל', map: 'מסלול טסט',
    start: { road: 'F-K', dir: 1, lane: 0, from: 10 },
    brief: [
      'מהירות 30. לפני מעברי חציה מאטים, ועוצרים להולך רגל שחוצה או שעומד לחצות.',
      'עוברים את פס ההאטה לאט (פחות מ-25 קמ"ש).',
      'בסוף הרחוב: "תן זכות קדימה" מימין לרחוב, ופונים שמאלה.',
    ],
    steps: [{ turn: 'left' }],
    focus: ['ped', 'pedwait', 'bump', 'speed', 'stopcross', 'signal'],
  },
  {
    id: 'l11-fast-road', title: 'מכביש מחולק לכיכר דו-נתיבית', map: 'כביש בין-עירוני',
    start: { road: 'D-F', dir: 1, lane: 1, from: 60 },
    brief: [
      'בכביש מחולק מותר 90 קמ"ש. מאטים בזמן לפני הכיכר.',
      'פנייה שמאלה בכיכר (יציאה שלישית): נכנסים מהנתיב השמאלי ונוסעים בפנימי.',
      'כניסה לכיכר מעל 30 קמ"ש היא עבירה.',
    ],
    steps: [{ rb: 3 }],
    focus: ['speed', 'rbfast', 'rbentry', 'rbsignal', 'rbcut', 'keepright'],
  },
];

// ===== התקדמות בשיעורים (נשמרת בדפדפן) =====
const LESSON_STORE = 'driving-practice.lessons';
function lessonProgress() { try { return JSON.parse(localStorage.getItem(LESSON_STORE) || '{}') || {}; } catch (e) { return {}; } }
function saveLessonResult(id, res) {
  const all = lessonProgress();
  const prev = all[id];
  all[id] = { tries: (prev ? prev.tries : 0) + 1, best: Math.max(prev ? prev.best : 0, res.score), passed: (prev && prev.passed) || res.passed, last: res.score };
  try { localStorage.setItem(LESSON_STORE, JSON.stringify(all)); } catch (e) { /* לא חובה */ }
}

// ===== מסכים =====
let activeLesson = null;

function openLessons() { paused = true; renderLessonList(); $('lessons').hidden = false; $('lessonBrief').hidden = true; $('lessonList').hidden = false; }
function closeLessons() { $('lessons').hidden = true; resumeIfIdle(); }

function renderLessonList() {
  const box = $('lessonListItems'); box.innerHTML = '';
  const prog = lessonProgress();
  LESSONS.forEach((L, i) => {
    const p = prog[L.id];
    const el = document.createElement('button'); el.type = 'button'; el.className = 'lesson' + (p && p.passed ? ' passed' : '');
    el.innerHTML = '<span class="num"></span><span class="info"><strong></strong><small></small></span><span class="state"></span>';
    el.querySelector('.num').textContent = i + 1;
    el.querySelector('strong').textContent = L.title;
    el.querySelector('small').textContent = L.brief[0];
    el.querySelector('.state').textContent = p ? (p.passed ? `✓ ${p.best}` : `${p.best}`) : '';
    el.addEventListener('click', () => showLessonBrief(L));
    box.appendChild(el);
  });
  const done = LESSONS.filter(L => prog[L.id] && prog[L.id].passed).length;
  $('lessonCount').textContent = `השלמת ${done} מתוך ${LESSONS.length} שיעורים`;
}

function showLessonBrief(L) {
  $('lessonList').hidden = true; $('lessonBrief').hidden = false;
  $('lessonTitle').textContent = L.title;
  const ul = $('lessonPoints'); ul.innerHTML = '';
  for (const t of L.brief) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
  const rules = $('lessonRules'); rules.innerHTML = '';
  const seen = new Set();
  for (const k of L.focus) {
    const r = ruleForKey(k);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = r.title;
    b.addEventListener('click', () => { closeLessons(); openBook(r.id); });
    rules.appendChild(b);
  }
  $('btnLessonGo').onclick = () => startLesson(L);
}

function startLesson(L) {
  const map = BUILTIN_MAPS.find(m => m.name === L.map) || BUILTIN_MAPS[0];
  loadMap(validateMap(map).map);
  const e = edgeById[L.start.road];
  if (e) {
    if (!assist.on) toggleSteer();
    const t = L.start.dir > 0 ? e.t0 + L.start.from : e.t1 - L.start.from;
    apStartEdge(e, L.start.dir, L.start.lane, t);
    apPlace(Math.atan2(e.d.y * L.start.dir, e.d.x * L.start.dir), true);
    player.v = 0; player.gear = 'D'; player.blinker = 0;
    cam.x = player.x; cam.y = player.y; cam.rot = -Math.PI / 2 - player.h;
  }
  Rules.reset(); Rules.lastLim = e ? e.lim : 50;
  Rules.lesson = { def: L, i: 0, results: [], startTime: time, doneAt: null };
  activeLesson = L;
  $('lessons').hidden = true;
  $('lessonBar').hidden = false;
  updateLessonBar();
  paused = false;
  Voice.say('ready');
}

function updateLessonBar() {
  const ls = Rules.lesson;
  if (!ls) { $('lessonBar').hidden = true; return; }
  $('lessonBarTitle').textContent = ls.def.title;
  $('lessonBarStep').textContent = `משימה ${Math.min(ls.i + 1, ls.def.steps.length)} מתוך ${ls.def.steps.length}`;
}

function finishLesson() {
  const ls = Rules.lesson;
  if (!ls) return;
  Rules.lesson = null;
  activeLesson = null;
  $('lessonBar').hidden = true;
  paused = true;
  const log = Rules.log.filter(x => x.time >= ls.startTime);
  const focusHits = log.filter(x => ls.def.focus.includes(x.key));
  const severe = log.filter(x => x.severe);
  const stepsOk = ls.results.filter(Boolean).length;
  const score = Math.max(0, 100 - log.reduce((s, x) => s + x.pts, 0) - (ls.def.steps.length - stepsOk) * 10);
  const passed = !severe.length && !focusHits.length && stepsOk === ls.def.steps.length;
  saveLessonResult(ls.def.id, { score, passed });
  addHistory({ type: 'lesson', name: ls.def.title, score, passed, keys: countKeys(log) });
  Voice.say(passed ? 'good' : 'warn_lane');
  $('lessonResScore').textContent = score;
  $('lessonResVerdict').textContent = passed ? 'עברת את השיעור!' : 'כדאי לנסות שוב';
  $('lessonResVerdict').className = 'verdict ' + (passed ? 'good' : 'bad');
  $('lessonResMeta').textContent = `משימות שבוצעו נכון: ${stepsOk} מתוך ${ls.def.steps.length} · עבירות: ${log.length}`;
  const ul = $('lessonResList'); ul.innerHTML = '';
  if (!log.length) ul.innerHTML = '<li class="empty">בלי עבירות. מצוין!</li>';
  for (const it of log) {
    const li = document.createElement('li'); li.className = it.severe ? 'severe' : 'minor';
    const r = ruleForKey(it.key);
    li.innerHTML = '<span class="what"></span><span class="pts"></span>';
    li.querySelector('.what').textContent = it.text + (r ? ' · המורה: ' + r.text : '');
    li.querySelector('.pts').textContent = '−' + it.pts;
    ul.appendChild(li);
  }
  const idx = LESSONS.indexOf(ls.def);
  $('btnLessonRetry').onclick = () => { $('lessonResult').hidden = true; startLesson(ls.def); };
  $('btnLessonNext').hidden = idx >= LESSONS.length - 1;
  $('btnLessonNext').onclick = () => { $('lessonResult').hidden = true; openLessons(); showLessonBrief(LESSONS[idx + 1]); };
  $('lessonResult').hidden = false;
}

$('btnLessons').addEventListener('click', openLessons);
$('btnCloseLessons').addEventListener('click', closeLessons);
$('btnLessonBack').addEventListener('click', () => { $('lessonBrief').hidden = true; $('lessonList').hidden = false; renderLessonList(); });
$('btnLessonQuit').addEventListener('click', () => { Rules.lesson = null; activeLesson = null; $('lessonBar').hidden = true; });
$('btnLessonResClose').addEventListener('click', () => { $('lessonResult').hidden = true; resumeIfIdle(); });
Rules.onLessonDone = () => finishLesson();
Rules.onLessonStep = () => updateLessonBar();
