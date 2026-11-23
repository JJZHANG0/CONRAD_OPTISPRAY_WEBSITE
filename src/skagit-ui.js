import { loadCase, loadJson, metricValues, metricDefinition, flightAt, pointAt, createDeposition } from './skagit-data.js';
import { caseImage, createHeatCanvas, drawMap } from './skagit-map.js';
import { paintTrajectory } from './science-view.js';

const el = id => document.getElementById(id);
const set = (id, value) => { el(id).textContent = value; };
function physics(active) {
  const size = el('physics-size');
  const play = el('physics-play');
  const chart = el('physics-chart');
  let data, elapsed = 0, playing = false, start, path, frame;
  let loading = false;

  size.disabled = true;

  function render() {
    if (!path) return;
    const release = path[0];
    const sample = pointAt(path, release[0] + elapsed, { includeLanding: true });
    frame = { path, sample };
    paintTrajectory(chart, path, sample);
    set('physics-time', `${elapsed.toFixed(2)} s after release`);
  }

  function stop() {
    playing = false;
    play.textContent = 'Play drop';
  }

  function select() {
    stop();
    path = data.paths[size.value];
    const release = path[0];
    const land = path.at(-1);
    const duration = land[0] - release[0];
    elapsed = duration * .42;
    set('physics-airtime', `${duration.toFixed(2)} s`);
    set('physics-diameter', `${land[4].toFixed(1)} µm`);
    set('physics-mass', `${(100 * (land[5] + land[6]) / (release[5] + release[6])).toFixed(1)}%`);
    set('physics-drift', `${(land[1] - release[1]).toFixed(1)} m`);
    set('physics-sample', 'The aircraft marks where the drop was released. The curve follows its predicted path to the ground.');
    render();
  }

  let animation;
  function tick(now) {
    if (!playing || !active()) { stop(); return; }
    start ??= now;
    const duration = path.at(-1)[0] - path[0][0];
    elapsed = Math.min((now - start) / 1000, duration);
    render();
    if (elapsed < duration) animation = requestAnimationFrame(tick);
    else stop();
  }

  play.addEventListener('click', () => {
    if (playing) { cancelAnimationFrame(animation); stop(); return; }
    playing = true;
    start = undefined;
    play.textContent = 'Pause drop';
    animation = requestAnimationFrame(tick);
  });
  size.addEventListener('change', select);
  new ResizeObserver(render).observe(chart);

  function preload() {
    if (loading || data) return;
    loading = true;
    loadJson('physics.json').then(value => {
      data = value;
      data.samples.forEach((sample, i) => size.add(new Option(`${sample.diameter.toFixed(1)} µm`, i)));
      size.value = '1';
      size.disabled = play.disabled = false;
      select();
    }).catch(error => {
      console.error(error);
      set('physics-sample', 'The particle trajectories could not load. Reload the page to try again.');
    }).finally(() => { loading = false; });
  }

  return { frame: () => frame, preload };
}

