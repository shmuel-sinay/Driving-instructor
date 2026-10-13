'use strict';
// ===== קול הבוחן =====
// כל משפט של הבוחן מוקלט מראש כקובץ assets/voice/<id>.mp3 (נוצר אוטומטית ב-GitHub Actions: .github/workflows/assets.yml).
// בקובץ היחיד (dist) הקבצים מוטמעים בתוך VOICE_DATA. אם אין הקלטה, משתמשים בדיבור של הדפדפן.
// כדי להוסיף משפט: מוסיפים שורה כאן ומריצים את הפעולה "Generate assets" ב-GitHub.

const VOICE_LINES = {
  // פתיחה
  start: 'שלום, המבחן מתחיל. סע ישר אלא אם תקבל ממני הוראה אחרת.',
  ready: 'צא לדרך בבטחה כשתהיה מוכן.',
  straight_on: 'המשך בנסיעה ישרה בהתאם לתנאי הדרך.',
  // צמתים ופניות
  junc_right: 'בצומת הקרוב, פנה ימינה.',
  junc_left: 'בצומת הקרוב, פנה שמאלה.',
  junc_straight: 'בצומת הקרוב, המשך ישר.',
  light_right: 'ברמזור הבא, פנה ימינה.',
  light_left: 'ברמזור הבא, פנה שמאלה.',
  light_straight: 'ברמזור הבא, המשך ישר.',
  t_right: 'בצומת ה-T, פנה ימינה.',
  t_left: 'בצומת ה-T, פנה שמאלה.',
  // מעגלי תנועה (מספר יציאה × כיוון)
  rb_1_right: 'במעגל התנועה הקרוב, פנה ימינה (יציאה ראשונה).',
  rb_1_straight: 'במעגל התנועה, המשך ישר (יציאה ראשונה).',
  rb_1_left: 'במעגל התנועה, פנה שמאלה (יציאה ראשונה).',
  rb_2_right: 'במעגל התנועה, פנה ימינה (יציאה שנייה).',
  rb_2_straight: 'במעגל התנועה, המשך ישר (יציאה שנייה).',
  rb_2_left: 'במעגל התנועה, פנה שמאלה (יציאה שנייה).',
  rb_3_straight: 'במעגל התנועה, המשך ישר (יציאה שלישית).',
  rb_3_left: 'במעגל התנועה, פנה שמאלה (יציאה שלישית).',
  rb_3_uturn: 'במעגל התנועה, בצע פניית פרסה (יציאה שלישית).',
  rb_4_left: 'במעגל התנועה, פנה שמאלה (יציאה רביעית).',
  rb_4_uturn: 'במעגל התנועה, בצע פניית פרסה (יציאה רביעית).',
  rb_5_uturn: 'במעגל התנועה, בצע פניית פרסה (יציאה חמישית).',
  // נתיבים והשתלבות
  lane_left_turn: 'השתלב בנתיב השמאלי לקראת פנייה.',
  lane_right_turn: 'השתלב בנתיב הימני לקראת פנייה.',
  back_right: 'חזור לנתיב הימני כשמתאפשר לך.',
  merge_fast: 'השתלב בתנועה בדרך המהירה.',
  left_from_leftmost: 'פנה שמאלה מנתיב הפנייה השמאלי ביותר.',
  left_from_rightmost: 'פנה שמאלה מנתיב הפנייה הימני ביותר.',
  // חניות ומשימות
  park_parallel: 'בצע חניה מקבילה (בנסיעה לאחור) בין שני הרכבים שמצד ימין.',
  park_perp_right: 'בצע חניה בניצב (ב-90 מעלות) במקום הפנוי בחניון מצד ימין.',
  park_perp_left: 'בצע חניה בניצב (ב-90 מעלות) במקום הפנוי בחניון מצד שמאל.',
  stop_side: 'עצור בבטחה בצד הדרך.',
  park_left: 'חנה בצד שמאל במקום הפנוי הבא.',
  reverse_line: 'בצע נסיעה לאחור בקו ישר לאורך המדרכה.',
  uturn_next: 'במקום המותר הבא, בצע פניית פרסה.',
  shoulder: 'רד לשוליים בבטחה ועצור.',
  // סיום
  park_free: 'חנה את הרכב במקום הפנוי.',
  end_full: 'העבר להילוך חניה (P), הרם בלם יד ודומם מנוע. המבחן הסתיים.',
  end_here: 'אנא עצור כאן, המבחן הסתיים.',
  // הערות של הבוחן
  good: 'יפה מאוד.',
  warn_speed: 'שים לב למהירות.',
  warn_signal: 'לא איתתת.',
  warn_ped: 'שים לב להולך הרגל!',
  warn_red: 'נסעת באור אדום.',
  warn_stop: 'לא עצרת עצירה מוחלטת.',
  warn_yield: 'לא נתת זכות קדימה.',
  warn_lane: 'שים לב לבחירת הנתיב.',
};
const VOICE_BY_TEXT = Object.fromEntries(Object.entries(VOICE_LINES).map(([k, v]) => [v, k]));
// בקובץ היחיד הבנייה מחליפה את זה במפה של קבצי קול מוטמעים
const VOICE_DATA = typeof VOICE_DATA_EMBED !== 'undefined' ? VOICE_DATA_EMBED : null;

const Voice = {
  on: true, heVoice: null, audio: null, missing: new Set(),
  init() {
    if (window.speechSynthesis) {
      const pick = () => { const vs = speechSynthesis.getVoices(); this.heVoice = vs.find(v => /^he|^iw/i.test(v.lang)) || null; };
      pick(); speechSynthesis.onvoiceschanged = pick;
    }
  },
  stop() {
    if (this.audio) { this.audio.pause(); this.audio = null; }
    if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* אין תמיכה */ }
  },
  // מקבל מזהה משפט או טקסט חופשי
  say(idOrText) {
    if (!this.on || !idOrText) return;
    const id = VOICE_LINES[idOrText] ? idOrText : VOICE_BY_TEXT[idOrText];
    const text = id ? VOICE_LINES[id] : idOrText;
    this.stop();
    const src = id && !this.missing.has(id) ? (VOICE_DATA ? VOICE_DATA[id] : 'assets/voice/' + id + '.mp3') : null;
    if (src) {
      const a = new Audio(src);
      this.audio = a;
      a.onerror = () => { this.missing.add(id); if (this.audio === a) this.tts(text); };
      a.play().catch(() => { this.missing.add(id); if (this.audio === a) this.tts(text); });
      return;
    }
    this.tts(text);
  },
  tts(text) {
    if (!window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[()]/g, ',').replace(/–/g, ','));
      u.lang = 'he-IL'; if (this.heVoice) u.voice = this.heVoice;
      speechSynthesis.speak(u);
    } catch (e) { /* אין תמיכה בדיבור */ }
  },
};
Voice.init();
