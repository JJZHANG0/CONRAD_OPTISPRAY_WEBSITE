import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDrone } from './drone.js';
import { createEnvironment } from './environment.js';
import { createWindField, createFlightPaths, createAtmosphericMotes } from './effects.js';
import { createScientificView } from './science-view.js';
import { createSkagitScene } from './skagit-scene.js';
import { windVector } from './physics.js';

export function initScene(ui, skagit) {
const SEED = 20261116;
const DURATION = 12;
const CHAPTERS = 6;
const STEP = 1 / 60;

function mulberry32(seed) {
  return function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(SEED);
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);

const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio || 1, innerWidth < 760 ? 1.4 : 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17251f);
scene.fog = new THREE.Fog(0x17251f, 28, 110);

const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.08, 500);
camera.position.set(10.5, 7.3, 14.5);

const pmrem = new THREE.PMREMGenerator(renderer);
const environmentMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environmentMap;
scene.environmentIntensity = 0.62;
pmrem.dispose();

const hemisphere = new THREE.HemisphereLight(0xc4d9d1, 0x111810, 1.35);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xffe2b0, 3.1);
sun.position.set(-14, 24, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);
const sunOffset = sun.position.clone();
const rim = new THREE.DirectionalLight(0x62d9c5, 1.25);
rim.position.set(12, 9, -15);
scene.add(rim);

const skyUniforms = {
  uHorizon: { value: new THREE.Color(0x17251f) },
  uZenith: { value: new THREE.Color(0x061115) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(190, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 uHorizon; uniform vec3 uZenith; varying vec3 vPosition; void main(){float h=normalize(vPosition).y; float f=smoothstep(-0.08,0.72,h); gl_FragColor=vec4(mix(uHorizon,uZenith,f),1.0);}',
  }),
);
scene.add(sky);

const field = createEnvironment(scene, random);
const drone = createDrone();
scene.add(drone.group);
const science = createScientificView(scene);
const caseScene = createSkagitScene(scene, drone, field, mulberry32(SEED + 1));
const viewports = {
  physics: document.getElementById('physics-viewport'),
  mapping: document.getElementById('mapping-viewport'),
};
const immersiveMedia = matchMedia('(min-width:1060px) and (min-height:680px)');
const wind = createWindField(random);
scene.add(wind.group);

const flightPaths = createFlightPaths();
scene.add(flightPaths.group);
const motes = createAtmosphericMotes(random);
scene.add(motes);

let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let engineeringRotation = 0;
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let dragging = false;
let dragStartX = 0;
let dragLastX = 0;
let dragDistance = 0;
let displayedLabResult;

const api = {
  onChange(state, result) {
    wind.uniforms.uSpeed.value = state.wind;
    flightPaths.setPath(state.path);
    const dir = windVector(1, state.direction);
    flightPaths.group.position.set(-state.offset * dir[0], 0, -state.offset * dir[2]);
  },
  onLabResult(data) {
    if (displayedLabResult !== data) labClock = 0;
    displayedLabResult = data;
    science.update(data);
  },
  onPart(id) { drone.setSelected(id); },
  onMotion(enabled) { paused = !enabled; }
};
if (ui.result) {
  displayedLabResult = ui.result;
  science.update(ui.result);
}
drone.setSelected('sensor');


const cameraStates = [
  { position: [10.5, 7.3, 14.5], target: [0.4, 4.2, 0], drone: [2.0, 5.1, 0], rotation: [-0.03, -0.48, -0.02], fov: 44 },
  { position: [12.5, 8.8, 18.8], target: [3.6, 2.5, 0], drone: [0.4, 5.1, 0], rotation: [0, -0.18, 0], fov: 48 },
  { position: [11.8, 8.8, 16.5], target: [0, 3.7, 0], drone: [1.0, 5.2, 0], rotation: [0, 0.28, 0], fov: 46 },
  { position: [1.5, 31, 21], target: [0, 0, -2], drone: [-3, 5.4, -2], rotation: [0, 0, 0], fov: 50 },
  { position: [8.4, 6.5, 10.8], target: [0.8, 4.4, 0], drone: [0.8, 4.7, 0], rotation: [0, -0.48, 0], fov: 43 },
  { position: [10.8, 12.8, 16], target: [-1, 1.5, -1], drone: [-2, 4.6, -2], rotation: [0, 0.1, 0], fov: 46 },
].map((state) => ({
  ...state,
  position: new THREE.Vector3(...state.position),
  target: new THREE.Vector3(...state.target),
  drone: new THREE.Vector3(...state.drone),
  rotation: new THREE.Euler(...state.rotation),
}));

