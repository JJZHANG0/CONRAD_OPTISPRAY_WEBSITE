import * as THREE from 'three';

const wind = [
  { key: 'locate', label: 'Locate', seconds: 1.4, part: 'sensor', view: 'assembly', note: 'Locate the ultrasonic heads above the aircraft.' },
  { key: 'isolate', label: 'Isolate', seconds: 1.8, part: 'sensor', view: 'sensor', pose: { sensor: 1 }, note: 'Separate the existing wind module from its mounting position.' },
  { key: 'measure', label: 'Measure', seconds: 3, part: 'sensor', view: 'sensor', pose: { sensor: 1 }, wind: true, note: 'Ultrasonic pulses travel both ways between opposing heads. The difference in travel time gives the wind component.' },
  { key: 'connect', label: 'Connect', seconds: 3, part: 'control', view: 'system', pose: { sensor: .5, control: .65 }, signal: true, note: 'The bench prototype sends wind readings to the ESP32 over RS485. The link shows which parts exchange data.' },
  { key: 'assemble', label: 'Assemble', seconds: 1.8, part: 'sensor', view: 'assembly', note: 'Return the wind module and controller to the original aircraft.' },
];

const liquid = [
  { key: 'locate', label: 'Locate', seconds: 1.4, part: 'control', view: 'assembly', show: ['pump'], note: 'Locate the controller, pump, tank, spray boom and nozzle array.' },
  { key: 'isolate', label: 'Isolate', seconds: 1.8, part: 'tank', view: 'system', show: ['pump'], pose: { control: .8, tank: .55, pump: .45, boom: .42, nozzle: .42 }, note: 'Separate the existing assemblies to see how the tank, pump, boom and nozzles relate.' },
  { key: 'connect', label: 'Connect', seconds: 2.2, part: 'control', view: 'system', signal: true, note: 'The ESP32 receives wind readings over RS485. The connection shown is the signal path between the two assemblies.' },
  { key: 'run', label: 'Run', seconds: 4, part: 'nozzle', view: 'liquid', show: ['pump'], signal: true, flow: true, note: 'Follow liquid from the tank through the pump and boom, then see spray leave the existing nozzle outlets.' },
  { key: 'fault', label: 'Interrupt link', seconds: 5, part: 'nozzle', view: 'liquid', show: ['pump'], flow: true, fault: true, note: 'The bench controller flags stale communication and stops the pump after three seconds.' },
  { key: 'inspect', label: 'Inspect', seconds: 2.4, part: 'tank', view: 'system', show: ['pump'], pose: { control: .55, tank: .35, pump: .35, boom: .3, nozzle: .3 }, transparent: true, note: 'Inspect the liquid path through the aircraft. The highlighted line describes the route; aircraft-side valve placement depends on integration.' },
  { key: 'assemble', label: 'Assemble', seconds: 1.8, part: 'control', view: 'assembly', note: 'Return the controller and spray assemblies to their original positions.' },
];

const climate = [
  { key: 'locate', label: 'Locate', seconds: 1.1, part: 'climate', view: 'assembly', show: ['climate'], note: 'Locate the temperature and humidity module on the aircraft.' },
  { key: 'isolate', label: 'Isolate', seconds: 1.5, part: 'climate', view: 'climate', show: ['climate'], pose: { climate: 1 }, note: 'The vented housing separates the sensing opening from the aircraft surface.' },
  { key: 'measure', label: 'Read conditions', seconds: 2.5, part: 'climate', view: 'climate', show: ['climate'], pose: { climate: 1 }, climate: true, note: 'Temperature and relative humidity add atmospheric context to droplet travel.' },
  { key: 'connect', label: 'Connect', seconds: 1.8, part: 'climate', view: 'system', show: ['climate'], pose: { climate: .55, control: .35 }, signal: true, signalFrom: 'climate', note: 'Follow the environmental reading from the sensor assembly to the controller.' },
  { key: 'assemble', label: 'Assemble', seconds: 1.8, part: 'climate', view: 'assembly', show: ['climate'], note: 'Return the module to the aircraft assembly.' },
];

