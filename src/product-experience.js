import * as THREE from 'three';

import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { gsap } from 'gsap';
import { createDrone } from './drone.js';
import { createEnvironment } from './environment.js';
import { createDeposition, flightAt, loadCase, loadJson, palette, pointAt } from './skagit-data.js';
import { caseImage, createHeatCanvas, drawMap, routeColors, unproject } from './skagit-map.js';
import { chapters, tours } from './product-experience-content.js';
import { createComponentDemonstration, features, featureDuration, featureFrame, featureViews } from './component-demonstration.js';
import { createPlatformDemo, workflow } from './platform-demonstration.js';
import { createIntelligence } from './product-intelligence.js';
import { createDashboard } from './product-dashboard.js';
import './product-experience.css';

const BASE = import.meta.env.BASE_URL;


const FIELD_SCALE = 0.145;
const CANOPY_HEIGHT = 0.58;
const SPRAY_DURATION = 25;
const SPRAY_NOZZLE_STAGE_END = 1.25;
const SPRAY_FLIGHT_STAGE_END = 10.1;
const SPRAY_DRIFT_STAGE_END = 13.8;
const SPRAY_OPERATION_END = 23;
const MOBILE_MENU = matchMedia('(max-width: 620px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (value) => Math.min(1, Math.max(0, value));
const el = (id) => document.getElementById(id);

const root = el('experience');
const menuToggle = el('chapter-menu-toggle');
const nav = el('chapter-navigation');
const navButtons = [...nav.querySelectorAll('[data-chapter]')];


function restoreRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createFieldSurface(scene, data, toWorld, aerial, heat) {
  const [x, y, w, h] = data.display.overview_crop_px;
  const corners = [[x, y + h], [x + w, y + h], [x, y], [x + w, y]]
    .map(([px, py]) => toWorld(unproject(data, px, py)));
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const positions = geometry.attributes.position;
  geometry.attributes.uv.set([0, 0, 1, 0, 0, 1, 1, 1]);
  corners.forEach((point, i) => positions.setXYZ(i, point.x, 0.018, point.z));
  geometry.computeVertexNormals();

  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.getContext('2d').drawImage(aerial, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const aerialTexture = new THREE.CanvasTexture(canvas);
  aerialTexture.colorSpace = THREE.SRGBColorSpace;
  aerialTexture.anisotropy = 4;
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: aerialTexture, color: 0x788878, roughness: 1,
  }));
  ground.receiveShadow = true;
  scene.add(ground);

  const texture = new THREE.CanvasTexture(heat.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const layer = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, toneMapped: false,
  }));
  layer.position.y = CANOPY_HEIGHT;
  layer.renderOrder = 2;
  layer.visible = false;
  scene.add(layer);
  return { layer, texture };
}

