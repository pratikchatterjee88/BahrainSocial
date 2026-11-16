# Bahrain Social — plan

Everything we have discussed, in one place: what is done, what is next, and the ideas still open.

## Vision

A place for people in Bahrain to find what they are searching for and to socialise around it. Like a map app, but more interactive: a 3D Bahrain people enjoy flying around, with local knowledge that ordinary maps lack (what's good here, what's on tonight, ask people nearby).

## Done

- [x] 3D terrain from satellite imagery and elevation
- [x] All buildings and roads, streamed around the camera
- [x] Realism passes: building shapes, colour, roofs, mosques, compounds, palms, bridges, clouds, bloom
- [x] Day and night with a 24-hour clock
- [x] Detail levels with Auto
- [x] Hand-built landmarks: World Trade Center, Al Fateh Mosque, Financial Harbour blades
- [x] Search by road, area, place and coordinates
- [x] Explore: 4,341 places in Food, Everyday and Go out
- [x] Hearts and tips on places
- [x] Notes, questions with answers, events with "I'm going"
- [x] Tag yourself; open the map at your tag
- [x] Report, auto-hide at three reports, owner hide
- [x] 3D cars with simulated time-of-day traffic
- [x] Fallback view when WebGL is off

## Next: finish the prototype

- [ ] Test with real people: share the page with a few friends as Contributors
- [ ] Exercise what is untested: posting questions and events through the form, saving tips, RSVP, Report, Hide
- [ ] Seed content before showing it more widely, so the map does not look empty
- [ ] Replace the drop-down menus in the compose form with buttons (they are awkward on some devices)
- [ ] Script the hand-run data downloads so the data can be rebuilt from scratch
- [ ] Delete the `*.prev*` backup files and put the project under git

## Explore ideas

- [ ] More categories: mosques and places of worship, schools, salons, gyms, car services, government offices, embassies
- [ ] Opening hours and phone numbers where the open data has them
- [ ] "Near me": open at your tag with your favourite food already listed
- [ ] Saved lists (my favourites, want to try)
- [ ] Directions between two points

## Social ideas

- [ ] Photos on tips and posts
- [ ] Follow people or areas; a notification when someone answers your question
- [ ] Private groups (family, friends, a compound) with their own pins
- [ ] Weekly "what's on" digest of events
- [ ] Badges for helpful contributors

## Realism backlog

- [ ] Split large outlines into wings of different heights; recessed windows and porches as real geometry
- [ ] Soft corner shadowing and a proper sky reflection on glass
- [ ] More hand-built landmarks: Four Seasons, Bab Al Bahrain, Bahrain Fort, National Museum, F1 circuit, airport terminal
- [ ] Correct the tallest towers from a published list
- [ ] Boats in marinas, aircraft at the airport
- [ ] Cars that stop at junctions and turn; real one-way data
- [ ] Higher-resolution ground imagery (commercial licence needed)
- [ ] Optional: photoreal stills or a fly-through video rendered in Blender

## Live traffic

- [ ] Choose a provider (TomTom or HERE) and test its coverage on known Bahrain roads
- [ ] Small server piece that holds the key and passes traffic to the page
- [ ] Match provider roads to the model's roads
- [ ] Colour roads by live speed and drive the cars from it; show incidents

Needs public hosting and a provider account. Until then traffic stays simulated.

## Going public

Required before anyone outside an invited group can use it:

- [ ] Hosting on Cloudflare (Pages or Workers)
- [ ] Its own sign-up and login
- [ ] A real database in place of the prototype storage, with limits enforced on the server
- [ ] Replace the non-commercial imagery (EOX 2016 mosaic, a paid EOX licence, or our own Sentinel-2 mosaic)
- [ ] Confirm the GlobalBuildingAtlas licence, or fall back to block-average heights
- [ ] Attribution page and share-alike compliance for OpenStreetMap data
- [ ] Moderation: automatic text filters, a daily queue, block and ban
- [ ] Terms of use and a privacy policy
- [ ] Phone layout and performance pass; install to the home screen

## Making money

Open decision: **who pays.** Not yet answered.

**Option A: businesses pay, the public uses it free (recommended)**
- [ ] Claim your place: verified owner, photos, hours, menu, contact
- [ ] Offers and promoted pins
- [ ] Featured placement in Explore
- [ ] Insights: how many people viewed, hearted or flew to the place
- [ ] Sponsored events
- [ ] Self-service sign-up and monthly billing

**Option B: the public pays**
- [ ] Premium plan: private groups, saved lists, no promoted pins, early event access

**Option C: one-off sales**
- [ ] License the 3D model or custom renders to developers, architects, tourism bodies or event organisers
- [ ] Branded versions for a mall, hotel or the F1 circuit

Other audiences discussed: property (listings and prices on buildings), developers and architects (drop a proposed building into its surroundings).

**Payments:** check which providers support a Bahrain-based business. Candidates are a merchant of record (Paddle, Lemon Squeezy) or Tap Payments.

## Open questions

1. Who pays: businesses, the public, or both?
2. Website only, or App Store and Google Play apps as well?
3. Run by one person with automation, or a small team with staff tools?
4. Which audience first: everyday residents, food lovers, event-goers, or businesses?

## Decisions already made

- Prototype on the private page first, public hosting later.
- No Google place data: its terms do not allow showing it on a non-Google map.
- No home addresses stored; positions snap to 100 m.
- No photogrammetry route for now.
- "Best" places are ranked by hearts from our own users, since the open data has no ratings.
