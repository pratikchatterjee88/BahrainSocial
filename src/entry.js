import { startFallback } from './fallback.js';
let ok = false;
try { ok = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { ok = false; }
if (ok) import('./main.js'); else startFallback(window.__ASSETS__);
