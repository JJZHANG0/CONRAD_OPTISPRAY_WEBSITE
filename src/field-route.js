import './style.css';
import './skagit.css';
import './field-route.css';
import { loadCase, loadJson, createDeposition } from './skagit-data.js';
import { caseImage, createHeatCanvas, drawMap } from './skagit-map.js';

const el = id => document.getElementById(id);
const title = el('route-map-title');
const canvas = el('route-map');
const status = el('route-load');
const segmentControl = el('route-segment');
const steps = [...document.querySelectorAll('[data-route-step]')];
const panels = [...document.querySelectorAll('[data-route-panel]')];
const exampleControls = [...document.querySelectorAll('[data-example-segment]')];

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const format = (value, unit) => `${integer.format(value)} ${unit}`;
const interpolate = (a, b, fraction) => a.map((value, i) => value + (b[i] - value) * fraction);
const segmentPoint = (segment, fraction) => interpolate(segment.start_enu_m, segment.end_enu_m, fraction);

function boundaryMark(ring) {
  const westernEdge = ring.map((point, i) => {
    const next = ring[(i + 1) % ring.length];
    return { center: interpolate(point, next, .52), length: Math.hypot(point[0] - next[0], point[1] - next[1]) };
  }).filter(edge => edge.length > 80).sort((a, b) => a.center[0] - b.center[0])[0];
  return { label: '1', point: westernEdge.center, offset: [-78, -26] };
}

function renderComparison(plans) {
  const values = [
    ['Spray passes', p => p.segments.filter(s => s.spray).length],
    ['Spray distance', p => format(p.sprayDistance, 'm')],
    ['Transfer distance', p => format(p.transferDistance, 'm')],
    ['Flight time', p => format(p.seconds, 's')],
    ['Target covered', p => `${p.coveragePercent.toFixed(1)}%`],
    ['Uncovered target', p => format(p.gap, 'm²')],
    ['Off-target swath', p => format(p.offTarget, 'm²')],
    ['Repeated coverage', p => format(p.repeat, 'm²')],
    ['Recorded route conflicts', p => p.conflicts.length],
  ];
  const comparison = el('route-comparison');
  for (const [label, value] of values) {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = label;
    row.append(heading);
    for (const plan of plans) row.insertCell().textContent = value(plan);
    comparison.append(row);
  }
}

