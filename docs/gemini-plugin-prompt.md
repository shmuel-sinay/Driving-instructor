# הנחיות ל-Gemini לכתיבת תוספי חוקים

העתק את כל הטקסט שמתחת לקו לצ'אט חדש ב-Gemini, וכתוב בסוף אילו חוקים להוסיף.
אפשר להעתיק את אותו טקסט גם מתוך התוכנה: כפתור "תוספים" ← "העתק הנחיות לתוספים".

---

אתה כותב "תוספים" (plugins) לסימולטור "מגרש תרגול נהיגה": משחק נהיגה במבט מלמעלה לתרגול חוקי התנועה בישראל (נהיגה בצד ימין). בסימולטור יש "בוחן" שבודק את הנהיגה ורושם עבירות. תוסף מוסיף לבוחן חוקים חדשים.
המשימה שלך: לכתוב תוסף בקוד JavaScript, בדיוק לפי הממשק שמתואר כאן, שמממש את החוקים שאבקש בסוף ההודעה.

# כללי הפלט
1. החזר בלוק קוד אחד בלבד: ```javascript ... ```
2. שתי השורות הראשונות בקוד חייבות להיות:
   // @name שם קצר לתוסף בעברית
   // @description משפט אחד: מה התוסף בודק
3. הקוד רץ בתוך פונקציה שמקבלת את האובייקט DP. אין import/export, אין require, אין גישה ל-document, ל-window, לרשת או ל-localStorage. JavaScript רגיל (ES2017).
4. כל ההודעות לנהג בעברית, קצרות וברורות (עד כ-80 תווים), ומסבירות מה היה לא בסדר.
5. אחרי הבלוק כתוב בעברית רשימה קצרה: איזה חוקים הוספת ואיזו חומרה לכל אחד, ומה לא היה אפשר לבדוק עם החיישנים הקיימים (אם יש כזה).

# הממשק
DP.addRule({
  id: 'unique-id',           // מזהה ייחודי באנגלית, בלי רווחים
  name: 'שם החוק',            // בעברית
  severity: 'minor',         // 'minor' = עבירה רגילה (מורידה 5 נקודות) | 'severe' = עבירה חמורה (מורידה 15 ונחשבת כישלון)
  cooldown: 6,               // שניות שבהן החוק לא ידווח שוב אחרי דיווח (ברירת מחדל 6)
  check(s, mem) { ... },              // רץ בכל פריים (כ-120 פעמים בשנייה)
  onEnterJunction(s, ev, mem) { ... }, // רץ ברגע שהרכב נכנס לצומת או לכיכר
  onExitJunction(s, ev, mem) { ... },  // רץ ברגע שהרכב יוצא מהצומת או מהכיכר אל דרך
});
- חובה לפחות אחת משלוש הפונקציות.
- כדי לדווח על עבירה, הפונקציה מחזירה מחרוזת עם ההודעה. אפשר גם להחזיר { text: '...', severe: true } כדי לקבוע חומרה למקרה מסוים. כדי לא לדווח, לא מחזירים כלום.
- mem הוא אובייקט ריק ששייך לחוק, ונשמר בין פריימים. משתמשים בו לטיימרים ולזיכרון (למשל mem.t = (mem.t || 0) + s.dt).
- אפשר לקרוא ל-DP.addRule כמה פעמים בתוסף אחד.

פונקציות עזר:
- DP.say('טקסט'): הודעה חיובית ירוקה לנהג (למשל מחמאה). לא מורידה נקודות.
- DP.lightState(junctionId, roadId): מצב הרמזור לנכנסים מהדרך הזאת: 'red' | 'redYellow' | 'green' | 'yellow' | null.
- DP.angleDiff(a, b): הפרש בין שתי זוויות ברדיאנים, בטווח -π עד π.
- DP.map: עותק של המפה הנוכחית (צמתים ודרכים, בפורמט המפות).
- DP.onDraw(function (ctx, s) { ... }): ציור נוסף על המפה בכל פריים, בקואורדינטות של העולם (מטרים). ctx הוא CanvasRenderingContext2D. לשימוש רק אם ביקשתי משהו ויזואלי.

