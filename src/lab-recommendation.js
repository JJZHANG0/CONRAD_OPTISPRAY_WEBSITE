import { applyRouteOffset, simulateLab } from './lab-physics.js';

export const ROUTE_OPTIONS = ['serpentine', 'single', 'perimeter'];
const OFFSET_STEP_M = 0.5;

function routeScore(result) {
  const cv = Number.isFinite(result.cv) ? result.cv : 1000;
  return result.inside / (1 + cv / 100);
}

function recommendForPath(state, path) {
  const base = simulateLab({ ...state, path, offset: 0 });
  const maxOffset = Math.min(45, Math.max(0, base.meanDownwindDrift * 1.5 + 5));
  let bestResult = base;
  let bestScore = routeScore(base);
  for (let offset = OFFSET_STEP_M; offset <= maxOffset + 1e-9; offset += OFFSET_STEP_M) {
    const candidate = applyRouteOffset(base, offset);
    const score = routeScore(candidate);
    if (score > bestScore + 1e-8 || (Math.abs(score - bestScore) <= 1e-8 && candidate.inside > bestResult.inside)) {
      bestResult = candidate;
      bestScore = score;
    }
  }
  return { result: bestResult, score: bestScore };
}

export function evaluateRoutes(state) {
  const evaluated = Object.fromEntries(ROUTE_OPTIONS.map((path) => [path, recommendForPath(state, path)]));
  const path = ROUTE_OPTIONS.reduce((best, candidate) =>
    evaluated[candidate].score > evaluated[best].score ? candidate : best, ROUTE_OPTIONS[0]);
  const result = evaluated[path].result;
  return {
    resultsByPath: Object.fromEntries(ROUTE_OPTIONS.map((candidate) => [candidate, evaluated[candidate].result])),
    recommendation: {
      path,
      offset: result.state.offset,
      score: evaluated[path].score,
      inside: result.inside,
      cv: result.cv,
    },
  };
}
