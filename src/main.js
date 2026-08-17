import "./style.css";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  LOADER — stays up until every asset is in and the scene has drawn   */
/* ------------------------------------------------------------------ */
const loaderEl = document.getElementById("loader");
const loaderPct = document.getElementById("loader-pct");
document.body.classList.add("loading");

const assets = []; // promises the loader waits on
let loadedCount = 0; // how many of them have finished
let shownPct = 0; // eased percentage, so the number counts up smoothly
let ready = false; // true once the loader is gone and input is live

const nextFrame = () => new Promise(requestAnimationFrame);

// wait on a promise and count it toward the percentage — a failed asset
// still counts, so one dead URL can never wedge the loader shut
function load(promise) {
  const p = Promise.resolve(promise).catch(() => {});
  assets.push(p);
  p.then(() => loadedCount++);
  return p;
}

// runs every frame: ease the displayed number toward the real progress
function updateLoader(dt) {
  if (ready) return;
  const target = (loadedCount / assets.length) * 100;
  shownPct += (target - shownPct) * Math.min(dt * 5, 1);
  loaderPct.textContent = `${Math.floor(shownPct)}%`;
}

async function hideLoader() {
  await Promise.all(assets);
  while (shownPct < 99.5) await nextFrame(); // let the number finish counting
  loaderPct.textContent = "100%";

  ready = true;
  document.body.classList.remove("loading");
  loaderEl.classList.add("done");
  loaderEl.addEventListener("transitionend", () => loaderEl.remove(), {
    once: true,
  });
}

/* ------------------------------------------------------------------ */
/*  CONFIG                                                             */
/* ------------------------------------------------------------------ */
const CFG = {
  // roll / strip
  L: 900, // total strip length (world units)
  W: 7, // strip width = length of the roll cylinder
  core: 0.8, // core tube radius
  h: 0.01, // paper thickness per wrap
  panels: 30, // number of distinct photos in the texture atlas
  panelScale: 1, // photo length along the strip (1 = undistorted aspect)
  lift: 0.012, // strip height above the ground
  // motion
  follow: 4, // chase strength — speed scales with distance to the pointer
  maxSpeed: 26, // speed cap (units / second)
  maxTurn: 1.1, // steering rate: radians per unit of strip rolled out
  deadzone: 1.1, // roll stops when it gets this close to the pointer
  accel: 11.7, // how hard it picks up speed
  drag: 0.9, // how slowly it bleeds speed — low = long slippery glide
  steer: 12.5, // heading response to the pointer
  // camera
  camX: -4.5,
  camY: 12,
  camZ: 13.5,
  fov: 65,
};

const SEGS = 3200; // segments along strip length
const WSEGS = 6; // segments across width
const STEP = 0.05; // arc-length between path samples
const RAMP = 0.0005; // height gain per unit laid, so later tape stacks on top
const TWO_PI = Math.PI * 2;

const outerRadius = (remaining) =>
  Math.sqrt(CFG.core * CFG.core + (CFG.h * remaining) / Math.PI);
const R_FULL = outerRadius(CFG.L);

