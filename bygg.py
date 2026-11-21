"""Bygger index.html (norsk) og en.html (engelsk): all data, suncalc, CSS og JS legges inn i én fil per språk."""
import json
from pathlib import Path

gater = Path("data/kvadraturen.json").read_text()


def bygg(ut: str, lang: str, body: str, tittel: str) -> None:
    html = f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{tittel}</title>
<style>{Path("style.css").read_text()}</style></head>
<body>
{Path(body).read_text()}
<script>{Path("suncalc.js").read_text()}</script>
<script>const GATER = {gater};</script>
<script>{Path("app.js").read_text()}</script>
</body></html>
"""
    Path(ut).write_text(html)
    print(ut, round(len(html) / 1024), "kB")


bygg("index.html", "nb", "body.html", "KvadraturHenge")
bygg("en.html", "en", "body_en.html", "KvadraturHenge – when the sun lines up with the streets of Kristiansand")
