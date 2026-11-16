import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Earcut } from 'three/src/extras/Earcut.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const A = window.__ASSETS__;           // injected by tools/build.mjs
const B = A.bounds;                    // west/east/north/south of the mosaic (degrees)
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp, sstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

// ---------- geography: Web-Mercator mosaic -> local kilometres (x east, z south) ----------
const R = 6371.0088, rad = Math.PI / 180;
const merc = (lat) => Math.asinh(Math.tan(lat * rad));
const lat0 = (B.north + B.south) / 2, k0 = Math.cos(lat0 * rad);
const mN = merc(B.north), mS = merc(B.south);
const W_KM = (B.east - B.west) * rad * R * k0;
const H_KM = (mN - mS) * R * k0;
const xzOf = (lon, lat) => [((lon - B.west) / (B.east - B.west) - 0.5) * W_KM, -((merc(lat) - mS) / (mN - mS) - 0.5) * H_KM];
const lonLatOf = (x, z) => [B.west + (x / W_KM + 0.5) * (B.east - B.west), Math.atan(Math.sinh(mS + (0.5 - z / H_KM) * (mN - mS))) / rad];

const PLACES = [
  // name, lat, lon, tier (1 always … 4 only close), kind
  ['Manama', 26.2235, 50.5876, 1, 'city'],
  ['Muharraq', 26.2540, 50.6130, 1, 'city'],
  ['Riffa', 26.1270, 50.5560, 1, 'city'],
  ['Jabal ad Dukhan · 134 m', 26.0383, 50.5433, 2, 'peak'],
  ['Hawar Islands', 25.6500, 50.7700, 1, 'isle'],
  ['King Fahd Causeway', 26.1900, 50.3350, 1, 'isle'],
  ['Sitra', 26.1500, 50.6250, 2, 'city'],
  ['Isa Town', 26.1736, 50.5478, 2, 'city'],
  ['Hamad Town', 26.1150, 50.5000, 2, 'city'],
  ['Durrat Al Bahrain', 25.8380, 50.6030, 2, 'isle'],
  ['Amwaj Islands', 26.2900, 50.6640, 2, 'isle'],
  ['Umm an Nasan', 26.1500, 50.4000, 2, 'isle'],
  ['Bahrain International Circuit', 26.0325, 50.5106, 2, 'poi'],
  ['Bahrain International Airport', 26.2708, 50.6336, 3, 'poi'],
  ['Bahrain World Trade Center', 26.2393, 50.5813, 3, 'poi'],
  ['Bahrain Financial Harbour', 26.2405, 50.5735, 3, 'poi'],
  ['Bab Al Bahrain', 26.2340, 50.5756, 3, 'poi'],
  ['Al Fateh Grand Mosque', 26.2189, 50.5981, 3, 'poi'],
  ['Bahrain Fort', 26.2334, 50.5206, 3, 'poi'],
  ['Bahrain Bay', 26.2455, 50.5880, 3, 'poi'],
  ['Diyar Al Muharraq', 26.3150, 50.6250, 3, 'isle'],
  ['Khalifa Bin Salman Port', 26.2000, 50.7080, 3, 'poi'],
  ['Budaiya', 26.2180, 50.4480, 3, 'city'],
  ['Awali', 26.0850, 50.5480, 3, 'city'],
  ['Zallaq', 26.0470, 50.4850, 3, 'city'],
  ['Tree of Life', 25.9941, 50.5830, 3, 'poi'],
  ['Riffa Fort', 26.1183, 50.5631, 3, 'poi'],
  ['Askar', 26.0600, 50.6150, 3, 'city'],
  ['Gulf of Bahrain', 25.9000, 50.4000, 2, 'sea'],
  ['Qatar', 25.5600, 50.8450, 2, 'sea'],
];
// fly-to chips: name, lon, lat, distance km, camera bearing from target (deg, 0 = camera south of it), tilt above horizon
const LANDMARKS = [
  ['Manama Souq', 50.5756, 26.2340, 0.9, 200, 26],
  ['World Trade Center', 50.5813, 26.2393, 1.0, 150, 20],
  ['Financial Harbour', 50.5735, 26.2405, 1.1, 20, 18],
  ['Bahrain Bay', 50.5880, 26.2455, 1.6, 330, 20],
  ['Al Fateh Mosque', 50.5981, 26.2189, 0.8, 120, 28],
  ['Seef', 50.5400, 26.2330, 1.6, 0, 22],
  ['Bahrain Fort', 50.5206, 26.2334, 0.8, 340, 30],
  ['Muharraq', 50.6130, 26.2540, 1.3, 220, 26],
  ['Amwaj', 50.6640, 26.2900, 2.2, 40, 26],
  ['Riffa', 50.5631, 26.1183, 1.4, 180, 28],
  ['F1 Circuit', 50.5106, 26.0325, 2.4, 160, 32],
  ['Tree of Life', 50.5830, 25.9941, 0.7, 180, 24],
  ['Durrat Al Bahrain', 50.6030, 25.8380, 4.5, 200, 35],
  ['Causeway', 50.3350, 26.1880, 3.2, 110, 24],
];

// ---------- renderer / scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.001, 1500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.1; controls.maxDistance = 420;
controls.maxPolarAngle = Math.PI * 0.49;
controls.screenSpacePanning = false; controls.zoomToCursor = true;
// map-style: drag moves the ground; right-drag, Ctrl-drag or two fingers turn and tilt
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

function placeCamera(lon, lat, d, az, el) {
  const [x, z] = xzOf(lon, lat); controls.target.set(x, 0, z);
  camera.position.set(x + d * Math.cos(el * rad) * Math.sin(az * rad), d * Math.sin(el * rad), z + d * Math.cos(el * rad) * Math.cos(az * rad));
}
const OPENING = [50.581, 26.236, 3.4, 328, 15];          // low over the bay, looking at the Manama skyline
placeCamera(...OPENING);
{ // deep-link view: ?v=lon,lat,distanceKm,azimuthDeg,elevationDeg[,hour]
  const m = new URLSearchParams(location.search).get('v');
  if (m) { const [lo, la, d, az, el, hr] = m.split(',').map(Number); placeCamera(lo, la, d, az, el); if (hr) $('time').value = hr; }
}

// ---------- shared GLSL ----------
const SHADOW_SIZE = 4096;
const COMMON_GLSL = /* glsl */`
uniform vec3 uSun, uSunCol, uZenith, uHorizon;
uniform float uAmb, uNight, uTime, uTraffic, uFine2;
uniform sampler2D uShadowMap; uniform mat4 uShadowM; uniform float uShadowOn;
vec3 skyColor(vec3 d){
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.45));
  float s = max(dot(d, uSun), 0.0);
  c += uSunCol * (pow(s, 8.0) * 0.12 + pow(s, 96.0) * 0.5);
  return c;
}
float shadowAt(vec3 w, float bias){
  vec4 sc = uShadowM * vec4(w, 1.0);
  vec3 p = sc.xyz * 0.5 + 0.5;
  if (uShadowOn < 0.5 || p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += step(p.z - bias, texture2D(uShadowMap, p.xy + vec2(float(i), float(j)) * ${(1.2 / SHADOW_SIZE).toFixed(7)}).r);
  vec2 e = smoothstep(vec2(0.0), vec2(0.07), p.xy) * smoothstep(vec2(0.0), vec2(0.07), 1.0 - p.xy);
  return mix(1.0, s / 9.0, e.x * e.y);
}
vec3 applyHaze(vec3 col, vec3 V, float dist){
  float haze = 1.0 - exp(-dist * (0.0009 + 0.03 * exp(-cameraPosition.y * 0.9)));
  return mix(col, skyColor(normalize(vec3(-V.x, 0.035, -V.z))), haze * 0.9);
}
vec3 ambient(){ return uAmb * mix(vec3(1.0), uZenith * 1.6, 0.3); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}`;
const LOG_PV = '#include <common>\n#include <logdepthbuf_pars_vertex>', LOG_V = '#include <logdepthbuf_vertex>';
const LOG_PF = '#include <logdepthbuf_pars_fragment>', LOG_F = '#include <logdepthbuf_fragment>';
const OUT_GLSL = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';

const U = {
  uImg: { value: null }, uMask: { value: null }, uH: { value: null },
  uEx: { value: 1 }, uTime: { value: 0 }, uNight: { value: 0 },
  uSize: { value: new THREE.Vector2(W_KM, H_KM) }, uTexel: { value: new THREE.Vector2() },
  uSun: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, uSunCol: { value: new THREE.Color() },
  uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
  uAmb: { value: 0.4 },
  uShadowMap: { value: null }, uShadowM: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 },
  uTraffic: { value: 1 }, uFine2: { value: 1 },
  uFocus: { value: new THREE.Vector3() }, uCityR: { value: 0.001 },
};

const terrainMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    ${LOG_PV}
    uniform sampler2D uH; uniform float uEx;
    varying vec2 vUv; varying vec3 vW;
    void main(){
      vUv = uv;
      vec3 p = position;
      p.y = texture2D(uH, uv).r * 0.001 * uEx;
      vW = p;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      ${LOG_V}
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${LOG_PF}
    uniform sampler2D uImg, uMask, uH;
    uniform vec2 uSize, uTexel;
    varying vec2 vUv; varying vec3 vW;
    vec2 uFine;
    ${COMMON_GLSL}
    float waves(vec2 p){
      float t = uTime;
      float w = noise(p * 0.9 + vec2(t * 0.25, t * 0.16)) * 0.6;
      w += noise(p * 2.6 - vec2(t * 0.4, -t * 0.27)) * 0.3 * uFine.x;
      w += noise(p * 7.0 + vec2(-t * 0.7, t * 0.5)) * 0.1 * uFine.y;
      return w;
    }
    void main(){
      ${LOG_F}
      vec3 albedo = texture2D(uImg, vUv).rgb;
      float water = smoothstep(0.35, 0.65, texture2D(uMask, vUv).r);
      vec3 V = normalize(cameraPosition - vW);
      float dist = length(cameraPosition - vW);

      // --- land: relief shading from the real heightmap
      float k = 0.001 * 6.4;
      float hL = texture2D(uH, vUv - vec2(uTexel.x, 0)).r, hR = texture2D(uH, vUv + vec2(uTexel.x, 0)).r;
      float hD = texture2D(uH, vUv - vec2(0, uTexel.y)).r, hU = texture2D(uH, vUv + vec2(0, uTexel.y)).r;
      vec3 n = normalize(vec3(-(hR - hL) * k / (2.0 * uTexel.x * uSize.x), 1.0, (hU - hD) * k / (2.0 * uTexel.y * uSize.y)));
      float ndl = max(dot(n, uSun), 0.0);
      float flatL = max(uSun.y, 0.0);
      float shade = flatL + (ndl - flatL) * 1.5;
      float sh = shadowAt(vW, 0.00003);
      // close to the ground the 10 m imagery runs out: lift its murk and add grain so it reads as ground, not blur
      float close = 1.0 - smoothstep(1.0, 9.0, dist);
      vec3 ground = mix(albedo, pow(albedo, vec3(0.8)) * vec3(1.0, 0.97, 0.9), 0.6 * close);
      float grain = (noise(vW.xz * 900.0) * 0.6 + noise(vW.xz * 230.0) * 0.4 - 0.5) * 0.14 * close;
      vec3 land = ground * (1.08 + grain) * (ambient() + uSunCol * clamp(0.35 + 0.6 * shade, 0.0, 1.2)) * mix(0.5, 1.0, sh);

      // --- sea: satellite colour for depth, animated surface for light
      float amp = 1.0 / (1.0 + dist * 0.02);
      uFine = vec2(1.0 / (1.0 + dist * 0.03), 1.0 / (1.0 + dist * dist * 0.004));
      vec2 wp = vW.xz * 2.2; float e = 0.06;
      float w0 = waves(wp);
      vec3 nW = normalize(vec3(-(waves(wp + vec2(e, 0)) - w0) / e * amp * 0.07, 1.0, -(waves(wp + vec2(0, e)) - w0) / e * amp * 0.07));
      // fine ripples near the camera
      float rip = (noise(vW.xz * 160.0 + uTime * vec2(0.9, 0.6)) - 0.5) * (1.0 - smoothstep(0.3, 6.0, dist));
      nW = normalize(nW + vec3(rip * 0.12, 0.0, rip * 0.09));
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nW, V), 0.0), 5.0);
      vec3 refl = skyColor(reflect(-V, nW));
      vec3 deep = albedo * 1.2 + vec3(0.0, 0.004, 0.008);
      vec3 sea = deep * (ambient() + uSunCol * (0.3 + 0.9 * flatL)) * mix(0.6, 1.0, sh);
      sea = mix(sea, refl, fres * 0.7);
      float glint = pow(max(dot(reflect(-uSun, nW), V), 0.0), 320.0);
      sea += uSunCol * glint * 1.6 * sh;
      float shore = smoothstep(0.0, 0.5, texture2D(uMask, vUv).r) * (1.0 - water);
      vec3 col = mix(land, sea, water) + shore * 0.05 * uSunCol;

      gl_FragColor = vec4(applyHaze(col, V, dist), 1.0);
      ${OUT_GLSL}
    }`,
});

const skyMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: false,
  vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: /* glsl */`
    precision highp float; varying vec3 vD;
    ${COMMON_GLSL}
    void main(){
      vec3 d = normalize(vD);
      vec3 c = skyColor(d);
      float s = max(dot(d, uSun), 0.0);
      c += uSunCol * smoothstep(0.99985, 0.99995, s) * 6.0;
      vec2 g = floor(vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 260.0);
      c += vec3(0.9, 0.95, 1.0) * step(0.9965, hash(g)) * uNight * smoothstep(0.02, 0.25, d.y) * (0.4 + 0.6 * hash(g + 3.0));
      c = mix(uHorizon * 0.05, c, smoothstep(-0.2, 0.0, d.y));
      gl_FragColor = vec4(c, 1.0);
      ${OUT_GLSL}
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

// plinth: the model sits on a dark slab
const SLAB = 2.2;
const slab = new THREE.Mesh(
  new THREE.BoxGeometry(W_KM, SLAB, H_KM),
  new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `${LOG_PV}\nvarying vec3 vP; varying vec3 vN;\nvoid main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n${LOG_V}\n}`,
    fragmentShader: /* glsl */`
      precision highp float; varying vec3 vP; varying vec3 vN;
      ${LOG_PF}
      uniform vec3 uSun, uSunCol; uniform float uAmb;
      void main(){
        ${LOG_F}
        float t = clamp(vP.y / ${SLAB.toFixed(1)} + 0.5, 0.0, 1.0);
        vec3 base = mix(vec3(0.012, 0.014, 0.017), vec3(0.035, 0.05, 0.058), pow(t, 3.0));
        float l = uAmb + max(dot(normalize(vN), uSun), 0.0) * 0.9;
        gl_FragColor = vec4(base * l * mix(vec3(1.0), uSunCol, 0.5), 1.0);
        ${OUT_GLSL}
      }`,
  }),
);
slab.position.y = -SLAB / 2 - 0.02; scene.add(slab);

// ---------- city materials ----------
// Buildings: footprint extruded to its height. position.y is height above the building's own ground (km).
const CITY_VERT = /* glsl */`
  attribute float aBase; attribute vec2 aWall; attribute vec4 aCol;
  uniform float uEx; uniform vec3 uFocus; uniform float uCityR;
  vec4 cityWorld(){
    vec4 wp = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
    float grow = 1.0 - smoothstep(uCityR * 0.86, uCityR, distance(wp.xz, uFocus.xz));
    wp.y = aBase * 0.001 * uEx + (position.y < 0.0 ? position.y : position.y * grow);
    return wp;
  }`;
const buildingMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    ${LOG_PV}
    ${CITY_VERT}
    varying vec3 vW, vN; varying vec4 vCol; varying vec3 vWall;
    void main(){
      vec4 wp = cityWorld();
      vW = wp.xyz; vN = normal; vCol = aCol; vWall = vec3(aWall.x, position.y * 1000.0, aWall.y);
      gl_Position = projectionMatrix * viewMatrix * wp;
      ${LOG_V}
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${LOG_PF}
    varying vec3 vW, vN; varying vec4 vCol; varying vec3 vWall;
    ${COMMON_GLSL}
    vec3 paintOf(float s){
      float k = fract(s * 7.31) * 6.0;
      return k < 1.6 ? vec3(0.86, 0.80, 0.67) : k < 2.8 ? vec3(0.90, 0.89, 0.85) : k < 3.8 ? vec3(0.78, 0.67, 0.50)
           : k < 4.6 ? vec3(0.86, 0.70, 0.57) : k < 5.4 ? vec3(0.71, 0.71, 0.70) : vec3(0.76, 0.57, 0.44);
    }
    void main(){
      ${LOG_F}
      vec3 n = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      float dist = length(cameraPosition - vW);
      float seed = vCol.a, H = vWall.z;
      vec3 roof = pow(vCol.rgb, vec3(2.2));
      float ndl = max(dot(n, uSun), 0.0);
      float sh = shadowAt(vW + n * 0.0015, 0.00002 + 0.00004 * (1.0 - ndl));
      float detail = (1.0 - smoothstep(1.4 * uFine2, 5.0 * uFine2, dist)) * step(0.3, uFine2);
      vec3 col; vec3 glow = vec3(0.0);
      if (H <= 0.0) {
        col = roof * (0.92 + 0.12 * noise(vW.xz * 700.0 + vW.y * 900.0));      // hand-built landmark stonework and steel
      } else if (n.y > 0.5) {
        // roof: colour measured from the satellite image at this building, lifted and weathered, with rooftop clutter up close
        float lum = dot(roof, vec3(0.33));
        col = mix(vec3(lum), roof, 1.35) * 1.25 + 0.03;
        col = mix(col, paintOf(seed + 0.37) * 0.82, 0.3);
        col *= 0.9 + 0.16 * noise(vW.xz * 500.0 + seed * 40.0);
        vec2 rc = floor(vW.xz * 1000.0 / 2.2);
        float unit = step(0.94, hash(rc + seed * 13.0)) * detail;
        col = mix(col, vec3(0.34, 0.35, 0.36), unit * 0.7);
      } else {
        float tower = smoothstep(34.0, 58.0, H);
        vec3 paint = mix(paintOf(seed), roof * 1.2, 0.14);
        vec3 wall = mix(paint, mix(vec3(0.30, 0.40, 0.48), vec3(0.42, 0.47, 0.50), fract(seed * 3.7)), tower * 0.85);
        float floorH = 3.3, bay = mix(2.9, 1.9, tower);
        vec2 cell = vec2(vWall.x / bay, vWall.y / floorH);
        vec2 f = fract(cell), id = floor(cell);
        float wx = mix(0.2, 0.06, tower), wy = mix(0.3, 0.12, tower);
        float win = step(wx, f.x) * step(f.x, 1.0 - wx) * step(wy, f.y) * step(f.y, 0.82);
        win *= step(0.4, vWall.y) * step(vWall.y, H - 0.9);
        vec3 glass = mix(vec3(0.035, 0.05, 0.065), skyColor(reflect(-V, n)), mix(0.3, 0.55, tower));
        float open = mix(mix(0.2, 0.6, tower), win, detail);
        col = mix(wall, glass, open);
        float lit = mix(0.16 * step(0.5, hash(floor(id * 0.34) + seed * 91.0)), step(0.6, hash(id + seed * 91.0)) * win, detail);
        glow = mix(vec3(1.0, 0.72, 0.4), vec3(0.95, 0.9, 0.78), step(0.8, hash(id.yx + seed))) * lit * uNight * 0.75;
        col *= mix(0.72, 1.0, smoothstep(0.0, 7.0, vWall.y));           // contact shading near the ground
        col += vec3(1.0, 0.7, 0.38) * uNight * 0.05 * (1.0 - smoothstep(0.0, 9.0, vWall.y));   // street-light spill on the lower wall
      }
      vec3 light = ambient() * (0.8 + 0.2 * n.y) + uSunCol * ndl * sh;
      gl_FragColor = vec4(applyHaze(col * light + glow, V, dist), 1.0);
      ${OUT_GLSL}
    }`,
});
const depthMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.DoubleSide,
  vertexShader: `${CITY_VERT}\nvoid main(){ gl_Position = projectionMatrix * viewMatrix * cityWorld(); }`,
  fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
});
const roadMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false,
  vertexShader: /* glsl */`
    ${LOG_PV}
    attribute float aBase; attribute vec3 aRoad;
    uniform float uEx; uniform vec3 uFocus; uniform float uCityR;
    varying vec3 vW; varying vec3 vRoad; varying float vFade;
    void main(){
      vec4 wp = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
      vFade = 1.0 - smoothstep(uCityR * 0.8, uCityR, distance(wp.xz, uFocus.xz));
      float d = distance(cameraPosition, wp.xyz);
      wp.y = aBase * 0.001 * uEx + 0.0004 + d * 0.0006;          // sit just above the ground at any range
      vW = wp.xyz; vRoad = aRoad;
      gl_Position = projectionMatrix * viewMatrix * wp;
      ${LOG_V}
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${LOG_PF}
    varying vec3 vW; varying vec3 vRoad; varying float vFade;
    ${COMMON_GLSL}
    void main(){
      ${LOG_F}
      vec3 V = normalize(cameraPosition - vW);
      float dist = length(cameraPosition - vW);
      float cls = vRoad.z, across = abs(vRoad.x), along = vRoad.y;
      float halfW = (cls < 0.5 ? 22.0 : cls < 1.5 ? 18.0 : cls < 2.5 ? 15.0 : cls < 3.5 ? 12.0 : cls < 4.5 ? 9.0 : cls < 5.5 ? 7.0 : 4.5) * 0.5;
      float major = step(cls, 4.5);
      vec3 col = cls < 4.5 ? vec3(0.085, 0.088, 0.095) : cls < 5.5 ? vec3(0.15, 0.148, 0.145) : cls < 6.5 ? vec3(0.24, 0.225, 0.2) : vec3(0.42, 0.35, 0.26);
      col *= 0.9 + 0.2 * noise(vW.xz * 1500.0);
      float near = 1.0 - smoothstep(0.5, 2.5, dist);
      float dash = step(across, 0.035) * step(fract(along / 9.0), 0.45) * major;
      float edge = step(0.86, across) * step(across, 0.93) * step(cls, 3.5);
      col = mix(col, vec3(0.72, 0.7, 0.62), max(dash, edge) * near * 0.85);
      float sh = shadowAt(vW, 0.00003);
      vec3 light = (ambient() + uSunCol * max(uSun.y, 0.0)) * mix(0.48, 1.0, sh);
      vec3 lit = col * light * 1.2;

      // street lights: warm pools every few tens of metres
      float gap = major > 0.5 ? 38.0 : 52.0;
      float pool = exp(-pow((fract(along / gap) - 0.5) * gap / 7.0, 2.0)) * step(cls, 5.5);
      lit += col * vec3(1.0, 0.62, 0.28) * pool * uNight * 2.2;
      vec3 glow = vec3(1.0, 0.74, 0.42) * exp(-pow((fract(along / gap) - 0.5) * gap / 1.3, 2.0)) * step(0.8, across) * step(cls, 5.5) * uNight * 0.9 * (1.0 - smoothstep(2.0, 9.0, dist));

      // traffic: cars slide along each side of the bigger roads
      float side = sign(vRoad.x), lat = across * halfW;
      float s = along * side + uTime * (9.0 + 5.0 * hash(vec2(cls, side))) ;
      float slot = 26.0, cid = floor(s / slot), f = fract(s / slot) * slot;
      float car = step(0.6, hash(vec2(cid, side * 3.0 + floor(along / 400.0)))) * step(f, 4.4) * step(abs(lat - halfW * 0.45), 0.95) * major;
      car *= uTraffic;
      float carVis = car * (1.0 - smoothstep(1.5, 4.0, dist));
      float hc = hash(vec2(cid * 1.7, 9.0));
      vec3 body = hc < 0.5 ? vec3(0.82) : hc < 0.7 ? vec3(0.45, 0.47, 0.5) : hc < 0.85 ? vec3(0.06) : vec3(0.5, 0.07, 0.06);
      lit = mix(lit, body * (light + 0.04), carVis);
      glow += (step(3.6, f) * vec3(1.0, 0.95, 0.8) * 2.2 + step(f, 0.5) * vec3(1.0, 0.08, 0.04) * 1.4) * car * uNight * (1.0 - smoothstep(3.0, 8.0, dist));

      float a = smoothstep(1.0, 0.82, across) * vFade * (cls > 6.5 ? 0.6 : 0.94);
      gl_FragColor = vec4(applyHaze(lit + glow, V, dist), a);
      ${OUT_GLSL}
    }`,
});
// Trees: one small palm-like shape, instanced wherever the satellite image is green
const treeGeo = (() => {
  const trunk = new THREE.CylinderGeometry(0.00022, 0.0003, 0.0052, 5); trunk.translate(0, 0.0026, 0);
  const crown = new THREE.IcosahedronGeometry(0.0027, 0).toNonIndexed(); crown.scale(1, 0.62, 1); crown.translate(0, 0.0062, 0); crown.computeVertexNormals();
  const t = trunk.toNonIndexed(); t.computeVertexNormals();
  for (const g of [t, crown]) { g.deleteAttribute('uv'); }
  return mergeGeometries([t, crown]);
})();
const treeMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: /* glsl */`
    ${LOG_PV}
    varying vec3 vW, vN; varying float vY; varying float vSeed;
    void main(){
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = wp.xyz; vN = mat3(instanceMatrix) * normal; vY = position.y; vSeed = fract(instanceMatrix[3].x * 91.7 + instanceMatrix[3].z * 37.3);
      gl_Position = projectionMatrix * viewMatrix * wp;
      ${LOG_V}
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    ${LOG_PF}
    varying vec3 vW, vN; varying float vY; varying float vSeed;
    ${COMMON_GLSL}
    void main(){
      ${LOG_F}
      vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
      float dist = length(cameraPosition - vW);
      vec3 col = vY < 0.0046 ? vec3(0.2, 0.15, 0.1) : mix(vec3(0.07, 0.17, 0.06), vec3(0.16, 0.27, 0.09), vSeed) * (0.75 + 0.5 * smoothstep(0.0046, 0.0085, vY));
      float sh = shadowAt(vW + n * 0.002, 0.00004);
      vec3 light = ambient() + uSunCol * (0.25 + 0.75 * max(dot(n, uSun), 0.0)) * sh;
      gl_FragColor = vec4(applyHaze(col * light, V, dist), 1.0);
      ${OUT_GLSL}
    }`,
});

// ---------- sun / sky: real solar geometry for Bahrain (26.07°N) at the March equinox, clock in AST ----------
let sunStamp = 0, sunUp = true;
const SOLAR_NOON = 11.75, MOON = new THREE.Vector3(-0.35, 0.72, -0.45).normalize();
function setTime(hour) {
  const phi = 26.07 * rad, Hh = (hour - SOLAR_NOON) * 15 * rad;
  const sinEl = Math.cos(phi) * Math.cos(Hh);                       // declination 0
  const el = Math.asin(sinEl), elD = el / rad;
  let az = Math.acos(clamp((-sinEl * Math.sin(phi)) / (Math.cos(el) * Math.cos(phi)), -1, 1)); if (Hh > 0) az = 2 * Math.PI - az;
  const dayS = sstep(elD, -8, 10), warm = 1 - sstep(elD, 6, 30), night = 1 - sstep(elD, -9, -1);
  sunUp = elD > 2.5;
  if (elD > -2) {
    const e2 = Math.max(el, 2.5 * rad);
    U.uSun.value.set(Math.cos(e2) * Math.sin(az), Math.sin(e2), -Math.cos(e2) * Math.cos(az)).normalize();
    U.uSunCol.value.setRGB(1.0, 0.5 + 0.46 * (1 - warm), 0.24 + 0.66 * (1 - warm)).multiplyScalar(sstep(elD, -2, 5) * (0.78 + 0.22 * (1 - warm)));
  } else {
    U.uSun.value.copy(MOON);
    U.uSunCol.value.setRGB(0.05, 0.065, 0.11).multiplyScalar(sstep(-elD, 2, 9));
  }
  const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hz = lerp3([0.018, 0.02, 0.034], lerp3([0.98, 0.56, 0.32], [0.56, 0.74, 0.92], sstep(elD, 2, 24)), sstep(elD, -9, 1));
  const zn = lerp3([0.004, 0.008, 0.022], [0.09, 0.28, 0.68], dayS);
  U.uHorizon.value.setRGB(...hz); U.uZenith.value.setRGB(...zn);
  U.uAmb.value = 0.075 + 0.3 * dayS; U.uNight.value = night;
  sunStamp++;
}

// ---------- shadows: one sun-facing depth map that follows the point you are looking at ----------
const shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true });
shadowRT.depthTexture = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE, THREE.UnsignedIntType);
shadowRT.depthTexture.minFilter = shadowRT.depthTexture.magFilter = THREE.NearestFilter;
U.uShadowMap.value = shadowRT.depthTexture;
const shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 140);
shadowCam.layers.set(1);
let shadowKey = '';
function updateShadows(dist) {
  const on = city.ready && U.uCityR.value > 0.5 && sunUp && quality.shadows;
  U.uShadowOn.value = on ? 1 : 0;
  if (!on) return;
  const s = clamp(dist * 0.7, 0.8, 6);
  const step = (2 * s) / 256, t = controls.target;
  const cx = Math.round(t.x / step) * step, cz = Math.round(t.z / step) * step;
  const key = `${cx.toFixed(3)},${cz.toFixed(3)},${s.toFixed(2)},${sunStamp},${city.version},${U.uCityR.value.toFixed(2)}`;
  if (key === shadowKey) return;
  shadowKey = key;
  shadowCam.left = shadowCam.bottom = -s; shadowCam.right = shadowCam.top = s;
  shadowCam.position.set(cx, 0, cz).addScaledVector(U.uSun.value, 70);
  shadowCam.lookAt(cx, 0, cz); shadowCam.updateProjectionMatrix(); shadowCam.updateMatrixWorld();
  U.uShadowM.value.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
  scene.overrideMaterial = depthMat;
  renderer.setRenderTarget(shadowRT); renderer.clear(); renderer.render(scene, shadowCam);
  renderer.setRenderTarget(null); scene.overrideMaterial = null;
}

// ---------- terrain assets ----------
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image failed to decode')); i.src = src; });
const GX = 512, GZ = 876;                       // terrain mesh vertices: buildings and roads stand on exactly this surface
let grid = null, green = null, GW = 0, GH = 0;
function groundM(x, z) {                          // ground height in metres at local km (x, z)
  if (!grid) return 0;
  const fx = clamp((x / W_KM + 0.5) * (GX - 1), 0, GX - 1.001), fz = clamp((0.5 - z / H_KM) * (GZ - 1), 0, GZ - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, o = iz * GX + ix;
  return (grid[o] * (1 - tx) + grid[o + 1] * tx) * (1 - tz) + (grid[o + GX] * (1 - tx) + grid[o + GX + 1] * tx) * tz;
}
function isGreen(x, z) {
  const px = Math.floor((x / W_KM + 0.5) * GW), py = Math.floor((z / H_KM + 0.5) * GH);
  return px >= 0 && py >= 0 && px < GW && py < GH && green[py * GW + px] === 1;
}

async function init() {
  const [img, mask, hImg] = await Promise.all([loadImg(A.imagery), loadImg(A.water), loadImg(A.height)]);

  // heightmap: metres packed as R*256+G in 1/256 m steps
  const HW = hImg.width, HH = hImg.height;
  const c = document.createElement('canvas'); c.width = HW; c.height = HH;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(hImg, 0, 0);
  const px = ctx.getImageData(0, 0, HW, HH).data;
  const heights = new Float32Array(HW * HH), half = new Uint16Array(HW * HH);
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const s = (y * HW + x) * 4, d = (HH - 1 - y) * HW + x;   // flip so row 0 = south
    const m = (px[s] * 256 + px[s + 1]) / 256;
    heights[d] = m; half[d] = THREE.DataUtils.toHalfFloat(m);
  }
  const hTex = new THREE.DataTexture(half, HW, HH, THREE.RedFormat, THREE.HalfFloatType);
  hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
  U.uH.value = hTex; U.uTexel.value.set(1 / HW, 1 / HH);
  // sample the heightmap at the mesh vertices the same way the GPU does (bilinear at texel centres)
  grid = new Float32Array(GX * GZ);
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    const fx = clamp(i / (GX - 1) * HW - 0.5, 0, HW - 1.001), fy = clamp(j / (GZ - 1) * HH - 0.5, 0, HH - 1.001);
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, o = iy * HW + ix;
    grid[j * GX + i] = (heights[o] * (1 - tx) + heights[o + 1] * tx) * (1 - ty) + (heights[o + HW] * (1 - tx) + heights[o + HW + 1] * tx) * ty;
  }

  // vegetation mask from the imagery (green clearly above red and blue), used to plant trees
  GW = 2304; GH = Math.round(GW * img.height / img.width);
  const gc = document.createElement('canvas'); gc.width = GW; gc.height = GH;
  const gx = gc.getContext('2d', { willReadFrequently: true }); gx.drawImage(img, 0, 0, GW, GH);
  const gp = gx.getImageData(0, 0, GW, GH).data; green = new Uint8Array(GW * GH);
  const mc = document.createElement('canvas'); mc.width = GW; mc.height = GH;
  const mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(mask, 0, 0, GW, GH);
  const mp = mx.getImageData(0, 0, GW, GH).data;
  for (let i = 0; i < GW * GH; i++) { const r = gp[i * 4], g = gp[i * 4 + 1], b = gp[i * 4 + 2]; green[i] = (g > r * 1.07 && g > b * 1.12 && g > 34 && g < 150 && mp[i * 4] < 40) ? 1 : 0; }

  const maxTex = renderer.capabilities.maxTextureSize;
  let src = img;
  if (Math.max(img.width, img.height) > maxTex) {            // older GPUs: shrink to fit
    const s = maxTex / Math.max(img.width, img.height);
    const d = document.createElement('canvas'); d.width = Math.floor(img.width * s); d.height = Math.floor(img.height * s);
    d.getContext('2d').drawImage(img, 0, 0, d.width, d.height); src = d;
  }
  const iTex = new THREE.Texture(src); iTex.colorSpace = THREE.SRGBColorSpace;
  iTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); iTex.generateMipmaps = true; iTex.minFilter = THREE.LinearMipmapLinearFilter; iTex.needsUpdate = true;
  U.uImg.value = iTex;
  const mTex = new THREE.Texture(mask); mTex.anisotropy = 4; mTex.needsUpdate = true;
  U.uMask.value = mTex;

  const geo = new THREE.PlaneGeometry(W_KM, H_KM, GX - 1, GZ - 1); geo.rotateX(-Math.PI / 2);
  const terrain = new THREE.Mesh(geo, terrainMat); terrain.frustumCulled = false; scene.add(terrain);

  buildLabels(PLACES);
  buildLandmarks();
  $('loading').textContent = 'Raising the city…';
  await city.load().catch((err) => { $('status').textContent = 'Buildings could not be loaded: ' + err.message; console.error(err); });
  $('loading').hidden = true;
}

// ---------- the city: every footprint, streamed around the point you are looking at ----------
const KM = 1e-4;                                 // packed decimetres -> km
const ROAD_W = [22, 18, 15, 12, 9, 7, 4.5, 3.5].map((m) => m / 1000);
const city = {
  ready: false, version: 0, index: null, bld: null, roads: null, tiles: new Map(), queue: [], radiusMax: 9, auto: true, shownB: 0, govs: [], areas: [],
  async load() {
    const nameOf = (u) => (u.startsWith('data:') ? 'embedded data' : u);
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' for ' + nameOf(u)); return r; }, (e) => { throw new Error(e.message + ' (' + nameOf(u) + ')'); });
    // the published page can only serve text files, so binary packs travel there as base64 text
    const unb64 = (t) => { const s = atob(t.trim()), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a.buffer; };
    const bin = (u) => u.endsWith('.b64.txt') ? get(u).then((x) => x.text()).then(unb64) : get(u).then((x) => x.arrayBuffer());
    const [index, b, r] = await Promise.all([get(A.city.index).then((x) => x.json()), bin(A.city.buildings), bin(A.city.roads)]);
    this.index = index; this.bld = new Uint16Array(b); this.roads = new Uint16Array(r); this.ready = true;
    this.keys = [...new Set([...Object.keys(index.b), ...Object.keys(index.r)])].map((k) => { const [tx, tz] = k.split(',').map(Number); return { k, tx, tz, cx: tx + 0.5, cz: tz + 0.5 }; });
    fillAbout(index);
    get(A.city.districts).then((x) => x.json()).then((d) => {
      const have = new Set(PLACES.map((p) => p[0].toLowerCase()));
      this.areas = d.map((e) => { const [x, z] = xzOf(e[2], e[1]); return { name: e[0], x, z }; });
      buildLabels(d.filter((e) => !have.has(e[0].toLowerCase())).map((e) => [e[0], e[1], e[2], 4, 'area']));
    }).catch(() => {});
    get(A.city.govs).then((x) => x.json()).then((g) => { this.govs = g; buildGovernorates(g); }).catch(() => {});
  },
  update(dist) {
    if (!this.ready) return 0;
    const t = controls.target;
    const Rr = dist > 70 ? 0.001 : this.radiusMax;
    U.uCityR.value += (Rr - U.uCityR.value) * 0.25; U.uFocus.value.copy(t);
    const want = Rr + 0.75, drop = Rr * 1.25 + 1.5;
    this.queue.length = 0;
    for (const e of this.keys) {
      const d = Math.hypot(e.cx - t.x, e.cz - t.z), has = this.tiles.has(e.k);
      if (d < want && !has) this.queue.push([d, e]);
      else if (has && d > drop) this.unload(e.k);
    }
    if (this.queue.length) {
      this.queue.sort((a, b) => a[0] - b[0]);
      const t0 = performance.now();
      for (let i = 0; i < this.queue.length && performance.now() - t0 < 10; i++) this.build(this.queue[i][1]);
    }
    return this.queue.length;
  },
  unload(k) {
    const t = this.tiles.get(k);
    for (const m of t.meshes) { scene.remove(m); if (m.isInstancedMesh) m.dispose(); else m.geometry.dispose(); }
    this.shownB -= t.count; this.tiles.delete(k); this.version++;
  },
  build(e) {
    const meshes = [], ox = e.tx, oz = e.tz;
    const sphere = new THREE.Sphere(new THREE.Vector3(0.5, 0.05, 0.5), 3.4);
    let count = 0;
    const bi = this.index.b[e.k];
    if (bi) {
      const g = buildingGeometry(this.bld, bi[0], bi[1], ox, oz); count = bi[2];
      g.boundingSphere = sphere;
      const m = new THREE.Mesh(g, buildingMat); m.position.set(ox, 0, oz); m.layers.enable(1); m.updateMatrixWorld(); scene.add(m); meshes.push(m);
    }
    const ri = this.index.r[e.k];
    if (ri) {
      const g = roadGeometry(this.roads, ri[0], ri[1], ox, oz); g.boundingSphere = sphere;
      const m = new THREE.Mesh(g, roadMat); m.position.set(ox, 0, oz); m.renderOrder = 2; m.updateMatrixWorld(); scene.add(m); meshes.push(m);
    }
    const tm = quality.trees ? treesFor(ox, oz) : null; if (tm) { scene.add(tm); meshes.push(tm); }
    this.tiles.set(e.k, { meshes, count }); this.shownB += count; this.version++;
  },
};
const quality = { key: 'medium', shadows: true, trees: true };
const s16 = (v) => (v > 32767 ? v - 65536 : v);
const rnd = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
function treesFor(ox, oz) {
  if (!green) return null;
  const STEP = 0.021, list = [];
  for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) {
    const x = ox + (i + rnd(i + ox * 7, j + oz * 3)) * STEP, z = oz + (j + rnd(j + oz * 5, i + ox * 11)) * STEP;
    if (isGreen(x, z)) list.push(x, z);
  }
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(treeGeo, treeMat, list.length / 2);
  for (let k = 0; k < list.length; k += 2) {
    const x = list[k], z = list[k + 1], s = 0.75 + rnd(x * 50, z * 50) * 0.8;
    p4.set(x, groundM(x, z) * 0.001, z); q4.setFromAxisAngle(yAxis, rnd(z * 31, x * 17) * 6.28); s4.set(s, s * (0.85 + rnd(x, z) * 0.5), s);
    mesh.setMatrixAt(k / 2, m4.compose(p4, q4, s4));
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  return mesh;
}

function buildingGeometry(d, off, len, ox, oz) {
  let nv = 0, ni = 0;
  for (let p = off; p < off + len;) { const n = d[p]; nv += n * 5; ni += n * 6 + (n - 2) * 3; p += 4 + n * 2; }
  const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 4), col = new Uint8Array(nv * 4), base = new Float32Array(nv), wall = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let v = 0, ii = 0;
  const ring = [];
  for (let p = off; p < off + len;) {
    const n = d[p], h = d[p + 1] / 10, c565 = d[p + 2], fl = d[p + 3]; p += 4;
    const r = (c565 >> 11) << 3, g = ((c565 >> 5) & 63) << 2, b = (c565 & 31) << 3, seed = (fl >> 2) * 4;
    ring.length = n * 2;
    let cx = 0, cz = 0, area = 0;
    for (let i = 0; i < n; i++) { const x = s16(d[p + i * 2]) * KM, z = s16(d[p + i * 2 + 1]) * KM; ring[i * 2] = x; ring[i * 2 + 1] = z; cx += x; cz += z; }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1]; }
    p += n * 2;
    const gm = groundM(ox + cx / n, oz + cz / n), hk = h / 1000, sgn = area > 0 ? 1 : -1;
    const put = (x, y, z, nx, ny, nz, u) => {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nor[v * 4] = nx * 127; nor[v * 4 + 1] = ny * 127; nor[v * 4 + 2] = nz * 127;
      col[v * 4] = r; col[v * 4 + 1] = g; col[v * 4 + 2] = b; col[v * 4 + 3] = seed;
      base[v] = gm; wall[v * 2] = u; wall[v * 2 + 1] = h; return v++;
    };
    // walls (carried 8 m below ground level so nothing floats on a slope)
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = ring[i * 2], z0 = ring[i * 2 + 1], x1 = ring[j * 2], z1 = ring[j * 2 + 1];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1e-9, nx = sgn * dz / L, nz = -sgn * dx / L, u1 = u + L * 1000;
      const a = put(x0, -0.008, z0, nx, 0, nz, u), bq = put(x1, -0.008, z1, nx, 0, nz, u1), cq = put(x1, hk, z1, nx, 0, nz, u1), dq = put(x0, hk, z0, nx, 0, nz, u);
      idx[ii++] = a; idx[ii++] = bq; idx[ii++] = cq; idx[ii++] = a; idx[ii++] = cq; idx[ii++] = dq; u = u1;
    }
    const r0 = v;
    for (let i = 0; i < n; i++) put(ring[i * 2], hk, ring[i * 2 + 1], 0, 1, 0, 0);
    const tri = Earcut.triangulate(ring, null, 2);
    for (let i = 0; i < tri.length; i++) idx[ii++] = r0 + tri[i];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 4, true));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4, true));
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 1));
  g.setAttribute('aWall', new THREE.BufferAttribute(wall, 2));
  g.setIndex(new THREE.BufferAttribute(ii === ni ? idx : idx.subarray(0, ii), 1));
  return g;
}

function roadGeometry(d, off, len, ox, oz) {
  let nv = 0, ni = 0;
  for (let p = off; p < off + len;) { const n = d[p]; nv += n * 2; ni += (n - 1) * 6; p += 2 + n * 2; }
  const pos = new Float32Array(nv * 3), base = new Float32Array(nv), road = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let v = 0, ii = 0;
  for (let p = off; p < off + len;) {
    const n = d[p], cls = d[p + 1], w = ROAD_W[cls] / 2; p += 2;
    let along = rnd(p, cls) * 400;                // so traffic and lamps do not line up across segments
    for (let i = 0; i < n; i++) {
      const x = s16(d[p + i * 2]) * KM, z = s16(d[p + i * 2 + 1]) * KM;
      const a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1);
      let dx = s16(d[p + b * 2]) - s16(d[p + a * 2]), dz = s16(d[p + b * 2 + 1]) - s16(d[p + a * 2 + 1]);
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      if (i > 0) along += Math.hypot(x - s16(d[p + i * 2 - 2]) * KM, z - s16(d[p + i * 2 - 1]) * KM) * 1000;
      for (const side of [-1, 1]) {
        const px = x - dz * w * side, pz = z + dx * w * side;
        pos[v * 3] = px; pos[v * 3 + 2] = pz; base[v] = groundM(ox + px, oz + pz);
        road[v * 3] = side; road[v * 3 + 1] = along; road[v * 3 + 2] = cls; v++;
      }
      if (i > 0) { const q = v - 4; idx[ii++] = q; idx[ii++] = q + 1; idx[ii++] = q + 2; idx[ii++] = q + 1; idx[ii++] = q + 3; idx[ii++] = q + 2; }
    }
    p += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 1));
  g.setAttribute('aRoad', new THREE.BufferAttribute(road, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ---------- hand-built landmarks: lofted shapes standing on their real sites ----------
function loftBuilder(cx, cz) {
  const P = [], N = [], C = [], Bs = [], Wl = [], I = [];
  const gm = groundM(cx, cz);
  const push = (x, y, z, n, c, seed, u, H) => { P.push(cx + x / 1000, y / 1000, cz + z / 1000); N.push(n[0] * 127, n[1] * 127, n[2] * 127, 0); C.push(c[0], c[1], c[2], seed); Bs.push(gm); Wl.push(u, H); return P.length / 3 - 1; };
  // rings: [{ y, pts: [x, z, ...] }] in metres from the site centre, all with the same point count
  function loft(rings, c, H, seed = 90, capBottom = false) {
    const n = rings[0].pts.length / 2;
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r], Bq = rings[r + 1]; let u = 0;
      let mx = 0, mz = 0; for (let i = 0; i < n; i++) { mx += A.pts[i * 2] / n; mz += A.pts[i * 2 + 1] / n; }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = [A.pts[i * 2], A.y, A.pts[i * 2 + 1]], b = [A.pts[j * 2], A.y, A.pts[j * 2 + 1]], c2 = [Bq.pts[j * 2], Bq.y, Bq.pts[j * 2 + 1]], d = [Bq.pts[i * 2], Bq.y, Bq.pts[i * 2 + 1]];
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0] + c2[0] - b[0], d[1] - a[1] + c2[1] - b[1], d[2] - a[2] + c2[2] - b[2]];
        let nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const L = Math.hypot(...nn) || 1; nn = nn.map((v) => v / L);
        if (nn[0] * ((a[0] + b[0]) / 2 - mx) + nn[2] * ((a[2] + b[2]) / 2 - mz) < 0) nn = nn.map((v) => -v);
        if (H > 0) nn[1] = Math.min(nn[1], 0.45);                        // keep raked glass reading as wall, not roof
        const u1 = u + Math.hypot(e1[0], e1[2]);
        const q = [push(...a, nn, c, seed, u, H), push(...b, nn, c, seed, u1, H), push(...c2, nn, c, seed, u1, H), push(...d, nn, c, seed, u, H)];
        I.push(q[0], q[1], q[2], q[0], q[2], q[3]); u = u1;
      }
    }
    const cap = (ring, ny) => { const r0 = P.length / 3; for (let i = 0; i < n; i++) push(ring.pts[i * 2], ring.y, ring.pts[i * 2 + 1], [0, ny, 0], c, seed, 0, H > 0 ? H : 0); for (const t of Earcut.triangulate(ring.pts, null, 2)) I.push(r0 + t); };
    cap(rings[rings.length - 1], 1); if (capBottom) cap(rings[0], -1);
  }
  const box = (x0, x1, y0, y1, z0, z1, c) => loft([{ y: y0, pts: [x0, z0, x1, z0, x1, z1, x0, z1] }, { y: y1, pts: [x0, z0, x1, z0, x1, z1, x0, z1] }], c, 0, 90, true);
  const circle = (r, n, ox = 0, oz = 0) => { const p = []; for (let i = 0; i < n; i++) p.push(ox + Math.cos(i / n * 6.2832) * r, oz + Math.sin(i / n * 6.2832) * r); return p; };
  const mesh = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(N), 4, true));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Uint8Array(C), 4, true));
    g.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(Bs), 1));
    g.setAttribute('aWall', new THREE.BufferAttribute(new Float32Array(Wl), 2));
    g.setIndex(I);
    const m = new THREE.Mesh(g, buildingMat); m.frustumCulled = false; m.layers.enable(1); return m;
  };
  return { loft, box, circle, mesh };
}
function buildLandmarks() {
  // Bahrain World Trade Center: two 240 m sails raked back from the sea, three turbine bridges between them
  { const [x, z] = xzOf(50.58141, 26.23966), L = loftBuilder(x, z), glass = [120, 150, 170], steel = [70, 76, 84];
    for (const side of [-1, 1]) {
      const rings = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14, pts = [];
        for (let i = 0; i < 18; i++) { const a = i / 18 * 6.2832, px = Math.cos(a) * 11, pz = Math.sin(a) * 24; pts.push(side * 27 + px * (1 - 0.6 * t), 24 - (24 - pz) * (1 - 0.88 * Math.pow(t, 1.3))); }
        rings.push({ y: 10 + t * 230, pts });
      }
      L.loft(rings, glass, 240, side > 0 ? 60 : 180);
    }
    for (const y of [60, 97, 133]) { L.box(-21, 21, y - 1.6, y + 1.6, 12, 15, steel); L.box(-0.9, 0.9, y - 14, y + 14, 11, 11.7, [230, 232, 235]); L.box(-14, 14, y - 0.9, y + 0.9, 11, 11.7, [230, 232, 235]); }
    scene.add(L.mesh()); }
  // Al Fateh Grand Mosque: the great dome and its two minarets
  { const [x, z] = xzOf(50.59834, 26.21899), L = loftBuilder(x, z), stone = [226, 214, 190], domeC = [236, 228, 208];
    const rings = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * 1.5; rings.push({ y: 12 + Math.sin(a) * 14, pts: L.circle(Math.max(12.5 * Math.cos(a), 0.4), 24) }); }
    L.loft([{ y: 0, pts: L.circle(13.5, 24) }, { y: 12, pts: L.circle(13.5, 24) }], stone, 0); L.loft(rings, domeC, 0);
    for (const sx of [-34, 34]) {
      L.loft([{ y: 0, pts: L.circle(2.6, 12, sx, -30) }, { y: 46, pts: L.circle(2.2, 12, sx, -30) }, { y: 47, pts: L.circle(3.2, 12, sx, -30) }, { y: 49, pts: L.circle(3.2, 12, sx, -30) }, { y: 50, pts: L.circle(1.8, 12, sx, -30) }, { y: 62, pts: L.circle(1.6, 12, sx, -30) }, { y: 70, pts: L.circle(0.2, 12, sx, -30) }], stone, 0);
    }
    scene.add(L.mesh()); }
}

// ---------- governorates: boundary lines, labels, and the "where am I" readout ----------
const govGroup = new THREE.Group(); govGroup.visible = false; scene.add(govGroup);
const govMat = new LineMaterial({ color: 0xff7566, linewidth: 2.6, transparent: true, opacity: 0.95, depthTest: false });
function buildGovernorates(govs) {
  for (const g of govs) {
    for (const ring of g.rings) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(ring[i], groundM(ring[i], ring[i + 1]) * 0.001 + 0.03, ring[i + 1]);
      const geo = new LineGeometry(); geo.setPositions(pts);
      const line = new Line2(geo, govMat); line.computeLineDistances(); line.renderOrder = 5; line.frustumCulled = false; govGroup.add(line);
    }
    const [lo, la] = lonLatOf(g.label[0], g.label[1]);
    buildLabels([[g.name, la, lo, 0, 'gov']]);
  }
}
function inRing(r, x, z) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if ((r[i + 1] > z) !== (r[j + 1] > z) && x < (r[j] - r[i]) * (z - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
  }
  return inside;
}
function whereIs(x, z) {
  let gov = '';
  for (const g of city.govs) if (g.rings.some((r) => inRing(r, x, z))) { gov = g.name + ' Governorate'; break; }
  let best = null, bd = 3.5;
  for (const a of city.areas) { const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a.name; } }
  return [best, gov].filter(Boolean).join(' · ') || (gov ? gov : 'Gulf of Bahrain');
}

// ---------- labels ----------
const labelRoot = $('labels');
const labels = [];
function buildLabels(list) {
  const made = [];
  for (const [name, lat, lon, tier, kind] of list) {
    const el = document.createElement('div'); el.className = `label k-${kind}`; el.textContent = name;
    labelRoot.appendChild(el);
    const [x, z] = xzOf(lon, lat);
    const l = { el, x, z, h: groundM(x, z), tier, kind, w: 0, hgt: 0, shown: false }; labels.push(l); made.push(l);
  }
  for (const l of made) { const r = l.el.getBoundingClientRect(); l.w = r.width; l.hgt = r.height; }
  labels.sort((a, b) => a.tier - b.tier);
}
const v3 = new THREE.Vector3();
let showLabels = true, showGov = false;
function updateLabels(w, h, d) {
  const maxTier = d > 170 ? 1 : d > 60 ? 2 : d > 22 ? 3 : 4;
  const taken = [];
  for (const l of labels) {
    const lift = l.kind === 'gov' ? 0.03 : l.kind === 'area' || l.kind === 'sea' ? 0.0 : Math.min(0.06, d * 0.02);
    v3.set(l.x, l.h * 0.001 + lift, l.z).project(camera);
    let ok = (l.kind === 'gov' ? showGov : showLabels) && l.tier <= maxTier && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    if (ok && d < 60 && l.kind !== 'gov') { const far = Math.hypot(l.x - camera.position.x, l.z - camera.position.z); if (far > Math.max(14, d * 5)) ok = false; }
    const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
    const box = [sx - l.w / 2 - 5, sy - l.hgt - 3, sx + l.w / 2 + 5, sy + 3];
    if (ok) for (const t of taken) if (box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]) { ok = false; break; }
    if (ok) { taken.push(box); l.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`; }
    if (ok !== l.shown) { l.shown = ok; l.el.classList.toggle('on', ok); }
  }
}

