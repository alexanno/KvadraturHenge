"""Bygger index.html: all data, suncalc, CSS og JS legges inn i én fil."""
import json
from pathlib import Path

gater = Path("data/kvadraturen.json").read_text()
html = f"""<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KvadraturHenge</title>
<style>{Path("style.css").read_text()}</style></head>
<body>
{Path("body.html").read_text()}
<script>{Path("suncalc.js").read_text()}</script>
<script>const GATER = {gater};</script>
<script>{Path("app.js").read_text()}</script>
</body></html>
"""
Path("index.html").write_text(html)
print("index.html", round(len(html) / 1024), "kB")