const sprayLevels = [0.48, 0, 0.75, 0, 0, 0.75];
const windLevels = [0, 0, 1, 0, 0, 0.35];
const heatLevels = [0, 0, 0, 0, 0, 0.75];
const pathLevels = [0.08, 0, 0.12, 0, 0, 0.8];
const explodeLevels = [0, 0, 0, 0, 1, 0];
const sunLevels = [3.1, 2.2, 2.5, 1.8, 2.8, 2.2];
const fogNearLevels = [28, 14, 24, 45, 22, 32];
const fogFarLevels = [110, 65, 120, 140, 90, 120];
const backgroundColors = [0x17251f, 0x0c1918, 0x10201e, 0x0b1815, 0x080f11, 0x0a1714].map((hex) => new THREE.Color(hex));
const baseGroundColor = new THREE.Color(0x354a3b);
const darkGroundColor = new THREE.Color(0x25332e);
const baseCropColor = new THREE.Color(0x3c5236);
const darkCropColor = new THREE.Color(0x26332e);

function chapterWeight(progress, index) {
  return smooth(clamp(1 - Math.abs(progress - index)));
}

function interpolate(values, progress) {
  const index = Math.min(CHAPTERS - 2, Math.floor(progress));
  const fraction = smooth(clamp(progress - index));
  return THREE.MathUtils.lerp(values[index], values[index + 1], fraction);
}

const tempPosition = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const tempDrone = new THREE.Vector3();
const tempColor = new THREE.Color();
const tempPathPoint = new THREE.Vector3();
const tempPathFollow = new THREE.Vector3();
const tempTangent = new THREE.Vector3();
const selectedWorld = new THREE.Vector3();

let renderWidth, renderHeight;
function attachRenderer(viewport = container) {
  if (renderer.domElement.parentElement !== viewport) viewport.prepend(renderer.domElement);
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  if (renderWidth !== width || renderHeight !== height) {
    renderWidth = width;
    renderHeight = height;
    renderer.setSize(width, height, false);
  }
  camera.aspect = width / height;
}

