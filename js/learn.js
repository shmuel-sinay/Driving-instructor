'use strict';
// ===== לימוד: ספר החוקים ומבחן התיאוריה =====

// ----- ספר החוקים -----
const Book = { cat: null, query: '', shown: 40 };

// סיווג כל שאלה במאגר הרשמי לנושא של ספר החוקים (לפי מילות מפתח)
const CASE_TOPICS = [
  ['מעגלי תנועה', /מעגל(?:י)? תנועה|כיכר/],
  ['הולכי רגל ורוכבי אופניים', /הולכ(?:י|ת)? רגל|מעבר(?:י)? ה?חצייה|אופניים|ילד/],
  ['עצירה וחניה', /חני(?:י)?ה|להחנות|להעמיד|העמדת|חונה/],
  ['פניות ונתיבי פנייה', /פנייה|לפנות|פונה|פניית|פרסה/],
  ['איתות והסתכלות', /איתות|לאותת|מחוון|מראה|מראות|שטח מת|הסתכלות|נסיעה לאחור/],
  ['אורות וראות', /אורות|פנס|ראות|ערפל|לילה|תאורה|לעמעם|עמעום|סנוור/],
  ['מצבי חירום', /תאונ|חירום|משולש|שול|גריר|החלק|נפגע|תקלה|מצוקה/],
  ['מהירות ושמירת מרחק', /מהירות|רווח|מרחק|קמ"ש|קמ״ש/],
  ['נתיבים, סטייה ועקיפה', /נתיב|עקיפ|עוקף|לעקוף|סטי(?:י)?ה|לסטות|קו הפרדה|קו קטעים/],
  ['רמזורים ותמרורים', /רמזור/],
  ['זכות קדימה וצמתים', /זכות ה?קדימה|צומת|"עצור"|״עצור״/],
];
function caseTopic(t) {
  if (t.cat === 'הכרת הרכב') return 'הכרת הרכב';
  const txt = t.q + ' ' + t.a[t.c];
  for (const [cat, re] of CASE_TOPICS) if (re.test(txt)) return cat;
  if (t.cat === 'תמרורים') return 'רמזורים ותמרורים';
  return 'חובות הנהג ובטיחות';
}
const CASES = THEORY.map(t => Object.assign({ topic: caseTopic(t) }, t));

function openBook(focusRuleId) {
  paused = true;
  $('book').hidden = false;
  if (focusRuleId) { Book.cat = null; Book.query = ''; $('bookSearch').value = ''; }
  renderBookCats();
  renderBook(focusRuleId);
}
function closeBook() { $('book').hidden = true; resumeIfIdle(); }

function renderBookCats() {
  const box = $('bookCats'); box.innerHTML = '';
  const mk = (label, cat) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.className = 'chip' + (Book.cat === cat ? ' on' : '');
    b.addEventListener('click', () => { Book.cat = cat; Book.shown = 40; renderBookCats(); renderBook(); });
    box.appendChild(b);
  };
  mk('הכל', null);
  for (const c of RULE_CATS) mk(`${c} (${RULEBOOK.filter(r => r.cat === c).length + CASES.filter(t => t.topic === c).length})`, c);
}

