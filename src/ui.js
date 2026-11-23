import { LAB_DEFAULTS } from './lab-physics.js';
import { evaluateRoutes } from './lab-recommendation.js';
import { paintCharts } from './science-view.js';

const PART_COPY = {
  sensor: ['BUILT / WIND SENSING', 'Ultrasonic wind sensing feeds an ESP32 over RS485. Sensor placement and aircraft-motion calibration remain to be tested.', 'Explore wind sensing', './#wind'],
  control: ['BUILT / BENCH CONTROL', 'The bench pump stops after a three-second communication interruption. Integrated airborne spray guidance is not yet validated.', 'Explore the interactive model', './#lab'],
  boom: ['PLANNED / GUIDANCE LAYER', 'A quick-release mount and flow-conditioning layer are planned. The displayed boom is an illustrative assembly, not a tested specification.', 'Review spray passes', './field-route.html#review'],
  nozzle: ['TESTED / STATIONARY NOZZLE', 'Five KZ80-06 nozzle conditions were measured using water-sensitive paper. The seven-station 3D array is illustrative.', 'Explore droplet physics', './#physics'],
  tank: ['INTEGRATION / EXISTING AIRCRAFT', 'The retrofit concept retains the operator’s aircraft. Flow, pressure, height, position and ground speed are planned aircraft inputs.', 'Adjust spray flow', './#lab'],
  interface: ['BUILT / DESKTOP CONSOLE', 'The prototype includes wind readings, pump controls, drift simulation and landing animations. Aircraft-specific recommendations require field validation.', 'Explore the Simulation Lab', './#lab'],
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ROUTE_LABELS = { single: 'SINGLE', serpentine: 'SERPENTINE', perimeter: 'PERIMETER' };

export function createInterface(callbacks) {
  const state = { ...LAB_DEFAULTS, part: 'sensor' };
  let labView;
  let autoRoute = true;
  let activeChapter = 0;
  let toastTimer;
  let scheduled = false;
  let lastProgress = -1;
  let requestId = 0;
  let workerBusy = false;
  let pendingLab = null;
  let activeLab = null;
  let worker;
  const chapters = [...document.querySelectorAll('.chapter')];

  try {
    worker = new Worker(new URL('./lab-physics.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => receiveLabResult(data);
    worker.onerror = (event) => {
      console.error('Deposition model worker failed', event.message);
      worker.terminate();
      worker = undefined;
      workerBusy = false;
      if (activeLab?.id === requestId) pendingLab = activeLab;
      activeLab = null;
      sendPendingLab();
    };
  } catch {
    worker = undefined;
  }

  const notify = (message) => {
    clearTimeout(toastTimer);
    const element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('visible');
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3600);
  };

  function currentResult() {
    return labView?.resultsByPath?.[state.path];
  }

  function renderLabResult() {
    const current = currentResult();
    document.querySelectorAll('[data-metric]').forEach((element) => {
      const value = current?.[element.dataset.metric];
      element.textContent = Number.isFinite(value) ? value.toFixed(1) : '—';
    });
    const driftFraction = Number.isFinite(current?.drift) ? clamp(current.drift / 25, 0, 1) : 0;
    document.getElementById('drift-bar').style.width = `${driftFraction * 100}%`;

    const recommendation = labView?.recommendation;
    const recommendationLabel = document.getElementById('recommendation-route');
    const recommendationDetail = document.getElementById('recommendation-detail');
    const recommendationButton = document.getElementById('use-recommended-route');
    if (recommendation) {
      const route = ROUTE_LABELS[recommendation.path];
      recommendationLabel.textContent = `${route} ROUTE`;
      const placement = recommendation.offset > 0.05
        ? `Move ${recommendation.offset.toFixed(1)} m into the wind.`
        : 'Keep the route centered.';
      recommendationDetail.textContent = `${placement} Balances in-field retention and coverage evenness for these conditions.`;
      recommendationButton.hidden = state.path === recommendation.path;
    } else {
      recommendationLabel.textContent = 'CALCULATING';
      recommendationDetail.textContent = 'Evaluating route placement for the current conditions.';
      recommendationButton.hidden = true;
    }

    paintCharts(current);
    if (current) callbacks.onLabResult?.(current);
  }

  function receiveLabResult(data) {
    workerBusy = false;
    activeLab = null;
    if (data.error) console.error('Deposition estimate failed', data.error);
    if (data.id === requestId && data.resultsByPath && data.recommendation) {
      labView = data;
      if (autoRoute) state.path = data.recommendation.path;
      state.offset = data.resultsByPath[state.path].state.offset;
      syncUI(false);
    }
    sendPendingLab();
  }

  function sendPendingLab() {
    if (workerBusy || !pendingLab) return;
    const job = pendingLab;
    pendingLab = null;
    workerBusy = true;
    activeLab = job;
    if (worker) {
      worker.postMessage(job);
      return;
    }
    setTimeout(() => {
      try {
        receiveLabResult({ id: job.id, ...evaluateRoutes(job.state) });
      } catch (error) {
        receiveLabResult({ id: job.id, error: error instanceof Error ? error.message : String(error) });
      }
    }, 0);
  }

  function requestLabSimulation() {
    requestId += 1;
    document.getElementById('recommendation-route').textContent = 'UPDATING';
    document.getElementById('recommendation-detail').textContent = 'Recalculating route placement for the current conditions.';
    document.getElementById('use-recommended-route').hidden = true;
    pendingLab = { id: requestId, state: { ...state, offset: 0 } };
    sendPendingLab();
  }

  function syncUI(recompute = true) {
    document.querySelectorAll('[data-value]').forEach((element) => {
      element.textContent = Number(state[element.dataset.value]).toFixed(['size', 'direction'].includes(element.dataset.value) ? 0 : 1);
    });
    document.querySelectorAll('input[data-param]').forEach((element) => {
      element.value = state[element.dataset.param];
      element.style.setProperty('--fill', `${(element.value - element.min) / (element.max - element.min) * 100}%`);
    });
    for (const [attribute, check] of [
      ['direction', (value) => Number(value) === state.direction],
      ['path', (value) => value === state.path],
      ['part', (value) => value === state.part],
    ]) {
      document.querySelectorAll(`[data-${attribute}]`).forEach((element) => {
        const selected = check(element.dataset[attribute]);
        element.classList.toggle('selected', selected);
        element.setAttribute('aria-pressed', String(selected));
      });
    }
    document.getElementById('path-label').textContent = ROUTE_LABELS[state.path];
    const [code, description, action, href] = PART_COPY[state.part];
    document.getElementById('part-code').textContent = code;
    document.getElementById('part-description').textContent = description;
    const partAction = document.getElementById('part-action');
    partAction.textContent = `${action} ↗`;
    partAction.href = href;
    renderLabResult();
    callbacks.onChange?.(state);
    if (recompute) requestLabSimulation();
  }

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      syncUI();
    });
  };

  document.querySelectorAll('input[data-param]').forEach((input) => input.addEventListener('input', () => {
    state[input.dataset.param] = Number(input.value);
    schedule();
  }));
  document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('click', () => {
    state.direction = Number(button.dataset.direction);
    syncUI();
  }));
  document.querySelectorAll('[data-path]').forEach((button) => button.addEventListener('click', () => {
    state.path = button.dataset.path;
    autoRoute = false;
    if (labView) state.offset = labView.resultsByPath[state.path].state.offset;
    syncUI(false);
  }));
  function selectPart(id) {
    if (!PART_COPY[id]) return;
    state.part = id;
    callbacks.onPart?.(id);
    syncUI(false);
  }
  document.querySelectorAll('[data-part]').forEach((button) => button.addEventListener('click', () => selectPart(button.dataset.part)));

  document.getElementById('use-recommended-route').addEventListener('click', () => {
    const path = labView?.recommendation.path;
    if (!path) return;
    state.path = path;
    autoRoute = true;
    state.offset = labView.resultsByPath[path].state.offset;
    syncUI(false);
  });
  document.getElementById('motion-toggle').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const pause = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(pause));
    button.textContent = pause ? 'MOTION OFF' : 'MOTION ON';
    callbacks.onMotion?.(!pause);
  });
  document.querySelectorAll('[data-scroll-to]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    callbacks.onScrollTo?.(Number(button.dataset.scrollTo));
  }));

  function setProgress(progress) {
    if (Math.abs(progress - lastProgress) < 0.0001) return;
    lastProgress = progress;
    const previous = activeChapter;
    activeChapter = clamp(Math.round(progress), 0, 5);
    chapters.forEach((chapter, index) => {
      const opacity = clamp(1 - Math.abs(progress - index) * 1.8, 0, 1);
      chapter.style.opacity = opacity;
      chapter.style.visibility = opacity > 0.015 ? 'visible' : 'hidden';
      chapter.classList.toggle('active', index === activeChapter);
      chapter.inert = index !== activeChapter;
    });
    document.querySelectorAll('.nav-link,.chapter-rail button').forEach((button) => {
      const active = Number(button.dataset.scrollTo) === activeChapter;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    document.getElementById('chapter-counter').textContent = String(activeChapter + 1).padStart(2, '0');
    document.getElementById('scroll-progress-bar').style.transform = `scaleX(${progress / 5})`;
    document.querySelector('.scroll-cue').style.opacity = progress < 0.18 ? '1' : '0';
    if (activeChapter !== previous) callbacks.onChapter?.(activeChapter);
  }

  addEventListener('resize', () => paintCharts(currentResult()));
  return {
    state,
    syncUI,
    setProgress,
    notify,
    selectPart,
    get result() { return currentResult(); },
    get labResult() { return labView; },
    get activeChapter() { return activeChapter; },
  };
}
