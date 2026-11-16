// Software fallback for browsers with WebGL unavailable: the same satellite mosaic on its slab,
// drawn with Canvas 2D as a tilted orthographic model (rotate / tilt / zoom, no relief or water shader).
export function startFallback(A) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('view'), stage = $('stage'), ctx = canvas.getContext('2d');
  $('notice').hidden = false;
  for (const id of ['head', 'bar', 'dock', 'where', 'hint']) $(id).hidden = true;
  const img = new Image();
  let tex = null, az = -0.35, tilt = 0.55, zoom = 1, cw = 0, ch = 0, dirty = true;
  img.onload = () => {
    tex = document.createElement('canvas'); tex.width = 1536; tex.height = Math.round(1536 * img.height / img.width);
    const t = tex.getContext('2d'); t.imageSmoothingQuality = 'high'; t.drawImage(img, 0, 0, tex.width, tex.height);
    $('loading').hidden = true; dirty = true;
  };
  img.src = A.imagery;
  function draw() {
    requestAnimationFrame(draw);
    const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== cw || h !== ch) { cw = w; ch = h; canvas.width = w * dpr; canvas.height = h * dpr; dirty = true; }
    if (!dirty || !tex) return; dirty = false;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height); g.addColorStop(0, '#10181d'); g.addColorStop(1, '#05080a');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = Math.min(w / tex.width, h / tex.height) * 1.25 * zoom * dpr, thick = 14 * zoom * dpr * (1 - tilt * 0.6);
    const place = (dy) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(canvas.width / 2, canvas.height * 0.47 + dy); ctx.scale(1, tilt); ctx.rotate(az); ctx.scale(s, s); };
    for (let d = thick; d > 0; d -= 1.5) { place(d); ctx.fillStyle = d > thick - 2 ? '#0b1114' : '#141d22'; ctx.fillRect(-tex.width / 2, -tex.height / 2, tex.width, tex.height); }
    place(0); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(tex, -tex.width / 2, -tex.height / 2);
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    az += (e.clientX - drag[0]) * 0.006; tilt = Math.min(1, Math.max(0.25, tilt + (e.clientY - drag[1]) * 0.003));
    drag = [e.clientX, e.clientY]; dirty = true;
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.min(8, Math.max(0.5, zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
  draw();
}
