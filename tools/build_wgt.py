#!/usr/bin/env python3
"""
Fabrique dist/NC-TV.wgt (non signé) à installer avec Apps2Samsung,
qui se charge lui-même de la signature. Usage : python3 tools/build_wgt.py
"""
import os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ["config.xml", "index.html", "icon.png", "css", "js"]
out = os.path.join(ROOT, "dist", "NC-TV.wgt")
os.makedirs(os.path.dirname(out), exist_ok=True)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for item in FILES:
        path = os.path.join(ROOT, item)
        if os.path.isdir(path):
            for dirpath, _, names in os.walk(path):
                for n in sorted(names):
                    full = os.path.join(dirpath, n)
                    z.write(full, os.path.relpath(full, ROOT))
        else:
            z.write(path, item)
print("OK :", out)
