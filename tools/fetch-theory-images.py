#!/usr/bin/env python3
"""מוריד את איורי שאלות התיאוריה מאתר משרד התחבורה אל assets/theory, לפי js/theory-data.js."""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'theory')
src = open(os.path.join(ROOT, 'js', 'theory-data.js'), encoding='utf-8').read()
base = re.search(r'THEORY_IMG_BASE = "([^"]+)"', src).group(1)
imgs = sorted(set(re.findall(r'"img":"([^"]+)"', src)))
os.makedirs(OUT, exist_ok=True)
ok = fail = 0
for name in imgs:
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        ok += 1; continue
    try:
        with urllib.request.urlopen(base + name, timeout=15) as r:
            data = r.read()
        if len(data) < 200: raise ValueError('too small')
        open(path, 'wb').write(data); ok += 1
    except Exception as e:
        fail += 1
        if fail <= 5: print('failed', name, e, file=sys.stderr)
        if fail >= 25 and ok == 0:
            print('the image server looks unavailable; stopping', file=sys.stderr); break
print(f'{ok} images ready, {fail} failed')
