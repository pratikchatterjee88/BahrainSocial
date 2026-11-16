"""Download real satellite imagery (Sentinel-2 cloudless, EOX) and elevation
(AWS Terrain Tiles / SRTM) for Bahrain and stitch them into data/."""
import math, os, sys, io, json, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

OUT = sys.argv[1]; CACHE = sys.argv[2]
W, E, S, N = 50.28, 50.86, 25.52, 26.36
ZI, ZD = 14, 12
IMG = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

def tx(lon, z): return (lon + 180) / 360 * 2**z
def ty(lat, z):
    r = math.radians(lat)
    return (1 - math.asinh(math.tan(r)) / math.pi) / 2 * 2**z
def lon_of(x, z): return x / 2**z * 360 - 180
def lat_of(y, z): return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2**z))))

# snap bbox to DEM tile grid so both mosaics cover the identical area
x0, x1 = int(tx(W, ZD)), int(tx(E, ZD)) + 1
y0, y1 = int(ty(N, ZD)), int(ty(S, ZD)) + 1

def get(url, path):
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "terrain-model-builder/1.0"})
        for a in range(4):
            try:
                d = urllib.request.urlopen(req, timeout=30).read(); break
            except Exception as e:
                if a == 3: raise
        open(path, "wb").write(d)
    return path

def mosaic(tmpl, z, ext, mode):
    f = 2 ** (z - ZD)
    xs, ys = range(x0 * f, x1 * f), range(y0 * f, y1 * f)
    jobs = [(x, y) for x in xs for y in ys]
    def one(j):
        x, y = j
        return j, get(tmpl.format(z=z, x=x, y=y), f"{CACHE}/{z}_{x}_{y}.{ext}")
    out = Image.new(mode, (len(xs) * 256, len(ys) * 256))
    with ThreadPoolExecutor(8) as ex:
        for (x, y), p in ex.map(one, jobs):
            out.paste(Image.open(p).convert(mode), ((x - xs[0]) * 256, (y - ys[0]) * 256))
    print(z, len(jobs), "tiles", out.size); return out

img = mosaic(IMG, ZI, "jpg", "RGB")
img.save(f"{OUT}/imagery_full.png")
dem = np.asarray(mosaic(DEM, ZD, "png", "RGB")).astype(np.float32)
h = dem[..., 0] * 256 + dem[..., 1] + dem[..., 2] / 256 - 32768
np.save(f"{OUT}/dem.npy", h)
meta = dict(west=lon_of(x0, ZD), east=lon_of(x1, ZD), north=lat_of(y0, ZD), south=lat_of(y1, ZD))
json.dump(meta, open(f"{OUT}/bounds.json", "w"))
print(meta, "elev", h.min(), h.max())