const light = [
  { key: 'locate', label: 'Locate', seconds: 1, part: 'light', view: 'assembly', show: ['light'], note: 'Locate the light-sensing module on the aircraft.' },
  { key: 'isolate', label: 'Isolate', seconds: 1.5, part: 'light', view: 'light', show: ['light'], pose: { light: 1 }, note: 'The optical opening faces outward while the enclosure protects the sensor body.' },
  { key: 'sense', label: 'Receive light', seconds: 1.5, part: 'light', view: 'light', show: ['light'], pose: { light: 1 }, light: true, note: 'Light enters the sensing window; the device interface supports an illuminance value in lux.' },
  { key: 'assemble', label: 'Assemble', seconds: 1, part: 'light', view: 'assembly', show: ['light'], note: 'Return the module to the aircraft assembly.' },
];

const position = [
  { key: 'update', label: 'Position fix', seconds: 2.6, part: 'position', show: ['position'], gps: true, note: 'The marker shows the aircraft’s field-relative position along the farmland route.' },
];

const flow = [
  { key: 'locate', label: 'Locate', seconds: 1, part: 'flow', view: 'assembly', show: ['pump', 'flow'], note: 'Locate the inline flow sensor along the liquid path.' },
  { key: 'isolate', label: 'Isolate', seconds: 1.5, part: 'flow', view: 'flow', show: ['pump', 'flow'], pose: { pump: .3, flow: 1, tank: .2, boom: .15 }, note: 'The sensor sits between the pump and spray boom.' },
  { key: 'measure', label: 'Follow flow', seconds: 2, part: 'flow', view: 'flow', show: ['pump', 'flow'], pose: { pump: .3, flow: 1, tank: .2, boom: .15 }, flow: true, note: 'Follow liquid through the sensor body and onward to the existing nozzle array.' },
  { key: 'connect', label: 'Connect', seconds: 1.5, part: 'flow', view: 'system', show: ['pump', 'flow'], pose: { pump: .25, flow: .55, control: .3 }, signal: true, signalFrom: 'flow', note: 'The device interface accepts whole-system or numbered-nozzle flow values.' },
  { key: 'assemble', label: 'Assemble', seconds: 1.5, part: 'flow', view: 'assembly', show: ['pump', 'flow'], note: 'Return the liquid path assemblies to the aircraft.' },
];

const pressure = [
  { key: 'locate', label: 'Locate', seconds: 1, part: 'pressure', view: 'assembly', show: ['pressure', 'valve'], note: 'Locate the pressure sensor and valve at the spray manifold.' },
  { key: 'isolate', label: 'Isolate', seconds: 1.5, part: 'pressure', view: 'pressure', show: ['pressure', 'valve'], pose: { pressure: 1, valve: .55, boom: .15 }, note: 'The sensor reads pressure at the manifold or a numbered nozzle.' },
  { key: 'read', label: 'Read pressure', seconds: 1.5, part: 'pressure', view: 'pressure', show: ['pressure', 'valve'], pose: { pressure: 1, valve: .55, boom: .15 }, signal: true, signalFrom: 'pressure', pressure: true, note: 'Follow the pressure reading to the device interface; the valve remains in its current state.' },
  { key: 'follow', label: 'Follow liquid', seconds: 2, part: 'valve', view: 'flow', show: ['pressure', 'valve', 'pump', 'flow'], pose: { pressure: .55, valve: .45, pump: .2, flow: .2 }, flow: true, pressure: true, note: 'The liquid path passes the sensor and valve before reaching the boom.' },
  { key: 'assemble', label: 'Assemble', seconds: 2, part: 'pressure', view: 'assembly', show: ['pressure', 'valve'], note: 'Return the manifold assemblies to the aircraft.' },
];

