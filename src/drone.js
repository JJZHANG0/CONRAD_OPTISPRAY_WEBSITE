import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function mesh(geometry, material, position = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function beamBetween(a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), material);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
  return object;
}

function mergeStaticChildren(group) {
  [...group.children].filter((child) => child.isGroup).forEach(mergeStaticChildren);
  const buckets = new Map();
  group.children.filter((child) => child.isMesh).forEach((child) => {
    const key = child.material.uuid;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(child);
  });
  buckets.forEach((objects) => {
    if (objects.length < 2) return;
    const geometries = objects.map((object) => {
      object.updateMatrix();
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      return geometry;
    });
    const combined = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!combined) return;
    const merged = mesh(combined, objects[0].material);
    objects.forEach((object) => group.remove(object));
    group.add(merged);
  });
}

function createMaterials() {
  return {
    carbon: new THREE.MeshStandardMaterial({ color: 0x11191a, metalness: 0.75, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x182123, metalness: 0.82, roughness: 0.26 }),
    titanium: new THREE.MeshPhysicalMaterial({ color: 0xaeb9b6, metalness: 0.88, roughness: 0.25, clearcoat: 0.35 }),
    tank: new THREE.MeshPhysicalMaterial({ color: 0xb8c5bd, metalness: 0.08, roughness: 0.3, clearcoat: 0.5 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x54efd1, emissive: 0x27c9ad, emissiveIntensity: 1.5, metalness: 0.25, roughness: 0.25 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xe99152, emissive: 0x8a3518, emissiveIntensity: 0.35, metalness: 0.35, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c1213, roughness: 0.8, metalness: 0.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x173d3b, metalness: 0.35, roughness: 0.12, clearcoat: 1 }),
    rotor: new THREE.MeshStandardMaterial({ color: 0x263032, metalness: 0.6, roughness: 0.38 }),
    rotorBlur: new THREE.MeshBasicMaterial({ color: 0x9eb4ae, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide }),
  };
}

function makeRotor(materials, x, z, index) {
  const assembly = new THREE.Group();
  assembly.position.set(x, 0.16, z);
  assembly.add(mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.36, 20), materials.dark));
  assembly.add(mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.12, 20), materials.titanium, [0, 0.23, 0]));
  const ring = mesh(new THREE.TorusGeometry(0.96, 0.018, 6, 64), materials.titanium, [0, 0.12, 0]);
  ring.rotation.x = Math.PI / 2;
  assembly.add(ring);

  const rotor = new THREE.Group();
  rotor.position.y = 0.31;
  const bladeGeometry = new RoundedBoxGeometry(1.72, 0.025, 0.105, 2, 0.02);
  const bladeA = mesh(bladeGeometry, materials.rotor);
  bladeA.rotation.y = index * 0.4;
  const bladeB = mesh(bladeGeometry, materials.rotor);
  bladeB.rotation.y = Math.PI / 2 + index * 0.4;
  rotor.add(bladeA, bladeB);
  const blur = mesh(new THREE.CircleGeometry(0.9, 48), materials.rotorBlur, [0, -0.015, 0]);
  blur.rotation.x = -Math.PI / 2;
  rotor.add(blur);
  assembly.add(rotor);

  const nav = mesh(new THREE.SphereGeometry(0.055, 10, 8), index % 2 ? materials.orange : materials.cyan, [x > 0 ? 0.18 : -0.18, -0.05, z > 0 ? 0.18 : -0.18]);
  assembly.add(nav);
  return { assembly, rotor };
}

