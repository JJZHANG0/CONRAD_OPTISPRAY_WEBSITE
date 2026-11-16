import * as THREE from 'three';
import { FIELD, sampleTrace, windVector } from './physics.js';
import { routePoint } from './mission.js';
const COLORS=[0xeeac72,0x64ead0,0xb9d5ee];
export function createScientificView(scene) {
  const group=new THREE.Group();scene.add(group);
  const trails=new THREE.Group();group.add(trails);
  const count=21*18, positions=new Float32Array(count*3), colors=new Float32Array(count*3);
  for(let i=0;i<count;i++) new THREE.Color(COLORS[Math.floor(i/18)%3]).toArray(colors,i*3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const points=new THREE.Points(geo,new THREE.PointsMaterial({size:0.045,vertexColors:true,transparent:true,opacity:0.8,depthWrite:false}));points.frustumCulled=false;group.add(points);
  const heatData=new Uint8Array(FIELD.width*FIELD.depth*4);
  const texture=new THREE.DataTexture(heatData,FIELD.width,FIELD.depth,THREE.RGBAFormat);texture.magFilter=THREE.NearestFilter;
  const heat=new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width,FIELD.depth),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0.8,depthWrite:false,side:THREE.DoubleSide}));
  heat.rotation.x=-Math.PI/2;heat.position.set(0,0.6,-2);scene.add(heat);
  const border=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(FIELD.width,FIELD.depth)),new THREE.LineBasicMaterial({color:0x71e5c6,transparent:true,opacity:0.5}));
  border.rotation.x=-Math.PI/2;border.position.copy(heat.position);scene.add(border);
  let result;
  function update(data) {
    result=data;
    while(trails.children.length) {const obj=trails.children[0];obj.geometry.dispose();obj.material.dispose();trails.remove(obj);}
    data.traces.forEach((tr,i)=>{
      const pts=tr.samples.map(s=>new THREE.Vector3(s.x+tr.nozzleX,s.y+0.6,s.z+0.12));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:COLORS[i%3],transparent:true,opacity:0.35}));trails.add(line);
    });
    const max=Math.max(...data.grid,1e-10);
    for(let z=0;z<FIELD.depth;z++) for(let x=0;x<FIELD.width;x++) {
      const mass=data.grid[z*FIELD.width+x], f=Math.sqrt(mass/max), index=((FIELD.depth-1-z)*FIELD.width+x)*4;
      heatData[index]=Math.round(12+f*112);heatData[index+1]=Math.round(40+f*194);heatData[index+2]=Math.round(42+f*157);heatData[index+3]=mass>0?210:40;
    }
    texture.needsUpdate=true;
  }
  function animate(time,origin,opacity,heatOpacity) {
    if(!result)return;
    group.position.set(origin.x,0,origin.z);group.visible=opacity>0.01;
    points.material.opacity=opacity;
    trails.children.forEach(l=>{l.material.opacity=opacity*0.35;});
    result.traces.forEach((tr,i)=>{for(let j=0;j<18;j++){
      const t=((time+j/18*tr.time)%tr.time), p=sampleTrace(tr,t), index=(i*18+j)*3;
      positions[index]=p[0]+tr.nozzleX;positions[index+1]=p[1]+0.6;positions[index+2]=p[2]+0.12;
    }});geo.attributes.position.needsUpdate=true;
    heat.visible=heatOpacity>0.01;border.visible=heat.visible;heat.material.opacity=heatOpacity;border.material.opacity=heatOpacity*0.7;
  }
  return {update,animate};
}
export function paintCharts(result) {
  for(const canvas of document.querySelectorAll('[data-chart]')) {
    canvas.setAttribute('aria-label', canvas.dataset.chart==='trajectory' ? `Simulated height vs downwind displacement. Reference diameter ${result.state.size} micrometers; mass-weighted airtime ${result.flightTime.toFixed(2)} seconds; mean drift ${result.drift.toFixed(2)} meters.` : `Simulated east-west deposition. In-field mass ${result.inside.toFixed(2)} percent; total water dose ${result.doseKg.toFixed(2)} kilograms.`);
    const w=canvas.clientWidth||360,h=canvas.clientHeight||150,ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=w*ratio;canvas.height=h*ratio;const c=canvas.getContext('2d');c.scale(ratio,ratio);c.clearRect(0,0,w,h);
    const left=34,top=12,right=w-12,bottom=h-27;
    c.strokeStyle='#31413d';c.lineWidth=1;
    for(let i=0;i<=3;i++){const y=top+(bottom-top)*i/3;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();}
    c.font='9px monospace';c.fillStyle='#a9bbb4';
    if(canvas.dataset.chart==='trajectory') {
      const dir=windVector(1,result.state.direction), list=result.traces.filter(t=>t.nozzleX===0);
      const maxX=Math.max(1,...list.map(t=>t.landing[0]*dir[0]+t.landing[1]*dir[2]));
      list.forEach((tr,i)=>{c.strokeStyle=['#eeac72','#64ead0','#b9d5ee'][i];c.lineWidth=1.7;c.beginPath();tr.samples.forEach((p,j)=>{const x=left+(p.x*dir[0]+p.z*dir[2])/maxX*(right-left),y=bottom-p.y/result.state.height*(bottom-top);j?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();});
      c.fillText(`${result.state.height.toFixed(1)}m`,0,top+6);c.fillText('0',18,bottom);c.fillText('0',left,bottom+17);c.fillText(`${maxX.toFixed(1)}m downwind`,Math.max(left,right-110),bottom+17);
    } else {
      const sums=Array.from({length:FIELD.width},(_,x)=>result.grid.reduce((s,v,i)=>s+(i%FIELD.width===x?v:0),0));
      const max=Math.max(...sums,1e-9),bw=(right-left)/sums.length;
      sums.forEach((n,i)=>{c.fillStyle='#64ead0';c.fillRect(left+i*bw,bottom-(n/max)*(bottom-top),Math.max(1,bw-2),n/max*(bottom-top));});
      c.fillStyle='#a9bbb4';c.fillText(`${(max*100).toFixed(1)}%`,0,top+5);c.fillText('0',18,bottom);c.fillText('W −18m',left,bottom+17);c.fillText('E +18m',right-49,bottom+17);
    }
  }
}
