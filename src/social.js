// Bahrain Social: places to find, and what people leave on the map (tags, hearts, tips, notes, questions, events).
//
// Storage follows one pattern everywhere: one document per person per collection, readable by everyone,
// writable only by that person (the page owner can change any). On the published page that is the page's
// shared database; in the standalone file it is this browser's storage, so only you see it.

const COLS = ['tags', 'faves', 'tips', 'posts', 'replies', 'rsvps', 'reports'];
const DAY = 86400000;
const KIND_NAME = { n: 'Note', q: 'Question', e: 'Event' };
const KIND_LABEL = { n: 'note', q: 'question', e: 'event' };

export function initSocial(ctx) {
  const { $, A, B, controls, pin, flyTo, xzOf, lonLatOf, whereIs, setDynLabels, setKindVisible, addSearch } = ctx;

  // ---------- small helpers ----------
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const clean = (v, max) => String(v ?? '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const inBounds = (lon, lat) => typeof lon === 'number' && typeof lat === 'number' && lon > B.west && lon < B.east && lat > B.south && lat < B.north;
  const snap = (v) => Math.round(v * 1000) / 1000;                       // about 100 m
  const distKm = (lon, lat, x, z) => { const [px, pz] = xzOf(lon, lat); return Math.hypot(px - x, pz - z); };
  const fmtDist = (d) => (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km');
  const ago = (t) => { const m = Math.max(0, (Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? Math.round(m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const fmtWhen = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const centre = () => { const t = controls.target; return lonLatOf(t.x, t.z); };

  // ---------- storage ----------
  const store = { db: null, uid: 'me', local: true, ready: false, owner: false, hidden: new Set() };
  const cols = Object.fromEntries(COLS.map((c) => [c, new Map()]));
  const mine = (col) => cols[col].get(store.uid) || null;
  let renderQueued = false;
  const queueRender = () => { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll(); }); };

  async function save(col, data) {
    if (store.local) lsSet('bs.' + col, data); else await store.db.doc(col + '/' + store.uid).set(data);
    cols[col] = new Map(cols[col]).set(store.uid, data); queueRender();
  }
  async function initStore() {
    let db = null, user = null;
    if (window.claude && typeof window.claude.use === 'function') [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (db && uid) {
      store.db = db; store.uid = uid; store.local = false; store.owner = await user.isOwner();
      for (const c of COLS) db.collection(c).limit(1000).onSnapshot((s) => { cols[c] = new Map(s.docs.map((d) => [d.id, d.data()])); queueRender(); }, () => {});
      db.doc('mod/hidden').onSnapshot((s) => { const d = s.exists ? s.data() : null; store.hidden = new Set(d && Array.isArray(d.ids) ? d.ids.filter((x) => typeof x === 'string') : []); queueRender(); }, () => {});
    } else {
      for (const c of COLS) { const v = lsGet('bs.' + c, null); if (v) cols[c].set('me', v); }
      $('tagWho').textContent = 'Here everything is saved in this browser only, so only you see it.';
    }
    store.ready = true; queueRender();
    const tag = mine('tags');
    if (tag && cleanName(tag.name)) $('meName').value = cleanName(tag.name); else $('meName').value = lsGet('bs.name', '');
    $('meStart').checked = !!lsGet('bs.startAtTag', false);
    if ($('meStart').checked && tag && inBounds(tag.lon, tag.lat) && !new URLSearchParams(location.search).get('v')) flyTo(tag.lon, tag.lat, null, 2.2, null, 32, false);
  }
  const cleanName = (v) => clean(v, 24);
  const myName = () => cleanName($('meName').value);

  // ---------- reading what people wrote (all of it is untrusted) ----------
  function reportCounts() {
    const n = new Map();
    for (const r of cols.reports.values()) if (r && Array.isArray(r.ids)) for (const id of r.ids.slice(0, 300)) if (typeof id === 'string') n.set(id, (n.get(id) || 0) + 1);
    return n;
  }
  let reported = new Map();
  const isHidden = (id) => store.hidden.has(id) || (reported.get(id) || 0) >= 3;
  function allPosts() {
    const out = [], now = Date.now();
    for (const [uid, doc] of cols.posts) {
      if (!doc || !Array.isArray(doc.items)) continue;
      for (const it of doc.items.slice(0, 20)) {
        if (!it || typeof it.id !== 'string' || !KIND_NAME[it.k] || !inBounds(it.lon, it.lat) || typeof it.exp !== 'number' || it.exp < now) continue;
        const id = uid + '_' + it.id; if (isHidden(id)) continue;
        out.push({ id, uid, k: it.k, text: clean(it.t, 200), title: clean(it.title, 60), by: cleanName(it.by) || 'Someone', lon: it.lon, lat: it.lat,
          at: typeof it.at === 'number' ? it.at : 0, exp: it.exp, when: typeof it.when === 'number' ? it.when : 0, raw: it.id });
      }
    }
    return out;
  }
  function repliesFor(postId) {
    const out = [];
    for (const [uid, doc] of cols.replies) if (doc && Array.isArray(doc.items)) for (const r of doc.items.slice(0, 100)) {
      if (!r || r.to !== postId) continue;
      const id = 'r_' + uid + '_' + r.at; if (isHidden(id)) continue;
      out.push({ id, uid, text: clean(r.t, 200), by: cleanName(r.by) || 'Someone', at: typeof r.at === 'number' ? r.at : 0 });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  const goingCount = (postId) => { let n = 0; for (const r of cols.rsvps.values()) if (r && Array.isArray(r.ids) && r.ids.includes(postId)) n++; return n; };
  function tipsFor(placeId) {
    const out = [];
    for (const [uid, doc] of cols.tips) {
      const t = doc && doc.items && typeof doc.items === 'object' ? doc.items[placeId] : null; if (!t) continue;
      const id = 'tip_' + uid + '_' + placeId; if (isHidden(id)) continue;
      out.push({ id, uid, text: clean(t.t, 140), by: cleanName(t.by) || 'Someone', at: typeof t.at === 'number' ? t.at : 0 });
    }
    return out.sort((a, b) => b.at - a.at);
  }
  function loveCounts() {
    const n = new Map();
    for (const f of cols.faves.values()) if (f && Array.isArray(f.ids)) for (const id of f.ids.slice(0, 300)) if (typeof id === 'string') n.set(id, (n.get(id) || 0) + 1);
    return n;
  }
  async function toggleIn(col, id) {
    const cur = new Set((mine(col) || {}).ids || []); if (cur.has(id)) cur.delete(id); else cur.add(id);
    await save(col, { ids: [...cur].slice(-300) });
  }
  const has = (col, id) => ((mine(col) || {}).ids || []).includes(id);

  // ---------- Explore ----------
  let places = null, placesLoading = null, exGroup = -1, exOrigin = null, openPlace = null, pane = null;
  function loadPlaces() {
    return placesLoading || (placesLoading = fetch(A.city.places).then((r) => r.json()).then((d) => {
      places = d;
      const wrap = $('exChips'), buttons = [];
      const mk = (parent, label, gi) => { const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', String(gi === exGroup)); b.addEventListener('click', () => { exGroup = gi; for (const c of buttons) c.setAttribute('aria-pressed', String(c === b)); showPlace(null); renderExplore(); }); parent.appendChild(b); buttons.push(b); };
      d.sections.forEach((name, si) => {
        const row = el('div', 'chipRow'); row.appendChild(el('small', null, name));
        const chips = el('div', 'chips'); if (si === 0) mk(chips, 'Everything nearby', -1);
        d.groups.forEach((g, gi) => { if (g[0] === si) mk(chips, g[1], gi); });
        row.appendChild(chips); wrap.appendChild(row);
      });
      const sel = $('tagFood');
      d.groups.forEach((g, gi) => { if (g[0] === 0) { const o = el('option', null, g[1]); o.value = gi; sel.appendChild(o); } });
      const tag = mine('tags'); if (tag && Number.isInteger(tag.food)) sel.value = tag.food;
      addSearch(d.places.map((p) => [p[1], d.groups[p[4]][1], p[2], p[3], 's']));
      queueRender();
    }));
  }
  function renderExplore() {
    if (!places || pane !== 'explore') return;
    const list = $('exList'); list.replaceChildren();
    if (!exOrigin) exOrigin = pin.on ? lonLatOf(pin.x, pin.z) : centre();
    const [ox, oz] = xzOf(exOrigin[0], exOrigin[1]), counts = loveCounts();
    $('exNear').textContent = 'Near ' + whereIs(ox, oz);
    let rows = [];
    for (const p of places.places) if (exGroup < 0 || p[4] === exGroup) rows.push([distKm(p[2], p[3], ox, oz), p, counts.get(p[0]) || 0]);
    rows.sort((a, b) => a[0] - b[0]);
    if ($('exLoved').checked) rows = rows.filter((r) => r[0] < 12).sort((a, b) => b[2] - a[2] || a[0] - b[0]);
    rows = rows.slice(0, 12);
    if (!rows.length) list.appendChild(el('p', 'near', 'Nothing of that kind is mapped here. Try another kind or search somewhere else.'));
    for (const [d, p, n] of rows) {
      const row = el('div', 'row2'), go = el('button', 'go'); go.type = 'button';
      const tips = tipsFor(p[0]).length;
      go.append(el('span', null, p[1]), el('small', null, `${p[5]} · ${fmtDist(d)}${tips ? ` · ${tips} tip${tips > 1 ? 's' : ''}` : ''}`));
      go.addEventListener('click', () => { flyTo(p[2], p[3], p[1], 0.45); showPlace(p); });
      const heart = el('button', 'heart', `♥ ${n}`); heart.type = 'button'; heart.setAttribute('aria-pressed', String(has('faves', p[0]))); heart.setAttribute('aria-label', `Love ${p[1]}`);
      heart.addEventListener('click', () => toggleIn('faves', p[0]).catch(() => { $('exNear').textContent = 'Your heart could not be saved (view-only access).'; }));
      row.append(go, heart); list.appendChild(row);
    }
    setDynLabels('place', rows.map(([, p]) => ({ name: p[1], lon: p[2], lat: p[3], onClick: () => showPlace(p) })));
    if (openPlace) fillPlace();
  }
  function showPlace(p) {
    openPlace = p; $('placeCard').hidden = !p; $('exBrowse').hidden = !!p; $('pcMsg').textContent = ''; $('explorePane').scrollTop = 0;
    if (p) { $('pcTipText').value = (((mine('tips') || {}).items || {})[p[0]] || {}).t || ''; fillPlace(); }
  }
  function fillPlace() {
    const p = openPlace; if (!p) return;
    const [ox, oz] = exOrigin ? xzOf(exOrigin[0], exOrigin[1]) : [controls.target.x, controls.target.z];
    $('pcName').textContent = p[1]; $('pcSub').textContent = `${p[5]} · ${places.groups[p[4]][1]} · ${fmtDist(distKm(p[2], p[3], ox, oz))} away`;
    const h = $('pcHeart'); h.textContent = `♥ ${loveCounts().get(p[0]) || 0}`; h.setAttribute('aria-pressed', String(has('faves', p[0])));
    const box = $('pcTips'); box.replaceChildren();
    const tips = tipsFor(p[0]);
    if (!tips.length) box.appendChild(el('p', 'near', 'No tips yet. Be the first.'));
    for (const t of tips) box.appendChild(tipRow(t));
  }
  function tipRow(t) {                                   // a tip or an answer: text, who, when, report / hide
    const row = el('div', 'tip'); row.appendChild(el('span', null, t.text));
    const meta = el('small', null, `${t.by}${t.uid === store.uid ? ' (you)' : ''} · ${ago(t.at)}`);
    if (t.uid !== store.uid) { const r = el('button', null, has('reports', t.id) ? 'Reported' : 'Report'); r.type = 'button'; r.addEventListener('click', () => toggleIn('reports', t.id).catch(() => {})); meta.appendChild(r); }
    if (store.owner) { const hb = el('button', null, 'Hide'); hb.type = 'button'; hb.addEventListener('click', () => hideForAll(t.id)); meta.appendChild(hb); }
    row.appendChild(meta); return row;
  }
  async function hideForAll(id) {
    if (!store.owner || store.local) return;
    const ids = [...new Set([...store.hidden, id])].slice(-2000);
    try { await store.db.doc('mod/hidden').set({ ids }); store.hidden = new Set(ids); queueRender(); } catch (e) { /* not the owner after all */ }
  }
  $('pcBack').addEventListener('click', () => showPlace(null));
  $('pcHeart').addEventListener('click', () => { if (openPlace) toggleIn('faves', openPlace[0]).catch(() => { $('pcMsg').textContent = 'Could not save (view-only access).'; }); });
  $('pcTipSave').addEventListener('click', async () => {
    const p = openPlace, msg = $('pcMsg'); if (!p) return;
    const text = clean($('pcTipText').value, 140), name = myName();
    if (!name) { msg.textContent = 'Add your name under Me first.'; return; }
    const items = { ...(((mine('tips') || {}).items) || {}) };
    if (text) items[p[0]] = { t: text, by: name, at: Date.now() }; else delete items[p[0]];
    if (Object.keys(items).length > 50) { msg.textContent = 'You have 50 tips already. Remove one first.'; return; }
    try { await save('tips', { items }); msg.textContent = text ? 'Tip saved.' : 'Tip removed.'; } catch (e) { msg.textContent = 'Could not save (view-only access).'; }
  });
  $('exHere').addEventListener('click', () => { exOrigin = centre(); renderExplore(); });
  $('exLoved').addEventListener('change', renderExplore);

  // ---------- Social: notes, questions, events ----------
  let feedFilter = 'all', openItem = null, posts = [];
  function renderMarkers() {
    for (const k of ['n', 'q', 'e']) {
      setDynLabels(KIND_LABEL[k], posts.filter((p) => p.k === k).map((p) => ({
        name: k === 'e' ? `${p.title || p.text} · ${fmtWhen(p.when)}` : k === 'q' ? '? ' + p.text : p.text, lon: p.lon, lat: p.lat, onClick: () => { openPane('social'); showItem(p.id); },
      })));
    }
  }
  function renderFeed() {
    if (pane !== 'social') return;
    const box = $('feed'); box.replaceChildren();
    const t = controls.target, now = Date.now();
    let rows = posts.filter((p) => feedFilter === 'all' || (feedFilter === 'week' ? p.k === 'e' && p.when < now + 7 * DAY : p.k === feedFilter))
      .map((p) => [distKm(p.lon, p.lat, t.x, t.z), p]);
    rows.sort((a, b) => (feedFilter === 'week' ? a[1].when - b[1].when : (a[0] - b[0]) + (b[1].at - a[1].at) / DAY * 0.5));
    rows = rows.slice(0, 30);
    if (!rows.length) box.appendChild(el('p', 'near', feedFilter === 'week' ? 'No events in the next seven days.' : 'Nothing posted yet. Start it off below.'));
    for (const [d, p] of rows) {
      const row = el('div', 'row2'), go = el('button', 'go'); go.type = 'button';
      const extra = p.k === 'q' ? ` · ${repliesFor(p.id).length} answer${repliesFor(p.id).length === 1 ? '' : 's'}` : p.k === 'e' ? ` · ${fmtWhen(p.when)} · ${goingCount(p.id)} going` : '';
      go.append(el('span', null, p.k === 'e' ? (p.title || p.text) : p.text), el('small', null, `${KIND_NAME[p.k]} · ${p.by} · ${fmtDist(d)} · ${ago(p.at)}${extra}`));
      go.addEventListener('click', () => showItem(p.id));
      row.append(go); box.appendChild(row);
    }
    if (openItem) fillItem();
  }
  function showItem(id) {
    openItem = id; $('itemCard').hidden = !id; $('feedView').hidden = !!id; $('icMsg').textContent = ''; $('socialPane').scrollTop = 0;
    if (id) fillItem();
  }
  function fillItem() {
    const p = posts.find((x) => x.id === openItem);
    if (!p) { showItem(null); return; }
    const [x, z] = xzOf(p.lon, p.lat);
    $('icKind').textContent = KIND_NAME[p.k] + (p.k === 'e' ? ' · ' + fmtWhen(p.when) : '');
    $('icText').textContent = p.k === 'e' && p.title ? `${p.title}${p.text ? ': ' + p.text : ''}` : p.text;
    $('icMeta').textContent = `${p.by}${p.uid === store.uid ? ' (you)' : ''} · ${whereIs(x, z)} · ${ago(p.at)}`;
    const g = $('icGoing'); g.hidden = p.k !== 'e'; g.textContent = `${has('rsvps', p.id) ? 'Going' : "I'm going"} · ${goingCount(p.id)}`; g.setAttribute('aria-pressed', String(has('rsvps', p.id)));
    const box = $('icReplies'); box.replaceChildren(); $('icReplyRow').hidden = p.k !== 'q';
    if (p.k === 'q') { const rs = repliesFor(p.id); if (!rs.length) box.appendChild(el('p', 'near', 'No answers yet.')); for (const r of rs) box.appendChild(tipRow(r)); }
    const rep = $('icReport'); rep.hidden = p.uid === store.uid; rep.textContent = has('reports', p.id) ? 'Reported' : 'Report'; rep.setAttribute('aria-pressed', String(has('reports', p.id)));
    $('icRemove').hidden = p.uid !== store.uid; $('icHide').hidden = !store.owner || p.uid === store.uid;
  }
  async function removeMine(rawId) {
    const items = (((mine('posts') || {}).items) || []).filter((it) => it && it.id !== rawId);
    await save('posts', { items });
  }
  $('icBack').addEventListener('click', () => showItem(null));
  $('icGo').addEventListener('click', () => { const p = posts.find((x) => x.id === openItem); if (p) flyTo(p.lon, p.lat, p.title || p.text.slice(0, 30), 0.6); });
  $('icGoing').addEventListener('click', () => { if (openItem) toggleIn('rsvps', openItem).catch(() => { $('icMsg').textContent = 'Could not save (view-only access).'; }); });
  $('icReport').addEventListener('click', () => { if (openItem) toggleIn('reports', openItem).catch(() => {}); });
  $('icHide').addEventListener('click', () => { if (openItem) { hideForAll(openItem); showItem(null); } });
  $('icRemove').addEventListener('click', async () => { const p = posts.find((x) => x.id === openItem); if (p) { try { await removeMine(p.raw); showItem(null); } catch (e) { $('icMsg').textContent = 'Could not remove it.'; } } });
  $('icReplySend').addEventListener('click', async () => {
    const text = clean($('icReplyText').value, 200), name = myName(), msg = $('icMsg');
    if (!openItem || !text) return;
    if (!name) { msg.textContent = 'Add your name under Me first.'; return; }
    const items = [...((((mine('replies') || {}).items) || []).slice(-99)), { to: openItem, t: text, by: name, at: Date.now() }];
    try { await save('replies', { items }); $('icReplyText').value = ''; msg.textContent = 'Answer posted.'; } catch (e) { msg.textContent = 'Could not post (view-only access).'; }
  });
  for (const b of $('feedChips').children) b.addEventListener('click', () => { feedFilter = b.dataset.f; for (const c of $('feedChips').children) c.setAttribute('aria-pressed', String(c === b)); renderFeed(); });
  const PLACEHOLDER = { n: 'Jam on the highway, great sunset here…', q: 'Best karak near here?', e: 'What is it about? (optional)' };
  function syncCompose() { const k = $('cKind').value; $('cTitle').hidden = $('cWhen').hidden = k !== 'e'; $('cLife').hidden = k !== 'n'; $('cText').placeholder = PLACEHOLDER[k]; }
  $('cKind').addEventListener('change', syncCompose); syncCompose();
  $('cPost').addEventListener('click', async () => {
    const k = $('cKind').value, msg = $('cMsg'), name = myName(), text = clean($('cText').value, 200), title = clean($('cTitle').value, 60), now = Date.now();
    if (!store.ready) { msg.textContent = 'Still connecting. Try again in a moment.'; return; }
    if (!name) { msg.textContent = 'Add your name under Me first.'; return; }
    if (k === 'e' ? !title : !text) { msg.textContent = k === 'e' ? 'Give the event a name.' : 'Write something first.'; return; }
    const when = k === 'e' ? new Date($('cWhen').value).getTime() : 0;
    if (k === 'e' && !(when > now - 3600000)) { msg.textContent = 'Pick a date and time that is still to come.'; return; }
    const [lo, la] = centre(); if (!inBounds(lo, la)) { msg.textContent = 'That spot is outside the model.'; return; }
    const exp = k === 'n' ? now + (+$('cLife').value || 1) * DAY : k === 'q' ? now + 14 * DAY : when + 3 * 3600000;
    const live = ((((mine('posts') || {}).items) || []).filter((it) => it && typeof it.exp === 'number' && it.exp > now));
    if (live.length >= 20) { msg.textContent = 'You have 20 live posts. Remove one first.'; return; }
    const item = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), k, t: text, by: name, lon: snap(lo), lat: snap(la), at: now, exp };
    if (k === 'e') { item.title = title; item.when = when; }
    try { await save('posts', { items: [...live, item] }); $('cText').value = ''; $('cTitle').value = ''; msg.textContent = `Posted in ${whereIs(controls.target.x, controls.target.z)}.`; }
    catch (e) { msg.textContent = 'Could not post. You have view-only access to this page.'; }
  });

  // ---------- Me ----------
  function renderMe() {
    const groups = places ? places.groups : null, out = [];
    for (const [id, t] of cols.tags) {
      if (!t || !inBounds(t.lon, t.lat) || isHidden('tag_' + id)) continue;
      const g = groups && Number.isInteger(t.food) && groups[t.food] ? ' · ' + groups[t.food][1] : '';
      out.push({ name: (cleanName(t.name) || 'Someone') + g + (id === store.uid ? ' (you)' : ''), lon: t.lon, lat: t.lat });
    }
    setDynLabels('tag', out);
    $('tagRemove').hidden = !mine('tags');
    $('tagCount').textContent = out.length ? `${out.length} ${out.length === 1 ? 'person is' : 'people are'} on the map.` : 'Nobody has tagged themselves yet.';
    const box = $('myPosts'); box.replaceChildren();
    const my = posts.filter((p) => p.uid === store.uid);
    if (!my.length) box.appendChild(el('p', 'near', 'You have no live posts.'));
    for (const p of my) {
      const row = el('div', 'row2'), go = el('button', 'go'); go.type = 'button';
      go.append(el('span', null, p.k === 'e' ? (p.title || p.text) : p.text), el('small', null, `${KIND_NAME[p.k]} · ${ago(p.at)}`));
      go.addEventListener('click', () => { openPane('social'); showItem(p.id); });
      const rm = el('button', 'mini', 'Remove'); rm.type = 'button'; rm.addEventListener('click', () => removeMine(p.raw).catch(() => {}));
      row.append(go, rm); box.appendChild(row);
    }
  }
  $('meName').addEventListener('change', () => lsSet('bs.name', myName()));
  $('meStart').addEventListener('change', (e) => lsSet('bs.startAtTag', e.target.checked));
  $('tagSave').addEventListener('click', async () => {
    const name = myName(), msg = $('tagMsg');
    if (!name) { msg.textContent = 'Type a name or nickname first.'; $('meName').focus(); return; }
    if (!store.ready) { msg.textContent = 'Still connecting. Try again in a moment.'; return; }
    const [lo, la] = centre(), tag = { name, lon: snap(lo), lat: snap(la), food: +$('tagFood').value || 0 };
    if (!inBounds(tag.lon, tag.lat)) { msg.textContent = 'That spot is outside the model.'; return; }
    try { await save('tags', tag); lsSet('bs.name', name); msg.textContent = `Tagged in ${whereIs(controls.target.x, controls.target.z)}.`; }
    catch (e) { msg.textContent = 'Your tag could not be saved. You have view-only access to this page.'; }
  });
  $('tagRemove').addEventListener('click', async () => {
    try {
      if (store.local) { try { localStorage.removeItem('bs.tags'); } catch (e) { /* ignore */ } } else await store.db.doc('tags/' + store.uid).delete();
      const m = new Map(cols.tags); m.delete(store.uid); cols.tags = m; queueRender(); $('tagMsg').textContent = 'Your tag is removed.';
    } catch (e) { $('tagMsg').textContent = 'Your tag could not be removed.'; }
  });

  // ---------- panes ----------
  function openPane(which) {
    pane = which;
    for (const [name, id, btn] of [['explore', 'explorePane', 'exploreBtn'], ['social', 'socialPane', 'socialBtn'], ['me', 'mePane', 'meBtn']]) {
      $(id).hidden = which !== name; $(btn).setAttribute('aria-pressed', String(which === name));
    }
    $('cross').hidden = which !== 'social' && which !== 'me';
    $('where').hidden = !!which;                           // the panel needs the room on short screens
    setKindVisible('place', which === 'explore');
    if (which) loadPlaces().then(() => { if (which === 'explore') { exOrigin = pin.on ? lonLatOf(pin.x, pin.z) : centre(); renderExplore(); } }).catch(() => { $('exNear').textContent = 'The places list could not be loaded.'; });
    renderAll();
  }
  for (const [name, btn, close] of [['explore', 'exploreBtn', 'exploreClose'], ['social', 'socialBtn', 'socialClose'], ['me', 'meBtn', 'meClose']]) {
    $(btn).addEventListener('click', () => openPane(pane === name ? null : name));
    $(close).addEventListener('click', () => openPane(null));
  }
  function renderAll() {
    reported = reportCounts(); posts = allPosts();
    renderMarkers(); renderMe(); renderExplore(); renderFeed();
  }
  setInterval(queueRender, 60000);                       // lets posts expire and "5 min ago" tick over
  initStore().catch(() => { store.ready = true; });
  loadPlaces().catch(() => {});
}