/* ------------------------------------------------------------------ */
/*  RENDERER / SCENE / CAMERA                                          */
/* ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6e6e6);
scene.fog = new THREE.Fog(0xe6e6e6, 35, 90);

const camera = new THREE.PerspectiveCamera(
  CFG.fov,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);

/* ------------------------------------------------------------------ */
/*  LIGHTS + GROUND (no shadows)                                       */
/* ------------------------------------------------------------------ */
scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b4bc, 1.15));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(6, 14, 7);
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshStandardMaterial({ color: 0xe2e2e2, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

/* ------------------------------------------------------------------ */
/*  STRIP TEXTURE (photo atlas, drawn once and lazily filled)          */
/* ------------------------------------------------------------------ */
// as much texture width as this GPU allows (some max out at 8192)
const TEX_W = Math.min(16384, renderer.capabilities.maxTextureSize);
const TEX_H = 512;
const texCanvas = document.createElement("canvas");
texCanvas.width = TEX_W;
texCanvas.height = TEX_H;
const tctx = texCanvas.getContext("2d");

const stripTexture = new THREE.CanvasTexture(texCanvas);
stripTexture.colorSpace = THREE.SRGBColorSpace;
// the atlas tiles along the strip, so photos keep a fixed world size
stripTexture.wrapS = THREE.RepeatWrapping;
stripTexture.wrapT = THREE.ClampToEdgeWrapping;
stripTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

function coverDraw(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / r;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// curated Unsplash photos, shown as-is (full bleed, no overlays)
const UNSPLASH_IDS = [
  "photo-1506905925346-21bda4d32df4",
  "photo-1470071459604-3b5ec3a7fe05",
  "photo-1441974231531-c6227db76b6e",
  "photo-1501594907352-04cda38ebc29",
  "photo-1519681393784-d120267933ba",
  "photo-1469474968028-56623f02e42e",
  "photo-1447752875215-b2761acb3c5d",
  "photo-1433086966358-54859d0ed716",
  "photo-1472214103451-9374bd1c798e",
  "photo-1482938289607-e9573fc25ebb",
  "photo-1509316975850-ff9c5deb0cd9",
  "photo-1465146344425-f00d5f5c8f07",
  "photo-1426604966848-d7adac402bff",
  "photo-1454496522488-7a8e488e8606",
  "photo-1475924156734-496f6cac6ec1",
  "photo-1439066615861-d1af74d74000",
];

function drawPanel(idx, img) {
  const pw = TEX_W / CFG.panels;
  const x0 = idx * pw;
  const gap = 10; // thin white gutter between photos
  const ctx = tctx;

  ctx.fillStyle = "#f7f6f2";
  ctx.fillRect(x0, 0, pw, TEX_H);

  if (img) {
    coverDraw(ctx, img, x0 + gap, gap, pw - gap * 2, TEX_H - gap * 2);
  } else {
    // neutral block while the photo loads
    ctx.fillStyle = "#d8d6d1";
    ctx.fillRect(x0 + gap, gap, pw - gap * 2, TEX_H - gap * 2);
  }
}

const photoCache = []; // idx -> Image (loaded) | "loading"

// resolves once the panel's photo is drawn (or has definitively failed)
function ensurePhoto(idx) {
  if (photoCache[idx]) return Promise.resolve();
  photoCache[idx] = "loading";
  const id = UNSPLASH_IDS[idx % UNSPLASH_IDS.length];
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      photoCache[idx] = img;
      drawPanel(idx, img);
      stripTexture.needsUpdate = true;
      resolve();
    };
    // if an Unsplash id is dead, fall back to a Picsum photo so the
    // panel never stays a blank placeholder
    img.onerror = () => {
      img.onerror = () => resolve(); // fallback failed too — don't block
      img.src = `https://picsum.photos/seed/roll-${idx}/900/600`;
    };
    img.src = `https://images.unsplash.com/${id}?w=900&q=80&fm=jpg&fit=crop`;
  });
}

for (let i = 0; i < CFG.panels; i++) {
  drawPanel(i, null);
  load(ensurePhoto(i));
}
stripTexture.needsUpdate = true;

load(document.fonts.ready); // the on-screen type waits on the web fonts too

/* ------------------------------------------------------------------ */
/*  PATH — the trail the roll leaves behind as the user steers it      */
/* ------------------------------------------------------------------ */
// samples: [x, z, tx, tz] per point, laid down once and then frozen
const samples = new Float32Array((Math.ceil(CFG.L / STEP) + 2) * 4);
let sampleCount = 0;
let pathLen = 0; // arc length covered by committed samples

let theta = 0; // current rolling heading (radians in XZ plane)
let desiredTheta = 0; // where the user is dragging toward
let headX = 0;
let headZ = 0;

function pushSample(x, z, tx, tz) {
  const o = sampleCount * 4;
  samples[o] = x;
  samples[o + 1] = z;
  samples[o + 2] = tx;
  samples[o + 3] = tz;
  sampleCount++;
}

const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// commit path samples up to arc length sNew; heading turns while rolling
function advancePath(sNew) {
  // tight turns fan the tape over itself like a real ribbon — the height
  // ramp keeps the newest layer on top, so it renders cleanly
  const lim = CFG.maxTurn * STEP;
  while (pathLen + STEP <= sNew) {
    const diff = shortAngle(desiredTheta - theta);
    const eased = diff * 0.22; // slides into the turn instead of snapping
    theta += Math.min(Math.max(eased, -lim), lim);
    headX += Math.cos(theta) * STEP;
    headZ += Math.sin(theta) * STEP;
    pathLen += STEP;
    pushSample(headX, headZ, Math.cos(theta), Math.sin(theta));
  }
}

