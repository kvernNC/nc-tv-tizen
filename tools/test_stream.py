#!/usr/bin/env python3
"""
Test à lancer sur ton PC (depuis la Calédonie) : pour chaque chaîne de
js/channels.js, indique quelles adresses répondent et donne une URL pour VLC.
Aucune dépendance : python3 tools/test_stream.py
"""
import json, os, re, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = "https://hdfauth.ftven.fr/esi/TA?format=json&url="
UA = {"User-Agent": "Mozilla/5.0"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
        return r.read().decode("utf-8", "replace")

def channels():
    src = open(os.path.join(ROOT, "js", "channels.js"), encoding="utf-8").read()
    consts = dict(re.findall(r"var (\w+) = '([^']+)';", src))
    block = src[src.index("var CHANNEL_LIST"):]
    for name, body in re.findall(r"\{ name: '([^']+)',\s*urls: \[(.*?)\]\s*\}", block, re.S):
        urls = [consts[c] + path for c, path in re.findall(r"(\w+) \+ '([^']+)'", body)]
        yield name, urls

def check_paratv():
    m3u = get("https://raw.githubusercontent.com/Paradise-91/ParaTV/main/playlists/paratv/group/france/france.m3u")
    name, ua = None, UA["User-Agent"]
    for line in m3u.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF"):
            name = re.sub(r"^\d+\.\s*", "", line.rsplit(",", 1)[-1]); ua = UA["User-Agent"]
        elif line.startswith("#EXTVLCOPT:http-user-agent="):
            ua = line.split("=", 1)[1]
        elif line and not line.startswith("#") and name:
            try:
                req = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": ua}), timeout=20).read().decode("utf-8", "replace")
                master = req(line)
                v = [l for l in master.splitlines() if l and not l.startswith("#")]
                if not v: raise ValueError("lien expiré ou vide")
                sub = req(v[0]) if v[0].startswith("http") else ""
                print(f"  [OK ] {name}")
            except Exception as e:
                print(f"  [NON] {name}  {e}")
            name = None

for name, urls in channels():
    print(f"=== {name}")
    for raw in urls:
        short = raw.split("/simulcast/")[-1]
        try:
            signed = json.loads(get(TOKEN + urllib.parse.quote(raw, safe="")))["url"]
            master = get(signed)
            variants = [l for l in master.splitlines() if l and not l.startswith("#")]
            if not variants:
                raise ValueError("playlist vide ou refusée")
            v = variants[-1] if variants[-1].startswith("http") else signed.rsplit("/", 1)[0] + "/" + variants[-1]
            segs = [l for l in get(v).splitlines() if l and not l.startswith("#")]
            s = segs[-1] if segs[-1].startswith("http") else v.rsplit("/", 1)[0] + "/" + segs[-1]
            urllib.request.urlopen(urllib.request.Request(s, headers=UA), timeout=20).read(1000)
            res = re.findall(r"RESOLUTION=(\d+x\d+)", master)
            print(f"  [OK ] {short}  ({res[-1] if res else '?'})")
            print(f"        VLC : {signed}")
        except Exception as e:
            print(f"  [NON] {short}  {e}")

print("=== Chaînes ParaTV (ajoutées automatiquement à la suite dans l'app)")
check_paratv()
