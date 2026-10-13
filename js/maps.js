'use strict';
// ===== מפות מובנות ובדיקת תקינות של מפה בפורמט JSON =====
// הפורמט המלא מתואר ב-docs/gemini-prompt.md

const BUILTIN_MAPS = [
  {
    name: 'מסלול טסט',
    description: 'כיכר דו-נתיבית, שתי כיכרות צמודות, רחובות עם חניה, פסי האטה, איסור פנייה, רמזורים ו"עצור"',
    traffic: 14,
    start: { road: 'A-B', direction: 'forward', distance: 40 },
    nodes: [
      { id: 'A', x: 0, y: 0, type: 'junction' },
      { id: 'B', x: 260, y: 0, type: 'light', lightOffset: 0 },
      { id: 'C', x: 520, y: 0, type: 'roundabout', lanes: 2 },
      { id: 'D', x: 780, y: 0, type: 'junction' },
      { id: 'E', x: 0, y: 260, type: 'junction' },
      { id: 'F', x: 260, y: 260, type: 'roundabout' },
      { id: 'G', x: 400, y: 260, type: 'roundabout' },
      { id: 'H', x: 520, y: 260, type: 'light', lightOffset: 14 },
      { id: 'I', x: 780, y: 260, type: 'junction' },
      { id: 'J', x: 0, y: 480, type: 'junction' },
      { id: 'K', x: 260, y: 480, type: 'junction' },
      { id: 'N', x: 400, y: 480, type: 'junction' },
      { id: 'L', x: 520, y: 480, type: 'junction' },
      { id: 'M', x: 780, y: 480, type: 'junction' },
    ],
    roads: [
      { from: 'A', to: 'B', name: 'שדרות הרצל', lanesForward: 2, lanesBackward: 2, speed: 50, parking: 'both', crosswalks: [130] },
      { from: 'B', to: 'C', name: 'שדרות הרצל', lanesForward: 2, lanesBackward: 2, speed: 60 },
      { from: 'C', to: 'D', name: 'דרך העצמאות', lanesForward: 2, lanesBackward: 2, speed: 70 },
      { from: 'A', to: 'E', name: 'רחוב הדקלים', lanesForward: 1, lanesBackward: 1, speed: 40, parking: 'right', speedBumps: [120] },
      { from: 'E', to: 'J', name: 'רחוב הדקלים', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'B', to: 'F', name: 'שדרות ירושלים', lanesForward: 2, lanesBackward: 2, speed: 50 },
      { from: 'C', to: 'H', name: 'דרך השלום', lanesForward: 2, lanesBackward: 2, speed: 50 },
      { from: 'D', to: 'I', name: 'דרך הים', lanesForward: 1, lanesBackward: 1, speed: 80, overtaking: true },
      { from: 'E', to: 'F', name: 'רחוב הרימון', lanesForward: 1, lanesBackward: 1, speed: 50, signAtFrom: 'stop' },
      { from: 'F', to: 'G', name: 'רחוב הכיכרות', lanesForward: 1, lanesBackward: 1, speed: 40 },
      { from: 'G', to: 'H', name: 'רחוב הנביאים', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'H', to: 'I', name: 'שדרות בן גוריון', lanesForward: 2, lanesBackward: 2, speed: 60, banAtTo: ['left'], signAtTo: 'stop' },
      { from: 'F', to: 'K', name: 'רחוב בית הספר', lanesForward: 1, lanesBackward: 1, speed: 30, school: true, crosswalks: [80, 165], speedBumps: [120] },
      { from: 'N', to: 'G', name: 'רחוב השוק (חד-סטרי)', lanesForward: 1, lanesBackward: 0, speed: 30, parking: 'both' },
      { from: 'J', to: 'K', name: 'רחוב אלנבי', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'K', to: 'N', name: 'רחוב אלנבי', lanesForward: 1, lanesBackward: 1, speed: 50, signAtFrom: 'yield' },
      { from: 'N', to: 'L', name: 'רחוב אלנבי', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'H', to: 'L', name: 'רחוב הגפן', lanesForward: 1, lanesBackward: 1, speed: 40, parking: 'right', crosswalks: [110], signAtTo: 'stop' },
      { from: 'L', to: 'M', name: 'דרך מנחם בגין', lanesForward: 2, lanesBackward: 2, speed: 70 },
      { from: 'I', to: 'M', name: 'רחוב הירקון', lanesForward: 1, lanesBackward: 1, speed: 50 },
    ],
  },
  {
    name: 'כביש בין-עירוני',
    description: 'יציאה מהעיר לכביש 80 עם עקיפה, דרך מהירה 110, כביש מחולק 90, כיכר דו-נתיבית ודרך לכפר',
    traffic: 10,
    start: { road: 'A-B', direction: 'forward', distance: 30 },
    nodes: [
      { id: 'A', x: 0, y: 0, type: 'light', lightOffset: 4 },
      { id: 'B', x: 250, y: 0, type: 'junction' },
      { id: 'C', x: 0, y: 250, type: 'roundabout' },
      { id: 'D', x: 250, y: 250, type: 'junction' },
      { id: 'E', x: 900, y: 0, type: 'junction' },
      { id: 'F', x: 900, y: 250, type: 'roundabout', lanes: 2 },
      { id: 'G', x: 1600, y: 0, type: 'junction' },
      { id: 'H', x: 1600, y: 250, type: 'junction' },
      { id: 'I', x: 900, y: 700, type: 'junction' },
      { id: 'J', x: 0, y: -200, type: 'junction' },
      { id: 'K', x: -220, y: 0, type: 'junction' },
      { id: 'L', x: -220, y: 250, type: 'junction' },
    ],
    roads: [
      { from: 'A', to: 'B', name: 'רחוב העצמאות', lanesForward: 1, lanesBackward: 1, speed: 50, crosswalks: [120], parking: 'right' },
      { from: 'A', to: 'C', name: 'רחוב הגפן', lanesForward: 1, lanesBackward: 1, speed: 40, speedBumps: [110], school: true, crosswalks: [70] },
      { from: 'J', to: 'A', name: 'רחוב הדקל', lanesForward: 1, lanesBackward: 1, speed: 50, parking: 'both' },
      { from: 'K', to: 'A', name: 'רחוב הרימון', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'K', to: 'L', name: 'דרך השדות', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'L', to: 'C', name: 'דרך השדות', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'B', to: 'D', name: 'רחוב התעשייה', lanesForward: 1, lanesBackward: 1, speed: 40, speedBumps: [125], signAtFrom: 'stop', signAtTo: 'yield' },
      { from: 'C', to: 'D', name: 'רחוב המייסדים', lanesForward: 1, lanesBackward: 1, speed: 50, parking: 'both', crosswalks: [130] },
      { from: 'B', to: 'E', name: 'כביש 40', lanesForward: 1, lanesBackward: 1, speed: 80, overtaking: true },
      { from: 'D', to: 'F', name: 'כביש 4 (מחולק)', lanesForward: 2, lanesBackward: 2, speed: 90 },
      { from: 'E', to: 'F', name: 'כביש הגישה', lanesForward: 2, lanesBackward: 2, speed: 70, signAtFrom: 'yield' },
      { from: 'E', to: 'G', name: 'כביש 40', lanesForward: 1, lanesBackward: 1, speed: 80, overtaking: true },
      { from: 'F', to: 'H', name: 'דרך מהירה 1', lanesForward: 2, lanesBackward: 2, speed: 110 },
      { from: 'G', to: 'H', name: 'כביש 3', lanesForward: 1, lanesBackward: 1, speed: 80, overtaking: true },
      { from: 'F', to: 'I', name: 'דרך הכפר (ללא מוצא)', lanesForward: 2, lanesBackward: 2, speed: 60, crosswalks: [380] },
    ],
  },
  {
    name: 'העיר הקטנה',
    description: 'רמזורים, כיכר, "עצור", חד-סטרי, מעברי חציה ואזור בית ספר',
    traffic: 12,
    start: { road: 'A-B', direction: 'forward', distance: 45 },
    nodes: [
      { id: 'A', x: 0, y: 0, type: 'junction' },
      { id: 'B', x: 230, y: 0, type: 'junction' },
      { id: 'C', x: 460, y: 0, type: 'light', lightOffset: 0 },
      { id: 'D', x: 690, y: 0, type: 'junction' },
      { id: 'E', x: 0, y: 210, type: 'junction' },
      { id: 'F', x: 230, y: 210, type: 'light', lightOffset: 9 },
      { id: 'G', x: 460, y: 210, type: 'roundabout' },
      { id: 'H', x: 690, y: 210, type: 'allstop' },
      { id: 'I', x: 0, y: 420, type: 'junction' },
      { id: 'J', x: 230, y: 420, type: 'junction' },
      { id: 'K', x: 460, y: 420, type: 'light', lightOffset: 20 },
      { id: 'L', x: 690, y: 420, type: 'junction' },
    ],
    roads: [
      { from: 'A', to: 'B', name: 'רחוב הרצל', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'B', to: 'C', name: 'שדרות בן גוריון', lanesForward: 2, lanesBackward: 2, speed: 60 },
      { from: 'C', to: 'D', name: 'רחוב ויצמן', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'A', to: 'E', name: 'רחוב הגפן (אזור מגורים)', lanesForward: 1, lanesBackward: 1, speed: 30, crosswalks: [105] },
      { from: 'E', to: 'I', name: 'רחוב הזית', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'B', to: 'F', name: 'רחוב התאנה', lanesForward: 1, lanesBackward: 1, speed: 40, signAtFrom: 'stop' },
      { from: 'C', to: 'G', name: 'דרך השלום', lanesForward: 2, lanesBackward: 2, speed: 50 },
      { from: 'D', to: 'H', name: 'דרך הים', lanesForward: 1, lanesBackward: 1, speed: 70, overtaking: true },
      { from: 'F', to: 'E', name: 'רחוב יפו (חד-סטרי)', lanesForward: 2, lanesBackward: 0, speed: 50, signAtTo: 'yield' },
      { from: 'F', to: 'G', name: 'שדרות רוטשילד', lanesForward: 2, lanesBackward: 2, speed: 60, crosswalks: [115] },
      { from: 'G', to: 'H', name: 'רחוב הנביאים', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'F', to: 'J', name: 'רחוב בית הספר', lanesForward: 1, lanesBackward: 1, speed: 30, crosswalks: [70, 140], school: true, signAtTo: 'stop' },
      { from: 'K', to: 'G', name: 'רחוב הדקל (חד-סטרי)', lanesForward: 1, lanesBackward: 0, speed: 40 },
      { from: 'H', to: 'L', name: 'כביש עוקף', lanesForward: 1, lanesBackward: 1, speed: 80, overtaking: true },
      { from: 'I', to: 'J', name: 'רחוב אלנבי', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'J', to: 'K', name: 'דרך מנחם בגין', lanesForward: 2, lanesBackward: 2, speed: 70 },
      { from: 'K', to: 'L', name: 'רחוב הירקון', lanesForward: 1, lanesBackward: 1, speed: 50 },
    ],
  },
  {
    name: 'מגרש מתחילים',
    description: 'מפה קטנה ושקטה: רמזור אחד, כיכר אחת ורחוב ללא מוצא',
    traffic: 5,
    start: { road: 'P-Q', direction: 'forward', distance: 40 },
    nodes: [
      { id: 'P', x: 0, y: 0, type: 'junction' },
      { id: 'Q', x: 250, y: 0, type: 'light' },
      { id: 'R', x: 500, y: 0, type: 'junction' },
      { id: 'T', x: 0, y: 250, type: 'junction' },
      { id: 'S', x: 250, y: 250, type: 'roundabout' },
      { id: 'U', x: 500, y: 250, type: 'junction' },
      { id: 'V', x: 250, y: 450, type: 'junction' },
    ],
    roads: [
      { from: 'P', to: 'Q', name: 'רחוב האלון', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'Q', to: 'R', name: 'שדרות הנשיא', lanesForward: 2, lanesBackward: 2, speed: 60, crosswalks: [120] },
      { from: 'P', to: 'T', name: 'רחוב הברוש', lanesForward: 1, lanesBackward: 1, speed: 40 },
      { from: 'T', to: 'S', name: 'רחוב השקד', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'S', to: 'U', name: 'רחוב הרימון', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'R', to: 'U', name: 'רחוב החרוב', lanesForward: 1, lanesBackward: 1, speed: 50 },
      { from: 'Q', to: 'S', name: 'דרך הכיכר', lanesForward: 2, lanesBackward: 2, speed: 50 },
      { from: 'S', to: 'V', name: 'סמטת הגן (ללא מוצא)', lanesForward: 1, lanesBackward: 1, speed: 30, crosswalks: [100], school: true },
    ],
  },
];