function sample(time, progress, labTime = 0) {
  const kind = { 1: 'physics', 3: 'mapping' }[Math.round(progress)];
  const frame = kind && skagit[kind]();
  const immersive = Boolean(kind && immersiveMedia.matches);
  document.body.classList.toggle('immersive-case', immersive);
  if (kind) {
    attachRenderer(immersive ? container : viewports[kind]);
    science.animate(time, drone.group.position, 0, 0);
    wind.group.visible = flightPaths.group.visible = motes.visible = false;
    field.group.visible = kind === 'physics';
    field.ground.material.color.copy(baseGroundColor);
    field.crops.material.color.copy(baseCropColor);
    sky.visible = kind === 'physics';
    drone.group.visible = Boolean(frame);
    const highView = kind === 'mapping' && frame?.camera === 'overview';
    scene.fog.near = highView ? 240 : 40;
    scene.fog.far = highView ? 1150 : 220;
    scene.background.setHex(0x10221c);
    skyUniforms.uHorizon.value.copy(scene.background);
    sun.intensity = 2.7;
    const trackedPosition = kind === 'mapping' && frame?.camera === 'follow' ? frame.flight.position : null;
    sun.target.position.set(trackedPosition?.[0] ?? 0, 0, -(trackedPosition?.[1] ?? 0));
    sun.position.copy(sun.target.position).add(sunOffset);
    camera.fov = kind === 'physics' ? 43 : 48;
    camera.near = kind === 'mapping' ? 2.3 : .08;
    camera.far = kind === 'mapping' ? 1800 : 500;
    camera.updateProjectionMatrix();
    caseScene.show(kind, frame, camera, {
      time, immersive, overview: cameraStates[3], mouseX: pointer.x,
    });
    return;
  }
  attachRenderer();
  caseScene.hide();
  sun.target.position.set(0, 0, 0);
  sun.position.copy(sunOffset);
  drone.group.visible = field.group.visible = motes.visible = sky.visible = true;
  const localTime = ((time % DURATION) + DURATION) % DURATION;
  const labCycleTime = ((labTime % DURATION) + DURATION) % DURATION;
  const labResult = ui.result;
  const labModelTime = labResult ? labCycleTime / DURATION * labResult.replayDuration : labCycleTime;
  const phase = (localTime / DURATION) * Math.PI * 2;
  const index = Math.min(CHAPTERS - 2, Math.floor(progress));
  const fraction = smooth(clamp(progress - index));
  const a = cameraStates[index];
  const b = cameraStates[index + 1];
  const mappingWeight = chapterWeight(progress, 3);
  const labWeight = chapterWeight(progress, 5);
  const engineeringWeight = chapterWeight(progress, 4);
  const pathWeight = labWeight;
  const explode = interpolate(explodeLevels, progress);

  tempPosition.copy(a.position).lerp(b.position, fraction);
  tempTarget.copy(a.target).lerp(b.target, fraction);
  tempDrone.copy(a.drone).lerp(b.drone, fraction);
  tempDrone.y = THREE.MathUtils.lerp(ui.state.height + 2.24, tempDrone.y, engineeringWeight);

  if (pathWeight > 0.001) {
    const missionProgress = labResult
      ? Math.min(1, labModelTime / Math.max(labResult.routeDuration, 1e-6))
      : localTime / DURATION;
    tempPathPoint.copy(flightPaths.getPoint(missionProgress));
    tempPathPoint.add(flightPaths.group.position);
    tempPathPoint.y = ui.state.height + 2.24;
    tempPathFollow.copy(tempPathPoint).sub(tempDrone);
    tempDrone.addScaledVector(tempPathFollow, pathWeight);
    tempPosition.addScaledVector(tempPathFollow, pathWeight * 0.08);
    tempTarget.addScaledVector(tempPathFollow, pathWeight * 0.08);
    tempTangent.copy(flightPaths.getTangent(missionProgress));
  }

  drone.group.position.copy(tempDrone);

  drone.group.rotation.set(
    THREE.MathUtils.lerp(a.rotation.x, b.rotation.x, fraction),
    THREE.MathUtils.lerp(a.rotation.y, b.rotation.y, fraction) + engineeringRotation * engineeringWeight,
    THREE.MathUtils.lerp(a.rotation.z, b.rotation.z, fraction),
  );
  if (pathWeight > 0.001) {
    const heading = Math.atan2(tempTangent.x, tempTangent.z) + Math.PI;
    drone.group.rotation.y = THREE.MathUtils.lerp(drone.group.rotation.y, heading, pathWeight);
    drone.group.rotation.z += Math.sin(phase * 2) * 0.025 * pathWeight;
  }
  if (engineeringWeight < 0.01 && pathWeight < 0.01) drone.group.rotation.set(0, 0, 0);
  drone.setExplode(explode);
  drone.update(localTime, phase);
  drone.group.updateMatrixWorld(true);

  const selectedPart = drone.parts[ui.state.part];
  if (selectedPart && engineeringWeight > 0.001) {
    selectedPart.getWorldPosition(selectedWorld);
    tempTarget.lerp(selectedWorld, engineeringWeight * 0.46);
  }

  if (innerWidth < 760) {
    tempTarget.x += 0.8 * (1 - mappingWeight);
    tempTarget.y += chapterWeight(progress,0)*5.5 + chapterWeight(progress,1)*2 + engineeringWeight*2;
    tempPosition.x += 0.4 * (1 - mappingWeight);
  }
  tempPosition.x += pointer.x * 0.38 * (1 - mappingWeight) + Math.sin(phase) * 0.07;
  tempPosition.y += pointer.y * 0.2 * (1 - mappingWeight) + Math.cos(phase) * 0.045;
  camera.position.copy(tempPosition);
  camera.near = .08;
  camera.far = 500;
  camera.fov = THREE.MathUtils.lerp(a.fov, b.fov, fraction) + (innerWidth < 760 ? 14 : 0);
  camera.updateProjectionMatrix();
  camera.lookAt(tempTarget);

  science.animate(time, drone.group.position, interpolate(sprayLevels, progress), interpolate(heatLevels, progress), labModelTime);
  wind.uniforms.uTime.value = localTime;
  wind.uniforms.uOpacity.value = interpolate(windLevels, progress) * Math.min(1, ui.state.wind);
  wind.group.rotation.y = THREE.MathUtils.degToRad(90 - ui.state.direction);
  wind.group.visible = wind.uniforms.uOpacity.value > 0.005;
  flightPaths.setOpacity(interpolate(pathLevels, progress));
  flightPaths.group.visible = flightPaths.paths[ui.state.path].tube.material.opacity > 0.005;

  motes.rotation.y = Math.sin(phase) * 0.035;
  motes.material.opacity = 0.28 * (1 - engineeringWeight * 0.7);
  sun.intensity = interpolate(sunLevels, progress);
  scene.fog.near = interpolate(fogNearLevels, progress);
  scene.fog.far = interpolate(fogFarLevels, progress);
  tempColor.copy(backgroundColors[index]).lerp(backgroundColors[index + 1], fraction);
  scene.background.copy(tempColor);
  scene.fog.color.copy(tempColor);
  skyUniforms.uHorizon.value.copy(tempColor);
  field.ground.material.color.copy(baseGroundColor).lerp(darkGroundColor, engineeringWeight);
  field.crops.material.color.copy(baseCropColor).lerp(darkCropColor, engineeringWeight);
  renderer.domElement.style.cursor = engineeringWeight > 0.6 ? (dragging ? 'grabbing' : 'grab') : 'default';
}

