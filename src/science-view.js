import * as THREE from 'three';
import { sampleTrace } from './physics.js';
import { LAB_FIELD } from './lab-physics.js';
const COLORS=[0xeeac72,0x64ead0,0xb9d5ee];
const DEPOSIT_COLORS=[[18,59,222],[8,127,206],[51,191,209],[255,227,107],[255,191,0]];
const DEPOSITION_MAX_G_M2=15;
const DISPLAY_CELL_M=0.3;
const DISPLAY_SIGMA_M=0.45;
const DISPLAY_SUPPORT_SIGMA=3;
const PARTICLES_PER_PATH=18;

function createLandingRaster(samples) {
  const width=Math.ceil(LAB_FIELD.width/DISPLAY_CELL_M);
  const depth=Math.ceil(LAB_FIELD.depth/DISPLAY_CELL_M);
  const cellArea=DISPLAY_CELL_M*DISPLAY_CELL_M;
  const radius=Math.ceil(DISPLAY_SUPPORT_SIGMA*DISPLAY_SIGMA_M/DISPLAY_CELL_M);
  const kernel=Array.from({length:radius*2+1},(_,index)=>Math.exp(-.5*(((index-radius)*DISPLAY_CELL_M)/DISPLAY_SIGMA_M)**2));
  const events=[...samples].sort((a,b)=>a.time-b.time);
  const grid=new Float32Array(width*depth);
  let cursor=0;

  function axis(index,limit) {
    const start=Math.max(index-radius,0),end=Math.min(index+radius,limit-1);
    let total=0;
    for(let i=start;i<=end;i++) total+=kernel[i-index+radius];
    return {start,weights:Array.from({length:end-start+1},(_,i)=>kernel[start+i-index+radius]/total)};
  }

  function seek(time) {
    let changed=false;
    if(cursor&&events[cursor-1].time>time) {grid.fill(0);cursor=0;changed=true;}
    while(cursor<events.length&&events[cursor].time<=time) {
      const event=events[cursor++];
      const x=Math.floor((event.east-LAB_FIELD.minX)/DISPLAY_CELL_M);
      const south=-event.north;
      const z=Math.floor((south-LAB_FIELD.minZ)/DISPLAY_CELL_M);
      if(x<0||x>=width||z<0||z>=depth) continue;
      const wx=axis(x,width),wz=axis(z,depth);
      const kgPerSquareMetre=(event.waterMass+event.tracerMass)/cellArea;
      for(let zi=0;zi<wz.weights.length;zi++) for(let xi=0;xi<wx.weights.length;xi++) {
        grid[(wz.start+zi)*width+wx.start+xi]+=kgPerSquareMetre*wz.weights[zi]*wx.weights[xi];
      }
      changed=true;
    }
    return changed;
  }
  return {grid,width,depth,seek};
}
export function createScientificView(scene) {
  const group=new THREE.Group();scene.add(group);
  const trails=new THREE.Group();group.add(trails);
  const count=21*PARTICLES_PER_PATH, positions=new Float32Array(count*3), colors=new Float32Array(count*3);
  for(let i=0;i<count;i++) new THREE.Color(COLORS[Math.floor(i/PARTICLES_PER_PATH)%3]).toArray(colors,i*3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const points=new THREE.Points(geo,new THREE.PointsMaterial({size:0.075,vertexColors:true,transparent:true,opacity:0.8,depthWrite:false,sizeAttenuation:true}));points.frustumCulled=false;group.add(points);
  const displayWidth=Math.ceil(LAB_FIELD.width/DISPLAY_CELL_M),displayDepth=Math.ceil(LAB_FIELD.depth/DISPLAY_CELL_M);
  const heatData=new Uint8Array(displayWidth*displayDepth*4);
  const texture=new THREE.DataTexture(heatData,displayWidth,displayDepth,THREE.RGBAFormat);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.colorSpace=THREE.SRGBColorSpace;
  const heat=new THREE.Mesh(new THREE.PlaneGeometry(LAB_FIELD.width,LAB_FIELD.depth),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0.76,depthWrite:false,side:THREE.DoubleSide}));
  heat.rotation.x=-Math.PI/2;heat.position.set(0,0.014,-2);scene.add(heat);
  const border=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(LAB_FIELD.width,LAB_FIELD.depth)),new THREE.LineBasicMaterial({color:0x71e5c6,transparent:true,opacity:0.5}));
  border.rotation.x=-Math.PI/2;border.position.copy(heat.position);scene.add(border);
  let result,raster,traceLines=[];
  function paintDeposit() {
    if(!raster)return;
    for(let z=0;z<displayDepth;z++) for(let x=0;x<displayWidth;x++) {
      const mass=raster.grid[z*displayWidth+x],grams=mass*1000,index=((displayDepth-1-z)*displayWidth+x)*4;
      if(grams<=0) {heatData[index+3]=0;continue;}
      const scaled=Math.min(1,grams/DEPOSITION_MAX_G_M2)*(DEPOSIT_COLORS.length-1);
      const colorIndex=Math.min(Math.floor(scaled),DEPOSIT_COLORS.length-2),blend=scaled-colorIndex;
      for(let channel=0;channel<3;channel++) heatData[index+channel]=Math.round(DEPOSIT_COLORS[colorIndex][channel]+(DEPOSIT_COLORS[colorIndex+1][channel]-DEPOSIT_COLORS[colorIndex][channel])*blend);
      heatData[index+3]=Math.round(220*Math.sqrt(Math.min(1,grams/(DEPOSITION_MAX_G_M2*0.03))));
    }
    texture.needsUpdate=true;
  }
  function update(data) {
    if(data===result)return;
    result=data;
    while(trails.children.length) {const obj=trails.children[0];obj.geometry.dispose();obj.material.dispose();trails.remove(obj);}
    traceLines=data.traces.map((tr,i)=>{
      const pts=tr.samples.map(s=>new THREE.Vector3(tr.releaseEast+s.x+tr.nozzleX,s.y-data.state.height,tr.releaseSouth+s.z+0.12));
      const geometry=new THREE.BufferGeometry().setFromPoints(pts);geometry.setDrawRange(0,0);
      const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:COLORS[i%3],transparent:true,opacity:0.35}));trails.add(line);
      return line;
    });
    raster=createLandingRaster(data.landingSamples||[]);
    raster.seek(0);
    paintDeposit();
  }
  function animate(time,origin,opacity,heatOpacity,modelTime=0) {
    if(!result)return;
    group.position.set(0,result.state.height,0);group.visible=opacity>0.01;
    points.material.opacity=opacity;
    result.traces.forEach((tr,i)=>{
      const age=modelTime-tr.releaseTime;
      const visibleIndex=age<0?-1:tr.samples.findIndex(sample=>sample.t>age);
      const visibleCount=age<0?0:visibleIndex<0?tr.samples.length:visibleIndex;
      traceLines[i].geometry.setDrawRange(0,visibleCount);
      traceLines[i].material.opacity=opacity*0.35;
      const emissionSpan=Math.min(1.25,Math.max(0.3,tr.time*0.35));
      for(let j=0;j<PARTICLES_PER_PATH;j++){
      const releaseTime=tr.releaseTime+j/(PARTICLES_PER_PATH-1)*emissionSpan;
      const t=modelTime-releaseTime;
      const index=(i*PARTICLES_PER_PATH+j)*3;
      if(t>tr.time){positions[index]=0;positions[index+1]=-1000;positions[index+2]=0;continue;}
      if(t<0){positions[index]=0;positions[index+1]=-1000;positions[index+2]=0;continue;}
      const p=sampleTrace(tr,t);
      positions[index]=tr.releaseEast+p[0]+tr.nozzleX;positions[index+1]=p[1]-result.state.height;positions[index+2]=tr.releaseSouth+p[2]+0.12;
    }});geo.attributes.position.needsUpdate=true;
    if(raster.seek(modelTime))paintDeposit();
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
  canvas.setAttribute('aria-label', `Relative in-field wet mass by east-west position. The deposition map uses a fixed 0 to 15 grams per square meter scale. In-field wet mass ${result.inside.toFixed(2)} percent. Water dose ${result.doseKg.toFixed(2)} kilograms.`);
  const { ctx, width, height } = plot(canvas);
  const left = 34;
  const right = width - 12;
  const bottom = height - 27;
  horizontalLines(ctx, left, right, 12, bottom);
  const sums = new Array(LAB_FIELD.width).fill(0);
  for (let z=0;z<LAB_FIELD.depth;z++) for (let x=0;x<LAB_FIELD.width;x++) sums[x]+=result.grid[z*LAB_FIELD.width+x];
  const total=sums.reduce((sum,value)=>sum+value,0);
  const shares=sums.map(value=>total>0?value/total:0);
  const maxShare=Math.max(...shares,1e-9);
  const bar = (right - left) / shares.length;
  ctx.fillStyle = '#64ead0';
  shares.forEach((value, i) => {
    const h=value/maxShare*(bottom-12);
    ctx.fillRect(left+i*bar,bottom-h,Math.max(1,bar-2),h);
  });
  ctx.fillStyle = '#a9bbb4';
  ctx.fillText(`${(maxShare*100).toFixed(1)}%`, 0, 17);
  ctx.fillText('0', 18, bottom);
  ctx.fillText('W −18m', left, bottom + 17);
  ctx.fillText('E +18m', right - 49, bottom + 17);
}
