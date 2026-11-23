"""Bygger index.html (norsk) og en.html (engelsk): all data, suncalc, CSS og JS legges inn i én fil per språk."""
import json
from pathlib import Path

gater = Path("data/kvadraturen.json").read_text()
# Absolutt URL kreves for og:image (GitHub Pages). Endre hvis siden ligger et annet sted.
BASE = "https://alexanno.github.io/KvadraturHenge/"


def bygg(ut: str, lang: str, body: str, tittel: str, beskrivelse: str) -> None:
    bilde = BASE + "img/kvadraturhenge.jpg"
    html = f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{tittel}</title>
<meta name="description" content="{beskrivelse}">
<meta property="og:type" content="website"><meta property="og:title" content="{tittel}"><meta property="og:description" content="{beskrivelse}"><meta property="og:image" content="{bilde}"><meta name="twitter:card" content="summary_large_image">
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


bygg("index.html", "nb", "body.html", "KvadraturHenge", "Når står solen rett langs gatene i Kvadraturen i Kristiansand? Norges svar på Manhattanhenge.")
bygg("en.html", "en", "body_en.html", "KvadraturHenge – when the sun lines up with the streets of Kristiansand", "Norway's answer to Manhattanhenge: find when the sun shines straight down the streets of Kvadraturen in Kristiansand.")
