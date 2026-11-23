export const caseUrl = name => `${import.meta.env.BASE_URL}skagit/${name}`;
let caseRequest;
export function loadCase() {
  caseRequest ??= loadJson('case.json').catch(error => { caseRequest = undefined; throw error; });
  return caseRequest;
}

export async function loadJson(name) {
  const response = await fetch(caseUrl(name));
  if (!response.ok) throw new Error(`Field data: ${response.status} (${name})`);
  if (!name.endsWith('.bin')) return response.json();
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}

export function metricValues(metrics) {
  return [
    `${(metrics.water_evaporated_fraction * 100).toFixed(1)}%`,
    `${(metrics.inside_fraction_of_sprayed_nonvolatile * 100).toFixed(2)}%`,
    `${(metrics.outside_fraction_of_sprayed_nonvolatile * 100).toFixed(2)}%`,
    `${metrics.drift_p95_m.toFixed(1)} m`,
  ];
}

export const metricDefinition = 'Water loss is a share of released water. In-field and off-field tracer use all released tracer as the denominator. Drift P95 is the 95th-percentile horizontal release-to-landing distance, weighted by landed tracer mass.';

const lerp = (a, b, fraction) => a + (b - a) * fraction;
const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => value * value * (3 - 2 * value);
const heading = s => Math.atan2(s.end_enu_m[0] - s.start_enu_m[0], s.end_enu_m[1] - s.start_enu_m[1]);

function turnHeading(from, to, fraction) {
  const angle = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + angle * smooth(clamp(fraction));
}

export function flightAt(data, time) {
  const { segments, routeEnd } = data;
  const i = time < routeEnd
    ? segments.findIndex(s => time < s.start_time_s + s.duration_s)
    : segments.length - 1;
  const s = segments[i];
  const elapsed = time - s.start_time_s;
  const fraction = clamp(elapsed / s.duration_s);
  let yaw = heading(s);
  if (!s.spray) {
    const turn = Math.min(.65, s.duration_s * .2);
    if (i > 0 && elapsed < turn) yaw = turnHeading(heading(segments[i - 1]), yaw, elapsed / turn);
    if (i + 1 < segments.length && elapsed > s.duration_s - turn) {
      yaw = turnHeading(yaw, heading(segments[i + 1]), (elapsed - s.duration_s + turn) / turn);
    }
  }
  return {
    position: fraction === 1 ? s.end_enu_m : s.start_enu_m.map((value, index) => lerp(value, s.end_enu_m[index], fraction)),
    yaw,
    number: s.source_segment_number,
    spray: s.spray && time < routeEnd,
  };
}

export function pointAt(points, time, { includeLanding = false } = {}) {
  if (time < points[0][0]) return null;
  const last = points.at(-1);
  if (time >= last[0]) return includeLanding ? last : null;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (hi + lo) >> 1;
    if (points[mid][0] <= time) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  return a.map((value, index) => lerp(value, b[index], (time - a[0]) / (b[0] - a[0])));
}

export const palette = [[18, 59, 222], [8, 127, 206], [51, 191, 209], [255, 227, 107], [255, 191, 0]];

export function createDeposition(data, events) {
  const { cell_m: cell, sigma_display_m: sigma, support_sigma: support, east, north } = data.grid;
  const nx = Math.ceil((east[1] - east[0]) / cell);
  const ny = Math.ceil((north[1] - north[0]) / cell);
  const wet = new Float64Array(nx * ny);
  const tracer = new Float64Array(nx * ny);
  const radius = Math.ceil(support * sigma / cell);
  const weights = Array.from({ length: radius * 2 + 1 }, (_, i) =>
    Math.exp(-.5 * (((i - radius) * cell) / sigma) ** 2));
  let count = 0;

  function bins(index, limit) {
    const start = Math.max(index - radius, 0);
    const end = Math.min(index + radius, limit - 1);
    const selected = weights.slice(start - index + radius, end - index + radius + 1);
    const sum = selected.reduce((value, weight) => value + weight, 0);
    return { start, weights: selected.map(weight => weight / sum) };
  }

  function seek(time) {
    const previous = count;
    if (count && events[count - 1][0] > time) {
      wet.fill(0);
      tracer.fill(0);
      count = 0;
    }
    while (count < events.length && events[count][0] <= time) {
      const [, e, n, water, nv] = events[count++];
      const i = Math.floor((e - east[0]) / cell);
      const j = Math.floor((n - north[0]) / cell);
      if (i < 0 || i >= nx || j < 0 || j >= ny) continue;
      const x = bins(i, nx);
      const y = bins(j, ny);
      const asGramsPerArea = 1000 / (cell * cell);
      for (const [dy, wy] of y.weights.entries()) {
        let index = (y.start + dy) * nx + x.start;
        for (const wx of x.weights) {
          const factor = wx * wy * asGramsPerArea;
          wet[index] += (water + nv) * factor;
          tracer[index++] += nv * factor;
        }
      }
    }
    return previous !== count;
  }

  return { seek, wet, nv: tracer, nx, ny, cell, east, north, get count() { return count; } };
}