let targetProgress = 0;
let currentProgress = 0;
let simTime = 0;
let labClock = 0;
let wasLabActive = false;
let accumulator = 0;
let frames = 0;
let fpsTime = 0;
const clock = new THREE.Clock();

function readScroll() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  targetProgress = clamp((scrollY / maxScroll) * (CHAPTERS - 1), 0, CHAPTERS - 1);
}
readScroll();
addEventListener('scroll', readScroll, { passive: true });

function draw() {
  renderer.render(scene, camera);
  frames += 1;
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (document.hidden || document.getElementById('research-dialog').open) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  currentProgress = reduced ? targetProgress : THREE.MathUtils.lerp(currentProgress, targetProgress, Math.min(1, dt * 6.5));
  if (!paused) {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      simTime += STEP;
    }
  }
  ui.setProgress(currentProgress);
  const labActive = ui.activeChapter === 5;
  if (labActive && !wasLabActive) labClock = 0;
  if (labActive) {
    if (reduced) labClock = DURATION - STEP;
    else if (!paused) labClock += dt;
  }
  wasLabActive = labActive;
  sample(simTime, currentProgress, labClock);
  draw();
  fpsTime += dt;
  if (fpsTime >= 1) {
    window.__SCENE_STATS__ = {
      fps: Math.round(frames / fpsTime),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      droplets: 378,
      crops: 2745,
      chapter: Math.round(currentProgress) + 1,
    };
    frames = 0;
    fpsTime = 0;
  }
});

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (ui.activeChapter !== 4) return;
  dragging = true;
  dragStartX = dragLastX = event.clientX;
  dragDistance = 0;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event);
  if (!dragging || ui.activeChapter !== 4) return;
  const delta = event.clientX - dragLastX;
  engineeringRotation += delta * 0.008;
  dragDistance += Math.abs(delta);
  dragLastX = event.clientX;
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!dragging) return;
  dragging = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
  if (dragDistance > 5 || ui.activeChapter !== 4) return;
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(Object.values(drone.parts), true);
  if (!hits.length) return;
  let object = hits[0].object;
  while (object && !object.userData.partId) object = object.parent;
  if (object?.userData.partId) ui.selectPart(object.userData.partId);
});
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
renderer.domElement.addEventListener('pointerleave', () => { if (!dragging) pointer.set(0, 0); });

addEventListener('resize', () => {
  readScroll();
  if (paused) {
    currentProgress = targetProgress;
    sample(simTime, currentProgress);
    draw();
  }
});

window.__seek = (time) => {
  const value = Number(time);
  paused = true;
  accumulator = 0;
  simTime = Number.isFinite(value) && value > 0 ? value : 0;
  currentProgress = targetProgress;
  document.body.classList.add('capture-mode');
  sample(simTime, currentProgress);
  ui.setProgress(currentProgress);
  draw();
};
window.__play = () => {
  paused = false;
  document.body.classList.remove('capture-mode');
  clock.getDelta();
};
window.__setChapter = (index) => {
  const chapter = clamp(Math.round(Number(index) || 0), 0, CHAPTERS - 1);
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo({top: (chapter / (CHAPTERS - 1)) * maxScroll, behavior: 'instant'});
  readScroll();
  currentProgress = targetProgress;
  sample(simTime, currentProgress);
  ui.setProgress(currentProgress);
  draw();
};

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  paused = true;
  const motionButton = document.getElementById('motion-toggle');
  motionButton.setAttribute('aria-pressed', 'true');
  motionButton.textContent = 'MOTION OFF';
}

sample(0, 0);
ui.setProgress(0);
draw();
container.classList.add('ready');
document.getElementById('fallback').style.display = 'none';
const timeParameter = new URLSearchParams(location.search).get('t');
if (timeParameter !== null) window.__seek(timeParameter);
const hashIndex = ['home', 'physics', 'wind', 'mapping', 'engineering', 'lab'].indexOf(location.hash.slice(1));
if (hashIndex >= 0) requestAnimationFrame(() => window.__setChapter(hashIndex));
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault(); renderer.setAnimationLoop(null);
  document.getElementById('fallback').style.display='grid';
  document.querySelector('#fallback > span').textContent='3D CONTEXT LOST · RELOAD TO RESTORE';
  window.dispatchEvent(new Event('optispray-context-lost'));
});
window.__SCENE_READY__ = true;
return api;
}
