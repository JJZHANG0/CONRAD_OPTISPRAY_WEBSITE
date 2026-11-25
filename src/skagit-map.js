import { caseUrl, palette } from './skagit-data.js';

export const routeColors = { boundary: '#f1fff4', spray: '#ff846b', transfer: '#eff5d6' };

export function project(data, east, north) {
  const [x, y, xe, ye, xn, yn] = data.affine;
  return [x + east * xe + north * xn, y + east * ye + north * yn];
}

export function unproject(data, x, y) {
  const [px, py, xe, ye, xn, yn] = data.affine;
  const determinant = xe * yn - xn * ye;
  return [((x - px) * yn - (y - py) * xn) / determinant, ((y - py) * xe - (x - px) * ye) / determinant];
}

export const frameSize = data => data.display.overview_crop_px.slice(2).map(value => value * 3);

export function caseImage() {
  const image = new Image();
  image.src = caseUrl('naip-skagit.png');
  return image.decode().then(() => image);
}

function stroke(ctx, points, color, width, dashes = []) {
  ctx.beginPath();
  for (const [x, y] of points) ctx.lineTo(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dashes);
  ctx.stroke();
}

export function drawMap(canvas, data, image, {
  surface, flight, segments = data.segments, selected, marks = [], edge = [],
} = {}) {
  const [cx, cy, cw, ch] = data.display.overview_crop_px;
  const [width, height] = frameSize(data);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  const toCanvas = (e, n) => {
    const [x, y] = project(data, e, n);
    return [(x - cx) / cw * width, (y - cy) / ch * height];
  };
  if (surface) ctx.drawImage(surface, 0, 0);
  else ctx.drawImage(image, cx, cy, cw, ch, 0, 0, width, height);
  const ring = data.field.map(p => toCanvas(...p));
  ctx.save();
  stroke(ctx, [...ring, ring[0]], '#102219', 6);
  stroke(ctx, [...ring, ring[0]], routeColors.boundary, 3);
  ctx.restore();
  for (const [a, b] of edge) stroke(ctx, [toCanvas(...a), toCanvas(...b)], '#ffbe77', 6);
  for (const s of segments) {
    const a = toCanvas(...s.start_enu_m);
    const b = toCanvas(...s.end_enu_m);
    const active = selected === s.source_segment_number;
    if (active) stroke(ctx, [a, b], '#0c1f17', 10);
    stroke(ctx, [a, b], s.spray ? routeColors.spray : routeColors.transfer, active ? 6 : 3,
      s.spray ? [] : [8, 6]);
    if (active) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(...a, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#f4fff8';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(...b, 6, 0, 2 * Math.PI);
      ctx.strokeStyle = '#f4fff8';
      ctx.lineWidth = 2;
      ctx.stroke();
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const length = Math.hypot(dx, dy);
      if (length > 12) {
        const arrow = Math.min(9, length * .2);
        ctx.save();
        ctx.translate(a[0] + dx * .5, a[1] + dy * .5);
        ctx.rotate(Math.atan2(dy, dx));
        stroke(ctx, [[-arrow, -arrow], [0, 0], [-arrow, arrow]], '#f4fff8', 4);
        ctx.restore();
      }
    }
  }
  for (const { point, offset: [dx, dy], label } of marks) {
    const target = toCanvas(...point);
    const [x, y] = [target[0] + dx, target[1] + dy];
    stroke(ctx, [target, [x, y]], '#0b1714', 7);
    stroke(ctx, [target, [x, y]], '#e3fff2', 3);
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#0c231b';
    ctx.fill();
    ctx.strokeStyle = '#d0fff0';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e3fff2';
    ctx.fillText(label, x, y);
  }
  if (flight) {
    const [east, north] = flight.position;
    const origin = toCanvas(east, north);
    const ahead = toCanvas(east + Math.sin(flight.yaw), north + Math.cos(flight.yaw));
    ctx.save();
    ctx.translate(...origin);
    ctx.rotate(Math.atan2(ahead[0] - origin[0], origin[1] - ahead[1]));
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.setLineDash([]);
    ctx.fillStyle = '#adffe8';
    ctx.strokeStyle = '#0c211b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

export function createHeatCanvas(data, raster, aerial) {
  const canvas = document.createElement('canvas');
  const surface = document.createElement('canvas');
  [canvas.width, canvas.height] = [surface.width, surface.height] = frameSize(data);
  const ctx = canvas.getContext('2d');
  const surfaceContext = surface.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  const [cx, cy, cw, ch] = data.display.overview_crop_px;
  const { cell, east, north, nx, ny } = raster;
  const pixelCount = canvas.width * canvas.height;
  const indices = new Int32Array(pixelCount).fill(-1);
  const blendX = new Float32Array(pixelCount);
  const blendY = new Float32Array(pixelCount);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const [e, n] = unproject(data, cx + (x + .5) / canvas.width * cw, cy + (y + .5) / canvas.height * ch);
      const gx = (e - east[0]) / cell - .5;
      const gy = (n - north[0]) / cell - .5;
      if (gx < 0 || gy < 0 || gx >= nx - 1 || gy >= ny - 1) continue;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const index = y * canvas.width + x;
      indices[index] = iy * nx + ix;
      blendX[index] = gx - ix;
      blendY[index] = gy - iy;
    }
  }
  const colors = Array.from({ length: 256 }, (_, index) => {
    const p = index / 255 * (palette.length - 1);
    const i = Math.min(Math.floor(p), palette.length - 2);
    return palette[i].map((c, channel) => Math.round(c + (palette[i + 1][channel] - c) * (p - i)));
  });

  function paint(values, max) {
    for (let i = 0; i < pixelCount; i++) {
      const index = indices[i];
      const q = i * 4;
      if (index < 0) continue;
      const tx = blendX[i];
      const ty = blendY[i];
      const a = values[index] * (1 - tx) + values[index + 1] * tx;
      const b = values[index + nx] * (1 - tx) + values[index + nx + 1] * tx;
      const value = a * (1 - ty) + b * ty;
      if (value <= 0) { image.data[q + 3] = 0; continue; }
      const color = colors[Math.min(255, Math.round(value / max * 255))];
      image.data[q] = color[0];
      image.data[q + 1] = color[1];
      image.data[q + 2] = color[2];
      image.data[q + 3] = Math.round(220 * Math.sqrt(Math.min(1, value / (max * .03))));
    }
    ctx.putImageData(image, 0, 0);
    surfaceContext.drawImage(aerial, cx, cy, cw, ch, 0, 0, surface.width, surface.height);
    surfaceContext.drawImage(canvas, 0, 0);
  }

  return { canvas, surface, paint };
}
