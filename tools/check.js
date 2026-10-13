// בדיקה מהירה בלי דפדפן: תחביר של כל הקבצים, תקינות המפות המובנות, מקורות ספר החוקים ומשפטי הקול.
// הרצה: node tools/check.js   (יוצא עם קוד 1 אם משהו נכשל)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
const fail = msg => { failed++; console.error('✗ ' + msg); };
const ok = msg => console.log('✓ ' + msg);

// 1. תחביר
const html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
for (const f of scripts) {
  try { new vm.Script(read(f), { filename: f }); } catch (e) { fail(`${f}: ${e.message}`); }
}
ok(`syntax of ${scripts.length} scripts`);

// סוגריים מסולסלים מאוזנים ב-CSS (סוגר מיותר מבטל בשקט את הכלל שאחריו)
{
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0, stray = 0;
  for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) { stray++; depth = 0; } } }
  depth || stray ? fail(`css/style.css: unbalanced braces (open ${depth}, stray ${stray})`) : ok('css braces balanced');
}

// 2. לוגיקה שלא תלויה בדפדפן
const ctx = vm.createContext({ console, Math, JSON, Object, Array, Set, Map, Number, String, isFinite });
const load = f => vm.runInContext(read(f).replace(/^'use strict';/, '').replace(/^const (\w+) =/gm, 'var $1 ='), ctx, { filename: f });
for (const f of ['js/theory-data.js', 'js/rulebook.js', 'js/voice.js'.replace('voice', 'voice'), 'js/world.js', 'js/maps.js']) {
  try { if (f === 'js/voice.js') ctx.window = {}; load(f); } catch (e) { fail(`load ${f}: ${e.message}`); }
}
const r = vm.runInContext(`(() => {
  const out = { maps: [], rules: RULEBOOK.length, verified: RULEBOOK.filter(r => r.src.length).length, missing: [], dup: 0, theory: THEORY.length, voice: Object.keys(VOICE_LINES).length };
  const ids = new Set(THEORY.map(q => q.n));
  for (const rr of RULEBOOK) for (const n of rr.src) if (!ids.has(n)) out.missing.push(rr.id + ':' + n);
  out.dup = RULEBOOK.length - new Set(RULEBOOK.map(x => x.id)).size;
  for (const m of BUILTIN_MAPS) {
    const v = validateMap(m);
    let built = false;
    if (v.map) { try { buildWorld(v.map); built = edges.length > 0; } catch (e) { v.errors.push('buildWorld: ' + e.message); } }
    out.maps.push({ name: m.name, ok: !!v.map && built, errors: v.errors });
  }
  return out;
})()`, ctx);
for (const m of r.maps) m.ok ? ok(`map "${m.name}"`) : fail(`map "${m.name}": ${m.errors.join(' | ')}`);
r.missing.length ? fail('rule sources not in the official bank: ' + r.missing.join(', ')) : ok(`rule book: ${r.rules} rules (${r.verified} verified), ${r.theory} official questions`);
if (r.dup) fail(`${r.dup} duplicate rule ids`);
ok(`${r.voice} examiner voice lines`);
if (failed) { console.error(`\n${failed} problem(s)`); process.exit(1); }
console.log('\nall checks passed');