function mapping(active) {
  const component = el('mapping-component');
  const camera = el('mapping-camera');
  const play = el('mapping-play');
  const full = el('mapping-end');
  const slider = el('mapping-time');
  const canvas = el('mapping-map');
  let data, imagery, heat, raster, tracks, longestTrack;
  let time, layer, playing = false, start, origin, lastFrame, animation, frame;
  let paintVersion = 0;
  let loading = false;

  function stop() {
    cancelAnimationFrame(animation);
    playing = false;
    play.textContent = 'Play 2×';
  }

  function render(forceHeat = false) {
    if (!raster) return;
    const flight = flightAt(data, time);
    const kind = component.value;
    const max = data.display.color_max_gm2[kind];
    const changed = raster.seek(time);
    if (changed || forceHeat || layer !== kind) {
      heat.paint(raster[kind], max);
      paintVersion++;
    }
    layer = kind;
    drawMap(canvas, data, imagery, { surface: heat.surface, flight });
    const droplets = [];
    if (camera.value === 'follow') {
      for (const [diameter, points] of tracks) {
        if (points[0][0] > time) break;
        if (points[0][0] < time - longestTrack) continue;
        const point = pointAt(points, time);
        if (point && point[3] > 0) droplets.push({ diameter, points, point });
      }
    }
    frame = {
      data, surface: heat.canvas, paintVersion, flight, droplets,
      camera: camera.value, time,
    };
    set('mapping-scale', `${max} g/m²`);
    set('mapping-clock', `${time.toFixed(1)} s`);
    const label = time >= data.end ? 'Full route · spray off'
      : time >= data.routeEnd ? 'Route complete · spray off · droplets settling'
      : `Segment ${flight.number} of ${data.segments.length} · ${flight.spray ? 'Spray on' : 'Transfer · spray off'}`;
    set('mapping-status', `${label} · ${raster.count.toLocaleString('en-US')} landings`);
    slider.value = time;
    slider.style.setProperty('--fill', `${Math.min(100, time / data.end * 100).toFixed(2)}%`);
    slider.setAttribute('aria-valuetext', `${time.toFixed(1)} seconds. ${label}`);
  }

  async function preload() {
    if (loading || frame) return;
    loading = true;
    try {
      const [record, image, events, paths] = await Promise.all([
        loadCase(), caseImage(), loadJson('landings.bin'), loadJson('tracks.bin'),
      ]);
      data = record;
      imagery = image;
      time = data.end;
      slider.max = Math.ceil(data.end * 100) / 100;
      set('mapping-definitions', `Full-route simulation · ${metricDefinition}`);
      raster = createDeposition(data, events);
      heat = createHeatCanvas(data, raster, imagery);
      tracks = paths;
      longestTrack = Math.max(...tracks.map(([, points]) => points.at(-1)[0] - points[0][0])) + .01;
      const values = metricValues(data.metrics);
      ['water', 'inside', 'outside', 'drift'].forEach((field, i) => set(`mapping-${field}`, values[i]));
      play.disabled = full.disabled = slider.disabled = false;
      render(true);
    } catch (error) {
      console.error(error);
      set('mapping-status', 'The field prediction could not load. Reload the page to try again.');
    } finally {
      loading = false;
    }
  }

  function tick(now) {
    if (!playing || !active()) { stop(); return; }
    start ??= now;
    const next = Math.min(data.end, origin + (now - start) * .002);
    if (now - lastFrame >= 75 || next >= data.end) {
      time = next;
      lastFrame = now;
      render();
    }
    if (next < data.end) animation = requestAnimationFrame(tick);
    else stop();
  }

  play.addEventListener('click', () => {
    if (playing) { stop(); return; }
    if (time >= data.end) time = 0;
    camera.value = 'follow';
    origin = time;
    start = undefined;
    lastFrame = -Infinity;
    playing = true;
    play.textContent = 'Pause';
    render();
    animation = requestAnimationFrame(tick);
  });
  full.addEventListener('click', () => {
    stop();
    time = data.end;
    camera.value = 'overview';
    render();
  });
  slider.addEventListener('input', () => {
    stop();
    time = Math.min(data.end, Number(slider.value));
    render();
  });
  component.addEventListener('change', () => render());
  camera.addEventListener('change', () => render());
  return { frame: () => frame, preload };
}

export function initSkagit(ui) {
  const physicsView = physics(() => ui.activeChapter === 1);
  const mappingView = mapping(() => ui.activeChapter === 3);
  const weather = document.querySelector('[data-case-weather]');
  function onChapter(index) {
    if (index === 1) {
      physicsView.preload();
      loadCase().then(({ environment: env }) => {
        weather.textContent = `Wind W → E at ${env.wind_speed_mps} m/s · ${env.temperature_c} °C · ${env.relative_humidity_pct}% relative humidity`;
      }).catch(() => { weather.textContent = 'Field conditions unavailable'; });
    }
    if (index === 3) mappingView.preload();
  }
  return { physics: physicsView.frame, mapping: mappingView.frame, onChapter };
}