function createBody(core, materials) {
  const body = mesh(new RoundedBoxGeometry(2.25, 0.62, 1.48, 5, 0.14), materials.dark);
  core.add(body);
  const upperShell = mesh(new RoundedBoxGeometry(1.72, 0.3, 1.18, 4, 0.12), materials.titanium, [0, 0.36, -0.03]);
  upperShell.scale.set(1, 1, 0.94);
  core.add(upperShell);
  const canopy = mesh(new RoundedBoxGeometry(0.84, 0.28, 0.7, 4, 0.1), materials.glass, [0, 0.52, -0.18]);
  core.add(canopy);

  const frontSensor = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20), materials.carbon, [0, -0.03, -0.79]);
  frontSensor.rotation.x = Math.PI / 2;
  core.add(frontSensor);
  const lens = mesh(new THREE.CircleGeometry(0.105, 24), materials.cyan, [0, -0.03, -0.856]);
  lens.rotation.y = Math.PI;
  core.add(lens);

  for (const side of [-1, 1]) {
    const rail = mesh(new RoundedBoxGeometry(0.08, 0.24, 1.08, 2, 0.025), materials.titanium, [side * 1.13, 0.02, 0]);
    core.add(rail);
    for (let i = 0; i < 5; i += 1) {
      const vent = mesh(new THREE.BoxGeometry(0.015, 0.12, 0.07), materials.rubber, [side * 1.176, 0.03, -0.28 + i * 0.14]);
      core.add(vent);
    }
  }

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = '#aeb9b6';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#13201f';
  ctx.font = '600 62px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OPTISPRAY', 256, 66);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = mesh(new THREE.PlaneGeometry(1.25, 0.31), new THREE.MeshBasicMaterial({ map: labelTexture, toneMapped: false }), [0, 0.518, 0.26]);
  label.rotation.x = -Math.PI / 2;
  core.add(label);
}

function createLandingGear(core, materials) {
  for (const side of [-1, 1]) {
    core.add(beamBetween([side * 0.8, -0.28, 0.45], [side * 1.15, -1.55, 0.7], 0.045, materials.carbon));
    core.add(beamBetween([side * 0.8, -0.28, -0.45], [side * 1.15, -1.55, -0.7], 0.045, materials.carbon));
    core.add(beamBetween([side * 1.15, -1.55, -0.9], [side * 1.15, -1.55, 0.9], 0.055, materials.rubber));
  }
}

function createWindSensor(materials) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 20), materials.dark, [0, 0.08, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.48, 10), materials.titanium, [0, 0.39, 0]));
  const heads = [];
  const spinner = new THREE.Group();
  spinner.position.y = 0.62;
  for (const side of [-1,1]) for (const axis of [0,1]) {
    const x=axis===0?side*0.24:0, z=axis===1?side*0.24:0;
    spinner.add(beamBetween([x,-0.25,z],[x,0.08,z],0.016,materials.titanium));
    const head=mesh(new THREE.CylinderGeometry(0.055,0.055,0.08,12),materials.dark,[x,0.08,z]);
    head.rotation.z=axis===0?Math.PI/2:0;head.rotation.x=axis===1?Math.PI/2:0;spinner.add(head);
    heads.push(new THREE.Vector3(x, spinner.position.y + head.position.y, z));
    spinner.add(beamBetween([0,-0.25,0],[x,-0.25,z],0.018,materials.titanium));
  }
  group.userData.heads = heads;
  group.add(spinner);
  return { group, spinner };
}

function createControlModule(materials, interfaceSide = false) {
  const group = new THREE.Group();
  const shell = mesh(new RoundedBoxGeometry(0.42, 0.52, 0.8, 3, 0.06), interfaceSide ? materials.dark : materials.titanium);
  group.add(shell);
  const face = mesh(new THREE.BoxGeometry(0.025, 0.28, 0.54), materials.carbon, [interfaceSide ? -0.22 : 0.22, 0, 0]);
  group.add(face);
  for (let i = 0; i < 3; i += 1) {
    const light = mesh(new THREE.SphereGeometry(0.025, 8, 6), i === 2 ? materials.orange : materials.cyan, [interfaceSide ? -0.24 : 0.24, 0.08 - i * 0.08, -0.18]);
    group.add(light);
  }
  return group;
}

function createTank(materials) {
  const group = new THREE.Group();
  const tank = mesh(new RoundedBoxGeometry(1.45, 1.0, 1.1, 5, 0.16), materials.tank);
  tank.scale.set(1, 1, 0.94);
  group.add(tank);
  group.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 20), materials.dark, [0, 0.54, 0]));
  const band = mesh(new RoundedBoxGeometry(1.5, 0.12, 1.08, 3, 0.03), materials.carbon, [0, 0.12, 0]);
  group.add(band);
  const level = mesh(new THREE.BoxGeometry(0.04, 0.58, 0.07), materials.cyan, [0.735, -0.08, -0.25]);
  group.add(level);
  return group;
}

