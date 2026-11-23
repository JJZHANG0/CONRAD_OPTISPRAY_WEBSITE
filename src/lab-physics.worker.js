import { evaluateRoutes, ROUTE_OPTIONS } from './lab-recommendation.js';

self.onmessage = ({ data }) => {
  const { id, state } = data;
  try {
    const prediction = evaluateRoutes(state);
    const resultsByPath = Object.fromEntries(ROUTE_OPTIONS.map((path) => [path, prediction.resultsByPath[path]]));
    self.postMessage(
      { id, resultsByPath, recommendation: prediction.recommendation },
      Object.values(resultsByPath).map((result) => result.grid.buffer),
    );
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