const nozzles = [
  { key: 'locate', label: 'Locate', seconds: 1, part: 'nozzle', view: 'assembly', note: 'Locate the seven existing outlets along the spray boom.' },
  { key: 'isolate', label: 'Isolate', seconds: 2, part: 'nozzle', view: 'nozzle', pose: { boom: .35, nozzle: 1 }, note: 'Inspect one outlet, its tip and the shared boom connection.' },
  { key: 'spray', label: 'Follow spray', seconds: 2, part: 'nozzle', view: 'liquid', pose: { boom: .25, nozzle: .65 }, flow: true, note: 'Follow the recorded field trajectories as they leave the outlet line.' },
  { key: 'assemble', label: 'Assemble', seconds: 2, part: 'nozzle', view: 'assembly', note: 'Return the nozzle array to the aircraft assembly.' },
];

export const features = { wind, climate, light, position, control: liquid, flow, pressure, nozzle: nozzles };

export const featureViews = {
  assembly: { position: [7.4, 11, -2.8], target: [0, 8.9, -12] },
  sensor: { position: [1.7, 12.6, -8.7], target: [0, 11.4, -12] },
  system: { position: [6.5, 11.9, -2.4], target: [.6, 9.3, -11.8] },
  liquid: { position: [3.8, 9.1, .6], target: [1, 5.9, -11.7] },
  climate: { position: [2.4, 11.2, -8.2], target: [-1.1, 9.9, -11.7] },
  light: { position: [2.5, 11.0, -8.4], target: [1.1, 9.9, -11.6] },
  flow: { position: [4.3, 8.2, -6.4], target: [-0.5, 7.5, -11.3] },
  pressure: { position: [4.4, 7.75, -6.4], target: [2.4, 7.25, -11.2] },
  nozzle: { position: [3.3, 9.0, -3.2], target: [0, 7.8, -11.7] },
};

export function featureDuration(sequence) {
  return sequence.reduce((sum, step) => sum + step.seconds, 0);
}

export function featureFrame(sequence, progress) {
  let time = progress * featureDuration(sequence);
  for (let i = 0; i < sequence.length; i += 1) {
    const step = sequence[i];
    if (time < step.seconds || i === sequence.length - 1) return { i, time, step };
    time -= step.seconds;
  }
}

const accent = 0x67e6cd;
const water = 0x8bd3ff;
const warning = 0xffb467;
const zero = new THREE.Vector3();

function createChannel(parent, count, color) {
  const lines = new THREE.BufferGeometry();
  const points = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
  points.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const links = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .76, depthTest: false, depthWrite: false, toneMapped: false }));
  const dots = new THREE.Points(points, new THREE.PointsMaterial({ color, size: .09, depthTest: false, depthWrite: false, toneMapped: false }));
  links.frustumCulled = dots.frustumCulled = false;
  links.renderOrder = 8;
  dots.renderOrder = 9;
  parent.add(links, dots);

  function draw(pairs, phase, active, tint = color) {
    links.visible = pairs.length > 0;
    dots.visible = active && links.visible;
    links.material.color.setHex(tint);
    dots.material.color.setHex(tint);
    pairs.forEach(([from, to], index) => {
      lines.attributes.position.setXYZ(index * 2, from.x, from.y, from.z);
      lines.attributes.position.setXYZ(index * 2 + 1, to.x, to.y, to.z);
      const t = (phase + index * .19) % 1;
      points.attributes.position.setXYZ(index, ...zero.copy(from).lerp(to, t).toArray());
    });
    lines.setDrawRange(0, pairs.length * 2);
    points.setDrawRange(0, pairs.length);
    lines.attributes.position.needsUpdate = true;
    points.attributes.position.needsUpdate = true;
  }
  return { draw, clear: () => draw([], 0, false) };
}