function renderBook(focusRuleId) {
  const list = $('bookList'); list.innerHTML = '';
  const q = Book.query.trim();
  const rules = RULEBOOK.filter(r => (!Book.cat || r.cat === Book.cat) && (!q || (r.title + ' ' + r.text).includes(q)));
  $('bookCount').textContent = `${rules.length} חוקים · ${CASES.filter(t => (!Book.cat || t.topic === Book.cat) && (!q || t.q.includes(q) || t.a.some(a => a.includes(q)))).length} מקרים רשמיים`;
  for (const r of rules) {
    const el = document.createElement('article');
    el.className = 'rule' + (r.id === focusRuleId ? ' focus' : '');
    el.id = 'rule-' + r.id;
    el.innerHTML = '<header><h3></h3><span class="tag"></span></header><p></p><div class="srcs"></div>';
    el.querySelector('h3').textContent = r.title;
    el.querySelector('.tag').textContent = r.src.length ? 'מאומת במאגר הרשמי' : 'לבדיקה: לא מופיע במאגר';
    el.querySelector('.tag').classList.toggle('warn', !r.src.length);
    el.querySelector('p').textContent = r.text;
    const srcs = el.querySelector('.srcs');
    for (const n of r.src) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'src'; b.textContent = 'שאלה ' + n;
      b.addEventListener('click', () => showSourceQuestion(n, b));
      srcs.appendChild(b);
    }
    list.appendChild(el);
  }
  // מקרים מהמאגר הרשמי בנושא הנבחר / שמתאימים לחיפוש
  const cases = CASES.filter(t => (!Book.cat || t.topic === Book.cat) && (!q || t.q.includes(q) || t.a.some(a => a.includes(q))));
  if (cases.length) {
    const h = document.createElement('h3'); h.className = 'bankhead';
    h.textContent = `מקרים ותשובות מהמאגר הרשמי: ${cases.length}`;
    list.appendChild(h);
    for (const t of cases.slice(0, Book.shown)) list.appendChild(questionCard(t));
    if (cases.length > Book.shown) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'more';
      more.textContent = `הצג עוד (${cases.length - Book.shown} נוספים)`;
      more.addEventListener('click', () => { Book.shown += 60; renderBook(); });
      list.appendChild(more);
    }
  }
  if (!list.children.length) list.innerHTML = '<p class="empty">לא נמצאו חוקים. נסה מילה אחרת.</p>';
  if (focusRuleId) { const f = $('rule-' + focusRuleId); if (f) f.scrollIntoView({ block: 'center' }); }
}

function questionCard(t) {
  const el = document.createElement('div'); el.className = 'qcard';
  el.innerHTML = '<p class="qq"></p><p class="qa"></p>';
  el.querySelector('.qq').textContent = `${t.n}. ${t.q}`;
  el.querySelector('.qa').textContent = '✓ ' + t.a[t.c];
  if (t.img) el.prepend(theoryImg(t));
  return el;
}
function showSourceQuestion(n, btn) {
  const t = THEORY.find(x => x.n === n);
  if (!t) return;
  const next = btn.parentElement.nextElementSibling;
  if (next && next.classList.contains('qcard') && next.dataset.n == n) { next.remove(); return; }
  const card = questionCard(t); card.dataset.n = n;
  btn.parentElement.after(card);
}

// תמונת שאלה: קודם מהפרויקט, אחר כך מ-GitHub, ולבסוף מהאתר המקורי
function theoryImg(t) {
  const img = document.createElement('img');
  img.alt = 'איור לשאלה ' + t.n; img.loading = 'lazy'; img.className = 'qimg';
  const sources = ['assets/theory/' + t.img, 'https://raw.githubusercontent.com/shmuel-sinay/Driving-instructor/main/assets/theory/' + t.img, THEORY_IMG_BASE + t.img];
  let i = 0;
  img.onerror = () => { i++; if (i < sources.length) img.src = sources[i]; else img.replaceWith(Object.assign(document.createElement('p'), { className: 'noimg', textContent: '(האיור לשאלה הזאת לא זמין כרגע)' })); };
  img.src = sources[0];
  return img;
}

// ----- מבחן תיאוריה -----
const Quiz = { list: [], i: 0, right: 0, wrong: [], mode: 'exam', answered: false };
const QUIZ_CATS = ['חוקי התנועה', 'תמרורים', 'בטיחות', 'הכרת הרכב'];

function openQuiz() { paused = true; $('quiz').hidden = false; showQuizStart(); }
function closeQuiz() { $('quiz').hidden = true; resumeIfIdle(); }

function showQuizStart() {
  $('quizStart').hidden = false; $('quizRun').hidden = true; $('quizEnd').hidden = true;
  const box = $('quizCats'); box.innerHTML = '';
  for (const c of QUIZ_CATS) {
    const n = THEORY.filter(t => t.cat === c).length;
    const b = document.createElement('button'); b.type = 'button'; b.textContent = `${c} (${n})`;
    b.addEventListener('click', () => startQuiz('practice', c));
    box.appendChild(b);
  }
  updateMistakesBtn();
  $('quizBest').textContent = (() => { try { const v = localStorage.getItem('driving-practice.quizBest'); return v ? `השיא שלך במבחן: ${v}/30` : ''; } catch (e) { return ''; } })();
}