function createBoom(materials) {
  const group = new THREE.Group();
  for (const z of [-0.12, 0.12]) {
    group.add(beamBetween([-3.75, 0, z], [3.75, 0, z], 0.035, materials.carbon));
  }
  for (let i = 0; i < 13; i += 1) {
    const x = -3.6 + i * 0.6;
    group.add(beamBetween([x - 0.25, 0, -0.12], [x + 0.25, 0, 0.12], 0.018, materials.titanium));
  }
  for (const side of [-1, 1]) {
    group.add(beamBetween([side * 0.65, 0.42, 0], [side * 2.75, 0, 0], 0.035, materials.titanium));
    const end = mesh(new RoundedBoxGeometry(0.16, 0.16, 0.38, 2, 0.03), materials.orange, [side * 3.75, 0, 0]);
    group.add(end);
  }
  return group;
}

function createNozzles(materials) {
  const group = new THREE.Group();
  const outlets = [];
  const tipHeight = 0.15;
  const tipCenter = -0.2;
  for (let i = 0; i < 7; i += 1) {
    const x = (i - 3) * 1.05;
    group.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 12), materials.dark, [x, 0, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.025, 0.06, tipHeight, 12), materials.orange, [x, tipCenter, 0]));
    outlets.push(new THREE.Vector3(x, tipCenter - tipHeight / 2, 0));
    const collar = mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 16), materials.titanium, [x, 0.11, 0]);
    collar.rotation.x = Math.PI / 2;
    group.add(collar);
  }
  group.userData.outlets = outlets;
  return group;
}

function createClimateSensor(materials) {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(0.48, 0.12, 0.46, 3, 0.04), materials.carbon, [0, -0.08, 0]));
  group.add(mesh(new RoundedBoxGeometry(0.4, 0.3, 0.34, 4, 0.055), materials.dark, [0, 0.12, 0]));
  group.add(mesh(new RoundedBoxGeometry(0.34, 0.075, 0.3, 3, 0.025), materials.titanium, [0, 0.3, 0]));
  for (let i = 0; i < 4; i += 1) {
    group.add(mesh(new THREE.BoxGeometry(0.018, 0.14, 0.2), materials.rubber, [-0.205, 0.12, -0.105 + i * 0.07]));
  }
  group.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), materials.cyan, [0.12, 0.12, 0.185]));
  group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10), materials.titanium, [0, -0.17, 0]));
  return group;
}

function createLightSensor(materials) {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(0.5, 0.09, 0.44, 3, 0.035), materials.carbon, [0, -0.12, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 20), materials.dark, [0, 0, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.035, 20), materials.glass, [0, 0.095, 0]));
  group.add(mesh(new THREE.CircleGeometry(0.072, 24), materials.cyan, [0, 0.116, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), materials.titanium, [0.16, -0.12, 0]));
  return group;
}

function createGpsReceiver(materials) {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(0.62, 0.09, 0.5, 3, 0.04), materials.carbon));
  group.add(mesh(new RoundedBoxGeometry(0.4, 0.11, 0.3, 3, 0.04), materials.titanium, [0, 0.09, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.095, 24), materials.dark, [0, 0.18, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.145, 0.16, 0.035, 24), materials.tank, [0, 0.245, 0]));
  group.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), materials.cyan, [0.23, 0.14, 0.08]));
  for (const x of [-0.23, 0.23]) group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8), materials.titanium, [x, -0.07, 0]));
  return group;
}