# מערכת הצירים
- יחידות במטרים. x גדל ימינה (מזרח), y גדל למטה (דרום).
- זוויות ברדיאנים: 0 = מזרח, π/2 = דרום, -π/2 = צפון.
- כל המרחקים היחסיים (ahead, side) נמדדים ממרכז הרכב שלי: ahead חיובי = לפניי, side חיובי = מימיני.
- אורך רכב 4.4 מ', רוחב נתיב 3.5 מ'. נתיבים ממוספרים משמאל: 0 = הנתיב השמאלי ביותר בכיוון הנסיעה שלי.
- בכיכר נוסעים נגד כיוון השעון. רדיוס חיצוני 19 מ', אי התנועה ברדיוס 8.5 מ'. הטבעת מחולקת לנתיב "inner" (פנימי, רדיוס מתחת ל-13.75 מ') ו-"outer" (חיצוני).

# החיישנים: האובייקט s (מתעדכן בכל פריים)
s.time         זמן בשניות מתחילת הנסיעה
s.dt           זמן הפריים בשניות (בערך 0.008)
s.car          הרכב שלי:
  x, y, heading (רדיאנים), speed (מ'/ש', שלילי ברוורס), speedKmh (תמיד חיובי),
  gear ('drive' | 'reverse'), blinker ('left' | 'right' | null), steering (רדיאנים, חיובי = ימינה),
  braking (true כשהבלם לחוץ), gas (true כשהגז לחוץ), length, width
s.blinkerUsed(side, secondsBack)   true אם האיתות 'left' או 'right' היה דולק מתישהו ב-secondsBack השניות האחרונות
s.where        'road' | 'junction' | 'off'
s.road         (רק כש-where === 'road', אחרת null):
  id, name, speedLimit (קמ"ש), oneWay, school, overtakingAllowed,
  lanes (מספר הנתיבים בכיוון שלי), lanesOpposite, lane (0 = שמאלי), laneFromRight (0 = ימני),
  isRightmostLane, isLeftmostLane, offsetFromCenter (מטרים מקו ההפרדה, חיובי = בצד הנכון),
  width, onWrongSide, alignedWithRoad (הרכב מקביל לדרך),
  distanceToJunction (מטרים עד קו העצירה של הצומת הבא), distanceFromJunction (מטרים מהצומת הקודם), length
s.nextJunction (רק כשאני על דרך): הצומת שאליו אני נוסע:
  id, type ('junction' | 'light' | 'roundabout' | 'allstop'),
  control (מה שחל עליי בכניסה: 'none' = אני בדרך הראשית | 'stop' | 'yield' | 'light' | 'roundabout'),
  light (מצב הרמזור שלי, או null), roadCount, distance, distanceToStopLine,
  exits: [{ roadId, roadName, turn ('left' | 'right' | 'straight' | 'uturn'), lanes, exitNumber (רק בכיכר) }]
s.junction     (רק כש-where === 'junction'):
  id, type, roadCount, timeInside (שניות), enteredFromRoadId, stops (כמה פעמים עצרתי בפנים), stoppedSeconds,
  ובכיכר בלבד: ringLane ('inner' | 'outer' | 'island'), distanceFromCenter, exitsPassed (כמה יציאות כבר עברתי),
  ringLaneChanges: [{ time, from, to, blinker }]
s.crosswalkAhead  מעבר החציה הקרוב לפניי באותה דרך, או null:
  distance (מטרים עד תחילת המעבר, שלילי = אני עליו), pedestriansCrossing, pedestriansWaiting, pedestrianOnRoad
s.pedestrians  כל הולכי הרגל: [{ roadId, state ('waiting' = עומד על המדרכה ליד המעבר ומתכוון לחצות | 'crossing' | 'leaving'),
  onRoad, ahead, side, distance, x, y }]
s.vehicles     כל הרכבים האחרים: [{ ahead, side, distance, speedKmh, accel (מ'/ש² - שלילי = בולם),
  braking, blinker, heading, sameDirection, oppositeDirection, x, y,
  where ('road' | 'junction' | 'off'),
  כשעל דרך: roadId, lane, lanes, distanceToJunction, nextJunctionId,
  כשבצומת: junctionId, ובכיכר גם ringLane }]
s.instruction  ההוראה הנוכחית של הבוחן, או null: { junctionId, toRoadId, turn, text }
s.score, s.mapName

# האירועים: האובייקט ev
onEnterJunction(s, ev): ev = {
  junctionId, type, control, light (מצב הרמזור ברגע הכניסה), roadCount, exits (כמו ב-nextJunction),
  fromRoadId, speedKmh, lane (הנתיב שממנו נכנסתי, 0 = שמאלי), lanes,
  stoppedBeforeLine (true אם עצרתי עצירה מוחלטת לפני הקו, רלוונטי ל"עצור")
}
onExitJunction(s, ev): ev = {
  junctionId, type, fromRoadId, toRoadId, turn ('left' | 'right' | 'straight' | 'uturn'),
  exitNumber (בכיכר: מספר היציאה, 1 = הראשונה מימין), entryLane, entryLanes, exitLanes,
  timeInside, minSpeedKmh, maxSpeedKmh, stops, stoppedSeconds,
  ringLaneAtEntry, ringLaneAtExit, ringLaneChanges (בכיכר), wrongExitDirection, instructionFollowed (true/false/null)
}
הערה: הנתיב שאליו נכנסתי בדרך החדשה עוד לא ידוע ברגע היציאה. כדי לבדוק אותו, שמור ב-mem ובדוק ב-check כשהרכב כבר נוסע בדרך החדשה (s.road.id === mem.toRoadId).

# חוקים שהבוחן כבר בודק (אל תכפיל אותם)
נסיעה באור אדום או אדום-צהוב; אי-עצירה בתמרור "עצור" (בקו); אי-מתן זכות קדימה בכניסה מ"עצור", "תן זכות קדימה" או לכיכר, כשיש רכב שמתקרב או שבתוך הצומת;
פנייה ימינה או שמאלה בלי איתות מוקדם; איתות מטעה בנסיעה ישר; לא איתתת ימינה לפני היציאה מהכיכר (בדיקה פשוטה: האיתות היה דולק מתישהו בכיכר);
פנייה שלא מהנתיב הנכון ופנייה לנתיב הלא נכון; החלפת נתיב בלי איתות; החלפת נתיב על קו רצוף לפני צומת;
מהירות מעל המותר (מעל 20 קמ"ש = חמורה); נסיעה בצד השמאלי או חציית קו רצוף; נסיעה נגד כיוון בחד-סטרי או בכיכר; כניסה ב"אין כניסה";
אי-מתן זכות קדימה להולך רגל שכבר חוצה במעבר; עלייה על המדרכה או על אי התנועה; תאונה ופגיעה בהולך רגל; אי-ביצוע הוראת הבוחן.
אם ביקשתי להחמיר חוק קיים (למשל לבדוק את תזמון האיתות בכיכר בצורה מדויקת יותר), כתוב חוק חדש עם id אחר שבודק רק את המקרה המדויק.

# טיפים
- check רץ הרבה פעמים בשנייה: השתמש בטיימרים ב-mem (mem.t += s.dt) כדי לדרוש שמצב יימשך זמן מה לפני דיווח, ואפס אותם כשהמצב נגמר.
- בדוק תמיד שהאובייקט קיים לפני שימוש: if (!s.road) return;
- כדי לזהות "רכב שבתוך הכיכר נאלץ לבלום בגללי": ב-onEnterJunction או מיד אחריו, חפש ב-s.vehicles רכב עם junctionId זהה, distance קטן, ו-accel שלילי חזק (למשל מתחת ל-3-).
- עדיף חוק שמדווח מעט ובצדק, על פני חוק שמדווח הרבה בטעות. אל תדווח כשהמהירות כמעט 0, אלא אם החוק עוסק בעצירה.

# דוגמה מלאה ותקינה
```javascript
// @name איתות שנשאר דולק
// @description אם האיתות דולק יותר מ-6 שניות בנסיעה ישרה, בלי צומת קרוב
DP.addRule({
  id: 'forgot-blinker',
  name: 'איתות שנשאר דולק',
  severity: 'minor',
  cooldown: 15,
  check(s, mem) {
    const r = s.road;
    const straight = r && r.alignedWithRoad && r.distanceToJunction > 100 && s.car.speedKmh > 15;
    if (s.car.blinker && straight) mem.t = (mem.t || 0) + s.dt; else mem.t = 0;
    if (mem.t > 6) { mem.t = 0; return 'איתות דולק בלי סיבה: שכחת לכבות אותו'; }
  },
});

DP.addRule({
  id: 'fast-turn',
  name: 'פנייה מהירה מדי',
  severity: 'minor',
  onExitJunction(s, ev) {
    if ((ev.turn === 'left' || ev.turn === 'right') && ev.type !== 'roundabout' && ev.maxSpeedKmh > 30) {
      return 'פנייה מהירה מדי (' + Math.round(ev.maxSpeedKmh) + ' קמ"ש). יש להאט לפני הפנייה';
    }
  },
});
```

# הבקשה שלי
[כתוב כאן אילו חוקים להוסיף. אפשר להדביק רשימה שלמה של עבירות, והתוסף יכלול חוק לכל אחת]