// interpolated point + tangent at arc length t (t <= s)
const _pt = { x: 0, z: 0, tx: 1, tz: 0 };
function pathAt(t) {
  const f = Math.min(t / STEP, sampleCount - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, sampleCount - 1);
  const a = f - i0;
  const o0 = i0 * 4;
  const o1 = i1 * 4;
  _pt.x = samples[o0] + (samples[o1] - samples[o0]) * a;
  _pt.z = samples[o0 + 1] + (samples[o1 + 1] - samples[o0 + 1]) * a;
  const tx = samples[o0 + 2] + (samples[o1 + 2] - samples[o0 + 2]) * a;
  const tz = samples[o0 + 3] + (samples[o1 + 3] - samples[o0 + 3]) * a;
  const inv = 1 / Math.hypot(tx, tz);
  _pt.tx = tx * inv;
  _pt.tz = tz * inv;
  return _pt;
}

/* ------------------------------------------------------------------ */
/*  STRIP GEOMETRY                                                     */
/* ------------------------------------------------------------------ */
const world = new THREE.Group();
scene.add(world);

const rows = SEGS + 1;
const cols = WSEGS + 1;
const stripGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const idx = [];
  for (let i = 0; i < SEGS; i++) {
    for (let j = 0; j < WSEGS; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  stripGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  stripGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  stripGeo.setIndex(idx);
}

const strip = new THREE.Mesh(
  stripGeo,
  new THREE.MeshStandardMaterial({
    map: stripTexture,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  }),
);
strip.frustumCulled = false;
world.add(strip);

/* Photo size along the strip is fixed in world units instead of being
   L / panels — otherwise a longer strip just stretches every photo.
   One photo occupies `panelLen` units and the atlas repeats down the
   strip as many times as needed. */
{
  // the un-stretched length of one photo, from the atlas cell's aspect
  const cellAspect = TEX_W / CFG.panels / TEX_H;
  const panelLen = CFG.W * cellAspect * CFG.panelScale;
  const repeats = CFG.L / (panelLen * CFG.panels);
  const uv = stripGeo.attributes.uv.array;
  for (let i = 0; i < rows; i++) {
    const u = (i / SEGS) * repeats;
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j;
      uv[k * 2] = u;
      uv[k * 2 + 1] = j / WSEGS;
    }
  }
  stripGeo.attributes.uv.needsUpdate = true;
}

function updateStrip(s) {
  const R = outerRadius(Math.max(CFG.L - s, 0));
  const pos = stripGeo.attributes.position.array;
  const halfW = CFG.W / 2;

  // head of the path (may be a fraction of a STEP past the last sample)
  const frac = s - pathLen;
  const fCos = Math.cos(theta);
  const fSin = Math.sin(theta);
  const hx = headX + fCos * frac;
  const hz = headZ + fSin * frac;

  for (let i = 0; i < rows; i++) {
    const t = (i / SEGS) * CFG.L;

    if (t <= s) {
      // flat on the ground, following the steered path
      const p = pathAt(t);
      const nx = -p.tz; // lateral normal on the ground plane
      const nz = p.tx;
      for (let j = 0; j < cols; j++) {
        const off = (j / WSEGS - 0.5) * 2 * halfW;
        const k = (i * cols + j) * 3;
        pos[k] = p.x + nx * off;
        pos[k + 1] = CFG.lift + RAMP * t; // later tape lies on top at crossings
        pos[k + 2] = p.z + nz * off;
      }
    } else {
      // wound as full wraps at stepped radii (R, R-h, R-2h, ...): the
      // outer wrap is a closed cylinder, so it fully covers the layers
      // beneath — no see-through gaps, no filler needed
      const u = t - s;
      const a = Math.PI * CFG.h;
      const b = TWO_PI * R + a;
      // which wrap this arc length falls into (closed-form)
      const disc = Math.max(b * b - 4 * a * u, 0);
      let wrap = Math.floor((b - Math.sqrt(disc)) / (2 * a));
      let rk = R - wrap * CFG.h;
      const minR = CFG.core * 0.98;
      if (rk < minR) {
        wrap = Math.round((R - minR) / CFG.h);
        rk = minR;
      }
      const cum = TWO_PI * wrap * R - Math.PI * CFG.h * wrap * (wrap - 1);
      const phi = Math.max(u - cum, 0) / rk;
      // winds up the FRONT of the roll, so the surface spins in the
      // true rolling direction
      const fwd = rk * Math.sin(phi); // distance ahead of the contact point
      const up = CFG.lift + RAMP * s + R - rk * Math.cos(phi);
      const cx = hx + fCos * fwd;
      const cz = hz + fSin * fwd;
      const nx = -fSin;
      const nz = fCos;
      for (let j = 0; j < cols; j++) {
        const off = (j / WSEGS - 0.5) * 2 * halfW;
        const k = (i * cols + j) * 3;
        pos[k] = cx + nx * off;
        pos[k + 1] = up;
        pos[k + 2] = cz + nz * off;
      }
    }
  }
  stripGeo.attributes.position.needsUpdate = true;
  stripGeo.computeVertexNormals();
  return R;
}