function createPump(materials) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.56, 18), materials.dark));
  group.children[0].rotation.z = Math.PI / 2;
  group.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 18), materials.titanium, [-0.28, 0, 0]));
  group.children[1].rotation.z = Math.PI / 2;
  group.add(mesh(new RoundedBoxGeometry(0.32, 0.3, 0.28, 3, 0.045), materials.carbon, [0.18, 0.2, 0]));
  group.add(beamBetween([-0.48, 0, 0], [-0.68, 0, 0], 0.075, materials.titanium));
  group.add(beamBetween([0.08, 0, 0], [0.34, 0, 0], 0.07, materials.titanium));
  group.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), materials.cyan, [0.18, 0.2, 0.15]));
  return group;
}

function createFlowSensor(materials) {
  const group = new THREE.Group();
  group.add(beamBetween([-0.62, 0, 0], [0.62, 0, 0], 0.075, materials.titanium));
  group.add(mesh(new RoundedBoxGeometry(0.52, 0.35, 0.42, 4, 0.07), materials.dark));
  group.add(mesh(new RoundedBoxGeometry(0.27, 0.08, 0.24, 3, 0.025), materials.tank, [0, 0.2, 0]));
  group.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), materials.cyan, [0.15, 0.19, 0.22]));
  for (const x of [-0.42, 0.42]) group.add(mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 16), materials.carbon, [x, 0, 0]));
  return group;
}

function createPressureSensor(materials) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.3, 6), materials.titanium, [0, -0.04, 0]));
  group.add(mesh(new RoundedBoxGeometry(0.4, 0.3, 0.34, 4, 0.05), materials.dark, [0, 0.2, 0]));
  group.add(mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.04, 20), materials.glass, [0, 0.37, 0]));
  group.add(mesh(new THREE.CircleGeometry(0.074, 20), materials.cyan, [0, 0.392, 0]));
  group.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), materials.orange, [0.17, 0.2, 0.18]));
  return group;
}

function createValve(materials) {
  const group = new THREE.Group();
  group.add(mesh(new RoundedBoxGeometry(0.52, 0.28, 0.38, 4, 0.055), materials.dark));
  group.add(beamBetween([-0.48, 0, 0], [-0.68, 0, 0], 0.075, materials.titanium));
  group.add(beamBetween([0.48, 0, 0], [0.68, 0, 0], 0.075, materials.titanium));
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.38, 16), materials.carbon, [0, 0.31, 0]));
  group.add(mesh(new RoundedBoxGeometry(0.28, 0.09, 0.26, 3, 0.025), materials.titanium, [0, 0.55, 0]));
  group.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), materials.orange, [0.18, 0.5, 0.08]));
  return group;
}