function createSprayView(scene, nozzle, tracks, firstPass, data, toWorld) {
  const nozzles = nozzle.userData.outlets;
  const start = firstPass.start_time_s;
  const end = start + firstPass.duration_s;
  const traceWindow = data.display.trajectory_display.recent_trace_window_s
    * firstPass.duration_s / (SPRAY_FLIGHT_STAGE_END - SPRAY_NOZZLE_STAGE_END);
  const landingFade = 2.4;
  const yAxis = new THREE.Vector3(0, 1, 0);
  const trajectories = tracks.filter(([, path]) => path.length > 1 && path[0][0] >= start && path[0][0] < end)
    .map(([, path], index) => {
      const release = flightAt(data, path[0][0]);
      const outlet = nozzles[index % nozzles.length];
      const outletOffset = outlet.clone().add(nozzle.position)
        .applyAxisAngle(yAxis, -release.yaw);
      return { path, outlet, release: toWorld(release.position, 8.2).add(outletOffset) };
    });

  const previousPosition = new THREE.Vector3();
  const dropPosition = new THREE.Vector3();
  const dropDirection = new THREE.Vector3();
  const droplet = new THREE.Object3D();
  const position = new THREE.Vector3();
  const outletPosition = new THREE.Vector3();
  function pointPosition(origin, release, point, target) {
    target.set(
      release.x + (point[1] - origin[1]) * FIELD_SCALE,
      THREE.MathUtils.lerp(CANOPY_HEIGHT, release.y, clamp(point[3] / origin[3])),
      release.z - (point[2] - origin[2]) * FIELD_SCALE,
    );
    return target;
  }

  const droplets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({
    color: 0xc2f4ef, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false,
  }), trajectories.length);
  droplets.count = 0;
  droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  droplets.renderOrder = 3;
  const traces = trajectories.map(({ path }) => {
    const geometry = new LineSegmentsGeometry().setPositions(new Float32Array((path.length - 1) * 6));
    geometry.attributes.instanceStart.data.setUsage(THREE.DynamicDrawUsage);
    const material = new LineMaterial({
      color: 0x85e9d4, linewidth: 2.25, transparent: true, depthWrite: false, toneMapped: false,
    });
    const trace = new LineSegments2(geometry, material);
    trace.visible = false;
    trace.renderOrder = 2;
    trace.frustumCulled = false;
    return trace;
  });
  const group = new THREE.Group();
  group.visible = false;
  group.add(...traces, droplets);
  for (const mesh of group.children) mesh.frustumCulled = false;
  scene.add(group);

  function storeDroplet(index, path, release, point) {
    const previous = pointAt(path, Math.max(path[0][0], point[0] - 0.14), { includeLanding: true });
    pointPosition(path[0], release, previous, previousPosition);
    dropDirection.subVectors(dropPosition, previousPosition);
    if (dropDirection.lengthSq() > 1e-8) droplet.quaternion.setFromUnitVectors(yAxis, dropDirection.normalize());
    else droplet.quaternion.identity();
    // Track records contain time and position only, so keep the visual drop size fixed.
    droplet.position.copy(dropPosition);
    droplet.scale.set(0.82, 1.22, 0.82);
    droplet.updateMatrix();
    droplets.setMatrixAt(index, droplet.matrix);
  }

  function lowerBound(path, time) {
    let low = 0;
    let high = path.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (path[mid][0] < time) low = mid + 1;
      else high = mid;
    }
    return low;
  }
  function upperBound(path, time) {
    let low = 0;
    let high = path.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (path[mid][0] <= time) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  function update(time, { closeup = false } = {}) {
    group.visible = time >= 0;
    if (!group.visible) return;
    let moving = 0;
    for (const [index, { path, outlet, release }] of trajectories.entries()) {
      const trace = traces[index];
      trace.visible = false;
      const origin = path[0];
      const landingTime = path.at(-1)[0];
      if (time < origin[0] || time >= landingTime + landingFade) continue;
      const anchor = closeup ? nozzle.localToWorld(outletPosition.copy(outlet)) : release;
      const traceEnd = Math.min(time, landingTime);
      const point = pointAt(path, traceEnd, { includeLanding: true });
      pointPosition(origin, anchor, point, dropPosition);
      const traceStart = Math.max(origin[0], traceEnd - traceWindow);
      if (traceStart < traceEnd) {
        const { instanceStart, instanceEnd } = trace.geometry.attributes;
        const first = upperBound(path, traceStart);
        const end = lowerBound(path, traceEnd);
        const startPoint = pointAt(path, traceStart);
        pointPosition(origin, anchor, startPoint, previousPosition);
        for (let i = first; i < end; i += 1) {
          pointPosition(origin, anchor, path[i], position);
          instanceStart.setXYZ(i - first, previousPosition.x, previousPosition.y, previousPosition.z);
          instanceEnd.setXYZ(i - first, position.x, position.y, position.z);
          previousPosition.copy(position);
        }
        const lastIndex = end - first;
        instanceStart.setXYZ(lastIndex, previousPosition.x, previousPosition.y, previousPosition.z);
        instanceEnd.setXYZ(lastIndex, dropPosition.x, dropPosition.y, dropPosition.z);
        instanceStart.data.needsUpdate = true;
        trace.geometry.instanceCount = lastIndex + 1;
        const fade = clamp((time - landingTime) / landingFade);
        trace.material.opacity = .9 * (1 - fade * fade);
        trace.visible = true;
      }
      if (time < landingTime) storeDroplet(moving++, path, anchor, point);
    }
    droplets.count = moving;
    droplets.instanceMatrix.needsUpdate = true;
  }

  return { update };
}

function createPositionOutput(scene) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x73ffd0, toneMapped: false, depthTest: false });
  const marker = new THREE.MeshBasicMaterial({ color: 0xf0fff8, toneMapped: false, depthTest: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.14, 8, 40), material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.78;
  ring.renderOrder = 10;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.8, 8), material);
  stem.position.y = 1.55;
  stem.renderOrder = 10;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), marker);
  dot.position.y = 2.62;
  dot.renderOrder = 10;
  group.add(ring, stem, dot);
  group.visible = false;
  group.traverse((object) => { object.frustumCulled = false; });
  scene.add(group);

  function update(position, time) {
    group.position.copy(position);
    ring.scale.setScalar(1 + 0.12 * (0.5 + 0.5 * Math.sin(time * 5)));
  }
  return { group, update };
}

function createLandingMarks(scene, events, toWorld) {
  const positions = new Float32Array(events.length * 3);
  events.forEach((event, index) => {
    const point = toWorld([event[1], event[2]], CANOPY_HEIGHT + 0.095);
    positions.set(point.toArray(), index * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x3b9bc9, size: 0.08, transparent: true, opacity: 0.34,
    depthWrite: false, toneMapped: false,
  }));
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  scene.add(points);

  function update(time, visible = true) {
    if (time < 0 || !visible) {
      points.visible = false;
      geometry.setDrawRange(0, 0);
      return;
    }
    let low = 0;
    let high = events.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (events[middle][0] <= time) low = middle + 1;
      else high = middle;
    }
    points.visible = low > 0;
    geometry.setDrawRange(0, low);
  }
  return { points, update };
}

