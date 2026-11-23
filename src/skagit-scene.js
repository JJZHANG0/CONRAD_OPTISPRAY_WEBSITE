import * as THREE from 'three';
import { routeColors, unproject } from './skagit-map.js';
import { pointAt } from './skagit-data.js';

const position = (e, n, h) => new THREE.Vector3(e, h, -n);
const up = new THREE.Vector3(0, 1, 0);

function trackGeometry(points) {
  return new THREE.BufferGeometry().setFromPoints(points);
}

function inField(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function plantField(crops, ring, spacing, scale, random) {
  const ns = ring.map(point => point[1]);
  const es = ring.map(point => point[0]);
  const points = [];
  const maxE = Math.max(...es);
  const maxN = Math.max(...ns);
  for (let e = Math.min(...es); e < maxE; e += spacing) {
    for (let n = Math.min(...ns); n < maxN; n += spacing) {
      const point = [e + (.5 - random()) * spacing * .32, n + (.5 - random()) * spacing * .32];
      if (inField(point, ring)) points.push(point);
    }
  }
  const plants = new THREE.InstancedMesh(crops.geometry, crops.material, points.length);
  const marker = new THREE.Object3D();
  const color = new THREE.Color();
  points.forEach(([e, n], i) => {
    marker.position.set(e, .015, -n);
    marker.scale.setScalar(scale * (.74 + random() * .45));
    marker.rotation.y = (random() - .5) * 2;
    marker.updateMatrix();
    plants.setMatrixAt(i, marker.matrix);
    color.setHSL(.28 + random() * .035, .25 + random() * .08, .24 + random() * .08);
    plants.setColorAt(i, color);
  });
  return plants;
}

export function createSkagitScene(scene, drone, field, random) {
  const physicsGroup = new THREE.Group();
  const routeGroup = new THREE.Group();
  scene.add(physicsGroup, routeGroup);
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x57eed1, toneMapped: false }));
  physicsGroup.add(pathLine);
  const releaseDot = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), new THREE.MeshBasicMaterial({ color: 0xa8fff1 }));
  const currentDrop = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8fffb }));
  const landingDot = new THREE.Mesh(new THREE.RingGeometry(.16, .26, 20), new THREE.MeshBasicMaterial({ color: 0x57eed1, side: THREE.DoubleSide, toneMapped: false }));
  landingDot.rotation.x = -Math.PI / 2;
  physicsGroup.add(releaseDot, currentDrop, landingDot);

  const mist = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
    color: 0xc2f4ef, size: .17, opacity: .76, transparent: true, depthWrite: false,
  }));
  const trails = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: 0x8cddca, opacity: .43, transparent: true, depthWrite: false,
  }));
  routeGroup.add(mist, trails);

  let previousPath, previousRoute, previousVersion = -1, groundTexture;
  let center, worldWidth, worldDepth, overviewCrops, followCrops;

  function place(frame) {
    const { data } = frame;
    const [cx, cy, cw, ch] = data.display.overview_crop_px;
    const [left, top] = unproject(data, cx, cy);
    const [right, bottom] = unproject(data, cx + cw, cy + ch);
    worldWidth = right - left;
    worldDepth = top - bottom;
    center = position((left + right) / 2, (top + bottom) / 2, 0);
    groundTexture = new THREE.CanvasTexture(frame.surface);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    groundTexture.anisotropy = 4;
    const soil = field.ground.clone();
    soil.position.copy(center);
    soil.scale.set(2.5, 2.5, 1);
    routeGroup.add(soil);
    overviewCrops = plantField(field.crops, data.field, 4.7, 3.7, random);
    followCrops = plantField(field.crops, data.field, 1.85, 1.08, random);
    routeGroup.add(overviewCrops, followCrops);
    const plane = new THREE.PlaneGeometry(worldWidth, worldDepth);
    const overlay = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
      map: groundTexture, transparent: true, depthWrite: false, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }));
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.copy(center);
    overlay.position.y = .045;
    overlay.renderOrder = 1;
    routeGroup.add(overlay);
    const trailLine = (points, material) => {
      const line = new THREE.Line(trackGeometry(points), material);
      line.computeLineDistances();
      line.renderOrder = 2;
      routeGroup.add(line);
    };
    const outline = [...data.field, data.field[0]].map(([e, n]) => position(e, n, .12));
    const lineStyle = { transparent: true, depthWrite: false, toneMapped: false, fog: false };
    trailLine(outline, new THREE.LineBasicMaterial({ ...lineStyle, color: routeColors.boundary }));
    const spray = new THREE.LineBasicMaterial({ ...lineStyle, color: routeColors.spray });
    const transfer = new THREE.LineDashedMaterial({ ...lineStyle, color: routeColors.transfer, dashSize: 3, gapSize: 2 });
    for (const segment of data.segments) {
      const [a, b] = [segment.start_enu_m, segment.end_enu_m].map(([e, n]) => position(e, n, .13));
      trailLine([a, b], segment.spray ? spray : transfer);
    }
  }

  function setGeometry(object, points) {
    object.geometry.dispose();
    object.geometry = trackGeometry(points);
  }

  function showPhysics(frame, camera, { immersive, time, mouseX }) {
    const release = frame.path[0];
    const toScene = p => position(p[1] - release[1], p[2] - release[2], p[3]);
    if (previousPath !== frame.path) {
      const points = frame.path.map(toScene);
      setGeometry(pathLine, points);
      releaseDot.position.copy(points[0]);
      landingDot.position.copy(points.at(-1));
      landingDot.position.y = .10;
      previousPath = frame.path;
    }
    currentDrop.position.copy(toScene(frame.sample));
    currentDrop.position.y = Math.max(.12, currentDrop.position.y);
    currentDrop.scale.setScalar(THREE.MathUtils.clamp(frame.sample[4] / 230, .42, 1.5));
    drone.group.position.set(0, release[3] + .78, .07);
    drone.group.rotation.set(0, 0, 0);
    drone.group.scale.setScalar(.54);
    const end = toScene(frame.path.at(-1));
    const centerX = (end.x - 2.2) / 2;
    const centerZ = end.z * .35;
    const aspect = camera.aspect * (immersive ? .49 : 1);
    const distance = Math.max(12, (end.x + 6) * 1.10 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect));
    camera.position.set(centerX + distance * .09 + mouseX * .38 + Math.sin(time / 2) * .10, 4 + distance * .23, centerZ + distance);
    camera.lookAt(centerX, 1.5, centerZ);
  }

  const eye = new THREE.Vector3();
  function showRoute(frame, camera, { immersive, overview, time, mouseX }) {
    if (!groundTexture) place(frame);
    if (previousVersion !== frame.paintVersion) {
      groundTexture.needsUpdate = true;
      previousVersion = frame.paintVersion;
    }
    const [e, n, h] = frame.flight.position;
    const yaw = frame.flight.yaw;
    drone.group.position.copy(position(e, n, h));
    drone.group.position.y += .71;
    drone.group.scale.setScalar(.49);
    drone.group.rotation.set(0, -yaw, 0);
    const follow = frame.camera === 'follow';
    followCrops.visible = follow;
    overviewCrops.visible = !follow;
    if (follow) {
      const fe = Math.sin(yaw);
      const fn = Math.cos(yaw);
      const fit = Math.max(1, 1.2 / camera.aspect);
      camera.position.copy(position(e + (-fe * 27 + fn * 12) * fit, n + (-fn * 27 - fe * 12) * fit, 20 * fit));
      const wind = (frame.data.environment.wind_from_deg + 180) * Math.PI / 180;
      camera.lookAt(e - fe * 6 + Math.sin(wind) * 4, .9, -n + fn * 6 - Math.cos(wind) * 4);
      if (previousRoute !== frame) {
        const dots = [];
        const lines = [];
        const short = frame.data.display.trajectory_display.recent_trace_window_s;
        for (const { point, points } of frame.droplets) {
          const toVector = p => position(p[1], p[2], p[3]);
          dots.push(toVector(point));
          const cutoff = Math.max(points[0][0], frame.time - short);
          const history = [pointAt(points, cutoff), ...points.filter(p => p[0] > cutoff && p[0] < frame.time), point];
          for (let i = 1; i < history.length; i++) lines.push(toVector(history[i - 1]), toVector(history[i]));
        }
        setGeometry(mist, dots);
        setGeometry(trails, lines);
      }
    } else {
      const distance = Math.max(worldDepth, worldWidth / camera.aspect) * (immersive ? 1.18 : 1.35);
      eye.copy(overview.position).sub(overview.target).setLength(distance);
      eye.applyAxisAngle(up, .64 + Math.sin(time / 4) * .025 + mouseX * .045);
      camera.position.copy(center).add(eye);
      camera.lookAt(center);
    }
    mist.visible = trails.visible = follow;
    previousRoute = frame;
  }

  function show(kind, frame, camera, view) {
    physicsGroup.visible = kind === 'physics' && Boolean(frame);
    routeGroup.visible = kind === 'mapping' && Boolean(frame);
    if (!frame) return;
    if (kind === 'physics') showPhysics(frame, camera, view);
    else showRoute(frame, camera, view);
    const { time } = view;
    drone.setExplode(0);
    drone.update(time % 12, (time % 12) / 12 * Math.PI * 2);
  }

  function hide() {
    physicsGroup.visible = routeGroup.visible = false;
    drone.group.scale.setScalar(1);
  }
  hide();
  return { show, hide };
}