export function createDrone() {
  const group = new THREE.Group();
  group.name = 'OptiSpray aircraft';
  const materials = createMaterials();
  const core = new THREE.Group();
  group.add(core);
  createBody(core, materials);
  createLandingGear(core, materials);

  const rotors = [];
  const rotorRadiusX = 2.05;
  const rotorRadiusZ = 1.55;
  let rotorIndex = 0;
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      const x = xSide * rotorRadiusX;
      const z = zSide * rotorRadiusZ;
      core.add(beamBetween([xSide * 0.8, 0.08, zSide * 0.45], [x, 0.16, z], 0.09, materials.carbon));
      core.add(beamBetween([xSide * 0.95, -0.12, zSide * 0.42], [x * 0.82, 0.08, z * 0.82], 0.035, materials.titanium));
      const { assembly, rotor } = makeRotor(materials, x, z, rotorIndex);
      core.add(assembly);
      rotors.push(rotor);
      rotorIndex += 1;
    }
  }

  const sensor = createWindSensor(materials);
  const control = createControlModule(materials, false);
  const dataInterface = createControlModule(materials, true);
  const tank = createTank(materials);
  const boom = createBoom(materials);
  const nozzle = createNozzles(materials);
  const climate = createClimateSensor(materials);
  const light = createLightSensor(materials);
  const position = createGpsReceiver(materials);
  const pump = createPump(materials);
  const flow = createFlowSensor(materials);
  const pressure = createPressureSensor(materials);
  const valve = createValve(materials);
  const parts = { sensor: sensor.group, control, boom, nozzle, tank, interface: dataInterface, climate, light, position, pump, flow, pressure, valve };

  const bases = {
    sensor: [0, 0.56, 0], control: [1.18, 0.02, 0.08], interface: [-1.18, 0.02, 0.08],
    tank: [0, -0.74, 0], boom: [0, -1.25, 0.12], nozzle: [0, -1.43, 0.12],
    climate: [-0.72, 0.58, 0.08], light: [0.72, 0.58, 0.08], position: [0, 0.58, -0.62],
    pump: [0.56, -0.78, 0.15], flow: [-0.48, -1.03, 0.1], pressure: [0.48, -1.03, 0.1], valve: [1.1, -1.1, 0.12],
  };
  const offsets = {
    sensor: [0, 1.7, 0], control: [1.5, 0.65, 0], interface: [-1.5, 0.65, 0],
    tank: [0, -1.1, 0], boom: [0, 0.25, 1.45], nozzle: [0, -0.55, 1.45],
    climate: [-1.15, 1.05, 0.15], light: [1.15, 1.05, 0.15], position: [0, 1.35, -1.25],
    pump: [1.4, -0.9, 0.55], flow: [-1.5, -0.95, 0.6], pressure: [1.5, -0.95, 0.6], valve: [1.75, -0.45, 0.75],
  };

  for (const id of ['climate', 'light', 'position', 'pump', 'flow', 'pressure', 'valve']) parts[id].visible = false;

  Object.entries(parts).forEach(([id, part]) => {
    part.position.set(...bases[id]);
    part.userData.base = new THREE.Vector3(...bases[id]);
    part.userData.offset = new THREE.Vector3(...offsets[id]);
    part.userData.partId = id;
    group.add(part);
  });

  const linksGeometry = new THREE.BufferGeometry();
  linksGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Object.keys(parts).length * 6), 3));
  const linksMaterial = new THREE.LineBasicMaterial({ color: 0x58e9cd, transparent: true, opacity: 0, depthWrite: false });
  const links = new THREE.LineSegments(linksGeometry, linksMaterial);
  group.add(links);

  mergeStaticChildren(group);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.material = object.material.clone();
    if (object.material.emissive) {
      object.userData.baseEmissive = object.material.emissive.clone();
      object.userData.baseEmissiveIntensity = object.material.emissiveIntensity;
    }
  });

  let selected = null;
  const selectionTint = new THREE.Color(0x35dcb9);
  function setSelected(id) {
    if (selected && parts[selected]) {
      parts[selected].traverse((object) => {
        if (!object.isMesh || !object.material.emissive || !object.userData.baseEmissive) return;
        object.material.emissive.copy(object.userData.baseEmissive);
        object.material.emissiveIntensity = object.userData.baseEmissiveIntensity;
      });
      parts[selected].scale.setScalar(1);
    }
    selected = id;
    if (selected && parts[selected]) {
      parts[selected].traverse((object) => {
        if (!object.isMesh || !object.material.emissive) return;
        object.material.emissive.copy(object.userData.baseEmissive).lerp(selectionTint, 0.08);
        object.material.emissiveIntensity = object.userData.baseEmissiveIntensity;
      });
      parts[selected].scale.setScalar(1.035);
    }
  }

  function setExplode(amount, componentAmounts) {
    const linkPositions = linksGeometry.attributes.position;
    Object.entries(parts).forEach(([id, part], index) => {
      const separation = componentAmounts ? componentAmounts[id] : amount;
      part.position.copy(part.userData.base).addScaledVector(part.userData.offset, separation);
      linkPositions.setXYZ(index * 2, part.userData.base.x, part.userData.base.y, part.userData.base.z);
      linkPositions.setXYZ(index * 2 + 1, part.position.x, part.position.y, part.position.z);
    });
    linkPositions.needsUpdate = true;
    linksMaterial.opacity = (componentAmounts ? Math.max(...Object.values(componentAmounts)) : amount) * 0.34;
  }

  function update(t, phase) {
    rotors.forEach((rotor, index) => {
      rotor.rotation.y = phase * (index % 2 ? -18 : 18) + index * 0.4;
    });
    sensor.spinner.rotation.y = 0;
  }

  return { group, core, parts, rotors, setExplode, setSelected, update };
}