function createDriftView(scene, path, data, toWorld) {
  const launch = path[0];
  const pointInField = (sample) => toWorld([sample[1], sample[2]], CANOPY_HEIGHT + .12 + sample[3] * FIELD_SCALE);
  const points = path.map(pointInField);
  const release = points[0];
  const landing = points.at(-1);
  const angle = THREE.MathUtils.degToRad(data.environment.wind_from_deg + 180);
  const wind = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
  const projected = new THREE.Vector3().subVectors(landing, release).dot(wind);
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const segments = points.slice(1).flatMap((point, i) => [...points[i], ...point]);
  const geometry = new LineSegmentsGeometry().setPositions(segments);
  const material = new LineMaterial({ color: 0x7df6dd, linewidth: 2.8, transparent: true, opacity: .86, depthTest: false, depthWrite: false, toneMapped: false });
  const curve = new LineSegments2(geometry, material);
  curve.renderOrder = 5;
  group.add(curve);

  const pointGeometry = new THREE.SphereGeometry(.064, 12, 8);
  const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xe1fff9, depthTest: false, toneMapped: false });
  const head = new THREE.Mesh(pointGeometry, pointMaterial);
  const source = new THREE.Mesh(pointGeometry, pointMaterial);
  source.position.copy(release);
  source.scale.setScalar(.65);
  head.renderOrder = source.renderOrder = 6;
  group.add(head, source);

  const marker = new THREE.Mesh(new THREE.RingGeometry(.11, .15, 32), new THREE.MeshBasicMaterial({
    color: 0x7df6dd, side: THREE.DoubleSide, depthTest: false, toneMapped: false,
  }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.copy(landing);
  marker.renderOrder = 6;
  group.add(marker);

  const ground = release.clone().setY(landing.y);
  const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([release, ground]), new THREE.LineDashedMaterial({
    color: 0xc3ddd3, dashSize: .04, gapSize: .04, transparent: true, opacity: .6, depthTest: false, depthWrite: false,
  }));
  guide.computeLineDistances();
  guide.renderOrder = 5;
  group.add(guide);
  const arrow = new THREE.ArrowHelper(wind, ground.clone().add(new THREE.Vector3(0, -.035, 0)), projected, 0x94e1c7, .19, .09);
  arrow.traverse((object) => {
    if (object.material) object.material.depthTest = false;
    object.renderOrder = 4;
  });
  group.add(arrow);

  function update(fraction) {
    group.visible = fraction >= 0;
    if (!group.visible) return;
    const time = THREE.MathUtils.lerp(launch[0], path.at(-1)[0], clamp(fraction));
    head.position.copy(pointInField(pointAt(path, time, { includeLanding: true })));
    marker.scale.setScalar(fraction >= 1 ? 1.35 : 1);
  }

  return { release, landing, wind, downwindMeters: projected / FIELD_SCALE, update };
}