Promise.all([loadCase(), caseImage(), loadJson('route-weather.json')]).then(([data, imagery, weatherData]) => {
  const route = data.segments;
  const firstSpray = route.find(segment => segment.spray);
  const firstTurn = route.find(segment => !segment.spray);
  const field = boundaryMark(data.field);
  const previewMax = data.display.color_max_gm2.wet;
  let selected = firstTurn;
  let active;
  let deposition;

  function showReview() {
    const number = selected.source_segment_number;
    const type = selected.spray ? 'Spray pass' : 'Turn or transfer · spray off';
    title.textContent = `NORTH–SOUTH ROUTE · SEGMENT ${number}`;
    canvas.setAttribute('aria-label', `North–south route with field boundary, spray pass, and transfer marked. Segment ${number} is selected. ${type}.`);
    const spray = selected.spray ? selected : firstSpray;
    const turn = selected.spray ? firstTurn : selected;
    drawMap(canvas, data, imagery, {
      selected: number,
      marks: [
        field,
        { label: '2', point: segmentPoint(spray, .57), offset: [56, 33] },
        { label: '3', point: segmentPoint(turn, .50), offset: [22, 66] },
      ],
    });
    segmentControl.value = number;
    const end = selected.start_time_s + selected.duration_s;
    const length = selected.duration_s * selected.speed_mps;
    el('route-segment-status').textContent = `${type} · ${selected.start_time_s.toFixed(1)}–${end.toFixed(1)} s · ${length.toFixed(1)} m`;
  }

  function showComparison() {
    title.textContent = 'WEATHER-AWARE ROUTE COMPARISON';
    renderWeatherComparison(true);
  }

  function renderWeatherComparison(drawMaps = active === 'compare') {
    const weather = {
      speed: Number(el('route-weather-speed').value),
      from: Number(el('route-weather-from').value),
      gust: Number(el('route-weather-gust').value),
    };
    const scenario = weatherData.scenarios.find(item =>
      item.weather.windSpeedMps === weather.speed &&
      item.weather.windFromDeg === weather.from &&
      item.weather.gustPercent === weather.gust,
    );
    const results = el('route-weather-results');
    results.replaceChildren();
    if (!scenario) {
      el('route-weather-recommendation').textContent = 'No estimate is available for these inputs.';
      return;
    }
    el('route-weather-direction').textContent =
      `Wind from ${scenario.windFrom} at ${weather.from}° · toward ${scenario.windToward} at ${scenario.weather.windToDeg}°.`;
    const options = scenario.options.filter(option => option.geometrySelectable)
      .sort((a, b) => a.bearingDeg - b.bearingDeg);
    const recommended = options.find(option => option.bearingDeg === scenario.recommendedBearing);
    for (const [index, axis] of [0, 90].entries()) {
      const option = options.find(item => Math.round(item.bearingDeg) % 180 === axis);
      const card = el(`route-card-${index === 0 ? 'a' : 'b'}`);
      const heading = el(`route-label-${index === 0 ? 'a' : 'b'}`);
      const canvas = el(`route-map-${index === 0 ? 'a' : 'b'}`);
      card.classList.toggle('route-is-recommended', !!option && option.bearingDeg === scenario.recommendedBearing);
      if (!option) {
        heading.textContent = axis === 0 ? 'North–south route' : 'East–west route';
        drawMap(canvas, data, imagery, { segments: [] });
        continue;
      }
      heading.textContent = `${option.route} route${option.bearingDeg === scenario.recommendedBearing ? ' · Lower estimate' : ''}`;
      canvas.setAttribute('aria-label', `${option.route} flight lines over the Skagit field boundary`);
      const segments = option.segments.map((segment, number) => ({
        start_enu_m: segment.start,
        end_enu_m: segment.end,
        spray: segment.spray,
        source_segment_number: number + 1,
      }));
      drawMap(canvas, data, imagery, { segments });
    }
    for (const option of options) {
      const row = document.createElement('tr');
      if (option.bearingDeg === scenario.recommendedBearing) row.className = 'route-weather-recommended';
      const route = document.createElement('th');
      route.scope = 'row';
      route.textContent = option.route;
      row.append(route);
      row.insertCell().textContent = `${(option.offFieldFraction * 100).toFixed(2)}%`;
      row.insertCell().textContent = `${option.driftP95M.toFixed(1)} m`;
      results.append(row);
    }
    el('route-weather-recommendation').textContent = recommended
      ? `${recommended.route} flight lines have the lowest predicted off-field mass for these inputs.`
      : 'No geometry-valid route is available for these inputs.';
  }

  async function showDeposition() {
    title.textContent = 'FULL-ROUTE WET SPRAY';
    canvas.setAttribute('aria-label', 'Skagit full-route predicted wet-spray deposition');
    status.textContent = 'Loading the full-route prediction…';
    deposition ??= loadJson('landings.bin').then(events => {
      const raster = createDeposition(data, events);
      const heat = createHeatCanvas(data, raster, imagery);
      raster.seek(data.end);
      heat.paint(raster.wet, previewMax);
      return heat.surface;
    }).catch(error => { deposition = undefined; throw error; });
    try {
      const surface = await deposition;
      if (active !== 'deposition') return;
      drawMap(canvas, data, imagery, { surface });
      status.textContent = '';
    } catch (error) {
      console.error(error);
      if (active === 'deposition') status.textContent = 'The deposition map could not load. Open Mapping to view the prediction.';
    }
  }

  function show(step) {
    active = step;
    status.textContent = '';
    for (const button of steps) button.setAttribute('aria-pressed', String(button.dataset.routeStep === step));
    for (const panel of panels) panel.hidden = panel.id !== step;
    el('route-primary').hidden = step === 'compare';
    el('route-compare-maps').hidden = step !== 'compare';
    el('route-legend').dataset.stage = step;
    el('route-scale').hidden = step !== 'deposition';
    if (step === 'boundary') {
      title.textContent = 'RECORDED FIELD BOUNDARY';
      canvas.setAttribute('aria-label', 'North-up aerial image showing the recorded Skagit field boundary at marker 1');
      drawMap(canvas, data, imagery, { segments: [], marks: [field] });
    }
    if (step === 'compare') showComparison();
    if (step === 'review') showReview();
    if (step === 'deposition') {
      drawMap(canvas, data, imagery);
      showDeposition();
    }
  }

  renderComparison(data.plans);
  for (const id of ['route-weather-speed', 'route-weather-from', 'route-weather-gust']) {
    el(id).addEventListener('change', () => renderWeatherComparison());
  }
  el('route-scale-max').textContent = `${previewMax} g/m²`;
  for (const button of steps) {
    button.disabled = false;
    button.addEventListener('click', () => {
      const step = button.dataset.routeStep;
      history.replaceState(null, '', `#${step}`);
      show(step);
    });
  }
  for (const segment of route) {
    segmentControl.add(new Option(`${segment.source_segment_number}. ${segment.spray ? 'Spray pass' : 'Turn or transfer · spray off'}`, segment.source_segment_number));
  }
  segmentControl.disabled = false;
  segmentControl.addEventListener('change', () => {
    selected = route.find(segment => segment.source_segment_number === Number(segmentControl.value));
    showReview();
  });
  for (const button of exampleControls) {
    button.disabled = false;
    button.addEventListener('click', () => {
      selected = button.dataset.exampleSegment === 'spray' ? firstSpray : firstTurn;
      showReview();
    });
  }

  function showFromHash() {
    const step = location.hash.slice(1);
    show(steps.some(button => button.dataset.routeStep === step) ? step : 'review');
  }
  addEventListener('hashchange', showFromHash);
  showFromHash();
}).catch(error => {
  console.error(error);
  status.textContent = 'The Skagit route records could not load. Reload the page to try again.';
});
