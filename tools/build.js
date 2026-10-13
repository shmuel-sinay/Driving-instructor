// בונה קובץ HTML יחיד שמכיל הכל (dist/driving-practice.html) ואת docs/gemini-prompt.md
// הרצה: node tools/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = scripts.map(f => `// ---- ${f} ----\n` + read(f)).join('\n');

let out = html
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`)
  .replace(/(<script src="[^"]+"><\/script>\s*)+/, () => `<script>\n${js}\n</script>\n`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/driving-practice.html'), out);

// גרסה לפרסום כ-Artifact (בלי מעטפת html/head/body)
const app = html.split('<!--APP-->')[1].split('<!--/APP-->')[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const art = `<title>מגרש תרגול נהיגה</title>\n${fonts}\n<style>\nhtml{direction:rtl}\n${css}\n</style>\n<div dir="rtl" style="height:100%">${app}</div>\n<script>\ndocument.documentElement.lang='he';document.documentElement.dir='rtl';\n${js}\n</script>\n`;
fs.writeFileSync(path.join(root, 'dist/artifact.html'), art);

// מסמך ההנחיות ל-Gemini
global.window = {};
const [prompt, pluginPrompt] = new Function(read('js/prompt.js') + '\nreturn [GEMINI_PROMPT, PLUGIN_PROMPT];')();
fs.writeFileSync(path.join(root, 'docs/gemini-prompt.md'),
  '# הנחיות ל-Gemini ליצירת מפות\n\nהעתק את כל הטקסט שמתחת לקו לצ\'אט חדש ב-Gemini, וכתוב בסוף מה אתה רוצה.\n' +
  'אפשר להעתיק את אותו טקסט גם מתוך התוכנה: כפתור "מפות" ← "העתק הנחיות ל-Gemini".\n\n---\n\n' + prompt + '\n');
fs.writeFileSync(path.join(root, 'docs/gemini-plugin-prompt.md'),
  '# הנחיות ל-Gemini לכתיבת תוספי חוקים\n\nהעתק את כל הטקסט שמתחת לקו לצ\'אט חדש ב-Gemini, וכתוב בסוף אילו חוקים להוסיף.\n' +
  'אפשר להעתיק את אותו טקסט גם מתוך התוכנה: כפתור "תוספים" ← "העתק הנחיות לתוספים".\n\n---\n\n' + pluginPrompt + '\n');
console.log('built dist/driving-practice.html', out.length, 'bytes');