const NODE_TYPES = ['junction', 'light', 'roundabout', 'allstop'];
const SIGN_TYPES = ['none', 'stop', 'yield'];
const NODE_TYPE_HE = { junction: 'צומת רגיל', light: 'רמזור', roundabout: 'כיכר', allstop: '"עצור" מכל הכיוונים' };

// מחלץ JSON גם מתוך תשובה שיש בה טקסט או ```json
function extractJSON(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('לא נמצא JSON בטקסט. ודא שהדבקת את כל התשובה של Gemini, כולל הסוגריים המסולסלים { }.');
  t = t.slice(a, b + 1);
  // ניקוי טעויות נפוצות: פסיק לפני סוגר
  t = t.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(t); }
  catch (e) { throw new Error('ה-JSON לא תקין: ' + e.message + '. בקש מ-Gemini: "החזר JSON תקין בלבד".'); }
}

// מחזיר { map, errors, warnings }
function validateMap(raw) {
  const errors = [], warnings = [];
  const fail = () => ({ map: null, errors, warnings });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push('המפה חייבת להיות אובייקט JSON אחד { ... }.'); return fail(); }
  if (!Array.isArray(raw.nodes) || raw.nodes.length < 2) errors.push('חסרה רשימת "nodes" (לפחות 2 צמתים).');
  if (!Array.isArray(raw.roads) || raw.roads.length < 1) errors.push('חסרה רשימת "roads" (לפחות דרך אחת).');
  if (errors.length) return fail();
  if (raw.nodes.length > 200) errors.push('יותר מדי צמתים (מקסימום 200).');
  if (raw.roads.length > 300) errors.push('יותר מדי דרכים (מקסימום 300).');

  const map = {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'מפה חדשה',
    description: typeof raw.description === 'string' ? raw.description.slice(0, 200) : '',
    traffic: null, start: null, nodes: [], roads: [],
  };
  const num = v => typeof v === 'number' && isFinite(v);

  // צמתים
  const byId = {};
  raw.nodes.forEach((n, i) => {
    const where = `צומת #${i + 1}${n && n.id != null ? ` ("${n.id}")` : ''}`;
    if (!n || typeof n !== 'object') { errors.push(`${where}: חייב להיות אובייקט.`); return; }
    const id = n.id == null ? '' : String(n.id).trim();
    if (!id) { errors.push(`${where}: חסר "id".`); return; }
    if (id.includes('-')) { errors.push(`${where}: אסור מקף (-) במזהה של צומת.`); return; }
    if (byId[id]) { errors.push(`המזהה "${id}" מופיע פעמיים. לכל צומת צריך מזהה אחר.`); return; }
    if (!num(n.x) || !num(n.y)) { errors.push(`${where}: "x" ו-"y" חייבים להיות מספרים.`); return; }
    if (Math.abs(n.x) > 5000 || Math.abs(n.y) > 5000) { errors.push(`${where}: הקואורדינטות חייבות להיות בין -5000 ל-5000.`); return; }
    const type = n.type == null ? 'junction' : String(n.type);
    if (!NODE_TYPES.includes(type)) { errors.push(`${where}: סוג "${type}" לא מוכר. מותר: ${NODE_TYPES.join(', ')}.`); return; }
    const node = { id, x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10, type };
    if (type === 'light') node.lightOffset = num(n.lightOffset) ? n.lightOffset : 0;
    if (type === 'roundabout' && n.lanes != null) {
      if (n.lanes !== 1 && n.lanes !== 2) { errors.push(`${where}: "lanes" של כיכר חייב להיות 1 או 2.`); return; }
      if (n.lanes === 2) node.lanes = 2;
    }
    byId[id] = node; map.nodes.push(node);
  });
  for (let i = 0; i < map.nodes.length; i++) for (let j = i + 1; j < map.nodes.length; j++) {
    const a = map.nodes[i], b = map.nodes[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 60) errors.push(`הצמתים "${a.id}" ו-"${b.id}" קרובים מדי (${Math.round(Math.hypot(a.x - b.x, a.y - b.y))} מ'). המרחק המינימלי הוא 60 מ'.`);
  }

  // דרכים
  const pairs = {};
  raw.roads.forEach((r, i) => {
    const where = `דרך #${i + 1}${r && r.from != null ? ` ("${r.from}-${r.to}")` : ''}`;
    if (!r || typeof r !== 'object') { errors.push(`${where}: חייבת להיות אובייקט.`); return; }
    let from = String(r.from ?? ''), to = String(r.to ?? '');
    if (!byId[from] || !byId[to]) { errors.push(`${where}: הצומת ${!byId[from] ? `"${from}"` : `"${to}"`} לא קיים ברשימת nodes.`); return; }
    if (from === to) { errors.push(`${where}: דרך לא יכולה להתחיל ולהסתיים באותו צומת.`); return; }
    const A = byId[from], B = byId[to];
    if (A.x !== B.x && A.y !== B.y) { errors.push(`${where}: הדרך אלכסונית. כל דרך חייבת להיות אופקית (אותו y) או אנכית (אותו x). לעיקול מוסיפים צומת פינה.`); return; }
    const len = Math.hypot(A.x - B.x, A.y - B.y);
    if (len < 60) { errors.push(`${where}: קצרה מדי (${Math.round(len)} מ'). מינימום 60 מ'.`); return; }
    const key = [from, to].sort().join('|');
    if (pairs[key]) { errors.push(`${where}: כבר יש דרך בין "${from}" ל-"${to}".`); return; }
    pairs[key] = true;
    const lane = (v, def) => v == null ? def : v;
    let lf = lane(r.lanesForward, 1), lb = lane(r.lanesBackward, 1);
    if (![0, 1, 2, 3].includes(lf) || ![0, 1, 2, 3].includes(lb)) { errors.push(`${where}: מספר נתיבים חייב להיות 0, 1, 2 או 3.`); return; }
    if (lf + lb < 1) { errors.push(`${where}: חייב להיות לפחות נתיב אחד.`); return; }
    let sFrom = r.signAtFrom == null ? 'none' : String(r.signAtFrom), sTo = r.signAtTo == null ? 'none' : String(r.signAtTo);
    for (const s of [sFrom, sTo]) if (!SIGN_TYPES.includes(s)) { errors.push(`${where}: תמרור "${s}" לא מוכר. מותר: none, stop, yield.`); return; }
    let cross = Array.isArray(r.crosswalks) ? r.crosswalks : [];
    if (cross.some(c => !num(c))) { errors.push(`${where}: "crosswalks" חייב להיות רשימת מספרים (מרחק במטרים מהצומת from).`); return; }
    for (const c of cross) if (c < 30 || c > len - 30) { errors.push(`${where}: מעבר חציה ב-${c} מ' קרוב מדי לקצה. מותר בין 30 ל-${Math.floor(len - 30)}.`); return; }
    let parking = r.parking == null ? 'none' : String(r.parking);
    if (!['none', 'right', 'left', 'both'].includes(parking)) { errors.push(`${where}: "parking" חייב להיות none, right, left או both.`); return; }
    let bumps = Array.isArray(r.speedBumps) ? r.speedBumps : [];
    if (bumps.some(b => !num(b))) { errors.push(`${where}: "speedBumps" חייב להיות רשימת מספרים (מרחק במטרים מהצומת from).`); return; }
    for (const b of bumps) if (b < 25 || b > len - 25) { errors.push(`${where}: פס האטה ב-${b} מ' קרוב מדי לקצה. מותר בין 25 ל-${Math.floor(len - 25)}.`); return; }
    const TURNS = ['left', 'right', 'straight', 'uturn'];
    let banTo = Array.isArray(r.banAtTo) ? r.banAtTo.map(String) : [], banFrom = Array.isArray(r.banAtFrom) ? r.banAtFrom.map(String) : [];
    for (const b of banTo.concat(banFrom)) if (!TURNS.includes(b)) { errors.push(`${where}: איסור פנייה "${b}" לא מוכר. מותר: ${TURNS.join(', ')}.`); return; }
    // חד-סטרי בכיוון ההפוך: הופכים את הדרך
    if (lf === 0) {
      [from, to] = [to, from]; [lf, lb] = [lb, lf]; [sFrom, sTo] = [sTo, sFrom];
      cross = cross.map(c => len - c); bumps = bumps.map(b => len - b);
      parking = { right: 'left', left: 'right' }[parking] || parking;
      [banTo, banFrom] = [banFrom, banTo];
    }
    const speed = r.speed == null ? 50 : r.speed;
    if (!num(speed) || speed < 20 || speed > 120 || speed % 10 !== 0) { errors.push(`${where}: מהירות ${speed} לא תקינה. מותר 20 עד 120 בקפיצות של 10.`); return; }
    const road = {
      from, to, name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 50) : `רחוב ${from}-${to}`,
      lanesForward: lf, lanesBackward: lb, speed,
    };
    if (sFrom !== 'none') road.signAtFrom = sFrom;
    if (sTo !== 'none') road.signAtTo = sTo;
    if (cross.length) road.crosswalks = cross.slice().sort((a, b) => a - b);
    if (r.school) road.school = true;
    if (parking !== 'none') road.parking = parking;
    if (bumps.length) road.speedBumps = bumps.slice().sort((a, b) => a - b);
    if (banTo.length) road.banAtTo = [...new Set(banTo)];
    if (banFrom.length) road.banAtFrom = [...new Set(banFrom)];
    if (r.overtaking) {
      if (lf === 1 && lb === 1) road.overtaking = true;
      else warnings.push(`${where}: "overtaking" מתאים רק לדרך עם נתיב אחד לכל כיוון, ולכן לא הופעל.`);
    }
    map.roads.push(road);
  });
  if (errors.length) return fail();

  // בדיקות מבנה
  const dirName = (n, o) => o.x > n.x ? 'מזרח' : o.x < n.x ? 'מערב' : o.y > n.y ? 'דרום' : 'צפון';
  const roadsAt = {};
  for (const n of map.nodes) roadsAt[n.id] = [];
  for (const r of map.roads) { roadsAt[r.from].push(r); roadsAt[r.to].push(r); }
  for (const n of map.nodes) {
    const rs = roadsAt[n.id];
    if (!rs.length) { warnings.push(`הצומת "${n.id}" לא מחובר לאף דרך ולכן לא יופיע.`); continue; }
    const seen = {};
    for (const r of rs) {
      const o = byId[r.from === n.id ? r.to : r.from];
      const d = dirName(n, o);
      if (seen[d]) errors.push(`בצומת "${n.id}" יוצאות שתי דרכים לכיוון ${d}. מותרת דרך אחת לכל כיוון. כדי להמשיך, חבר דרך לצומת הבא בתור.`);
      seen[d] = true;
    }
    const ins = rs.filter(r => (r.to === n.id ? r.lanesForward : r.lanesBackward) > 0).length;
    const outs = rs.filter(r => (r.from === n.id ? r.lanesForward : r.lanesBackward) > 0).length;
    if (ins && !outs) errors.push(`לצומת "${n.id}" אפשר להיכנס אבל אי אפשר לצאת ממנו. בדוק את כיווני החד-סטרי.`);
    if (outs && !ins) warnings.push(`לצומת "${n.id}" אי אפשר להגיע (כל הדרכים בו יוצאות ממנו).`);
    if (n.type === 'roundabout' && n.lanes === 2 && rs.some(r => (r.to === n.id ? r.lanesForward : r.lanesBackward) === 1)) warnings.push(`בכיכר הדו-נתיבית "${n.id}" יש כניסה עם נתיב אחד. כדי לתרגל בחירת נתיב, כדאי 2 נתיבים בכל כניסה.`);
    if (n.type === 'roundabout' && rs.length < 3) warnings.push(`בכיכר "${n.id}" יש רק ${rs.length} דרכים. כיכר מתאימה ל-3 או 4 דרכים.`);
    if (n.type === 'light' && rs.length < 3) warnings.push(`ברמזור "${n.id}" יש רק ${rs.length} דרכים.`);
    const signs = rs.filter(r => (r.from === n.id && r.signAtFrom) || (r.to === n.id && r.signAtTo));
    if (n.type !== 'junction' && signs.length) warnings.push(`בצומת "${n.id}" (${NODE_TYPE_HE[n.type]}) תמרורי "עצור"/"תן זכות קדימה" מיותרים ולא יוצגו.`);
    if (n.type === 'junction' && ins >= 3 && !signs.length) warnings.push(`בצומת "${n.id}" אין תמרורים: כל הדרכים בו נחשבות ראשיות. כדאי לשים "stop" או "yield" על הדרך המשנית.`);
  }
  // דרך שעוברת דרך צומת, ודרכים שחוצות זו את זו בלי צומת
  for (const r of map.roads) {
    const A = byId[r.from], B = byId[r.to];
    for (const n of map.nodes) {
      if (n === A || n === B) continue;
      const inX = Math.min(A.x, B.x) < n.x && n.x < Math.max(A.x, B.x), inY = Math.min(A.y, B.y) < n.y && n.y < Math.max(A.y, B.y);
      if ((A.y === B.y && Math.abs(n.y - A.y) < 25 && inX) || (A.x === B.x && Math.abs(n.x - A.x) < 25 && inY))
        errors.push(`הדרך "${r.from}-${r.to}" עוברת דרך הצומת "${n.id}" (או ממש לידו). פצל אותה לשתי דרכים: "${r.from}-${n.id}" ו-"${n.id}-${r.to}".`);
    }
  }
  const hor = map.roads.filter(r => byId[r.from].y === byId[r.to].y), ver = map.roads.filter(r => byId[r.from].x === byId[r.to].x);
  for (const h of hor) for (const v of ver) {
    const y = byId[h.from].y, x = byId[v.from].x;
    const hx0 = Math.min(byId[h.from].x, byId[h.to].x), hx1 = Math.max(byId[h.from].x, byId[h.to].x);
    const vy0 = Math.min(byId[v.from].y, byId[v.to].y), vy1 = Math.max(byId[v.from].y, byId[v.to].y);
    if (x > hx0 && x < hx1 && y > vy0 && y < vy1)
      errors.push(`הדרכים "${h.from}-${h.to}" ו-"${v.from}-${v.to}" נחתכות בנקודה (${x}, ${y}) בלי צומת. הוסף שם צומת ופצל את שתי הדרכים.`);
  }
  // קישוריות
  const used = map.nodes.filter(n => roadsAt[n.id].length);
  if (used.length) {
    const seen = new Set([used[0].id]), q = [used[0].id];
    while (q.length) { const id = q.pop(); for (const r of roadsAt[id]) { const o = r.from === id ? r.to : r.from; if (!seen.has(o)) { seen.add(o); q.push(o); } } }
    if (seen.size < used.length) warnings.push('חלק מהדרכים לא מחוברות לשאר המפה (יש "איים" נפרדים).');
  }
  if (errors.length) return fail();

  // נקודת התחלה ותנועה
  const st = raw.start && typeof raw.start === 'object' ? raw.start : {};
  let road = null, dir = st.direction === 'backward' ? 'backward' : 'forward';
  if (typeof st.road === 'string') {
    const [f, t] = st.road.split('-');
    road = map.roads.find(r => r.from === f && r.to === t);
    if (!road) { road = map.roads.find(r => r.from === t && r.to === f); if (road) dir = dir === 'forward' ? 'backward' : 'forward'; }
    if (!road) warnings.push(`דרך ההתחלה "${st.road}" לא קיימת. מתחילים בדרך הראשונה.`);
  }
  if (!road) { road = map.roads[0]; dir = 'forward'; }
  if (dir === 'backward' && !road.lanesBackward) dir = 'forward';
  map.start = { road: road.from + '-' + road.to, direction: dir, distance: num(st.distance) ? st.distance : 30 };
  const total = map.roads.reduce((s, r) => s + Math.hypot(byId[r.from].x - byId[r.to].x, byId[r.from].y - byId[r.to].y), 0);
  map.traffic = num(raw.traffic) ? Math.max(0, Math.min(40, Math.round(raw.traffic))) : Math.max(3, Math.min(20, Math.round(total / 260)));
  map.nodes = used;
  return { map, errors, warnings };
}
