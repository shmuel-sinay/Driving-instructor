'use strict';
// ===== משוב והערות =====
// הקובץ פתוח מהמחשב ואין לו שרת, ולכן ההערות נשמרות ברשימה מקומית (localStorage).
// אפשר לשלוח כל הערה כ-Issue בגיטהוב (צריך חשבון גיטהוב), להעתיק אותה, או להוריד את כל הרשימה כקובץ ולהעלות אותו לסוכן.
const FEEDBACK_REPO = 'https://github.com/shmuel-sinay/Driving-instructor';
const FB_KEY = 'driving-practice.feedback';

function fbLoad() { try { return JSON.parse(localStorage.getItem(FB_KEY) || '[]'); } catch (e) { return []; } }
function fbStore(list) { try { localStorage.setItem(FB_KEY, JSON.stringify(list)); } catch (e) { /* לא חובה */ } }

// פרטים על הנסיעה הנוכחית, כדי שיהיה אפשר לשחזר את הבעיה
function fbContext() {
  const map = currentMap && currentMap.name ? currentMap.name : '';
  const last = Rules.log.slice(0, 5).map(l => '- ' + l.text).join('\n');
  return `מפה: ${map}\nמצלמה: ${cam.mode}\nציון: ${Rules.score}\nהיגוי: ${assist.on ? 'נהיגה מסייעת' : 'ידני'}\nמסך: ${innerWidth}x${innerHeight}\n` + (last ? `עבירות אחרונות:\n${last}\n` : '');
}
function fbCurrent() {
  const text = $('fbText').value.trim();
  if (!text) return null;
  return { kind: $('fbKind').value, text, info: $('fbInfo').checked ? fbContext() : '', at: new Date().toLocaleString('he-IL') };
}
function fbFormat(f) { return `[${f.kind}] ${f.at}\n${f.text}` + (f.info ? `\n\n${f.info}` : ''); }

function fbRender() {
  const list = fbLoad();
  $('fbCount').textContent = list.length;
  const ul = $('fbList'); ul.innerHTML = '';
  for (const f of list.slice().reverse()) { const li = document.createElement('li'); li.textContent = `[${f.kind}] ${f.text}`; ul.appendChild(li); }
}
function fbSaveCurrent() {
  const f = fbCurrent();
  if (!f) { $('fbText').focus(); return null; }
  const list = fbLoad(); list.push(f); fbStore(list);
  $('fbText').value = ''; fbRender();
  return f;
}
function openFeedback() { paused = true; fbRender(); $('feedback').hidden = false; setTimeout(() => $('fbText').focus(), 50); }
function closeFeedback() { $('feedback').hidden = true; resumeIfIdle(); }

$('btnFeedback').addEventListener('click', () => { const m = $('mainMenu'); if (m) m.open = false; openFeedback(); });
$('fbClose').addEventListener('click', closeFeedback);
$('fbSave').addEventListener('click', fbSaveCurrent);
$('fbGithub').addEventListener('click', () => {
  const f = fbSaveCurrent();
  if (!f) return;
  const title = `[${f.kind}] ${f.text.split('\n')[0].slice(0, 70)}`;
  const body = fbFormat(f) + '\n\n---\nנשלח מתוך "מגרש תרגול נהיגה"';
  window.open(`${FEEDBACK_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent('משוב')}`, '_blank');
});
$('fbCopy').addEventListener('click', () => {
  const f = fbCurrent() || fbLoad().slice(-1)[0];
  if (!f) return;
  const t = fbFormat(f);
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { $('fbCopy').textContent = 'הועתק!'; setTimeout(() => { $('fbCopy').textContent = 'העתק'; }, 1500); }, () => prompt('העתק את הטקסט:', t));
});
$('fbDownload').addEventListener('click', () => {
  const list = fbLoad();
  if (!list.length) return;
  const txt = '# משוב והערות על "מגרש תרגול נהיגה"\n\n' + list.map(fbFormat).join('\n\n---\n\n') + '\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  a.download = 'משוב-נהיגה.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('fbClear').addEventListener('click', () => { if (confirm('למחוק את כל ההערות ברשימה?')) { fbStore([]); fbRender(); } });
