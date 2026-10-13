#!/usr/bin/env python3
"""ממיר את מאגר השאלות הרשמי של משרד התחבורה (data/theoryexamhe-data.xml) לקובץ js/theory-data.js.
נשמרות רק השאלות לרישיון B (רכב פרטי). הרצה: python3 tools/import-theory.py"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'theoryexamhe-data.xml')
OUT = os.path.join(ROOT, 'js', 'theory-data.js')
CLASS_B = 'В'   # במאגר המקורי האות B כתובה באות קירילית

src = open(SRC, encoding='utf-8').read()
qs = []
for it in re.findall(r'<item>(.*?)</item>', src, re.S):
    title = html.unescape(re.search(r'<title>(.*?)</title>', it, re.S).group(1)).strip()
    m = re.match(r'(\d+)\.\s*(.*)', title, re.S)
    desc = re.search(r'<!\[CDATA\[(.*?)\]\]>', it, re.S).group(1)
    classes = re.findall(r'«(\w+)»', desc)
    if CLASS_B not in classes:
        continue
    raw = re.findall(r'<li><span( id="correctAnswer\d+")?>(.*?)</span></li>', desc, re.S)
    answers = [re.sub(r'\s+', ' ', html.unescape(re.sub('<.*?>', '', a[1]))).strip() for a in raw]
    correct = [i for i, a in enumerate(raw) if a[0]]
    if len(answers) != 4 or len(correct) != 1:
        continue
    img = re.search(r'<img src="[^"]*/([^"/]+\.(?:jpg|png|gif))"', desc, re.I)
    cat = html.unescape(re.search(r'<category>(.*?)</category>', it, re.S).group(1)).strip()
    q = {'n': int(m.group(1)), 'q': re.sub(r'\s+', ' ', m.group(2)).strip(), 'a': answers, 'c': correct[0], 'cat': cat}
    if img:
        q['img'] = img.group(1)
    qs.append(q)
qs.sort(key=lambda q: q['n'])
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("'use strict';\n// נוצר אוטומטית מתוך data/theoryexamhe-data.xml (מאגר השאלות הרשמי של משרד התחבורה) על ידי tools/import-theory.py\n")
    f.write('// אל תערוך ידנית. ' + str(len(qs)) + ' שאלות לרישיון B.\n')
    f.write('const THEORY_IMG_BASE = "http://tqpic.mot.gov.il/";\n')
    f.write('const THEORY = ' + json.dumps(qs, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(qs), 'questions ->', OUT)