// ---------- flying to a place ----------
let fly = null;
const pin = { el: $('pin'), x: 0, z: 0, on: false };
function flyTo(lon, lat, label, dist = 0.9, az = null, el = 34, drop = true) {
  const [x, z] = xzOf(lon, lat);
  const off = new THREE.Vector3();
  if (az === null) { off.copy(camera.position).sub(controls.target); off.y = 0; if (off.lengthSq() < 1e-6) off.set(0, 0, 1); off.normalize(); }
  else off.set(Math.sin(az * rad), 0, Math.cos(az * rad));
  off.multiplyScalar(dist * Math.cos(el * rad)); off.y = dist * Math.sin(el * rad);
  fly = { t0: performance.now(), dur: 2600, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: new THREE.Vector3(x, 0, z), toP: new THREE.Vector3(x, 0, z).add(off) };
  if (drop) { pin.x = x; pin.z = z; pin.on = true; pin.el.hidden = false; $('pinText').textContent = label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`; }
}
function stepFly(now) {
  if (!fly) return;
  let k = Math.min(1, (now - fly.t0) / fly.dur); k = k * k * (3 - 2 * k);
  controls.target.lerpVectors(fly.fromT, fly.toT, k);
  camera.position.lerpVectors(fly.fromP, fly.toP, k);
  camera.position.y += Math.sin(Math.PI * k) * Math.min(fly.fromT.distanceTo(fly.toT) * 0.22, 10);   // arc over the island
  if (k >= 1) fly = null;
}

// ---------- search ----------
let searchData = null, searchLoading = null;
const KIND = { a: 'Area', r: 'Road', p: 'Place', b: 'Building' };
const qEl = $('q'), resEl = $('results');
function loadSearch() { return searchLoading || (searchLoading = fetch(A.city.search).then((r) => r.json()).then((d) => { searchData = d.map((e) => [e[0], e[1], e[2], e[3], e[4], (e[0] + ' ' + e[1]).toLowerCase()]); })); }
function parseCoords(s) {
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*°?\s*[NS]?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*[EW]?\s*$/i);
  if (!m) return null;
  let la = +m[1], lo = +m[2]; if (la > 40) [la, lo] = [lo, la];
  return (la > B.south && la < B.north && lo > B.west && lo < B.east) ? [lo, la] : 'out';
}
function runSearch() {
  const s = qEl.value.trim(); resEl.replaceChildren();
  if (s.length < 2) { resEl.hidden = true; return; }
  const add = (title, sub, fn) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'res';
    const t = document.createElement('span'); t.textContent = title; const k = document.createElement('small'); k.textContent = sub; b.append(t, k);
    if (fn) b.addEventListener('click', () => { fn(); resEl.hidden = true; qEl.blur(); }); else b.disabled = true;
    resEl.appendChild(b);
  };
  const c = parseCoords(s);
  if (c === 'out') add('Those coordinates are outside the model', 'Bahrain is roughly 25.5–26.4°N, 50.3–50.9°E');
  else if (c) add(`Go to ${c[1].toFixed(5)}°N ${c[0].toFixed(5)}°E`, 'Coordinates', () => flyTo(c[0], c[1], null, 0.5));
  else if (!searchData) { add('Loading place names…', ''); loadSearch().then(runSearch); }
  else {
    const q = s.toLowerCase(), hits = [];
    for (const e of searchData) {
      const i = e[5].indexOf(q); if (i < 0) continue;
      const exact = e[0].toLowerCase() === q ? 0 : i === 0 ? 1 : e[5][i - 1] === ' ' ? 2 : 3;
      hits.push([exact * 10 + 'arbp'.indexOf(e[4]) + e[0].length * 0.001, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (const [, e] of hits.slice(0, 7)) add(e[0], KIND[e[4]] + (e[1] ? ' · ' + e[1] : ''), () => flyTo(e[2], e[3], e[0], e[4] === 'a' ? 2.6 : 0.7));
    if (!hits.length) add('Nothing by that name', 'Try a road number like “Road 2803”, or paste coordinates from a map app');
  }
  resEl.hidden = false;
}
qEl.addEventListener('focus', () => { loadSearch().catch(() => {}); });
qEl.addEventListener('input', runSearch);
qEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const b = resEl.querySelector('button:not(:disabled)'); if (b) b.click(); } if (e.key === 'Escape') { resEl.hidden = true; qEl.blur(); } });
$('pinClose').addEventListener('click', () => { pin.on = false; pin.el.hidden = true; });

// ---------- UI ----------
function fillAbout(index) {
  $('count').textContent = new Intl.NumberFormat('en').format(index.count);
  const s = index.sources, rows = [['Mapped height', s[1]], ['Mapped floor count', s[2]], ['Estimated from satellite', s[3]], ['Default for small structures', s[0]]];
  const bars = $('bars'); bars.replaceChildren();
  for (const [name, n] of rows) {
    const pct = n / index.count * 100;
    const a = document.createElement('span'); a.textContent = name;
    const i = document.createElement('i'), b = document.createElement('b'); b.style.width = Math.max(pct, 0.6) + '%'; i.appendChild(b);
    const c = document.createElement('span'); c.textContent = pct.toFixed(1) + '%';
    bars.append(a, i, c);
  }
}
const fmtTime = (h) => { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} AST`; };
let timeAnim = null;
function applyTime(h) { setTime(h); $('time').value = h; $('clock').textContent = fmtTime(h); }
$('time').addEventListener('input', (e) => { timeAnim = null; applyTime(+e.target.value); });
for (const b of document.querySelectorAll('.presets button')) b.addEventListener('click', () => { timeAnim = { from: +$('time').value, to: +b.dataset.t, t0: performance.now() }; });
for (const [name, lon, lat, d, az, el] of LANDMARKS) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
  b.addEventListener('click', () => flyTo(lon, lat, name, d, az, el, false)); $('chips').appendChild(b);
}
const toggle = (id, fn) => $(id).addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); fn(on); });
toggle('tLabels', (on) => { showLabels = on; });
toggle('tGov', (on) => { showGov = on; govGroup.visible = on; });
$('tIsland').addEventListener('click', () => flyTo(50.555, 26.03, null, 128, 15, 33, false));
// Detail levels change what is drawn, not just how far: reach of the raised city, sharpness, shadows, trees, traffic, facade detail
const LEVELS = {
  lite:   { name: 'Lite',   radius: 3,  px: 1,    shadows: false, trees: false, traffic: 0, fine: 0.0 },
  low:    { name: 'Low',    radius: 5,  px: 1,    shadows: true,  trees: false, traffic: 1, fine: 0.6 },
  medium: { name: 'Medium', radius: 9,  px: 1.5,  shadows: true,  trees: true,  traffic: 1, fine: 1.0 },
  high:   { name: 'High',   radius: 15, px: 2,    shadows: true,  trees: true,  traffic: 1, fine: 1.6 },
  ultra:  { name: 'Ultra',  radius: 45, px: 2,    shadows: true,  trees: true,  traffic: 1, fine: 2.4 },
};
const ORDER = ['lite', 'low', 'medium', 'high', 'ultra'];
function applyLevel(key) {
  const L = LEVELS[key], treesChanged = quality.trees !== L.trees;
  quality.key = key; quality.shadows = L.shadows; quality.trees = L.trees;
  U.uTraffic.value = L.traffic; U.uFine2.value = L.fine; city.radiusMax = L.radius;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, L.px)); cw = 0;       // forces a resize at the new sharpness
  if (treesChanged) for (const k of [...city.tiles.keys()]) city.unload(k);            // rebuild tiles with or without trees
  shadowKey = '';
  $('detailText').textContent = city.auto ? `Auto · ${L.name}` : `${L.name} detail`;
  for (const b of $('detailMenu').children) b.setAttribute('aria-current', b.dataset.level === (city.auto ? 'auto' : key));
}
const closeDetail = () => { $('detailMenu').hidden = true; $('detailBtn').setAttribute('aria-expanded', 'false'); };
$('detailBtn').addEventListener('click', () => { const open = $('detailMenu').hidden; $('detailMenu').hidden = !open; $('detailBtn').setAttribute('aria-expanded', String(open)); });
for (const b of $('detailMenu').children) b.addEventListener('click', () => { city.auto = b.dataset.level === 'auto'; slow = fast = 0; applyLevel(city.auto ? 'medium' : b.dataset.level); closeDetail(); });
canvas.addEventListener('pointerdown', closeDetail);
$('aboutBtn').addEventListener('click', () => { $('about').hidden = !$('about').hidden; });
$('aboutClose').addEventListener('click', () => { $('about').hidden = true; });
$('north').addEventListener('click', () => {
  const off = camera.position.clone().sub(controls.target), r = Math.hypot(off.x, off.z);
  fly = { t0: performance.now(), dur: 900, fromT: controls.target.clone(), toT: controls.target.clone(), fromP: camera.position.clone(), toP: controls.target.clone().add(new THREE.Vector3(0, off.y, r)) };
});
applyTime(+$('time').value);
$('search').hidden = false;
const hint = $('hint');
const dropHint = () => hint.classList.add('gone');
for (const ev of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, dropHint, { once: true, passive: true });
setTimeout(dropHint, 9000);

