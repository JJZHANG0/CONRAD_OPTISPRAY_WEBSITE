// Existing flight route geometry, shared by the replay and deposition sampling.
export const ROUTES = {
  single: [[-14,-7],[-5,-5],[5,-3],[14,-1]],
  perimeter: [[-14,-12],[14,-12],[14,9],[-14,9],[-14,-12]],
  serpentine: [[-14,-11],[12,-11],[13,-6],[-12,-6],[-13,-1],[12,-1],[13,4],[-12,4],[-13,9],[12,9]],
};
export function routeLength(name) {
  const p = ROUTES[name] || ROUTES.serpentine;
  return p.slice(1).reduce((s,v,i)=>s+Math.hypot(v[0]-p[i][0],v[1]-p[i][1]),0);
}
export function routePoint(name, t) {
  const p = ROUTES[name] || ROUTES.serpentine;
  let distance = Math.max(0,Math.min(1,t))*routeLength(name);
  for(let i=1;i<p.length;i++) {
    const dx=p[i][0]-p[i-1][0], dz=p[i][1]-p[i-1][1], len=Math.hypot(dx,dz);
    if(distance<=len || i===p.length-1) return [p[i-1][0]+dx*distance/len,p[i-1][1]+dz*distance/len];
    distance-=len;
  }
}
