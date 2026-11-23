import * as THREE from 'three';
import { FIELD, sampleTrace } from './physics.js';
const COLORS=[0xeeac72,0x64ead0,0xb9d5ee];
const DEPOSIT_COLORS=[[18,59,222],[8,127,206],[51,191,209],[255,227,107],[255,191,0]];
const PARTICLES_PER_PATH=18;
export function createScientificView(scene) {
  const group=new THREE.Group();scene.add(group);
  const trails=new THREE.Group();group.add(trails);
  const count=21*PARTICLES_PER_PATH, positions=new Float32Array(count*3), colors=new Float32Array(count*3);
  for(let i=0;i<count;i++) new THREE.Color(COLORS[Math.floor(i/PARTICLES_PER_PATH)%3]).toArray(colors,i*3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const points=new THREE.Points(geo,new THREE.PointsMaterial({size:0.075,vertexColors:true,transparent:true,opacity:0.8,depthWrite:false,sizeAttenuation:true}));points.frustumCulled=false;group.add(points);
  const heatData=new Uint8Array(FIELD.width*FIELD.depth*4);
  const texture=new THREE.DataTexture(heatData,FIELD.width,FIELD.depth,THREE.RGBAFormat);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.colorSpace=THREE.SRGBColorSpace;
  const heat=new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width,FIELD.depth),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0.76,depthWrite:false,side:THREE.DoubleSide}));
  heat.rotation.x=-Math.PI/2;heat.position.set(0,0.014,-2);scene.add(heat);
  const border=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(FIELD.width,FIELD.depth)),new THREE.LineBasicMaterial({color:0x71e5c6,transparent:true,opacity:0.5}));
  border.rotation.x=-Math.PI/2;border.position.copy(heat.position);scene.add(border);
  let result;
  function update(data) {
    result=data;
    while(trails.children.length) {const obj=trails.children[0];obj.geometry.dispose();obj.material.dispose();trails.remove(obj);}
    data.traces.forEach((tr,i)=>{
      const pts=tr.samples.map(s=>new THREE.Vector3(s.x+tr.nozzleX,s.y-data.state.height,s.z+0.12));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:COLORS[i%3],transparent:true,opacity:0.35}));trails.add(line);
    });
    const max=Math.max(...data.grid,1e-10);
    for(let z=0;z<FIELD.depth;z++) for(let x=0;x<FIELD.width;x++) {
      const mass=data.grid[z*FIELD.width+x], f=Math.sqrt(mass/max), index=((FIELD.depth-1-z)*FIELD.width+x)*4;
      const scaled=f*(DEPOSIT_COLORS.length-1), colorIndex=Math.min(Math.floor(scaled),DEPOSIT_COLORS.length-2), blend=scaled-colorIndex;
      for(let channel=0;channel<3;channel++) heatData[index+channel]=Math.round(DEPOSIT_COLORS[colorIndex][channel]+(DEPOSIT_COLORS[colorIndex+1][channel]-DEPOSIT_COLORS[colorIndex][channel])*blend);
      heatData[index+3]=mass>0?Math.round(55+f*130):0;
    }
    texture.needsUpdate=true;
  }
  function animate(time,origin,opacity,heatOpacity) {
    if(!result)return;
    group.position.set(origin.x,origin.y-2.24,origin.z);group.visible=opacity>0.01;
    points.material.opacity=opacity;
    trails.children.forEach(l=>{l.material.opacity=opacity*0.35;});
    result.traces.forEach((tr,i)=>{for(let j=0;j<PARTICLES_PER_PATH;j++){
      const t=((time+j/PARTICLES_PER_PATH*(tr.time+0.16))%(tr.time+0.16));
      const index=(i*PARTICLES_PER_PATH+j)*3;
      if(t>tr.time){positions[index]=0;positions[index+1]=-1000;positions[index+2]=0;continue;}
      const p=sampleTrace(tr,t);
      positions[index]=p[0]+tr.nozzleX;positions[index+1]=p[1]-result.state.height;positions[index+2]=p[2]+0.12;
    }});geo.attributes.position.needsUpdate=true;
    heat.visible=heatOpacity>0.01;border.visible=heat.visible;heat.material.opacity=heatOpacity;border.material.opacity=heatOpacity*0.7;
  }
  return {update,animate};
}
function plot(canvas) {
  const width = canvas.clientWidth || 360;
  const height = canvas.clientHeight || 150;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const bufferWidth = Math.round(width * ratio);
  const bufferHeight = Math.round(height * ratio);
  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#b3c5bd';
  return { ctx, width, height };
}

function horizontalLines(ctx, left, right, top, bottom) {
  ctx.strokeStyle = '#314a40';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = top + (bottom - top) * i / 3;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
}

export function paintTrajectory(canvas, path, point) {
  const { ctx, width, height } = plot(canvas);
  const left = 35;
  const right = width - 13;
  const top = 25;
  const bottom = height - 39;
  const [release] = path;
  const offsets = path.map(p => p[1] - release[1]);
  const min = Math.min(0, Math.floor(Math.min(...offsets)));
  const max = Math.max(5, Math.ceil(Math.max(...offsets) / 5) * 5);
  const altitude = release[3];
  const px = e => left + (e - min) / (max - min) * (right - left);
  const py = h => bottom - h / altitude * (bottom - top);
  horizontalLines(ctx, left, right, top, bottom);
  ctx.fillText('HEIGHT (m)', left, 11);
  for (let i = 0; i <= 3; i++) ctx.fillText(String(i), 14, py(i) + 3);
  ctx.textAlign = 'center';
  for (let i = 0; i <= max; i += 5) ctx.fillText(String(i), px(i), bottom + 14);
  ctx.fillText('DOWNWIND TRAVEL (m)', (left + right) / 2, height - 6);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#66efd2';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const p of path) ctx.lineTo(px(p[1] - release[1]), py(p[3]));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(point[1] - release[1]), py(point[3]), 4, 0, Math.PI * 2);
  ctx.fillStyle = '#e5fff5';
  ctx.fill();
  canvas.setAttribute('aria-label', `Predicted path of a ${release[4].toFixed(1)} micrometer drop. Height in meters versus eastward downwind travel in meters.`);
}

export function paintCharts(result) {
  const canvas = document.querySelector('[data-chart="deposition"]');
  if (!canvas || !result) return;
  canvas.setAttribute('aria-label', `Simulated east-west deposition. In-field mass ${result.inside.toFixed(2)} percent. Total water dose ${result.doseKg.toFixed(2)} kilograms.`);
  const { ctx, width, height } = plot(canvas);
  const left = 34;
  const right = width - 12;
  const bottom = height - 27;
  horizontalLines(ctx, left, right, 12, bottom);
  const sums = Array.from({ length: FIELD.width }, (_, x) => result.grid.reduce((sum, value, i) => sum + (i % FIELD.width === x ? value : 0), 0));
  const max = Math.max(...sums, 1e-9);
  const bar = (right - left) / sums.length;
  ctx.fillStyle = '#64ead0';
  sums.forEach((n, i) => ctx.fillRect(left + i * bar, bottom - n / max * (bottom - 12), Math.max(1, bar - 2), n / max * (bottom - 12)));
  ctx.fillStyle = '#a9bbb4';
  ctx.fillText(`${(max * 100).toFixed(1)}%`, 0, 17);
  ctx.fillText('0', 18, bottom);
  ctx.fillText('W −18m', left, bottom + 17);
  ctx.fillText('E +18m', right - 49, bottom + 17);
}
