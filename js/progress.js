'use strict';
// ===== ההתקדמות שלי: היסטוריה, נושאים חלשים והמלצות =====
// נשמר בדפדפן בלבד (localStorage). רשומה: { type: 'test'|'lesson'|'quiz', date, name, score, passed, keys: {key: n}, cats: {cat: [נכון, סה"כ]} }

const HISTORY_KEY = 'driving-practice.history';
function loadHistory() { try { const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function addHistory(rec) {
  const h = loadHistory();
  h.push(Object.assign({ date: Date.now() }, rec));
  while (h.length > 300) h.shift();
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* לא חובה */ }
}
function countKeys(log) { const k = {}; for (const it of log) if (it.key) k[it.key] = (k[it.key] || 0) + 1; return k; }

function recordTest() {
  if (Rules.recorded || !Rules.log) return;
  const minutes = time / 60;
  if (minutes < 0.5 && !Rules.log.length) return;   // נסיעה קצרה מדי
  Rules.recorded = true;
  addHistory({ type: 'test', name: currentMap ? currentMap.name : '', score: Rules.score, passed: !Rules.failed && Rules.score >= 85, keys: countKeys(Rules.log), minutes: Math.round(minutes * 10) / 10 });
}

// ===== מסך =====
function openProgress() { paused = true; renderProgress(); $('progress').hidden = false; }
function closeProgress() { $('progress').hidden = true; resumeIfIdle(); }

function renderProgress() {
  const h = loadHistory();
  const tests = h.filter(r => r.type === 'test');
  const lessons = h.filter(r => r.type === 'lesson');
  const quizzes = h.filter(r => r.type === 'quiz');
  const last5 = tests.slice(-5);
  const avg = last5.length ? Math.round(last5.reduce((s, r) => s + r.score, 0) / last5.length) : null;
  // תשובות נכונות בתיאוריה (30 הימים האחרונים)
  const recentQ = quizzes.filter(r => Date.now() - r.date < 30 * 864e5);
  const qTot = recentQ.reduce((s, r) => s + r.total, 0), qOk = recentQ.reduce((s, r) => s + r.right, 0);
  const qPct = qTot ? Math.round(qOk / qTot * 100) : null;

  $('pTests').textContent = tests.length;
  $('pAvg').textContent = avg == null ? '—' : avg;
  $('pLessons').textContent = `${new Set(lessons.filter(r => r.passed).map(r => r.name)).size}/${LESSONS.length}`;
  $('pTheory').textContent = qPct == null ? '—' : qPct + '%';

  // מוכנות לטסט
  const lastSevere = last5.some(r => !r.passed);
  let ready, cls;
  if (tests.length < 3) { ready = 'עוד מוקדם לדעת: סיים לפחות 3 מבחני נהיגה.'; cls = 'warn'; }
  else if (avg >= 90 && !lastSevere && (qPct == null || qPct >= 87)) { ready = 'נראה שאתה מוכן לטסט! ממוצע גבוה בלי כישלונות במבחנים האחרונים.'; cls = 'good'; }
  else if (avg >= 80) { ready = 'קרוב. תתרגל את הנושאים החלשים למטה.'; cls = 'warn'; }
  else { ready = 'עוד לא. כדאי לעבור על השיעורים ולתרגל את הנושאים החלשים.'; cls = 'bad'; }
  if (qPct != null && qPct < 87) ready += ` בתיאוריה: ${qPct}% תשובות נכונות (במבחן צריך 87%, כלומר 26 מתוך 30).`;
  $('pReady').textContent = ready;
  $('pReady').className = 'ready ' + cls;

  drawScoreChart(tests.slice(-12));

  // נושאים חלשים: עבירות מ-10 המבחנים והשיעורים האחרונים
  const recent = h.filter(r => r.type !== 'quiz').slice(-10);
  const agg = {};
  for (const r of recent) for (const k in (r.keys || {})) agg[k] = (agg[k] || 0) + r.keys[k];
  const weak = Object.entries(agg).filter(([k]) => ruleForKey(k)).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const box = $('pWeak'); box.innerHTML = '';
  if (!weak.length) box.innerHTML = '<p class="empty">עוד אין מספיק נתונים. סע כמה מבחנים או שיעורים, והנושאים שצריך לחזק יופיעו כאן.</p>';
  for (const [k, n] of weak) {
    const rule = ruleForKey(k);
    const lesson = LESSONS.find(L => L.focus.includes(k));
    const el = document.createElement('div'); el.className = 'weak';
    el.innerHTML = '<div class="winfo"><strong></strong><span></span></div><div class="mapbtns"></div>';
    el.querySelector('strong').textContent = rule.title;
    el.querySelector('span').textContent = `${n} פעמים ב-${recent.length} הנסיעות האחרונות`;
    const btns = el.querySelector('.mapbtns');
    const mk = (label, fn, primary) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (primary) b.className = 'primary'; b.addEventListener('click', fn); btns.appendChild(b); };
    if (lesson) mk('תרגל בשיעור', () => { closeProgress(); openLessons(); showLessonBrief(lesson); }, true);
    mk('החוק', () => { closeProgress(); openBook(rule.id); });
    box.appendChild(el);
  }

  // תיאוריה לפי נושא
  const cats = {};
  for (const r of quizzes.slice(-20)) for (const c in (r.cats || {})) { cats[c] = cats[c] || [0, 0]; cats[c][0] += r.cats[c][0]; cats[c][1] += r.cats[c][1]; }
  const tbox = $('pTheoryCats'); tbox.innerHTML = '';
  const entries = Object.entries(cats);
  if (!entries.length) tbox.innerHTML = '<p class="empty">עוד לא עשית מבחן תיאוריה.</p>';
  for (const [c, [ok, tot]] of entries.sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])) {
    const pct = Math.round(ok / tot * 100);
    const el = document.createElement('div'); el.className = 'tcat';
    el.innerHTML = '<span class="tname"></span><span class="tbar"><span></span></span><span class="tpct"></span><button type="button">תרגל</button>';
    el.querySelector('.tname').textContent = c;
    el.querySelector('.tbar span').style.width = pct + '%';
    el.querySelector('.tbar span').className = pct >= 87 ? 'ok' : 'low';
    el.querySelector('.tpct').textContent = `${pct}% (${ok}/${tot})`;
    el.querySelector('button').addEventListener('click', () => { closeProgress(); openQuiz(); startQuiz('practice', c); });
    tbox.appendChild(el);
  }

  // היסטוריה אחרונה
  const list = $('pHistory'); list.innerHTML = '';
  for (const r of h.slice(-12).reverse()) {
    const li = document.createElement('li');
    const d = new Date(r.date);
    const label = { test: 'מבחן נהיגה', lesson: 'שיעור', quiz: 'תיאוריה' }[r.type];
    const val = r.type === 'quiz' ? `${r.right}/${r.total}` : r.score;
    li.innerHTML = '<span class="when"></span><span class="what"></span><span class="pts"></span>';
    li.querySelector('.when').textContent = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    li.querySelector('.what').textContent = `${label}: ${r.name || ''}`;
    li.querySelector('.pts').textContent = val + (r.passed ? ' ✓' : '');
    li.className = r.passed ? 'minor' : 'severe';
    list.appendChild(li);
  }
  if (!h.length) list.innerHTML = '<li class="empty">עוד אין היסטוריה.</li>';
}

