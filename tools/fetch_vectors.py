"""Download every building footprint, road and named place for Bahrain from Overture Maps
(open data: OpenStreetMap + ML-derived footprints) into parquet files."""
import sys, json, duckdb
OUT = sys.argv[1]
REL = "2026-10-21.0"
b = json.load(open(sys.argv[2]))
W, E, S, N = b["west"], b["east"], b["south"], b["north"]
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
def src(theme, typ): return f"read_parquet('s3://overturemaps-us-west-2/release/{REL}/theme={theme}/type={typ}/*', hive_partitioning=1)"
box = f"bbox.xmin < {E} AND bbox.xmax > {W} AND bbox.ymin < {N} AND bbox.ymax > {S}"
jobs = {
 "buildings": f"SELECT id, ST_AsWKB(geometry) AS wkb, height, num_floors, class, subtype, names.primary AS name, roof_color, facade_color, sources[1].dataset AS src FROM {src('buildings','building')} WHERE {box}",
 "roads": f"SELECT id, ST_AsWKB(geometry) AS wkb, class, subtype, names.primary AS name, list_extract(map_extract(names.common,'en'),1) AS name_en FROM {src('transportation','segment')} WHERE {box}",
 "places": f"SELECT names.primary AS name, list_extract(map_extract(names.common,'en'),1) AS name_en, basic_category AS cat, confidence, ST_X(geometry) AS lon, ST_Y(geometry) AS lat FROM {src('places','place')} WHERE {box}",
 "divisions": f"SELECT names.primary AS name, list_extract(map_extract(names.common,'en'),1) AS name_en, subtype, class, ST_X(geometry) AS lon, ST_Y(geometry) AS lat FROM {src('divisions','division')} WHERE {box}",
 "landuse": f"SELECT ST_AsWKB(geometry) AS wkb, class, subtype, names.primary AS name FROM {src('base','land_use')} WHERE {box}",
}
for k in sys.argv[3:] or jobs:
    con.execute(f"COPY ({jobs[k]}) TO '{OUT}/{k}.parquet' (FORMAT parquet)")
    print(k, con.execute(f"SELECT count(*) FROM '{OUT}/{k}.parquet'").fetchone()[0], flush=True)