/* ------------------------------------------------------------------ */
/*  ROLL SIDE CAPS / CORE                                              */
/* ------------------------------------------------------------------ */
function makeCapTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b8b8b8";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.translate(512, 512);
  for (let r = 6; r < 512; r += 3) {
    const g = 168 + Math.floor(Math.random() * 46);
    ctx.strokeStyle = `rgb(${g},${g},${g})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < 70; a++) {
    const ang = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(120,120,120,${0.05 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 40, Math.sin(ang) * 40);
    ctx.lineTo(Math.cos(ang) * 512, Math.sin(ang) * 512);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAnnulus(radialSegs) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((radialSegs + 1) * 2 * 3);
  const uv = new Float32Array((radialSegs + 1) * 2 * 2);
  const idx = [];
  for (let k = 0; k < radialSegs; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.userData.radialSegs = radialSegs;
  return geo;
}

function updateAnnulus(geo, rIn, rOut) {
  const segs = geo.userData.radialSegs;
  const pos = geo.attributes.position.array;
  const uv = geo.attributes.uv.array;
  for (let k = 0; k <= segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const v = k * 2;
    pos[v * 3] = ca * rIn;
    pos[v * 3 + 1] = sa * rIn;
    pos[v * 3 + 2] = 0;
    pos[(v + 1) * 3] = ca * rOut;
    pos[(v + 1) * 3 + 1] = sa * rOut;
    pos[(v + 1) * 3 + 2] = 0;
    uv[v * 2] = 0.5 + (ca * rIn) / (2 * R_FULL);
    uv[v * 2 + 1] = 0.5 + (sa * rIn) / (2 * R_FULL);
    uv[(v + 1) * 2] = 0.5 + (ca * rOut) / (2 * R_FULL);
    uv[(v + 1) * 2 + 1] = 0.5 + (sa * rOut) / (2 * R_FULL);
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.uv.needsUpdate = true;
  geo.computeBoundingSphere();
}

const rollGroup = new THREE.Group();
world.add(rollGroup);

const capMat = new THREE.MeshStandardMaterial({
  map: makeCapTexture(),
  roughness: 0.95,
  side: THREE.DoubleSide,
});
const capL = new THREE.Mesh(makeAnnulus(120), capMat);
const capR = new THREE.Mesh(makeAnnulus(120), capMat);
capL.position.z = -CFG.W / 2 - 0.004;
capR.position.z = CFG.W / 2 + 0.004;
rollGroup.add(capL, capR);

// tan cardboard core — stays behind when the tape runs out
const coreGeo = new THREE.CylinderGeometry(
  CFG.core * 0.97,
  CFG.core * 0.97,
  CFG.W * 1.005,
  64,
  1,
  true,
);
coreGeo.rotateX(Math.PI / 2);
const core = new THREE.Mesh(
  coreGeo,
  new THREE.MeshStandardMaterial({
    color: 0xd9b896,
    roughness: 1,
    side: THREE.DoubleSide,
  }),
);
rollGroup.add(core);

function updateRoll(s, R, ds) {
  const frac = s - pathLen;
  rollGroup.position.set(
    headX + Math.cos(theta) * frac,
    R + CFG.lift + RAMP * s,
    headZ + Math.sin(theta) * frac,
  );
  rollGroup.rotation.y = -theta; // align the roll axis with the heading

  updateAnnulus(capL.geometry, CFG.core, R);
  updateAnnulus(capR.geometry, CFG.core, R);

  // spin with the rolling motion
  const dAng = ds / R;
  capL.rotation.z -= dAng;
  capR.rotation.z -= dAng;
}

/* ------------------------------------------------------------------ */
/*  CURSOR BADGE + HINT                                                */
/* ------------------------------------------------------------------ */
const badge = document.createElement("div");
badge.id = "cursor-badge";
badge.innerHTML = `<div class="badge-inner">DRAG<br/>AND ROLL</div>`;
document.body.appendChild(badge);

const hint = document.createElement("div");
hint.id = "progress-hint";
hint.textContent = "DRAG TO UNROLL";
document.body.appendChild(hint);

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let badgeX = mouseX;
let badgeY = mouseY;

/* ------------------------------------------------------------------ */
/*  DRAG INPUT — steer anywhere, unroll only                           */
/* ------------------------------------------------------------------ */
const S_MIN = 0.2;
let s = S_MIN;
let vel = 0; // current unroll speed, eased toward the chase speed
let dragging = false;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const seekPoint = new THREE.Vector3(); // pointer position on the ground
let seekValid = false;

function pointerToGround(clientX, clientY, out) {
  ndc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, out);
}

const canvas = renderer.domElement;
canvas.addEventListener("pointerdown", (e) => {
  if (!ready) return; // no steering until the loader is gone
  dragging = true;
  seekValid = !!pointerToGround(e.clientX, e.clientY, seekPoint);
  canvas.classList.add("dragging");
  badge.classList.add("pressed");
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!dragging) return;
  seekValid = !!pointerToGround(e.clientX, e.clientY, seekPoint);
});
const endDrag = () => {
  dragging = false;
  seekValid = false;
  canvas.classList.remove("dragging");
  badge.classList.remove("pressed");
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

/* ------------------------------------------------------------------ */
/*  CAMERA FOLLOW                                                      */
/* ------------------------------------------------------------------ */
const camTarget = new THREE.Vector3(-2, 0.4, 0);
const camDesired = new THREE.Vector3();
const camOffset = new THREE.Vector3(CFG.camX, CFG.camY, CFG.camZ);

function updateCamera() {
  camDesired.set(
    headX - Math.cos(theta) * 3.2,
    0.4,
    headZ - Math.sin(theta) * 3.2,
  );
  camTarget.lerp(camDesired, 0.045);
  camera.position.copy(camTarget).add(camOffset);
  camera.lookAt(camTarget);
}

/* ------------------------------------------------------------------ */
/*  MAIN LOOP                                                          */
/* ------------------------------------------------------------------ */
const clock = new THREE.Clock();

pushSample(0, 0, 1, 0);
updateRoll(s, updateStrip(s), 0);
updateCamera();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateLoader(dt);

  // the roll chases the pointer while dragging: speed scales with how far
  // the pointer is (drag farther = roll faster)
  let targetVel = 0;
  if (dragging && seekValid && s < CFG.L) {
    const frac = s - pathLen;
    const hx = headX + Math.cos(theta) * frac;
    const hz = headZ + Math.sin(theta) * frac;
    const dx = seekPoint.x - hx;
    const dz = seekPoint.z - hz;
    const dist = Math.hypot(dx, dz);

    if (dist > CFG.deadzone) {
      // steer toward a smoothed heading, never a snapped one
      const targetAng = Math.atan2(dz, dx);
      desiredTheta +=
        shortAngle(targetAng - desiredTheta) * (1 - Math.exp(-dt * CFG.steer));
      targetVel = Math.min((dist - CFG.deadzone) * CFG.follow, CFG.maxSpeed);
    }
  }

  // asymmetric easing: picks up speed quickly, then coasts on release —
  // let go and it keeps sliding for a while instead of stopping dead
  const k = targetVel > vel ? CFG.accel : CFG.drag;
  vel += (targetVel - vel) * (1 - Math.exp(-dt * k));
  if (vel > 0.02 && s < CFG.L) {
    const prev = s;
    s = Math.min(s + vel * dt, CFG.L);
    advancePath(s);
    updateRoll(s, updateStrip(s), s - prev);
    if (s > S_MIN + 0.5) hint.classList.add("hidden");
  } else if (vel <= 0.02) {
    vel = 0;
  }

  updateCamera();

  badgeX += (mouseX - badgeX) * 0.16;
  badgeY += (mouseY - badgeY) * 0.16;
  badge.style.transform = `translate(${badgeX - 44}px, ${badgeY - 44}px)`;

  renderer.render(scene, camera);
}
tick();
hideLoader();

/* ------------------------------------------------------------------ */
/*  RESIZE                                                             */
/* ------------------------------------------------------------------ */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
