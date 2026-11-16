"""Turn the raw mosaics into the web assets: colour texture, water mask, heightmap."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
RAW, OUT = sys.argv[1], sys.argv[2]

img = Image.open(f"{RAW}/imagery_full.png")
h = np.load(f"{RAW}/dem.npy")
H, W = h.shape

# --- water mask: SRTM says sea (<=0) AND the pixel looks like water (blue/green > red)
small = np.asarray(img.resize((W, H), Image.LANCZOS)).astype(np.float32)
r, g, b = small[..., 0], small[..., 1], small[..., 2]
lum = 0.3 * r + 0.5 * g + 0.2 * b
watery = ((np.maximum(g, b) - r > 10) & (r < 150)) | (lum < 48)
hm = ndi.median_filter(h, 3)                       # despike SRTM outliers
water = watery & (hm <= 2.0)
water = ndi.binary_opening(water, iterations=1)
water = ndi.binary_closing(water, iterations=1)
lab, n = ndi.label(~water)                         # drop specks of "land" in open sea
sizes = ndi.sum(~water, lab, range(1, n + 1))
water |= np.isin(lab, np.where(sizes < 30)[0] + 1)
lab, n = ndi.label(water)                          # drop tiny inland "water" specks
sizes = ndi.sum(water, lab, range(1, n + 1))
water &= ~np.isin(lab, np.where(sizes < 40)[0] + 1)

# --- heights (metres): clean, clamp, flat sea, land always above sea level
hc = np.clip(hm, 0, 140)
hc = ndi.gaussian_filter(hc, 1.6)
hc = np.where(water, 0, np.maximum(hc, 1.5))
shore = ndi.gaussian_filter((~water).astype(np.float32), 1.5)   # soften the coast step
hc = hc * np.clip(shore * 2 - 0.3, 0, 1)
q = np.round(hc * 256).astype(np.uint16)            # 1/256 m precision in R,G
rgb = np.dstack([q >> 8, q & 255, np.zeros_like(q)]).astype(np.uint8)
Image.fromarray(rgb).save(f"{OUT}/height.png", optimize=True)

mask = ndi.gaussian_filter(water.astype(np.float32), 0.8)
Image.fromarray((mask * 255).astype(np.uint8)).save(f"{OUT}/water.png", optimize=True)

tw = 4608; th = round(tw * img.height / img.width)
img.resize((tw, th), Image.LANCZOS).save(f"{OUT}/imagery.jpg", quality=84, optimize=True, subsampling=1)
print("tex", tw, th, "max h", hc.max(), "water frac", water.mean())
Image.fromarray((mask*255).astype('u1')).resize((700,1200)).save(f"{RAW}/../prev_mask.png")
