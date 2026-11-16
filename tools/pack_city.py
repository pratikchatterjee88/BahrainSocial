"""Pack Overture buildings / roads / names into compact per-tile Int16 streams for the viewer.

Coordinates are local metres on the same grid the terrain uses (x east, z south, origin at the
centre of the imagery mosaic), stored as decimetres relative to each 1 km tile's corner.
"""
import sys, json, math, hashlib
import numpy as np, pandas as pd, shapely
from shapely import wkb
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

VEC, RAW, DATA = sys.argv[1], sys.argv[2], sys.argv[3]
B = json.load(open(f"{DATA}/bounds.json"))
R = 6371008.8
merc = lambda lat: np.arcsinh(np.tan(np.radians(lat)))
lat0 = (B["north"] + B["south"]) / 2; k0 = math.cos(math.radians(lat0))
W_M = math.radians(B["east"] - B["west"]) * R * k0
H_M = (merc(B["north"]) - merc(B["south"])) * R * k0
TILE = 1000.0

def to_local(coords):                       # (n,2) lon/lat -> (n,2) x,z metres
    u = (coords[:, 0] - B["west"]) / (B["east"] - B["west"])
    v = (merc(coords[:, 1]) - merc(B["south"])) / (merc(B["north"]) - merc(B["south"]))
    return np.column_stack([(u - 0.5) * W_M, -(v - 0.5) * H_M])