// ===== מחברת טעויות: שאלות שטעית בהן נשמרות עד שעונים עליהן נכון =====
const MISTAKES_KEY = 'driving-practice.mistakes';
function loadMistakes() { try { return JSON.parse(localStorage.getItem(MISTAKES_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveMistakes(m) { try { localStorage.setItem(MISTAKES_KEY, JSON.stringify(m)); } catch (e) { /* לא חובה */ } }
function markMistake(n, wrong) {
  const m = loadMistakes();
  if (wrong) m[n] = (m[n] || 0) + 1; else delete m[n];
  saveMistakes(m);
}
function updateMistakesBtn() {
  const n = Object.keys(loadMistakes()).length;
  $('btnQuizMistakes').hidden = !n;
  $('btnQuizMistakes').textContent = `השאלות שטעיתי בהן (${n})`;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function startQuiz(mode, cat) {
  Quiz.mode = mode;
  let pool = cat ? THEORY.filter(t => t.cat === cat) : THEORY.slice();
  if (mode === 'exam') {
    // כמו במבחן האמיתי: 30 שאלות מכל הנושאים
    const by = c => shuffle(THEORY.filter(t => t.cat === c));
    pool = shuffle([].concat(by('חוקי התנועה').slice(0, 12), by('תמרורים').slice(0, 9), by('בטיחות').slice(0, 7), by('הכרת הרכב').slice(0, 2)));
  } else if (mode === 'mistakes') {
    const m = loadMistakes();
    // קודם השאלות שטעית בהן הכי הרבה פעמים
    pool = shuffle(THEORY.filter(t => m[t.n])).sort((a, b) => m[b.n] - m[a.n]).slice(0, 20);
  } else pool = shuffle(pool).slice(0, 20);
  if (!pool.length) { showQuizStart(); return; }
  Object.assign(Quiz, { list: pool, i: 0, right: 0, wrong: [], answered: false, cat, endsAt: mode === 'exam' ? Date.now() + 40 * 60000 : 0 });
  $('quizStart').hidden = true; $('quizEnd').hidden = true; $('quizRun').hidden = false;
  showQuestion();
}

function showQuestion() {
  const t = Quiz.list[Quiz.i];
  Quiz.answered = false;
  quizProgressText();
  $('quizQ').textContent = t.q;
  const imgBox = $('quizImg'); imgBox.innerHTML = '';
  if (t.img) imgBox.appendChild(theoryImg(t));
  const box = $('quizAnswers'); box.innerHTML = '';
  // ערבוב התשובות
  shuffle([0, 1, 2, 3]).forEach((k, idx) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ans';
    b.innerHTML = `<span class="num">${idx + 1}</span><span class="txt"></span>`;
    b.querySelector('.txt').textContent = t.a[k];
    b.dataset.k = k;
    b.addEventListener('click', () => answer(k, b));
    box.appendChild(b);
  });
  $('quizNext').hidden = true; $('quizFeedback').textContent = '';
}

// במבחן מלא יש 40 דקות, כמו במבחן האמיתי
function quizProgressText() {
  const t = Quiz.list[Quiz.i];
  let txt = `שאלה ${Quiz.i + 1} מתוך ${Quiz.list.length} · ${t.cat} · נכונות: ${Quiz.right}`;
  if (Quiz.endsAt) {
    const left = Math.max(0, Math.round((Quiz.endsAt - Date.now()) / 1000));
    txt += ` · זמן: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }
  $('quizProgress').textContent = txt;
}
setInterval(() => {
  if (!Quiz.endsAt || $('quizRun').hidden) return;
  quizProgressText();
  if (Date.now() >= Quiz.endsAt) {
    // נגמר הזמן: כל מה שלא נענה נחשב טעות
    Quiz.endsAt = 0;
    for (let i = Quiz.i + (Quiz.answered ? 1 : 0); i < Quiz.list.length; i++) Quiz.wrong.push({ t: Quiz.list[i], k: -1 });
    Quiz.i = Quiz.list.length - 1;
    nextQuestion();
    $('quizVerdict').textContent = 'נגמר הזמן! ' + $('quizVerdict').textContent;
  }
}, 1000);

function answer(k, btn) {
  if (Quiz.answered) return;
  Quiz.answered = true;
  const t = Quiz.list[Quiz.i];
  const ok = k === t.c;
  if (ok) Quiz.right++; else Quiz.wrong.push({ t, k });
  markMistake(t.n, !ok);
  for (const b of $('quizAnswers').children) {
    if (+b.dataset.k === t.c) b.classList.add('right');
    else if (b === btn) b.classList.add('wrong');
    b.disabled = true;
  }
  $('quizFeedback').textContent = ok ? 'נכון!' : 'לא נכון. התשובה הנכונה מסומנת בירוק.';
  $('quizFeedback').className = 'feedback ' + (ok ? 'good' : 'bad');
  $('quizNext').hidden = false;
  $('quizNext').textContent = Quiz.i + 1 < Quiz.list.length ? 'לשאלה הבאה' : 'לתוצאות';
  $('quizNext').focus();
}

function nextQuestion() {
  if (Quiz.i + 1 < Quiz.list.length) { Quiz.i++; showQuestion(); return; }
  $('quizRun').hidden = true; $('quizEnd').hidden = false;
  Quiz.endsAt = 0;
  const n = Quiz.list.length, r = Quiz.right;
  const pass = Quiz.mode === 'exam' ? r >= 26 : r / n >= 0.85;
  $('quizScore').textContent = `${r}/${n}`;
  $('quizVerdict').textContent = Quiz.mode === 'exam' ? (pass ? 'עברת! (צריך 26 תשובות נכונות מתוך 30)' : 'לא עברת. במבחן האמיתי צריך 26 תשובות נכונות מתוך 30.') : (pass ? 'מצוין!' : 'כדאי לתרגל עוד את הנושא הזה.');
  $('quizVerdict').className = 'verdict ' + (pass ? 'good' : 'bad');
  const cats = {};
  for (const t of Quiz.list) { cats[t.cat] = cats[t.cat] || [0, 0]; cats[t.cat][1]++; }
  for (const w of Quiz.wrong) cats[w.t.cat][0]--;
  for (const c in cats) cats[c][0] += cats[c][1];
  addHistory({ type: 'quiz', name: Quiz.mode === 'exam' ? 'מבחן מלא' : Quiz.mode === 'mistakes' ? 'מחברת טעויות' : (Quiz.cat || 'תרגול'), right: r, total: n, passed: pass, cats });
  if (Quiz.mode === 'exam') { try { const best = +localStorage.getItem('driving-practice.quizBest') || 0; if (r > best) localStorage.setItem('driving-practice.quizBest', r); } catch (e) { /* לא חובה */ } }
  const box = $('quizWrong'); box.innerHTML = '';
  if (Quiz.wrong.length) {
    const h = document.createElement('h3'); h.textContent = 'השאלות שטעית בהן'; box.appendChild(h);
    for (const w of Quiz.wrong) box.appendChild(questionCard(w.t));
  }
}

function resumeIfIdle() {
  const open = ['help', 'summary', 'maps', 'plugins', 'book', 'quiz', 'lessons', 'lessonResult', 'progress', 'feedback'].some(id => $(id) && !$(id).hidden);
  if (!open) paused = false;
}

$('btnBook').addEventListener('click', () => openBook());
$('btnCloseBook').addEventListener('click', closeBook);
$('bookSearch').addEventListener('input', e => { Book.query = e.target.value; Book.shown = 40; renderBook(); });
$('btnQuiz').addEventListener('click', openQuiz);
$('btnCloseQuiz').addEventListener('click', closeQuiz);
$('btnQuizExam').addEventListener('click', () => startQuiz('exam'));
$('btnQuizAll').addEventListener('click', () => startQuiz('practice'));
$('btnQuizMistakes').addEventListener('click', () => startQuiz('mistakes'));
$('quizNext').addEventListener('click', nextQuestion);
$('btnQuizAgain').addEventListener('click', showQuizStart);
window.addEventListener('keydown', e => {
  if ($('quiz').hidden || $('quizRun').hidden) return;
  if (/^Digit[1-4]$/.test(e.code) && !Quiz.answered) { const b = $('quizAnswers').children[+e.code.slice(5) - 1]; if (b) b.click(); }
  else if (e.code === 'Enter' && Quiz.answered) nextQuestion();
});
