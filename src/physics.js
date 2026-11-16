import { routePoint, routeLength } from './mission.js';
// Browser teaching model, NOT the team's calibrated 12,000-droplet research engine.
// Standard spherical-particle drag: OpenFOAM SchillerNaumannDragForce v13.
// All units SI. X east, Y up, Z south. Direction specifies travel TOWARD.
export const CONSTANTS = Object.freeze({g:9.81, rhoAir:1.225, rhoWater:1000, mu:1.81e-5, initialSpeed:2, coneHalfAngle:20, speed:3, dt:0.005});
export const FIELD = Object.freeze({width:36, depth:28, minX:-18, minZ:-16, cell:1});
export const DEFAULTS = Object.freeze({wind:2.4,height:3,flow:1.8,size:220,direction:90,path:'serpentine',offset:0});
export function windVector(speed, degrees) { const r=degrees*Math.PI/180; return [speed*Math.sin(r),0,-speed*Math.cos(r)]; }
export function dragRate(d, relativeSpeed) {
  const re=CONSTANTS.rhoAir*d*relativeSpeed/CONSTANTS.mu;
  const cdRe=re<1000 ? 24*(1+0.15*Math.pow(re,0.687)) : 0.44*re;
  return 0.75*CONSTANTS.mu*cdRe/(CONSTANTS.rhoWater*d*d);
}
export function traceDroplet({height,wind,direction}, diameter, angle=0, dt=CONSTANTS.dt) {
  const d=diameter*1e-6, air=windVector(wind,direction), rad=angle*Math.PI/180;
  let p=[0,height,0], v=[CONSTANTS.initialSpeed*Math.sin(rad),-CONSTANTS.initialSpeed*Math.cos(rad),0], time=0;
  const samples=[{t:0,x:0,y:height,z:0}];
  const acceleration=(velocity)=> {
    const rel=air.map((u,i)=>u-velocity[i]);
    const k=dragRate(d,Math.hypot(...rel));
    return rel.map((u,i)=>k*u-(i===1?CONSTANTS.g*(1-CONSTANTS.rhoAir/CONSTANTS.rhoWater):0));
  };
  let steps=0;
  while(p[1]>0 && time<120) {
    const a=acceleration(v), midV=v.map((n,i)=>n+a[i]*dt/2), midA=acceleration(midV);
    const nextP=p.map((n,i)=>n+midV[i]*dt), nextV=v.map((n,i)=>n+midA[i]*dt);
    if(nextP[1]<=0) {
      const f=p[1]/(p[1]-nextP[1]);
      p=p.map((n,i)=>n+(nextP[i]-n)*f);p[1]=0;time+=dt*f;
      samples.push({t:time,x:p[0],y:0,z:p[2]});break;
    }
    p=nextP;v=nextV;time+=dt;
    if(++steps%6===0) samples.push({t:time,x:p[0],y:p[1],z:p[2]});
  }
  return {diameter,mass:Math.PI/6*CONSTANTS.rhoWater*d**3,time,samples,landing:[p[0],p[2]],settled:p[1]===0};
}
export function simulate(input) {
  const state={...DEFAULTS,...input};
  for(const [key,min,max] of [['wind',0,8],['height',1.5,6],['flow',0.8,3],['size',100,400],['direction',0,360],['offset',0,80]]) {
    if(!Number.isFinite(state[key]) || state[key]<min || state[key]>max) throw new RangeError(`Invalid ${key}`);
  }
  const traces=[];
  for(let nozzle=0;nozzle<7;nozzle++) for(const factor of [0.7,1,1.3]) {
    const tr=traceDroplet(state,state.size*factor,(nozzle-3)/3*CONSTANTS.coneHalfAngle);
    tr.nozzleX=(nozzle-3)*1.05;tr.factor=factor;traces.push(tr);
  }
  const total=traces.reduce((s,t)=>s+t.mass,0), dir=windVector(1,state.direction);
  const drift=traces.reduce((s,t)=>s+t.mass*(t.landing[0]*dir[0]+t.landing[1]*dir[2]),0)/total;
  const flightTime=traces.reduce((s,t)=>s+t.mass*t.time,0)/total;
  const grid=new Float64Array(FIELD.width*FIELD.depth);
  let outside=0,outsideCount=0;
  const releases=160;
  const doseKg=state.flow/60*(routeLength(state.path)/CONSTANTS.speed); // water density approx. 1 kg/L
  for(let i=0;i<releases;i++) {
    const origin=routePoint(state.path,(i+0.5)/releases);
    for(const tr of traces) {
      const x=origin[0]+tr.nozzleX+tr.landing[0]-state.offset*dir[0];
      const z=origin[1]+0.12+tr.landing[1]-state.offset*dir[2];
      const ix=Math.floor(x-FIELD.minX), iz=Math.floor(z-FIELD.minZ);
      const w=tr.mass/total/releases;
      if(ix<0 || ix>=FIELD.width || iz<0 || iz>=FIELD.depth) { outside+=w;outsideCount++; }
      else grid[iz*FIELD.width+ix]+=w;
    }
  }
  const inside=grid.reduce((s,v)=>s+v,0), mean=inside/grid.length;
  const variance=grid.reduce((s,v)=>s+(v-mean)**2,0)/grid.length;
  const cv=mean>0?Math.sqrt(variance)/mean*100:null;
  return {state,traces,grid,drift,flightTime,doseKg,inside:inside*100,outside:outside*100,outsideCount:outsideCount/(releases*traces.length)*100,cv,occupied:grid.filter(x=>x>0).length/grid.length*100,balance:inside+outside,sampleCount:releases*traces.length};
}
export function sampleTrace(trace,t) {
  const arr=trace.samples;let lo=0,hi=arr.length-1;
  while(hi-lo>1){const mid=(hi+lo)>>1;if(arr[mid].t<t)lo=mid;else hi=mid;}
  const a=arr[lo],b=arr[hi],f=Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t||1)));
  return [a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,a.z+(b.z-a.z)*f];
}
