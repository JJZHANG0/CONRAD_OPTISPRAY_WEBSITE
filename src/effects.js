import * as THREE from 'three';
import { ROUTES, routePoint } from './mission.js';

export function createWindField(random) {
  const group = new THREE.Group();
  group.name = 'Three dimensional wind field';
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uSpeed: { value: 2.4 },
  };
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aProgress;
      varying float vProgress;
      void main() {
        vProgress = aProgress;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSpeed;
      varying float vProgress;
      void main() {
        float travel = fract(vProgress * 2.0 - uTime * (0.16 + uSpeed * 0.025));
        float pulse = pow(1.0 - travel, 9.0);
        float alpha = (0.075 + pulse * 0.82) * uOpacity;
        vec3 color = mix(vec3(0.12, 0.5, 0.46), vec3(0.4, 1.0, 0.84), pulse);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const lanes = 26;
  const segments = 72;
  for (let lane = 0; lane < lanes; lane += 1) {
    const positions = new Float32Array((segments + 1) * 3);
    const progress = new Float32Array(segments + 1);
    const baseY = 0.9 + (lane % 7) * 0.86 + random() * 0.25;
    const baseZ = -9 + Math.floor(lane / 7) * 5.8 + (random() - 0.5) * 1.4;
    const phase = random() * Math.PI * 2;
    for (let j = 0; j <= segments; j += 1) {
      const p = j / segments;
      const x = (p - 0.5) * 30;
      positions[j * 3] = x;
      positions[j * 3 + 1] = baseY + Math.sin(p * Math.PI * 3 + phase) * 0.24;
      positions[j * 3 + 2] = baseZ + Math.sin(p * Math.PI * 2 + phase) * 0.65;
      progress[j] = p;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
    group.add(new THREE.Line(geometry, lineMaterial));
  }

  const arrowPositions = [];
  const arrowProgress = [];
  for (let i = 0; i < 28; i += 1) {
    const x = (random() - 0.5) * 20;
    const y = 1.5 + random() * 5;
    const z = (random() - 0.5) * 16;
    arrowPositions.push(x, y, z, x + 0.8, y, z, x + 0.8, y, z, x + 0.55, y + 0.13, z, x + 0.8, y, z, x + 0.55, y - 0.13, z);
    for (let j = 0; j < 6; j += 1) arrowProgress.push(random());
  }
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(arrowPositions, 3));
  arrowGeometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(arrowProgress, 1));
  group.add(new THREE.LineSegments(arrowGeometry, lineMaterial));

  const volumeMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main(){
        vec2 p=vUv*5.0+vec2(uTime*0.035,0.0);
        float n=noise(p)+noise(p*2.03)*0.45;
        float contour=1.0-smoothstep(0.025,0.07,abs(fract(n*3.0)-0.5));
        float edge=smoothstep(0.0,0.18,vUv.x)*smoothstep(1.0,0.82,vUv.x)*smoothstep(0.0,0.18,vUv.y)*smoothstep(1.0,0.82,vUv.y);
        gl_FragColor=vec4(0.18,0.72,0.62,contour*edge*uOpacity*0.075);
      }
    `,
  });
  for (let i = 0; i < 4; i += 1) {
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), volumeMaterial);
    layer.rotation.x = -Math.PI / 2;
    layer.position.set(0, 1.4 + i * 1.4, 0);
    group.add(layer);
  }
  return { group, uniforms };
}

export function createFlightPaths() {
  const group = new THREE.Group(), paths = {};
  let active = 'serpentine';
  for (const name of Object.keys(ROUTES)) {
    const points = ROUTES[name].map(p=>new THREE.Vector3(p[0],0.65,p[1]));
    const tube = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xc7f4e6,transparent:true,opacity:0,depthWrite:false}));
    tube.visible=name===active;group.add(tube);paths[name]={tube};
  }
  return {group,paths,setPath(name){if(!paths[name])return;paths[active].tube.visible=false;active=name;paths[active].tube.visible=true;},setOpacity(v){Object.values(paths).forEach(p=>p.tube.material.opacity=v);},getPoint(t){const p=routePoint(active,t);return new THREE.Vector3(p[0],0.65,p[1]);},getTangent(t){const a=routePoint(active,Math.max(0,t-0.001)),b=routePoint(active,Math.min(1,t+0.001));return new THREE.Vector3(b[0]-a[0],0,b[1]-a[1]).normalize();}};
}

export function createAtmosphericMotes(random) {
  const count = 360;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 44;
    positions[i * 3 + 1] = random() * 12;
    positions[i * 3 + 2] = (random() - 0.5) * 44;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x8ed9c2, size: 0.025, transparent: true, opacity: 0.28, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  return points;
}
