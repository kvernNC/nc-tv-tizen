#!/usr/bin/env python3
"""
Test à lancer sur ton PC (depuis la Calédonie) : vérifie quelles variantes du
flux NC La 1ère répondent, et affiche l'URL signée à coller dans VLC.
Aucune dépendance : python3 tools/test_stream.py
"""
import json, urllib.parse, urllib.request

TOKEN = "https://hdfauth.ftven.fr/esi/TA?format=json&url="
BASE = "https://simulcast-b.ftven.fr/simulcast/1er_Nouvelle_Caledonie/{}/1er_Nouvelle_Caledonie.m3u8"
VARIANTS = ["hls_1er_NC", "hls_nc_1er_NC", "hls_local_1er_NC", "hls_monde_1er_NC"]
UA = {"User-Agent": "Mozilla/5.0"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
        return r.status, r.read().decode("utf-8", "replace")

for v in VARIANTS:
    raw = BASE.format(v)
    try:
        signed = json.loads(get(TOKEN + urllib.parse.quote(raw, safe=""))[1])["url"]
        status, body = get(signed)
        res = [l.split("RESOLUTION=")[1].split(",")[0] for l in body.splitlines() if "RESOLUTION=" in l]
        print(f"[OK ] {v:18} résolutions: {', '.join(res)}")
        print(f"      URL VLC : {signed}\n")
    except Exception as e:
        print(f"[NON] {v:18} {e}")