async function setup() {
  const container = el('scene-container');
  const [data, aerial, tracks, landings, physics, weather] = await Promise.all([
    loadCase(), caseImage(), loadJson('tracks.bin'), loadJson('landings.bin'), loadJson('physics.json'), loadJson('route-weather.json'),
  ]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8c9e81);
  scene.fog = new THREE.FogExp2(0x9aa991, 0.0017);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.06, 1100);
  const cameraTarget = new THREE.Vector3();
  const pmrem = new THREE.PMREMGenerator(renderer);
  new HDRLoader().load(BASE + 'environment/farm-field.hdr', (image) => {
    image.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(image).texture;
    scene.environmentIntensity = 0.72;
    scene.background = image;
    scene.backgroundBlurriness = 0.17;
    pmrem.dispose();
  }, undefined, () => pmrem.dispose());

  const hemisphere = new THREE.HemisphereLight(0xd9e6d4, 0x26382a, 2.2);
  const sun = new THREE.DirectionalLight(0xffe7ca, 3.1);
  sun.position.set(-32, 62, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, far: 140 });
  sun.shadow.bias = -0.0003;
  const fill = new THREE.DirectionalLight(0xd6eee3, 1.25);
  fill.position.set(25, 15, -35);
  scene.add(hemisphere, sun, sun.target, fill);

  const drone = createDrone();
  createEnvironment(scene, restoreRandom(20261124)).trees.visible = false;
  scene.add(drone.group);

  const componentDemo = createComponentDemonstration(drone);
  const intelligence = createIntelligence(el('intelligence-workspace'), {
    data, aerial, landings, weather, reducedMotion, navigate, openDashboard, showScene, updateScene,
  });
  const dashboard = createDashboard(el('dashboard-workspace'), intelligence.selectedPlan);
  const demo = createPlatformDemo(el('platform-demo'), reducedMotion, navigate, openDashboard);
  const heading = el('chapter-title');
  const chapterCopy = el('chapter-copy');
  const chapterDetail = el('chapter-content');
  const marker = el('part-marker');
  const meter = el('playback-progress');
  const playbackLabel = el('playback-label');
  const playbackNote = el('playback-note');
  const playbackToggle = el('playback-toggle');
  const presentationToggle = el('presentation-toggle');
  const readout = el('sensor-readout');
  const readoutLabel = el('sensor-reading-label');
  const readoutValue = el('sensor-reading-value');
  const readoutNote = el('sensor-reading-note');
  const legend = el('deposition-key');
  const operation = el('operation-inset');
  const operationMap = el('operation-map');
  const operationSegment = el('operation-segment');
  const operationState = el('operation-state');

  const east = data.field.map(([e]) => e);
  const north = data.field.map(([, n]) => n);
  const centerE = (Math.min(...east) + Math.max(...east)) / 2;
  const centerN = (Math.min(...north) + Math.max(...north)) / 2;
  const toWorld = ([e, n], y = CANOPY_HEIGHT + .04) => new THREE.Vector3(
    (e - centerE) * FIELD_SCALE, y, (centerN - n) * FIELD_SCALE - 12,
  );

  const deposition = createDeposition(data, landings);
  const heat = createHeatCanvas(data, deposition, aerial);
  const field = createFieldSurface(scene, data, toWorld, aerial, heat);
  const landingMarks = createLandingMarks(scene, landings, toWorld);
  const firstSprayPass = data.segments.find(({ spray }) => spray);
  const firstSprayPassEnd = firstSprayPass.start_time_s + firstSprayPass.duration_s;
  const firstTransfer = data.segments[data.segments.indexOf(firstSprayPass) + 1];
  const firstTransferEnd = firstTransfer.start_time_s + firstTransfer.duration_s;
  const paths = createSprayView(scene, drone.parts.nozzle, tracks, firstSprayPass, data, toWorld);
  const driftPath = physics.paths[1];
  const drift = createDriftView(scene, driftPath, data, toWorld);
  const driftKey = el('drift-key');
  const driftOutlet = drone.parts.nozzle.position.clone().add(drone.parts.nozzle.userData.outlets[3]);
  const driftYaw = -flightAt(data, driftPath[0][0]).yaw;

  const routeGroup = new THREE.Group();
  scene.add(routeGroup);
  const positionOutput = createPositionOutput(scene);
  const outline = data.field.map((point) => toWorld(point, CANOPY_HEIGHT + .065));
  routeGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineBasicMaterial({
    color: routeColors.boundary, toneMapped: false,
  })));

  const edge = data.field.map((point) => toWorld(point, CANOPY_HEIGHT + .095));
  const downwind = edge.map((point) => point.dot(drift.wind));
  const edgeLimit = THREE.MathUtils.lerp(Math.min(...downwind), Math.max(...downwind), .87);
  const downwindEdge = new LineSegments2(new LineSegmentsGeometry().setPositions(edge.slice(1).flatMap((point, i) => (
    Math.min(downwind[i], downwind[i + 1]) >= edgeLimit ? [...edge[i], ...point] : []
  ))), new LineMaterial({ color: 0xffba75, linewidth: 3.2, depthTest: false, toneMapped: false }));
  downwindEdge.renderOrder = 6;
  routeGroup.add(downwindEdge);
  const replayEdge = new LineSegments2(new LineSegmentsGeometry(), downwindEdge.material);
  replayEdge.renderOrder = 6;
  replayEdge.visible = false;
  routeGroup.add(replayEdge);

  for (const spray of [true, false]) {
    const points = data.segments.filter((segment) => segment.spray === spray)
      .flatMap((segment) => [toWorld(segment.start_enu_m, .71), toWorld(segment.end_enu_m, .71)]);
    const material = spray
      ? new THREE.LineBasicMaterial({ color: routeColors.spray, toneMapped: false })
      : new THREE.LineDashedMaterial({ color: routeColors.transfer, dashSize: .26, gapSize: .16, toneMapped: false });
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material);
    line.computeLineDistances();
    routeGroup.add(line);
  }

  const state = { chapter: 'overview', position: 0, playing: false };
  const overview = { position: [11, 12.6, 1.5], target: [0, 8, -12] };
  const fieldView = { position: [8, 68, 31], target: [0, 0, -12] };
  const sprayViews = [
    { position: [4, .7, 8.2], target: [.25, -1.4, .1] },
    { position: [3.1, .6, 13.1], target: [1.15, -4.05, .3] },
  ];
  const sprayStages = [
    { start: 0, label: 'Nozzle outlets', note: 'The droplets start at the outlets along the boom.' },
    { start: SPRAY_NOZZLE_STAGE_END, label: 'Flight', note: 'The trails fade as droplets reach the crop.' },
    { start: SPRAY_FLIGHT_STAGE_END, label: 'Drift close-up', note: 'The west wind carries this drop east of its release point.' },
    { start: SPRAY_DRIFT_STAGE_END, label: 'Operation replay', note: 'Follow the north–south passes and watch the spray turn off in transit.' },
    { start: SPRAY_OPERATION_END, label: 'Canopy deposition', note: 'Blue shows liquid deposition. Orange marks the downwind field edge.' },
  ];
  const archivedChapters = { deposition: 'spraying', platform: 'workflow', monitor: 'during', report: 'after', services: 'modular' };
  const visibility = () => chapters[state.chapter].view;
  const workflowSteps = Object.fromEntries(['before', 'during', 'after'].map(phase => [phase, workflow.filter((step) => step.card === phase)]));
  const activeWorkflow = () => visibility() === 'workflow' ? workflowSteps[state.chapter] ?? workflow : null;
  const sequence = () => features[state.chapter];
  let activeStep = -1;
  let cameraTween;
  let playbackTween;
  let targetPart = null;
  let rasterFrame = -1;
  let lastMapDraw = -Infinity;
  let stageWidth = 1;
  let stageHeight = 1;
  let replayScene = false;
  let replayBoundary;
  let dashboardReturn = 'overview';
  let tour;
  let tourClock;
  let tourIndex = 0;

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const from = Math.round(data.environment.wind_from_deg / 45) % directions.length;
  const windDirection = directions[from] + ' → ' + directions[(from + 4) % directions.length];
  const windSpeed = data.environment.wind_speed_mps + ' m/s';
  const readings = {
    wind: ['Wind speed & direction', windSpeed, windDirection],
    climate: ['Air temperature & humidity', data.environment.temperature_c + ' °C · ' + data.environment.relative_humidity_pct + '% RH', 'Farmland case conditions'],
    light: ['Illuminance', '12,500 lx', 'Example reading'],
    flow: ['Liquid flow', '1.6 L/min', 'Example reading'],
    pressure: ['Spray-line pressure', '280 kPa', 'Example reading'],
  };

  function framed(view, zoom = 1) {
    const target = new THREE.Vector3(...view.target);
    const position = new THREE.Vector3(...view.position);
    const fit = Math.max(1, .93 / camera.aspect);
    position.sub(target).multiplyScalar(fit * zoom).add(target);
    return { position, target };
  }

  function relativeView(origin, offset, look, zoom = 1) {
    const target = origin.clone().add(new THREE.Vector3(...look));
    const position = origin.clone().add(new THREE.Vector3(...offset));
    return framed({ position: [...position], target: [...target] }, zoom);
  }

  function fieldCamera(viewportShare = 1) {
    const view = framed(fieldView, viewportShare < 1 ? 1.14 : 1);
    if (viewportShare === 1) return view;
    const direction = new THREE.Vector3().subVectors(view.target, view.position);
    const halfHeight = direction.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, direction).normalize();
    const offset = MOBILE_MENU.matches
      ? up.multiplyScalar(halfHeight * .30)
      : right.multiplyScalar((1 - viewportShare) * halfHeight * camera.aspect);
    view.position.add(offset);
    view.target.add(offset);
    return view;
  }

  function moveCamera(view, duration = 0) {
    cameraTween?.kill();
    if (!duration || reducedMotion.matches) {
      camera.position.copy(view.position);
      cameraTarget.copy(view.target);
      return;
    }
    cameraTween = gsap.timeline({ defaults: { duration, ease: 'power2.inOut' } });
    cameraTween.to(camera.position, { x: view.position.x, y: view.position.y, z: view.position.z }, 0);
    cameraTween.to(cameraTarget, { x: view.target.x, y: view.target.y, z: view.target.z }, 0);
  }

  function setSprayCamera(time) {
    if (time >= SPRAY_FLIGHT_STAGE_END) {
      const center = drift.release.clone().lerp(drift.landing, .47);
      center.y += .16;
      const close = relativeView(center, [.08, 1.42, 4.25], [0, 0, 0]);
      const wide = fieldCamera(.73);
      const blend = THREE.MathUtils.smoothstep(time, SPRAY_DRIFT_STAGE_END - .18, SPRAY_DRIFT_STAGE_END + .65);
      camera.position.lerpVectors(close.position, wide.position, blend);
      cameraTarget.lerpVectors(close.target, wide.target, blend);
      return;
    }
    const ease = THREE.MathUtils.smoothstep(time, .4, 2.5);
    const position = new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...sprayViews[0].position), new THREE.Vector3(...sprayViews[1].position), ease,
    );
    const target = new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...sprayViews[0].target), new THREE.Vector3(...sprayViews[1].target), ease,
    );
    const view = relativeView(drone.group.position, position, target);
    camera.position.copy(view.position);
    cameraTarget.copy(view.target);
  }

  function moveAircraft(time) {
    const flight = flightAt(data, time);
    placeAircraft(flight);
    return flight;
  }

  function placeAircraft(flight) {
    drone.group.position.copy(toWorld(flight.position, 8.2));
    drone.group.rotation.set(0, -flight.yaw, 0);
  }

  function showScene(map) {
    if (replayScene === Boolean(map)) return;
    replayScene = Boolean(map);
    if (map) map.querySelector('canvas').after(container);
    else root.prepend(container);
    routeGroup.visible = replayScene;
    field.layer.visible = downwindEdge.visible = replayEdge.visible = false;
    landingMarks.update(-1);
    paths.update(-1);
    resize();
  }

  function updateScene(flight, time, showDeposition, boundary) {
    drone.group.scale.setScalar(1);
    placeAircraft(flight);
    field.layer.visible = showDeposition;
    if (replayBoundary !== boundary) {
      replayBoundary = boundary;
      const worldEdges = boundary.flatMap((edge) => edge.flatMap((point) => [...toWorld(point, CANOPY_HEIGHT + .095)]));
      replayEdge.geometry.setPositions(worldEdges);
    }
    replayEdge.visible = boundary.length > 0;
    landingMarks.update(showDeposition ? setRaster(time) : -1);
    paths.update(flight.spray && time < firstSprayPassEnd ? time : -1);
  }

  function showReadout(fields, time) {
    const visible = Boolean(fields) && time >= .36 && time < 1.57;
    readout.hidden = !visible;
    if (!visible) return;
    readoutLabel.textContent = fields[0];
    readoutValue.textContent = fields[1];
    readoutNote.textContent = fields[2];
  }

  function showStep(label, note = '') {
    if (playbackLabel.textContent !== label) playbackLabel.textContent = label;
    if (playbackNote.textContent !== note) playbackNote.textContent = note;
  }

  function updateFeature() {
    const frame = featureFrame(sequence(), state.position);
    const { step, i, time } = frame;
    if (i !== activeStep) {
      activeStep = i;
      targetPart = step.part;
      marker.hidden = true;
      drone.setSelected(targetPart);
      if (!step.gps) moveCamera(framed(featureViews[step.view]), .53);
    }
    const { flow, interrupted } = componentDemo.draw(sequence(), frame, !reducedMotion.matches);

    if (step.gps) {
      const missionTime = firstSprayPass.start_time_s + firstSprayPass.duration_s * .47 + time * 1.4;
      const flight = moveAircraft(missionTime);
      const [e, n] = flight.position;
      positionOutput.group.visible = true;
      positionOutput.update(toWorld(flight.position, CANOPY_HEIGHT + .02), reducedMotion.matches ? 0 : time);
      const view = relativeView(drone.group.position, [5.2, 17.5, 9], [.9, -4.6, -.1]);
      camera.position.copy(view.position);
      cameraTarget.copy(view.target);
      const coordinates = (e < 0 ? 'W ' : 'E ') + Math.abs(e).toFixed(1) + ' m · ' + (n < 0 ? 'S ' : 'N ') + Math.abs(n).toFixed(1) + ' m';
      showReadout(['GPS position fix', coordinates, 'Offset from the field origin'], time);
    } else {
      const reading = step.wind || step.climate || step.light || step.pressure && step.key === 'read'
        || state.chapter === 'flow' && step.key === 'measure';
      showReadout(reading ? readings[state.chapter] : null, time);
    }

    const sprayTime = THREE.MathUtils.lerp(firstSprayPass.start_time_s, firstSprayPassEnd, clamp(time / step.seconds));
    paths.update(flow ? sprayTime : -1, { closeup: true });
    if (step.fault) {
      const countdown = 'Link lost · pump stops in ' + Math.ceil(Math.max(0, 3 - time)) + ' s';
      showStep(interrupted ? countdown : 'Pump stopped', step.note);
    } else {
      showStep(step.label, step.note);
    }
  }

  function setRaster(time) {
    const frame = time >= data.end ? data.end : Math.floor(time / 8) * 8;
    if (rasterFrame !== frame) {
      rasterFrame = frame;
      deposition.seek(frame);
      heat.paint(deposition.wet, data.display.color_max_gm2.wet);
      field.texture.needsUpdate = true;
    }
    return frame;
  }

  function replayTime(fraction) {
    // Give the first transfer enough screen time to make the spray-off state readable.
    if (fraction < .19) return THREE.MathUtils.lerp(firstSprayPass.start_time_s, firstSprayPassEnd, fraction / .19);
    if (fraction < .40) return THREE.MathUtils.lerp(firstSprayPassEnd, firstTransferEnd, (fraction - .19) / .21);
    return THREE.MathUtils.lerp(firstTransferEnd, data.end, (fraction - .40) / .60);
  }

  function updateOperation(time, stage) {
    const fraction = clamp((time - SPRAY_DRIFT_STAGE_END) / (SPRAY_OPERATION_END - SPRAY_DRIFT_STAGE_END));
    const missionTime = replayTime(fraction);
    const flight = moveAircraft(missionTime);
    landingMarks.update(setRaster(missionTime));
    if (time - lastMapDraw >= .10 || (stage === 4 && lastMapDraw < SPRAY_OPERATION_END)) {
      lastMapDraw = time;
      drawMap(operationMap, data, aerial, { surface: heat.surface, flight, selected: stage === 3 ? flight.number : undefined });
    }
    operationSegment.textContent = missionTime >= data.routeEnd ? 'Route complete' : 'Segment ' + flight.number + ' of ' + data.segments.length;
    operationState.textContent = flight.spray ? 'Spray on' : 'Spray off';
    operationState.toggleAttribute('data-spray-on', flight.spray);
  }

  function updateSpray() {
    const time = state.position * SPRAY_DURATION;
    const stage = sprayStages.findLastIndex(({ start }) => time >= start);
    const { label, note } = sprayStages[stage];
    showStep(label, note);
    driftKey.hidden = stage !== 2;
    operation.hidden = stage < 3;
    field.layer.visible = routeGroup.visible = stage >= 3;
    downwindEdge.visible = stage === 4;
    legend.hidden = stage !== 4;

    if (stage < 2) {
      const mission = clamp((time - SPRAY_NOZZLE_STAGE_END) / (SPRAY_FLIGHT_STAGE_END - SPRAY_NOZZLE_STAGE_END));
      const missionTime = THREE.MathUtils.lerp(firstSprayPass.start_time_s, firstSprayPassEnd, mission);
      moveAircraft(missionTime);
      paths.update(stage === 1 ? missionTime : -1);
    } else if (stage === 2) {
      paths.update(-1);
      const scale = .26;
      drone.group.scale.setScalar(scale);
      drone.group.rotation.set(0, driftYaw, 0);
      drone.group.position.copy(drift.release)
        .sub(driftOutlet.clone().multiplyScalar(scale).applyEuler(drone.group.rotation));
      drift.update((time - SPRAY_FLIGHT_STAGE_END) / (SPRAY_DRIFT_STAGE_END - SPRAY_FLIGHT_STAGE_END - .3));
    } else {
      drift.update(-1);
      drone.group.scale.setScalar(1);
      updateOperation(time, stage);
    }
    setSprayCamera(time);
  }

  function updateProgress() {
    if (sequence()) updateFeature();
    else if (state.chapter === 'spraying') updateSpray();
    else if (activeWorkflow()) {
      const { step } = featureFrame(activeWorkflow(), state.position);
      demo.update(step);
      showStep(step.label);
    }
    meter.value = state.position;
  }

  function renderChapter() {
    const chapter = chapters[state.chapter];
    heading.textContent = tour?.[tourIndex][2] ?? chapter.title;
    chapterCopy.textContent = tour?.[tourIndex][3] ?? chapter.description;
    chapterDetail.replaceChildren();
    chapterDetail.hidden = !chapter.items && !chapter.links;
    if (chapter.items) {
      for (const [i, [label, detail, destination]] of chapter.items.entries()) {
        const card = document.createElement('article');
        const title = document.createElement('h2');
        const copy = document.createElement('p');
        if (destination) title.append(chapterLink(label, destination));
        else title.textContent = label;
        copy.textContent = detail;
        card.style.setProperty('--reveal-order', i);
        card.append(title, copy);
        chapterDetail.append(card);
      }
    }
    if (chapter.links) {
      chapterDetail.append(...chapter.links.map(([label, destination]) => chapterLink(label, destination)));
    }
    showStep(...(chapter.animation ?? ['', '']));
    playbackToggle.hidden = !sequence() && state.chapter !== 'spraying' && !activeWorkflow();
    playbackToggle.textContent = 'Pause';
    el('chapter-playback').toggleAttribute('data-minimal', playbackToggle.hidden);
    el('workspace-back').hidden = state.chapter !== 'dashboard';
  }

  function chapterLink(label, destination) {
    const button = document.createElement('button');
    button.className = 'workspace-button';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => navigate(destination));
    return button;
  }

  function openDashboard(stage, target) {
    dashboardReturn = state.chapter;
    navigate('dashboard');
    dashboard.show(stage, target);
  }

  function navigate(chapter) {
    stopTour();
    activate(chapter);
  }

  function activate(requested, initial = false) {
    const chapter = archivedChapters[requested] ?? requested;
    if (!Object.hasOwn(chapters, chapter)) return;
    if (state.chapter === chapter && state.playing && !initial) return;
    playbackTween?.kill();
    cameraTween?.kill();
    componentDemo.reset();
    state.chapter = chapter;
    state.position = 0;
    state.playing = true;
    root.dataset.chapter = chapter;
    root.setAttribute('data-playing', '');
    root.dataset.view = visibility() ?? (sequence() ? 'hardware' : chapter === 'spraying' ? 'spraying' : 'hero');
    demo.show(activeWorkflow() ? chapter : null);
    intelligence.show(visibility() === 'intelligence' ? chapter : null);
    if (visibility() !== 'dashboard') dashboard.hide();
    activeStep = -1;
    lastMapDraw = -Infinity;
    targetPart = chapters[chapter].part ?? null;
    drone.group.position.set(0, 9, -12);
    drone.group.rotation.set(0, 0, 0);
    drone.group.scale.setScalar(1);
    drone.setSelected(targetPart);
    marker.hidden = readout.hidden = driftKey.hidden = operation.hidden = legend.hidden = true;
    paths.update(-1);
    drift.update(-1);
    landingMarks.update(-1);
    routeGroup.visible = positionOutput.group.visible = field.layer.visible = false;
    navButtons.forEach((button) => {
      const current = button.dataset.chapter === ({ spraying: 'drift', dashboard: dashboardReturn }[chapter] ?? chapter);
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const group = nav.querySelector('[aria-current]')?.closest('details');
    if (group) for (const section of nav.querySelectorAll('details')) section.open = section === group;
    renderChapter();
    if (!sequence() && chapter !== 'spraying' && !visibility()) {
      const wide = chapter === 'advantages';
      moveCamera(wide ? fieldCamera() : framed(overview), initial ? 0 : 1.2);
    }
    updateProgress();

    const steps = sequence() ?? activeWorkflow();
    const duration = steps ? featureDuration(steps) : chapter === 'spraying' ? SPRAY_DURATION : 2;
    playbackTween = gsap.to(state, {
      position: 1,
      duration,
      ease: 'none',
      onUpdate: updateProgress,
      onComplete() {
        state.playing = false;
        root.removeAttribute('data-playing');
        playbackToggle.textContent = 'Replay';
      },
    });
  }

  function stopTour() {
    tour = undefined;
    tourClock?.kill();
    root.removeAttribute('data-tour');
    el('tour-select').value = '';
  }

  function startTour(name) {
    if (!Object.hasOwn(tours, name)) return;
    stopTour();
    tour = tours[name];
    tourIndex = 0;
    root.setAttribute('data-tour', '');
    el('tour-select').value = name;
    setPresentation(true);
    const entries = tour;
    function advance() {
      const [chapter, duration] = entries[tourIndex];
      activate(chapter, true);
      const clock = { progress: 0 };
      tourClock = gsap.to(clock, {
        progress: 1, duration, ease: 'none',
        onUpdate: () => intelligence.present(clock.progress),
        onComplete() {
          tourIndex++;
          if (tourIndex < entries.length) advance();
          else {
            stopTour();
            setPresentation(false);
          }
        },
      });
    }
    advance();
  }

  function projectMarker() {
    const part = drone.parts[targetPart];
    if (!part) return;
    const gps = state.chapter === 'position';
    const point = gps ? positionOutput.group.position.clone().add(new THREE.Vector3(0, .78, 0))
      : part.localToWorld(targetPart === 'nozzle' ? part.userData.outlets[3].clone()
        : new THREE.Vector3(0, targetPart === 'sensor' ? .73 : 0, 0));
    point.project(camera);
    marker.classList.toggle('position-output-marker', gps);
    marker.hidden = Math.abs(point.z) >= 1 || Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1;
    marker.style.left = (point.x + 1) * stageWidth / 2 + 'px';
    marker.style.top = (1 - point.y) * stageHeight / 2 + 'px';
  }

  function resize() {
    stageWidth = Math.max(1, container.clientWidth);
    stageHeight = Math.max(1, container.clientHeight);
    camera.aspect = stageWidth / stageHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, stageWidth < 740 ? 1.15 : 1.45));
    renderer.setSize(stageWidth, stageHeight, false);
    if (replayScene) moveCamera(fieldCamera());
    else if (state.chapter === 'spraying') setSprayCamera(state.position * SPRAY_DURATION);
    else if (state.chapter === 'position') updateFeature();
    else if (sequence()) moveCamera(framed(featureViews[featureFrame(sequence(), state.position).step.view]));
    else if (!visibility()) moveCamera(state.chapter === 'advantages' ? fieldCamera() : framed(overview));
  }

  function setMenu(open) {
    root.toggleAttribute('data-menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    if (open) nav.querySelector('[aria-current]')?.focus();
  }

  function setPresentation(enabled) {
    root.toggleAttribute('data-presentation', enabled);
    presentationToggle.setAttribute('aria-pressed', String(enabled));
    presentationToggle.textContent = enabled ? 'Exit presentation' : 'Presentation';
    setMenu(false);
  }

  navButtons.forEach((button) => button.addEventListener('click', () => {
    navigate(button.dataset.chapter);
    if (MOBILE_MENU.matches) {
      setMenu(false);
      heading.focus({ preventScroll: true });
    }
  }));
  nav.querySelectorAll('details').forEach((section, _, sections) => {
    section.querySelector('summary').addEventListener('click', (event) => {
      event.preventDefault();
      for (const other of sections) other.open = other === section;
    });
  });
  el('workspace-back').addEventListener('click', () => navigate(dashboardReturn));
  playbackToggle.addEventListener('click', () => {
    if (state.position === 1) { activate(state.chapter, true); return; }
    state.playing = playbackTween.paused();
    playbackTween.paused(!state.playing);
    playbackToggle.textContent = state.playing ? 'Pause' : 'Resume';
  });
  el('tour-select').addEventListener('change', ({ target }) => {
    if (target.value) startTour(target.value);
    else { stopTour(); setPresentation(false); }
  });
  menuToggle.addEventListener('click', () => setMenu(!root.hasAttribute('data-menu-open')));
  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    if (MOBILE_MENU.matches) setMenu(true);
    else nav.querySelector('[aria-current]')?.focus();
  });
  presentationToggle.addEventListener('click', () => {
    stopTour();
    setPresentation(!root.hasAttribute('data-presentation'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (root.hasAttribute('data-presentation')) {
        stopTour();
        setPresentation(false);
        presentationToggle.focus();
      } else if (root.hasAttribute('data-menu-open')) {
        setMenu(false);
        menuToggle.focus();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const inNav = nav.contains(event.target);
    if (event.target.matches?.('button, input, select, textarea, a, summary') && !inNav) return;
    if (event.key === 'Home') {
      event.preventDefault();
      navButtons[0].click();
      if (inNav && !MOBILE_MENU.matches) navButtons[0].focus();
      return;
    }
    const direction = (event.key === 'ArrowRight' || (inNav && event.key === 'ArrowDown')) ? 1
      : (event.key === 'ArrowLeft' || (inNav && event.key === 'ArrowUp')) ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const index = navButtons.findIndex((button) => button.dataset.chapter === state.chapter);
    const next = navButtons[(index + direction + navButtons.length) % navButtons.length];
    if (inNav && MOBILE_MENU.matches) {
      navigate(next.dataset.chapter);
      next.focus();
    } else {
      next.click();
      if (inNav) next.focus();
    }
  });

  const colors = palette.map((color) => 'rgb(' + color.join(',') + ')').join(',');
  el('deposition-ramp').style.background = 'linear-gradient(90deg,' + colors + ')';
  el('deposition-max').textContent = data.display.color_max_gm2.wet + ' g/m²';
  el('drift-distance').textContent = drift.downwindMeters.toFixed(1) + ' m';
  el('drift-wind').textContent = windDirection + ' · ' + windSpeed;

  scene.updateMatrixWorld(true);
  resize();
  new ResizeObserver(resize).observe(container);
  const params = new URLSearchParams(location.search);
  const initial = params.get('chapter');
  const resolved = archivedChapters[initial] ?? initial;
  activate(Object.hasOwn(chapters, resolved) && resolved !== 'dashboard' ? resolved : 'overview', true);
  if (params.get('mode') === 'presentation') setPresentation(true);
  if (params.has('tour')) startTour(params.get('tour'));
  let previousFrame = 0;
  renderer.setAnimationLoop((time) => {
    if ((visibility() && !replayScene) || time - previousFrame < 1000 / 40) return;
    previousFrame = time;
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();
    const seconds = time / 1000;
    drone.update(seconds, state.playing && !reducedMotion.matches ? seconds : 0);
    if (targetPart) projectMarker();
    renderer.render(scene, camera);
  });
}


const fullscreenButton = el('fullscreen-toggle');
if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.requestFullscreen();
  } catch (error) {
    console.warn('Full screen is unavailable in this browser context.', error);
  }
});
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit full screen' : 'Enter full screen');
  fullscreenButton.title = isFullscreen ? 'Exit full screen' : 'Enter full screen';
});

try {
  await setup();
} catch (error) {
  el('fallback').hidden = false;
  navButtons.forEach((button) => { button.disabled = true; });
  console.error('OptiSpray product experience could not initialize.', error);
}