// WASD / arrow keys fly across the ground
const keys = new Set();
window.addEventListener('keydown', (e) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return; keys.add(e.key.toLowerCase()); });
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function stepKeys(dt, dist) {
  if (!keys.size) return;
  const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const s = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const turn = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
  if (!f && !s && !turn) return;
  fly = null;
  fwd.copy(controls.target).sub(camera.position); fwd.y = 0; fwd.normalize(); right.set(-fwd.z, 0, fwd.x);
  const step = Math.max(dist, 0.3) * 0.9 * dt;
  const mv = fwd.multiplyScalar(f * step).addScaledVector(right, s * step);
  controls.target.add(mv); camera.position.add(mv);
  if (turn) { const off = camera.position.clone().sub(controls.target).applyAxisAngle(yAxis, turn * dt * 0.9); camera.position.copy(controls.target).add(off); }
}

const needle = $('needle'), wrap = $('stage'), statusEl = $('status'), posEl = $('pos'), placeEl = $('place');
let cw = 0, ch = 0, frameN = 0, last = 0, slow = 0, fast = 0;
applyLevel('medium');
function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (w === cw && h === ch) return;
  cw = w; ch = h; govMat.resolution.set(w, h); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
const clock = new THREE.Clock();
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = new Intl.NumberFormat('en');
function frame(now = 0) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
  resize();
  if (!still) U.uTime.value = clock.getElapsedTime();
  if (timeAnim) { let k = Math.min(1, (now - timeAnim.t0) / 1400); k = k * k * (3 - 2 * k); applyTime(timeAnim.from + (timeAnim.to - timeAnim.from) * k); if (k >= 1) timeAnim = null; }
  stepFly(now);
  let dist = camera.position.distanceTo(controls.target);
  stepKeys(dt, dist);
  controls.update();
  const floor = groundM(camera.position.x, camera.position.z) * 0.001 + 0.02;
  if (camera.position.y < floor) camera.position.y = floor;
  dist = camera.position.distanceTo(controls.target);
  const pending = city.update(dist);
  // auto detail: widen the built radius while frames are quick, pull it in when they are not
  if (city.auto && !pending && frameN > 90) {
    if (dt > 0.036) { slow++; fast = 0; } else if (dt < 0.019) { fast++; slow = 0; } else { slow = 0; fast = 0; }
    const at = ORDER.indexOf(quality.key);
    if (slow > 50 && at > 0) { applyLevel(ORDER[at - 1]); slow = 0; frameN = 30; }
    if (fast > 420 && at < 3) { applyLevel(ORDER[at + 1]); fast = 0; frameN = 30; }
  }
  updateShadows(dist);
  renderer.render(scene, camera);
  if (labels.length) updateLabels(cw, ch, dist);
  if (pin.on) {
    v3.set(pin.x, groundM(pin.x, pin.z) * 0.001, pin.z).project(camera);
    pin.el.style.transform = `translate(${((v3.x * 0.5 + 0.5) * cw).toFixed(1)}px, ${((-v3.y * 0.5 + 0.5) * ch).toFixed(1)}px) translate(-50%, -100%)`;
    pin.el.style.visibility = v3.z < 1 ? 'visible' : 'hidden';
  }
  needle.style.transform = `rotate(${(controls.getAzimuthalAngle() * 180 / Math.PI).toFixed(1)}deg)`;
  if (frameN++ % 12 === 0) {
    const t = controls.target, [lo, la] = lonLatOf(t.x, t.z);
    const eye = (camera.position.y - groundM(camera.position.x, camera.position.z) * 0.001) * 1000;
    placeEl.textContent = whereIs(t.x, t.z);
    posEl.textContent = `${la.toFixed(4)}° N ${lo.toFixed(4)}° E · eye ${eye < 3000 ? Math.round(eye) + ' m' : (eye / 1000).toFixed(1) + ' km'}`;
    if (city.ready) statusEl.textContent = dist > 70 ? 'Zoom in to raise the buildings' : `${LEVELS[quality.key].name} detail · ${nf.format(city.shownB)} buildings raised${pending ? ' · adding more…' : ''}`;
  }
}
init().catch((err) => { $('loading').hidden = false; $('loading').textContent = 'Could not load the model: ' + (err && err.message || err); console.error(err); });
requestAnimationFrame(frame);
window.__dbg = { camera, controls, xzOf, city, flyTo };