// גרף עמודות של ציוני המבחנים האחרונים, עם קו של ציון מעבר (85)
function drawScoreChart(tests) {
  const box = $('pChart');
  if (!tests.length) { box.innerHTML = '<p class="empty">הגרף יופיע אחרי המבחן הראשון ("סיום מבחן").</p>'; return; }
  const W = 560, H = 190, padL = 30, padR = 8, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const n = tests.length, slot = iw / Math.max(n, 6), bw = Math.min(30, slot * 0.6);
  const y = v => padT + ih - (v / 100) * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ציוני המבחנים האחרונים" direction="ltr">`;
  for (const v of [0, 50, 100]) svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`;
  svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(85)}" y2="${y(85)}" class="pass"/><text x="${padL - 6}" y="${y(85) + 4}" class="axis passlbl" text-anchor="end">85</text>`;
  tests.forEach((r, i) => {
    const cx = padL + slot * (i + 0.5), top = y(r.score), h = Math.max(2, padT + ih - top);
    const d = new Date(r.date);
    svg += `<g class="bar${r.passed ? '' : ' fail'}"><title>${d.getDate()}/${d.getMonth() + 1} · ${r.name}: ${r.score}${r.passed ? ' (עבר)' : ''}</title>`;
    svg += `<path d="M${cx - bw / 2},${padT + ih} V${top + 4} Q${cx - bw / 2},${top} ${cx - bw / 2 + 4},${top} H${cx + bw / 2 - 4} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + 4} V${padT + ih} Z"/>`;
    svg += `<rect x="${cx - slot / 2}" y="${padT}" width="${slot}" height="${ih}" class="hit"/></g>`;
    if (i === n - 1) svg += `<text x="${cx}" y="${top - 6}" class="val" text-anchor="middle">${r.score}</text>`;
  });
  svg += `<line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" class="base"/>`;
  svg += '</svg>';
  box.innerHTML = svg + '<p class="legend"><span class="sw pass"></span>עבר <span class="sw fail"></span>לא עבר <span class="sw line"></span>ציון מעבר (85) · ישן משמאל, חדש מימין</p>';
}

$('btnProgress').addEventListener('click', openProgress);
$('btnCloseProgress').addEventListener('click', closeProgress);
$('btnClearHistory').addEventListener('click', e => {
  const b = e.currentTarget;
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'בטוח? לחץ שוב למחיקה'; return; }
  try { localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(LESSON_STORE); } catch (err) { /* לא חובה */ }
  b.dataset.armed = ''; b.textContent = 'מחק היסטוריה';
  renderProgress();
});
