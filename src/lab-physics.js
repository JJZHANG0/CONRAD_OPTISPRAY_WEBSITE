import { ROUTES } from './mission.js';

export const LAB_FIELD = Object.freeze({ width: 36, depth: 28, minX: -18, minZ: -16, cell: 1 });
export const LAB_DEFAULTS = Object.freeze({ wind: 4.6, height: 3, flow: 1.7, size: 230, direction: 90, path: 'serpentine', offset: 0 });

const PHYSICS = Object.freeze({
  g: 9.81, rhoAir: 1.225, rhoWater: 1000, rhoResidue: 1200, muAir: 1.81e-5,
  rv: 461.5, dV: 2.5e-5, pressure: 101325, temperature: 16, humidity: 82,
  waterFraction: 0.999, tracerFraction: 0.001, sigmaG: 1.27,
  sprayVelocity: 2.8, sprayAngle: 45, routeSpeed: 5,
  rotorRadius: 0.15, rotorRpm: 1700, inducedFactor: 0.15, spreadFactor: 0.25, decayRadii: 6,
  dt: 0.001, maxFlightTime: 15, particleCount: 1024, traceCount: 21, traceInterval: 0.1,
  domainEast: [-70, 70], domainNorth: [-70, 70], domainUp: [0, 20],
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const hypot3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

function seededRandom(seed = 7) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalRandom(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function buildRoute(pathName, state, windEast, windNorth) {
  const windSpeed = Math.hypot(windEast, windNorth);
  const windUnitEast = windSpeed > 0 ? windEast / windSpeed : 0;
  const windUnitNorth = windSpeed > 0 ? windNorth / windSpeed : 0;
  const points = (ROUTES[pathName] || ROUTES.serpentine).map(([east, south]) => [
    east - state.offset * windUnitEast,
    -south - state.offset * windUnitNorth,
    state.height,
  ]);
  let cursor = 0;
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const east = b[0] - a[0];
    const north = b[1] - a[1];
    const length = Math.hypot(east, north);
    const duration = length / PHYSICS.routeSpeed;
    const spray = true;
    segments.push({ a, b, east, north, length, duration, start: cursor, speed: PHYSICS.routeSpeed, spray });
    cursor += duration;
  }
  const spraySegments = segments.filter(segment => segment.spray);
  return {
    segments,
    spraySegments,
    duration: cursor,
    sprayDuration: spraySegments.reduce((sum, segment) => sum + segment.duration, 0),
  };
}

function routePosition(route, time) {
  const segment = route.segments.find(item => time < item.start + item.duration) || route.segments.at(-1);
  const fraction = clamp((time - segment.start) / segment.duration, 0, 1);
  return [
    segment.a[0] + (segment.b[0] - segment.a[0]) * fraction,
    segment.a[1] + (segment.b[1] - segment.a[1]) * fraction,
    segment.a[2] + (segment.b[2] - segment.a[2]) * fraction,
  ];
}

function makeReleases(state, route, windEast, windNorth) {
  const random = seededRandom(7);
  const count = PHYSICS.particleCount;
  const spraySegments = route.spraySegments;
  const coneMax = PHYSICS.sprayAngle * Math.PI / 360;
  const releases = [];
  let diameterCubeSum = 0;
  for (let id = 0; id < count; id++) {
    const normal = normalRandom(random);
    const diameter = clamp(Math.exp(Math.log(state.size) + Math.log(PHYSICS.sigmaG) * normal), 20, 600) * 1e-6;
    const activeTime = random() * route.sprayDuration;
    let remaining = activeTime;
    let selected = spraySegments.at(-1);
    let local = selected.duration;
    for (const segment of spraySegments) {
      if (remaining <= segment.duration) {
        selected = segment;
        local = remaining;
        break;
      }
      remaining -= segment.duration;
    }
    const fraction = clamp(local / selected.duration, 0, 1);
    const east = selected.a[0] + fraction * selected.east;
    const north = selected.a[1] + fraction * selected.north;
    const lateral = (random() - 0.5) * 0;
    const norm = selected.length || 1;
    const releaseEast = east - selected.north / norm * lateral;
    const releaseNorth = north + selected.east / norm * lateral;
    const cosTheta = 1 - random() * (1 - Math.cos(coneMax));
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = 2 * Math.PI * random();
    const release = {
      id,
      time: selected.start + local,
      east: releaseEast,
      north: releaseNorth,
      up: state.height,
      u: selected.east / norm * selected.speed + PHYSICS.sprayVelocity * sinTheta * Math.cos(phi),
      v: selected.north / norm * selected.speed + PHYSICS.sprayVelocity * sinTheta * Math.sin(phi),
      w: -PHYSICS.sprayVelocity * cosTheta,
      diameter,
    };
    releases.push(release);
    diameterCubeSum += diameter ** 3;
  }
  const initialWetMass = state.flow * route.sprayDuration / 60;
  for (const release of releases) {
    release.parcelMass = initialWetMass * release.diameter ** 3 / diameterCubeSum;
    release.waterMass = release.parcelMass * PHYSICS.waterFraction;
    release.tracerMass = release.parcelMass * PHYSICS.tracerFraction;
  }
  return { releases, initialWetMass };
}

function saturationVaporPressure(tempC) {
  return 610.94 * Math.exp(17.625 * tempC / (tempC + 243.04));
}

function evaporationRate(diameter, relativeSpeed) {
  if (diameter <= 0 || PHYSICS.humidity >= 100) return 0;
  const tempK = PHYSICS.temperature + 273.15;
  const surfaceVaporDensity = saturationVaporPressure(PHYSICS.temperature) / (PHYSICS.rv * tempK);
  const ambientVaporDensity = PHYSICS.humidity / 100 * surfaceVaporDensity;
  const deltaDensity = Math.max(0, surfaceVaporDensity - ambientVaporDensity);
  const sc = PHYSICS.muAir / (PHYSICS.rhoAir * PHYSICS.dV);
  const re = PHYSICS.rhoAir * diameter * Math.abs(relativeSpeed) / PHYSICS.muAir;
  const sh = 2 + 0.6 * Math.sqrt(Math.max(re, 0)) * Math.cbrt(sc);
  return 4 * PHYSICS.dV * sh * deltaDensity / 1000;
}

function waterAtDiameter(release, diameter) {
  const fraction = release.tracerMass / release.parcelMass;
  const residueDiameter = release.diameter * Math.cbrt(Math.min(1, fraction * PHYSICS.rhoWater / PHYSICS.rhoResidue));
  const denominator = release.diameter ** 3 - residueDiameter ** 3;
  if (denominator <= 0) return 0;
  const remaining = clamp((diameter ** 3 - residueDiameter ** 3) / denominator, 0, 1);
  return release.waterMass * remaining;
}

function dragCoefficient(reynolds) {
  if (reynolds <= 0) return 0;
  if (reynolds < 1000) return 24 / reynolds * (1 + 0.197 * reynolds ** 0.63 + 2.6e-4 * reynolds ** 1.38);
  return 0.44;
}

function rotorVelocity(route, east, north, up, time) {
  const [centerEast, centerNorth, centerUp] = routePosition(route, time);
  const depth = centerUp - up;
  if (depth < 0) return [0, 0, 0];
  const tipSpeed = PHYSICS.rotorRpm * 2 * Math.PI / 60 * PHYSICS.rotorRadius;
  const induced = PHYSICS.inducedFactor * tipSpeed;
  const spread = PHYSICS.rotorRadius + PHYSICS.spreadFactor * depth;
  const radial = Math.hypot(east - centerEast, north - centerNorth);
  const vertical = -induced * (PHYSICS.rotorRadius / spread) ** 2
    * Math.exp(-((radial / spread) ** 2))
    * Math.exp(-depth / (PHYSICS.decayRadii * PHYSICS.rotorRadius));
  return [0, 0, vertical];
}

function pointInField(east, north) {
  return east >= LAB_FIELD.minX && east < LAB_FIELD.minX + LAB_FIELD.width
    && north >= -12 && north < 16;
}

function percentile95(samples) {
  if (!samples.length) return null;
  samples.sort((a, b) => a.distance - b.distance);
  const total = samples.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return null;
  let cumulative = 0;
  for (const sample of samples) {
    cumulative += sample.weight;
    if (cumulative >= total * 0.95) return sample.distance;
  }
  return samples.at(-1).distance;
}

function captureTrace(release, points, elapsed, state) {
  const sample = {
    t: elapsed,
    x: points[0] - release.east,
    y: points[2],
    z: -(points[1] - release.north),
  };
  const last = state.at(-1);
  if (!last || elapsed - last.t >= PHYSICS.traceInterval - 1e-7) state.push(sample);
}

function simulateParticle(release, route, windEast, windNorth, keepTrace, state) {
  let east = release.east;
  let north = release.north;
  let up = release.up;
  let u = release.u;
  let v = release.v;
  let w = release.w;
  let diameter = release.diameter;
  let waterMass = release.waterMass;
  let evaporated = 0;
  let elapsed = 0;
  let status = 'suspended';
  let landingEast = null;
  let landingNorth = null;
  let traceSamples = [];
  if (keepTrace) captureTrace(release, [east, north, up], elapsed, traceSamples);

  for (let stepIndex = 0; stepIndex < PHYSICS.maxFlightTime / PHYSICS.dt; stepIndex++) {
    const absoluteTime = release.time + elapsed;
    const [rotorEast, rotorNorth, rotorUp] = rotorVelocity(route, east, north, up, absoluteTime);
    const airEast = windEast + rotorEast;
    const airNorth = windNorth + rotorNorth;
    const airUp = rotorUp;
    const relEast = airEast - u;
    const relNorth = airNorth - v;
    const relUp = airUp - w;
    const relSpeed = hypot3(relEast, relNorth, relUp);
    const reynolds = PHYSICS.rhoAir * Math.max(diameter, 1e-9) * relSpeed / PHYSICS.muAir;
    const cd = dragCoefficient(reynolds);
    const currentWater = waterAtDiameter(release, diameter);
    const particleDensity = currentWater <= Math.max(1e-18, release.waterMass * 1e-10) ? PHYSICS.rhoResidue : PHYSICS.rhoWater;
    const dragScale = 0.75 * PHYSICS.rhoAir * cd * relSpeed / (particleDensity * Math.max(diameter, 1e-9));
    const unew = u + dragScale * relEast * PHYSICS.dt;
    const vnew = v + dragScale * relNorth * PHYSICS.dt;
    const wnew = w + (dragScale * relUp - PHYSICS.g) * PHYSICS.dt;
    const enew = east + unew * PHYSICS.dt;
    const nnew = north + vnew * PHYSICS.dt;
    const znew = up + wnew * PHYSICS.dt;
    let event = '';
    let impact = 1;
    if (znew <= 0) {
      impact = up > znew ? clamp(up / (up - znew), 0, 1) : 1;
      event = 'landed';
    } else if (enew < PHYSICS.domainEast[0] || enew > PHYSICS.domainEast[1]
      || nnew < PHYSICS.domainNorth[0] || nnew > PHYSICS.domainNorth[1]
      || znew > PHYSICS.domainUp[1]) {
      event = 'exited';
    }
    const effectiveStep = event === 'landed' ? PHYSICS.dt * impact : PHYSICS.dt;
    if (waterMass > 0 && diameter > 0) {
      const fraction = release.tracerMass / release.parcelMass;
      const residueDiameter = release.diameter * Math.cbrt(Math.min(1, fraction * PHYSICS.rhoWater / PHYSICS.rhoResidue));
      const diameterSquared = Math.max(residueDiameter ** 2, diameter ** 2 - evaporationRate(diameter, relSpeed) * effectiveStep);
      const nextDiameter = Math.sqrt(diameterSquared);
      const nextWater = waterAtDiameter(release, nextDiameter);
      evaporated += Math.max(0, waterMass - nextWater);
      waterMass = nextWater;
      diameter = nextDiameter;
    }
    if (event === 'landed') {
      landingEast = east + (enew - east) * impact;
      landingNorth = north + (nnew - north) * impact;
      elapsed += effectiveStep;
      if (keepTrace) captureTrace(release, [landingEast, landingNorth, 0], elapsed, traceSamples);
      status = pointInField(landingEast, landingNorth) ? 'inside' : 'outside';
      break;
    }
    if (event === 'exited') {
      east = enew; north = nnew; up = znew; elapsed += PHYSICS.dt;
      status = 'exited';
      break;
    }
    east = enew; north = nnew; up = znew; u = unew; v = vnew; w = wnew; elapsed += PHYSICS.dt;
    if (keepTrace && elapsed >= traceSamples.length * PHYSICS.traceInterval - 1e-7) {
      captureTrace(release, [east, north, up], elapsed, traceSamples);
    }
  }
  if (status === 'suspended' && keepTrace) captureTrace(release, [east, north, up], elapsed, traceSamples);
  const tracerMass = release.tracerMass;
  return {
    status, landingEast, landingNorth, elapsed, waterMass, tracerMass, evaporated,
    trace: keepTrace ? {
      releaseTime: release.time,
      releaseEast: release.east,
      releaseSouth: -release.north,
      time: elapsed,
      diameter: release.diameter * 1e6,
      factor: release.diameter / (state.size * 1e-6),
      nozzleX: 0,
      samples: traceSamples,
    } : null,
    releaseEast: release.east,
    releaseNorth: release.north,
  };
}

export function simulateLab(input = {}) {
  const state = { ...LAB_DEFAULTS, ...input };
  const direction = state.direction * Math.PI / 180;
  const windEast = state.wind * Math.sin(direction);
  const windNorth = state.wind * Math.cos(direction);
  const route = buildRoute(state.path, state, windEast, windNorth);
  const { releases, initialWetMass } = makeReleases(state, route, windEast, windNorth);
  const grid = new Float64Array(LAB_FIELD.width * LAB_FIELD.depth);
  const initialTracer = initialWetMass * PHYSICS.tracerFraction;
  const initialWater = initialWetMass * PHYSICS.waterFraction;
  const timeOrderedReleases = [...releases].sort((a, b) => a.time - b.time);
  const traceIds = new Set(Array.from({ length: PHYSICS.traceCount }, (_, index) =>
    timeOrderedReleases[Math.floor((index + 0.5) * timeOrderedReleases.length / PHYSICS.traceCount)].id));
  const traces = [];
  const landingDistances = [];
  const landingSamples = [];
  let insideWater = 0;
  let outsideWater = 0;
  let insideTracer = 0;
  let outsideTracer = 0;
  let evaporatedWater = 0;
  let exitedWater = 0;
  let exitedTracer = 0;
  let suspendedWater = 0;
  let suspendedTracer = 0;
  let outsideCount = 0;
  let landedTracer = 0;
  let landedWater = 0;
  let landedCount = 0;
  let downwindDistance = 0;
  let downwindWeight = 0;

  for (const release of releases) {
    const item = simulateParticle(release, route, windEast, windNorth, traceIds.has(release.id), state);
    if (item.trace) traces.push(item.trace);
    evaporatedWater += item.evaporated;
    if (item.status === 'inside' || item.status === 'outside') {
      landedCount++;
      landedTracer += item.tracerMass;
      landedWater += item.waterMass;
      landingSamples.push({
        east: item.landingEast,
        north: item.landingNorth,
        waterMass: item.waterMass,
        tracerMass: item.tracerMass,
        time: release.time + item.elapsed,
      });
      landingDistances.push({ distance: Math.hypot(item.landingEast - item.releaseEast, item.landingNorth - item.releaseNorth), weight: item.tracerMass });
      const windSpeed = Math.hypot(windEast, windNorth);
      if (windSpeed > 0) {
        const downwind = ((item.landingEast - item.releaseEast) * windEast
          + (item.landingNorth - item.releaseNorth) * windNorth) / windSpeed;
        downwindDistance += downwind * item.tracerMass;
        downwindWeight += item.tracerMass;
      }
      const eastIndex = Math.floor((item.landingEast - LAB_FIELD.minX) / LAB_FIELD.cell);
      const south = -item.landingNorth;
      const southIndex = Math.floor((south - LAB_FIELD.minZ) / LAB_FIELD.cell);
      if (item.status === 'inside') {
        insideWater += item.waterMass;
        insideTracer += item.tracerMass;
        if (eastIndex >= 0 && eastIndex < LAB_FIELD.width && southIndex >= 0 && southIndex < LAB_FIELD.depth) {
          grid[southIndex * LAB_FIELD.width + eastIndex] += item.waterMass + item.tracerMass;
        }
      } else {
        outsideWater += item.waterMass;
        outsideTracer += item.tracerMass;
        outsideCount++;
      }
    } else if (item.status === 'exited') {
      exitedWater += item.waterMass;
      exitedTracer += item.tracerMass;
    } else {
      suspendedWater += item.waterMass;
      suspendedTracer += item.tracerMass;
    }
  }
  const totalGrid = grid.reduce((sum, value) => sum + value, 0);
  const mean = totalGrid / grid.length;
  const variance = grid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / grid.length;
  const balance = (insideWater + outsideWater + evaporatedWater + exitedWater + suspendedWater + insideTracer + outsideTracer + exitedTracer + suspendedTracer) / initialWetMass;
  const drift = landedTracer >= 0.95 * initialTracer ? percentile95(landingDistances) : null;
  const meanDownwindDrift = downwindWeight > 0 ? downwindDistance / downwindWeight : 0;
  const tracesSorted = traces.sort((a, b) => a.diameter - b.diameter);
  return {
    state,
    field: LAB_FIELD,
    traces: tracesSorted,
    grid,
    landingSamples,
    inside: initialWetMass > 0 ? (insideWater + insideTracer) / initialWetMass * 100 : 0,
    outside: initialWetMass > 0 ? (outsideWater + outsideTracer) / initialWetMass * 100 : 0,
    outsideCount: releases.length ? outsideCount / releases.length * 100 : 0,
    drift,
    meanDownwindDrift,
    cv: mean > 0 ? Math.sqrt(variance) / mean * 100 : null,
    doseKg: initialWater,
    evaporatedKg: evaporatedWater,
    evaporatedPercent: initialWater > 0 ? evaporatedWater / initialWater * 100 : 0,
    insideTracerPercent: initialTracer > 0 ? insideTracer / initialTracer * 100 : 0,
    outsideTracerPercent: initialTracer > 0 ? outsideTracer / initialTracer * 100 : 0,
    landedWetKg: landedWater + landedTracer,
    initialWetKg: initialWetMass,
    initialWaterKg: initialWater,
    initialTracerKg: initialTracer,
    balance,
    sampleCount: releases.length,
    routeDuration: route.duration,
    sprayDuration: route.sprayDuration,
    replayDuration: route.duration + PHYSICS.maxFlightTime,
  };
}

export function applyRouteOffset(result, offset) {
  const state = { ...result.state, offset };
  const angle = state.direction * Math.PI / 180;
  const eastShift = -offset * Math.sin(angle);
  const northShift = -offset * Math.cos(angle);
  const grid = new Float64Array(LAB_FIELD.width * LAB_FIELD.depth);
  let insideWater = 0;
  let insideTracer = 0;
  let outsideWater = 0;
  let outsideTracer = 0;
  let outsideCount = 0;

  // The uniform-wind model is translation invariant, so each candidate offset moves
  // the aircraft path and its landing points together without reintegrating droplets.
  for (const sample of result.landingSamples) {
    const east = sample.east + eastShift;
    const north = sample.north + northShift;
    if (pointInField(east, north)) {
      insideWater += sample.waterMass;
      insideTracer += sample.tracerMass;
      const eastIndex = Math.floor((east - LAB_FIELD.minX) / LAB_FIELD.cell);
      const southIndex = Math.floor((-north - LAB_FIELD.minZ) / LAB_FIELD.cell);
      if (eastIndex >= 0 && eastIndex < LAB_FIELD.width && southIndex >= 0 && southIndex < LAB_FIELD.depth) {
        grid[southIndex * LAB_FIELD.width + eastIndex] += sample.waterMass + sample.tracerMass;
      }
    } else {
      outsideWater += sample.waterMass;
      outsideTracer += sample.tracerMass;
      outsideCount += 1;
    }
  }

  const totalGrid = grid.reduce((sum, value) => sum + value, 0);
  const mean = totalGrid / grid.length;
  const variance = grid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / grid.length;
  return {
    ...result,
    state,
    grid,
    traces: result.traces.map(trace => ({
      ...trace,
      releaseEast: trace.releaseEast + eastShift,
      releaseSouth: trace.releaseSouth - northShift,
    })),
    landingSamples: result.landingSamples.map(sample => ({
      ...sample,
      east: sample.east + eastShift,
      north: sample.north + northShift,
    })),
    inside: result.initialWetKg > 0 ? (insideWater + insideTracer) / result.initialWetKg * 100 : 0,
    outside: result.initialWetKg > 0 ? (outsideWater + outsideTracer) / result.initialWetKg * 100 : 0,
    outsideCount: result.sampleCount ? outsideCount / result.sampleCount * 100 : 0,
    cv: mean > 0 ? Math.sqrt(variance) / mean * 100 : null,
  };
}
