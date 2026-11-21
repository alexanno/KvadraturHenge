# KvadraturHenge

Som Manhattanhenge, men for Kvadraturen i Kristiansand: når står solen parallelt med gatene?

Liten webapp (én HTML-fil, all data og alle biblioteker embedded) som viser når solen står parallelt med gatene i Kvadraturen, Kristiansand.

- `uv run hent_data.py` henter gatene fra OSM med osmnx → `data/kvadraturen.json`
- `uv run bygg.py` bygger `index.html` (norsk) og `en.html` (engelsk, for turister) (gatedata + [SunCalc](https://github.com/mourner/suncalc) 1.9.0 + `app.js` + CSS). Tekster ligger i `body.html`/`body_en.html` og i `TXT` øverst i `app.js`
- Åpne `index.html` direkte i nettleseren, ingen server nødvendig

Solposisjon: SunCalc (azimut/høyde, norsk tid med sommertid). Gatene deles i segmenter med lengde og retning; «andel» er lengdeandelen som ligger innen ±toleranse av solas retning.
