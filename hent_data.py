"""Henter gatene i Kvadraturen fra OSM og skriver dem til data/kvadraturen.json (brukes av bygg.py)."""
import json
from pathlib import Path

import osmnx as ox

ox.settings.use_cache = True
ox.settings.cache_folder = "cache"

DOMKIRKEN = (58.14615, 7.99590)  # lat, lon (Kristiansand domkirke)
FILTER = '["highway"~"primary|secondary|tertiary|residential|living_street|pedestrian|unclassified"]'

G = ox.graph_from_point(DOMKIRKEN, dist=650, custom_filter=FILTER, simplify=True)
G = ox.convert.to_undirected(G)
G = ox.bearing.add_edge_bearings(G)
print("orientasjonsentropi:", round(ox.bearing.orientation_entropy(G), 3))

_, edges = ox.graph_to_gdfs(G)
gater = []
for _, e in edges.iterrows():
    navn = e.get("name")
    gater.append(
        {
            "navn": navn if isinstance(navn, str) else "",
            "lengde": round(e["length"], 1),
            "retning": round(e["bearing"], 1),  # kompassretning 0-360, start->slutt
            "coords": [[round(x, 5), round(y, 5)] for x, y in e.geometry.coords],  # lon, lat
        }
    )
Path("data").mkdir(exist_ok=True)
Path("data/kvadraturen.json").write_text(json.dumps(gater, ensure_ascii=False))
print(len(gater), "gatestrekninger,", round(sum(g["lengde"] for g in gater)), "m")
