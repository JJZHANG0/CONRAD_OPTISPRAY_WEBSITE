import * as THREE from 'three';

function makeFieldTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#15231b';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let row = 0; row < 16; row += 1) {
    const x = row * 64;
    const gradient = ctx.createLinearGradient(x, 0, x + 64, 0);
    gradient.addColorStop(0, '#101b15');
    gradient.addColorStop(0.25, '#263d29');
    gradient.addColorStop(0.5, '#355035');
    gradient.addColorStop(0.75, '#203523');
    gradient.addColorStop(1, '#101b15');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 64, 1024);
    ctx.fillStyle = 'rgba(7, 13, 10, 0.5)';
    ctx.fillRect(x + 53, 0, 11, 1024);
  }

  for (let i = 0; i < 13000; i += 1) {
    const x = random() * 1024;
    const y = random() * 1024;
    const light = Math.floor(35 + random() * 55);
    ctx.fillStyle = `rgba(${light * 0.55}, ${light}, ${light * 0.62}, ${0.15 + random() * 0.35})`;
    ctx.fillRect(x, y, 1 + random() * 3, 2 + random() * 7);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCropGeometry() {
  const positions = [];
  const bladeCount = 4;
  for (let i = 0; i < bladeCount; i += 1) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const px = -dz;
    const pz = dx;
    const point = (radial, y, side) => [dx * radial + px * side, y, dz * radial + pz * side];
    const baseL = point(0, 0, -0.055);
    const baseR = point(0, 0, 0.055);
    const midL = point(0.09, 0.22, -0.085);
    const midR = point(0.09, 0.22, 0.085);
    const tip = point(0.25, 0.5 + (i % 2) * 0.07, 0);
    positions.push(...baseL, ...baseR, ...midR, ...baseL, ...midR, ...midL, ...midL, ...midR, ...tip);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createEnvironment(scene, random) {
  const group = new THREE.Group();
  group.name = 'Agricultural digital twin';
  scene.add(group);

  const fieldTexture = makeFieldTexture(random);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c735d,
    map: fieldTexture,
    bumpMap: fieldTexture,
    bumpScale: 0.1,
    roughness: 0.98,
    metalness: 0.02,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const cropCountX = 45;
  const cropCountZ = 61;
  const cropCount = cropCountX * cropCountZ;
  const cropMaterial = new THREE.MeshStandardMaterial({ color: 0x577a4e, roughness: 0.9, side: THREE.DoubleSide });
  const crops = new THREE.InstancedMesh(createCropGeometry(), cropMaterial, cropCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (let ix = 0; ix < cropCountX; ix += 1) {
    for (let iz = 0; iz < cropCountZ; iz += 1) {
      const x = (ix - (cropCountX - 1) / 2) * 1.25;
      const z = (iz - (cropCountZ - 1) / 2) * 1.35 - 7;
      const scale = 0.72 + random() * 0.5;
      dummy.position.set(x + (random() - 0.5) * 0.14, 0.03, z + (random() - 0.5) * 0.18);
      dummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.08);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      crops.setMatrixAt(index, dummy.matrix);
      color.setHSL(0.28 + random() * 0.035, 0.25 + random() * 0.18, 0.24 + random() * 0.1);
      crops.setColorAt(index, color);
      index += 1;
    }
  }
  crops.castShadow = true;
  crops.receiveShadow = true;
  group.add(crops);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(5, 180), new THREE.MeshStandardMaterial({ color: 0x24271f, roughness: 1 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(-32, 0.018, -10);
  road.receiveShadow = true;
  group.add(road);

  const treeGeometry = new THREE.ConeGeometry(1.2, 4.5, 7);
  const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x172b21, roughness: 1 });
  const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, 150);
  for (let i = 0; i < 150; i += 1) {
    const scale = 0.65 + random() * 1.35;
    dummy.position.set((i - 75) * 1.65 + (random() - 0.5) * 2, 2.1 * scale, -64 - random() * 12);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
  }
  trees.castShadow = true;
  group.add(trees);

  const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x17241f, roughness: 1 });
  for (let i = 0; i < 7; i += 1) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hillMaterial);
    const scale = 15 + random() * 20;
    hill.scale.set(scale, 4 + random() * 6, 12 + random() * 14);
    hill.position.set((i - 3) * 32, -2, -100 - random() * 35);
    group.add(hill);
  }

  const fieldBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(58, 0.04, 84)),
    new THREE.LineBasicMaterial({ color: 0x7de6c9, transparent: true, opacity: 0.09 }),
  );
  fieldBorder.position.set(0, 0.08, -7);
  group.add(fieldBorder);

  return { group, ground, crops, trees, fieldTexture };
}