export function createComponentDemonstration(drone) {
  const acoustic = createChannel(drone.group, 4, accent);
  const data = createChannel(drone.group, 3, accent);
  const lightRays = createChannel(drone.group, 3, 0xffd27a);
  const liquid = createChannel(drone.group, 20, water);
  const { parts } = drone;
  const supplemental = ['climate', 'light', 'position', 'pump', 'flow', 'pressure', 'valve'];
  const surfaces = [];
  for (const group of [drone.core, parts.tank]) {
    group.traverse(({ isMesh, material }) => {
      if (isMesh) surfaces.push({ group, material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
    });
  }

  function transparency(layer) {
    for (const { group, material, opacity, transparent, depthWrite } of surfaces) {
      const alpha = layer[group === parts.tank ? 'tank' : 'core'];
      const transparentNow = alpha < 1 || transparent;
      if (material.transparent !== transparentNow) material.needsUpdate = true;
      material.transparent = transparentNow;
      material.opacity = alpha * opacity;
      material.depthWrite = alpha === 1 ? depthWrite : false;
    }
  }

  function reset() {
    drone.setExplode(0);
    transparency({ core: 1, tank: 1 });
    supplemental.forEach((id) => { parts[id].visible = false; });
    acoustic.clear();
    data.clear();
    lightRays.clear();
    liquid.clear();
  }

  function draw(sequence, frame, animate) {
    const { step, i, time } = frame;
    const activeParts = new Set(sequence.flatMap((entry) => entry.show ?? []));
    supplemental.forEach((id) => { parts[id].visible = activeParts.has(id); });
    const mix = animate ? THREE.MathUtils.smoothstep(time, 0, .65) : 1;
    const previous = sequence[i - 1]?.pose;
    const pose = Object.fromEntries(Object.keys(parts).map((id) => [id, THREE.MathUtils.lerp(previous?.[id] ?? 0, step.pose?.[id] ?? 0, mix)]));
    drone.setExplode(1, pose);
    transparency({
      core: step.transparent ? .32 : step.pose ? .67 : 1,
      tank: step.transparent ? .4 : 1,
    });

    const heads = parts.sensor.userData.heads.map((point) => point.clone().add(parts.sensor.position));
    acoustic.draw(step.wind ? [[heads[0], heads[2]], [heads[2], heads[0]], [heads[1], heads[3]], [heads[3], heads[1]]] : [], time * 1.8, step.wind);
    const interrupted = step.fault && time < 3;
    const signalPart = parts[step.signalFrom] ?? parts.sensor;
    const toController = [[signalPart.position.clone().add(new THREE.Vector3(0, .2, 0)), parts.control.position]];
    data.draw(step.signal || step.fault ? toController : [], time * 1.4, step.signal, step.fault ? warning : accent);

    const light = parts.light.position;
    const lightSources = [
      [light.clone().add(new THREE.Vector3(-.16, 1.1, 0)), light.clone()],
      [light.clone().add(new THREE.Vector3(0, 1.25, 0)), light.clone()],
      [light.clone().add(new THREE.Vector3(.16, 1.1, 0)), light.clone()],
    ];
    lightRays.draw(step.light ? lightSources : [], time * 1.8, Boolean(step.light));

    const flow = step.flow && (!step.fault || interrupted);
    const center = parts.boom.position;
    const outlets = parts.nozzle.userData.outlets.map((point) => point.clone().add(parts.nozzle.position));
    const fluidNodes = [parts.tank.position, parts.pump.position];
    if (activeParts.has('flow')) fluidNodes.push(parts.flow.position);
    if (activeParts.has('pressure')) fluidNodes.push(parts.pressure.position);
    if (activeParts.has('valve')) fluidNodes.push(parts.valve.position);
    fluidNodes.push(center);
    const segments = fluidNodes.slice(1).map((point, index) => [fluidNodes[index], point]).concat(outlets.map((point) => [center, point]));
    liquid.draw(step.flow || step.transparent ? segments : [], time * 1.1, flow, step.fault && !interrupted ? warning : water);
    return { flow, interrupted, activeParts };
  }

  return { draw, reset };
}
