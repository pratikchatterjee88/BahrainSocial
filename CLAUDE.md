# Bahrain Social — project notes for Claude

A browser-based 3D model of Bahrain with a social layer on top. People fly around the island, find places, and leave tags, tips, notes, questions and events on the map. See `PLAN.md` for what is planned and `README.md` for the public description.

## Current state

- Published as a private Claude artifact: https://claude.ai/artifact/4mNwZYpEEN4ZgDm4trtbgJ
- Also builds to a standalone `bahrain.html` (about 20 MB, opens by double-click; social data is then kept in that browser only).
- Prototype stage. Not public, no payments, no real accounts.

## What is built

### The 3D model (`src/main.js`)
- three.js 0.170, bundled with esbuild into one script. Units are kilometres; x is east, z is south, origin at the centre of the imagery mosaic.
- **Terrain:** Sentinel-2 imagery draped on SRTM elevation, 62 × 105 km, true vertical scale. Water mask derived from the imagery; animated sea with shoreline foam.
- **Buildings:** 191,495 footprints extruded per 1 km tile and streamed around the camera target. Heights come from mapped height, mapped floor count, a per-building satellite estimate, a 100 m block average, or a small default, in that order.
- **Building detail:** stepped towers, set-back penthouses, parapets, pitched tile roofs on some houses, mosque domes and minarets (258), ribbed industrial sheds (643), generated facades (windows, balconies, shopfronts, signs), per-building paint and tinted tower glass.
- **Close-range detail** (within about 2 km): walled compounds with gates, yards, parked cars, garden trees, rooftop stair heads, water tanks and AC units, street lamps.
- **Roads:** 105,317 segments as ribbons with pavements, kerbs and lane markings; 262 bridge segments raised on decks with piers; palms along main roads.
- **Traffic:** up to 9,000 instanced 3D cars near the camera, driving on the right in lane. Count and speed follow a simulated daily pattern from the time slider (peaks near 07:30 and 17:00). Not live data.
- **Landmarks built by hand:** Bahrain World Trade Center sails and turbine bridges, Al Fateh Grand Mosque dome and minarets, Financial Harbour tower blades.
- **Light:** sun position for 26.07°N at the equinox over a 24-hour clock, one moving shadow map, a top-down occupancy map for contact shadows, clouds, stars, bloom and a colour grade.
- **Detail levels:** Lite, Low, Medium, High, Ultra, plus Auto which steps between Lite and High on frame time. Rooftop clutter, cars, bloom and trees need Medium or higher.
- **Fallback (`src/fallback.js`):** if WebGL is unavailable the page shows a flat, rotatable satellite view with a notice.

### The social layer (`src/social.js`)
- **Explore:** 4,341 places in 24 groups under Food, Everyday and Go out. Nearest 12, distance, fly-to, hearts, "most loved first", a place card with tips.
- **Social:** notes (24 h or 7 days), questions with answers (14 days), events with "I'm going". Feed sorted by nearness and recency, filters, clickable map markers, compose at the crosshair.
- **Me:** nickname, favourite food, tag yourself, "open the map at my tag", list of your live posts.
- **Safety:** positions snap to about 100 m, links are stripped, all user text is rendered as plain text, three reports hide an item, the owner can hide anything.

### Page (`src/page.html`)
- Dark single-screen layout: title card with search (top left), Explore / Social / Me / View bar (top right), where-am-I readout (bottom left), landmark chips and clock (bottom right), About panel.

## Data storage

One document per person per collection in the artifact's shared database. Everyone can read; each person writes only their own document; the owner can write any.

| Collection | Holds |
|---|---|
| `tags` | name, favourite food, snapped position |
| `faves` | ids of hearted places |
| `tips` | that person's tips, keyed by place id |
| `posts` | that person's notes, questions, events |
| `replies` | that person's answers |
| `rsvps` | event ids they are going to |
| `reports` | item ids they reported |
| `mod/hidden` | item ids hidden by the owner (owner-write only) |

The post and tip limits (20 live posts, 50 tips) are enforced in page code only.

## File map

```
src/entry.js        picks the 3D viewer or the fallback
src/main.js         renderer, shaders, city streaming, traffic, labels, search, UI wiring
src/social.js       places, tags, tips, posts, storage
src/fallback.js     no-WebGL view
src/page.html       markup and CSS (no <html>/<body>; the build wraps it)
tools/fetch_data.py     downloads imagery and elevation tiles
tools/process_data.py   makes imagery.jpg, water.png, height.png
tools/fetch_vectors.py  downloads Overture buildings, roads, places, divisions
tools/pack_city.py      packs buildings, roads, search, governorates, places
tools/build.mjs         bundles everything into bahrain.html and bahrain.body.html
data/                   built assets the page loads
```

`src/*.prev*.js` and `src/page.prev.html` are manual backups from earlier steps and can be deleted.

## Build and publish

```bash
node tools/build.mjs
```

Outputs:
- `bahrain.html`: standalone, all data inlined.
- `bahrain.body.html`: the artifact version. It loads `city/*` files published beside it.

Publishing uses the Artifact tool on `bahrain.body.html` with the files under `data/city/` (the two binary packs go as `buildings.b64.txt` and `roads.b64.txt`, because artifacts cannot serve `.bin`), and the `db` rules plus `user` capability.

## Things to know before changing anything

- **Raw source data is not in the repo.** The Python tools were run against a temporary folder holding the parquet downloads, the GHSL height raster and the full-size imagery mosaic. Several of those were fetched with one-off commands (per-building heights, bridge flags, governorate areas, places with cuisine). Re-running `pack_city.py` needs them fetched again; the fetch steps should be folded into `fetch_vectors.py`.
- **Licences block commercial use as-is.** Imagery is Sentinel-2 cloudless 2024 by EOX (CC BY-NC-SA). The GlobalBuildingAtlas licence has not been checked. Overture/OSM data needs attribution and share-alike.
- **Roads are drawn lifted** above the ground by `0.4 m + 0.6 m per km of camera distance`. Anything that sits on a road (cars) must apply the same lift.
- **Per-tile and global caps** exist for cars and close-range detail. Raise them with care; main roads are filled first.
- **One-way roads are guessed:** motorway and trunk are treated as one-way, everything else two-way.
- **The artifact page cannot call outside services.** Live traffic, Google data and payments all need real hosting.
- **Testing:** headless Chrome with `--use-angle=metal --virtual-time-budget=…` renders only about 20 frames, so anything that streams in over time may be missing from a screenshot. The user's own Chrome sometimes has WebGL disabled.
- **`?v=lon,lat,distanceKm,azimuth,elevation[,hour]`** in the URL sets the opening camera, useful for test shots of the standalone file.

## Known gaps

- Compose for questions and events, tip saving, RSVP by click, Report and Hide have not been exercised through the UI.
- Moving cars have only been checked in headless stills and logs.
- Tall towers without a mapped height are still likely too short.
- No junction behaviour for cars; no boats or aircraft.
