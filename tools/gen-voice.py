#!/usr/bin/env python3
"""יוצר קובץ mp3 לכל משפט ב-VOICE_LINES שב-js/voice.js, בעזרת edge-tts (קול עברי טבעי).
הרצה: pip install edge-tts && python3 tools/gen-voice.py [--voice he-IL-AvriNeural] [--force]"""
import argparse, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'voice')

def load_lines():
    src = open(os.path.join(ROOT, 'js', 'voice.js'), encoding='utf-8').read()
    body = src[src.index('const VOICE_LINES = {') + len('const VOICE_LINES = '):]
    body = body[:body.index('\n};') + 2]
    lines = {}
    for m in re.finditer(r"^\s*(\w+):\s*'((?:[^'\\]|\\.)*)',", body, re.M):
        lines[m.group(1)] = m.group(2)
    return lines

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='he-IL-AvriNeural')
    ap.add_argument('--rate', default='-4%')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    lines = load_lines()
    ok = 0
    for key, text in lines.items():
        path = os.path.join(OUT, key + '.mp3')
        if os.path.exists(path) and not a.force:
            ok += 1
            continue
        spoken = text.replace('(', ', ').replace(')', '')
        r = subprocess.run(['edge-tts', '--voice', a.voice, '--rate=' + a.rate, '--text', spoken, '--write-media', path], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(path) or os.path.getsize(path) == 0:
            print('FAILED', key, r.stderr[-300:], file=sys.stderr)
            if os.path.exists(path): os.remove(path)
            continue
        ok += 1
        print('ok', key)
    json.dump(sorted(lines), open(os.path.join(OUT, 'index.json'), 'w'))
    print(f'{ok}/{len(lines)} voice lines ready in assets/voice')
    if ok == 0: sys.exit(1)

main()