def local_geom(g): return shapely.transform(g, to_local)
def h01(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

img = np.asarray(Image.open(f"{RAW}/imagery_full.png"))
IH, IW = img.shape[:2]
def roof_rgb(x, z):
    px = int((x / W_M + 0.5) * IW); py = int((z / H_M + 0.5) * IH)
    px = min(max(px, 1), IW - 2); py = min(max(py, 1), IH - 2)
    return img[py - 1:py + 2, px - 1:px + 2].reshape(-1, 3).mean(0)

# GHSL average building height (JRC, 100 m cells, Mollweide): the satellite estimate used where nothing is mapped
import glob, tifffile
_t = tifffile.TiffFile(glob.glob(sys.argv[4] + "/*.tif")[0]).pages[0]
GH = _t.asarray(); _tp = _t.tags["ModelTiepointTag"].value; GX0, GY0 = _tp[3], _tp[4]
def moll(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat); th = phi
    for _ in range(30): th -= (2 * th + math.sin(2 * th) - math.pi * math.sin(phi)) / (2 + 2 * math.cos(2 * th))
    return 2 * math.sqrt(2) / math.pi * 6378137.0 * lam * math.cos(th), math.sqrt(2) * 6378137.0 * math.sin(th)
def sat_height(lon, lat):
    x, y = moll(lon, lat); cx, cy = int((x - GX0) / 100), int((GY0 - y) / 100)
    w = GH[cy - 1:cy + 2, cx - 1:cx + 2]; w = w[w > 2.6]
    return float(GH[cy, cx]) if GH[cy, cx] > 2.6 else (float(w.mean()) if len(w) else 0.0)

# GlobalBuildingAtlas (TUM): a satellite-derived height for each individual building
_gba = pd.read_parquet(f"{VEC}/gba.parquet"); _gba = _gba[_gba.height > 0]
_gbag = [wkb.loads(bytes(w)) for w in _gba.wkb]; _gbah = _gba.height.values
_gbat = shapely.STRtree(_gbag)
def gba_height(pt):
    hit = _gbat.query(pt, predicate="within")
    return float(_gbah[hit[0]]) if len(hit) else 0.0

def est_height(row, area, seed, lon, lat):
    """returns (height m, source) with source 1 = mapped height, 2 = mapped floor count, 3 = satellite, 0 = default"""
    h = row.height
    if h == h and h > 0: return max(3.0, float(h)), 1
    f = row.num_floors
    if f == f and f > 0: return max(3.0, float(f) * 3.3 + 1.0), 2
    if area >= 45:
        gh = gba_height(shapely.Point(lon, lat))
        if gh >= 9.0: return min(gh * (1.15 + min(max(gh - 22.0, 0.0) * 0.022, 0.85)), 190.0), 3   # it runs increasingly low the taller the building
        if gh >= 2.0: return max(1, round(gh * 1.25 / 3.3)) * 3.3 + 0.8, 3   # low-rise: snap to whole storeys plus a parapet
        sh = sat_height(lon, lat)
        if sh >= 4.0: return min(sh * (0.85 + 0.3 * seed), 120.0), 3
    # no survey: plausible Bahraini building for its footprint, varied deterministically
    if area < 45: return 3.0 + seed * 1.0, 0                 # sheds, annexes
    if area < 700: return 6.8 + seed * 3.2, 0                # two- to three-storey villas
    if area < 2500: return 8.0 + seed * 7.0, 0               # apartment blocks, shops
    return 8.0 + seed * 5.0, 0                               # warehouses, malls

# ------------------------------------------------------------------ buildings
bd = pd.read_parquet(f"{VEC}/buildings.parquet")
# mosques: tagged buildings plus any footprint that a mapped mosque place falls on
_pl = pd.read_parquet(f"{VEC}/places.parquet")
_mq = _pl[_pl.cat.fillna("").str.contains("mosque") | _pl.name.fillna("").str.contains("Mosque|Masjid|مسجد|جامع", regex=True)]
MOSQUE_PTS = shapely.points(_mq.lon.values, _mq.lat.values)
_geoms = [wkb.loads(bytes(w)) for w in bd.wkb]
_tree = shapely.STRtree(_geoms)
MOSQUE_IDX = set(int(j) for i, j in zip(*_tree.query(MOSQUE_PTS, predicate="within")))
print("mosque places", len(_mq), "matched footprints", len(MOSQUE_IDX))
def kind_of(i, row):
    nm = row.name if isinstance(row.name, str) else ""
    if row._5 == "mosque" or row.subtype == "religious" or i in MOSQUE_IDX or any(k in nm for k in ("Mosque", "Masjid", "مسجد", "جامع")): return 1
    if row._5 in ("industrial", "warehouse", "hangar", "storage_tank") or row.subtype == "industrial": return 2
    return 0
tiles = {}; nb = 0; nv = 0; srcn = [0, 0, 0, 0]
kinds = [0, 0, 0]
for row in bd.itertuples():
    g = _geoms[row.Index]
    kind = kind_of(row.Index, row)
    polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
    for pi, pg in enumerate(polys):
        if pg.geom_type != "Polygon": continue
        lg = local_geom(shapely.Polygon(pg.exterior)).simplify(0.35)
        if lg.is_empty or lg.geom_type != "Polygon" or lg.area < 12: continue
        ring = np.asarray(lg.exterior.coords)[:-1]
        if len(ring) < 3 or len(ring) > 400: continue
        c = lg.centroid; seed = h01(f"{row.id}{pi}")
        gc = pg.centroid
        h, real = est_height(row, lg.area, seed, gc.x, gc.y); srcn[real] += 1
        r, gg, b = roof_rgb(c.x, c.y)
        rgb565 = (int(r) >> 3 << 11) | (int(gg) >> 2 << 5) | (int(b) >> 3)
        tx, tz = math.floor(c.x / TILE), math.floor(c.y / TILE)
        rel = np.round((ring - [tx * TILE, tz * TILE]) * 10).astype(np.int64)
        if np.abs(rel).max() > 32000: continue
        rec = np.concatenate([[len(ring), min(int(round(h * 10)), 32000), rgb565, real | (int(seed * 63) << 2) | (kind << 8)], rel.ravel()])
        tiles.setdefault((tx, tz), []).append(rec.astype(np.uint16))
        nb += 1; nv += len(ring); kinds[kind] += 1
print("buildings", nb, "ring verts", nv, "height sources [default, height, floors, satellite]", srcn, "tiles", len(tiles), "kinds [plain, mosque, industrial]", kinds)

# ------------------------------------------------------------------ roads
CLS = {"motorway": 0, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4, "residential": 5,
       "unclassified": 5, "living_street": 5, "service": 6, "track": 7, "pedestrian": 7}
rd = pd.read_parquet(f"{VEC}/roads.parquet")
# bridges: raised decks, ramped down only at ends that do not continue onto another bridge segment
BRIDGE = set(pd.read_parquet(f"{VEC}/bridges.parquet").id)
_ends = {}
for row in rd[rd.id.isin(BRIDGE)].itertuples():
    g = wkb.loads(bytes(row.wkb))
    if g.geom_type != "LineString": continue
    for c in (g.coords[0], g.coords[-1]): _ends[(round(c[0], 6), round(c[1], 6))] = _ends.get((round(c[0], 6), round(c[1], 6)), 0) + 1
rtiles = {}; nr = 0; names = {}
for row in rd.itertuples():
    if row.subtype != "road": continue
    g = wkb.loads(bytes(row.wkb))
    if g.geom_type != "LineString": continue
    lg = local_geom(g)
    nm = row.name_en if isinstance(row.name_en, str) else row.name if isinstance(row.name, str) else None
    if nm:
        m = g.interpolate(0.5, normalized=True)
        names.setdefault(nm, []).append((m.x, m.y, row.name if isinstance(row.name, str) else ""))
    cls = CLS.get(getattr(row, "_3"))
    if cls is None: continue
    lg = lg.simplify(0.5)
    pts = np.asarray(lg.coords)
    if len(pts) < 2: continue
    tx, tz = math.floor(pts[0, 0] / TILE), math.floor(pts[0, 1] / TILE)
    rel = np.round((pts - [tx * TILE, tz * TILE]) * 10).astype(np.int64)
    if np.abs(rel).max() > 32000: continue
    if row.id in BRIDGE and cls <= 6:
        a, b = g.coords[0], g.coords[-1]
        cls |= 16 | (32 if _ends.get((round(a[0], 6), round(a[1], 6)), 0) < 2 else 0) | (64 if _ends.get((round(b[0], 6), round(b[1], 6)), 0) < 2 else 0)
    rtiles.setdefault((tx, tz), []).append(np.concatenate([[len(pts), cls], rel.ravel()]).astype(np.uint16))
    nr += 1
print("roads", nr, "tiles", len(rtiles), "named", len(names))

def write(tmap, path):
    idx = {}; out = []; off = 0
    for key in sorted(tmap):
        a = np.concatenate(tmap[key]); idx[f"{key[0]},{key[1]}"] = [off, len(a), len(tmap[key])]
        out.append(a); off += len(a)
    np.concatenate(out).astype("<u2").tofile(path); return idx

import os
os.makedirs(f"{DATA}/city", exist_ok=True)
index = {"tile": TILE, "b": write(tiles, f"{DATA}/city/buildings.bin"), "r": write(rtiles, f"{DATA}/city/roads.bin"),
         "count": nb, "sources": srcn}
json.dump(index, open(f"{DATA}/city/index.json", "w"), separators=(",", ":"))

# ------------------------------------------------------------------ search index + district labels
search = []                                   # [name, altName, lon, lat, kind]
dv = pd.read_parquet(f"{VEC}/divisions.parquet")
labels = []
for row in dv.itertuples():
    if row.subtype in ("country", "region"): continue
    en = row.name_en if isinstance(row.name_en, str) else None
    search.append([en or row.name, row.name if en else "", round(row.lon, 5), round(row.lat, 5), "a"])
    if en: labels.append([en, round(row.lat, 5), round(row.lon, 5), row.subtype])
for nm, pts in names.items():
    a = np.array([(p[0], p[1]) for p in pts]); med = np.median(a, 0)
    i = int(np.argmin(((a - med) ** 2).sum(1)))
    search.append([nm, pts[i][2] if pts[i][2] != nm else "", round(a[i, 0], 5), round(a[i, 1], 5), "r"])
pl = pd.read_parquet(f"{VEC}/places.parquet")
pl = pl[(pl.confidence > 0.6) & (pl.lon > B["west"]) & (pl.lon < B["east"]) & (pl.lat > B["south"]) & (pl.lat < B["north"])]
for row in pl.itertuples():
    search.append([row.name, "", round(row.lon, 5), round(row.lat, 5), "p"])
for row in bd[bd.name.notna()].itertuples():
    c = wkb.loads(bytes(row.wkb)).centroid
    search.append([row.name, "", round(c.x, 5), round(c.y, 5), "b"])
json.dump(search, open(f"{DATA}/city/search.json", "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(labels, open(f"{DATA}/city/districts.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("search entries", len(search), "district labels", len(labels))

# ------------------------------------------------------------------ governorates (boundaries + readout)
ar = pd.read_parquet(f"{VEC}/areas.parquet")
govs = []
for row in ar[(ar.subtype == "region") & (ar["class"] == "land")].itertuples():
    g = local_geom(wkb.loads(bytes(row.wkb))).simplify(25)
    polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
    polys = [p for p in polys if p.area > 4e4]
    big = max(polys, key=lambda p: p.area); c = big.representative_point()
    govs.append({"name": row.name_en.replace(" Governorate", ""), "ar": row.name, "label": [round(c.x / 1000, 3), round(c.y / 1000, 3)],
                 "rings": [[round(v / 1000, 4) for xy in p.exterior.coords for v in xy] for p in polys]})
json.dump(govs, open(f"{DATA}/city/govs.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("governorates", [(g["name"], len(g["rings"])) for g in govs])

# ------------------------------------------------------------------ food places (Overture places, with cuisine)
FOOD_GROUPS = [
    ("Arabic & Middle Eastern", "middle_eastern lebanese turkish persian arabian doner_kebab mediterranean halal greek"),
    ("Indian & South Asian", "indian pakistani nepalese"),
    ("East & South-East Asian", "asian thai japanese filipino chinese korean sushi asian_fusion indonesian"),
    ("Burgers & fast food", "burger fast_food chicken sandwich american diner fish_and_chips southern_american texmex mexican"),
    ("Grill & steak", "steakhouse barbecue bar_and_grill brazilian"),
    ("Pizza & Italian", "pizza italian"),
    ("Seafood", "seafood"),
    ("Coffee & cafés", "coffee_shop cafe tea_room bubble_tea_shop"),
    ("Sweets & bakery", "bakery ice_cream_shop dessert_shop chocolatier donut_shop candy_store cupcake_shop frozen_yogurt_shop smoothie_juice_bar"),
    ("Breakfast & brunch", "breakfast_and_brunch"),
    ("Vegetarian & healthy", "vegetarian health_food"),
    ("Other restaurants", "restaurant buffet french spanish theme food_and_drink"),
]
PLACE_SECTIONS = [
    ("Food", FOOD_GROUPS),
    ("Everyday", [
        ("Pharmacies", "pharmacy"),
        ("Hospitals & clinics", "hospital outpatient_care_facility doctor family_practice urgent_care_clinic medical_center"),
        ("Petrol stations", "gas_station"),
        ("Banks & ATMs", "bank bank_or_credit_union atm credit_union"),
        ("Supermarkets", "grocery_store supermarket convenience_store organic_grocery_store ethical_grocery_store"),
    ]),
    ("Go out", [
        ("Beaches", "beach beach_resort"),
        ("Parks", "park playground amusement_park water_park"),
        ("Historic sites", "historic_site fort palace monument lighthouse"),
        ("Museums & culture", "museum history_museum art_museum science_museum cultural_center"),
        ("Cinemas", "movie_theater"),
        ("Hotels", "hotel resort"),
        ("Malls", "shopping_mall"),
    ]),
]
ALL_GROUPS = [(sec, name, keys.split()) for sec, (_, groups) in enumerate(PLACE_SECTIONS) for name, keys in groups]
def place_group(t):
    base = t.replace("_restaurant", "")
    for i, (sec, _, keys) in enumerate(ALL_GROUPS):
        if t in keys or (sec == 0 and base in keys) or (t.endswith("_clinic") and "hospital" in keys): return i
    return None
import os.path
if os.path.exists(f"{VEC}/places_food.parquet"):
    fp = pd.read_parquet(f"{VEC}/places_food.parquet")
    fp = fp[(fp.confidence > 0.5) & fp.name.notna() & (fp.lon > B["west"]) & (fp.lon < B["east"]) & (fp.lat > B["south"]) & (fp.lat < B["north"])]
    out, seen = [], set()
    for row in fp.itertuples():
        if not isinstance(row.tax, str): continue
        t = json.loads(row.tax).get("primary") or ""; gi = place_group(t)
        if gi is None: continue
        fid = hashlib.md5(f"{row.name}{row.lon:.4f}{row.lat:.4f}".encode()).hexdigest()[:10]
        if fid in seen: continue
        seen.add(fid)
        out.append([fid, row.name, round(row.lon, 5), round(row.lat, 5), gi, t.replace("_restaurant", "").replace("_shop", "").replace("_", " ")])
    json.dump({"sections": [sec for sec, _ in PLACE_SECTIONS], "groups": [[sec, name] for sec, name, _ in ALL_GROUPS], "places": out},
              open(f"{DATA}/city/places.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print("places", len(out), [sum(1 for f in out if f[4] == i) for i in range(len(ALL_GROUPS))])
