import { createDeposition, flightAt, metricValues } from './skagit-data.js';
import { createHeatCanvas, drawMap } from './skagit-map.js';

const timeLabel = (seconds) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
const routeName = (id) => id === 'A' ? 'North–south' : 'East–west';
const cardinal = { 0: 'North', 90: 'East', 180: 'South', 270: 'West' };
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const questions = [
  ['Are conditions suitable for spraying?', 'weather', 'Weather and field limits', 'Review the wind, verify the product label and check sensitive areas before confirming the mission.'],
  ['Why choose this route?', 'route', 'Planned coverage, time and transfers', 'Compare the two candidate routes and consider the downwind boundary before confirming either plan.'],
  ['What is different between the two routes?', 'route', 'North–south and east–west flight lines', 'Open route planning to compare both plans under the same farmland constraints.'],
  ['Where is drift risk concentrated?', 'edge', 'Downwind boundary and modeled tracer', 'Inspect the highlighted field edge for sensitive areas before spraying.'],
  ['What does the deposition map show?', 'tracer', 'Where the modeled tracer settles', 'Inspect the layer alongside the field boundary and check the report before interpreting coverage.'],
  ['How can I reduce drift exposure?', 'edge', 'Wind direction and downwind exposure', 'Check the downwind buffer and compare weather scenarios before deciding whether to proceed.'],
  ['What should I check next time?', 'wet', 'Saved deposition model and operation review', 'Review the report and check wind, field limits and transfer segments before the next operation.'],
  ['Which details should I add to the record?', 'weather', 'Weather and equipment context', 'Add field observations, sensitive areas and equipment measurements to the next operation record.'],
];

const guideSteps = [
  ['Select field', 'weather', 'Review the white farmland boundary before choosing a plan.'],
  ['Confirm task', 'route', 'Confirm the spray task with the field boundary and an 11 m setback.'],
  ['Check conditions', 'weather', 'Read the wind, temperature and humidity before comparing routes.'],
  ['Review drift', 'edge', 'Locate the downwind edge and check for sensitive areas nearby.'],
  ['Compare routes', 'route', 'Compare planned coverage, transfer distance and time.'],
  ['Confirm plan', 'route', 'Choose a candidate and confirm it before starting the replay.'],
  ['Monitor operation', 'feedback', 'Follow the aircraft marker and spray state through the replay.'],
  ['Review report', 'tracer', 'Review the result in AeroGuard and save the operation report.'],
];

const comparisons = [
  ['OptiSpray + AeroGuard', 'Modular attachment and decision software', 'Environmental inputs, spray physics, route evidence and post-operation review.', 'Explore modular integration', 'modular'],
  ['DJI AGRAS T50', 'Integrated agricultural aircraft', 'Surveying and route planning, manual and automatic spraying, and an in-operation task summary.', 'DJI product information', 'https://ag.dji.com/t50', 'DJI task summary', 'https://ag.dji.com/newsroom/agras-t50-t25-august-2024-firmware-update'],
  ['XAG P100 Pro', 'Integrated agricultural aircraft', 'Automatic 3D route planning, pilot-view livestream and operation reports.', 'XAG product information', 'https://www.xa.com/en/p100pro'],
];

export function createIntelligence(workspace, { data, aerial, landings, weather, reducedMotion, navigate, openDashboard, showScene, updateScene }) {
  const plans = Object.fromEntries(data.plans.map(plan => [plan.id, plan]));
  const segments = {
    A: data.segments,
    B: plans.B.segments.map(({ a, b, spray, number, startTime, duration }) => ({
      start_enu_m: [a.east, a.north], end_enu_m: [b.east, b.north],
      source_segment_number: number, spray, start_time_s: startTime, duration_s: duration,
    })),
  };
  const model = metricValues(data.metrics);
  const environment = data.environment;
  const baseWind = environment.wind_from_deg;
  const baseSpeed = environment.wind_speed_mps;
  const climate = environment.temperature_c + ' °C · ' + environment.relative_humidity_pct + '% RH';
  const modelDescription = 'Run-03 is the full spray and deposition simulation for Plan A.';
  const surfaces = {};
  const mission = { plan: 'A', confirmed: false, time: 0, playing: false, windShift: false, reviewed: false, acknowledged: false, deposition: false, scene: false };
  const routeEnd = (plan) => plan === 'A' ? data.routeEnd : plans.B.seconds;
  let view, map, sidebar, output, range, play, replayFrame, drawFrame, previousTime, panelMode, activeEvidence, windSpeed, windFrom, question, guide, layer, headline, condition, mapStatus;
  let downwindEdges = [];
  let edgeWind;
  let threshold = 3;
  let receptor = false;
  let replayRaster;
  let replayHeat;
  let replayHeatTime;

  function make(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function action(label, callback, pressed) {
    const button = make('button', 'workspace-button', label);
    button.type = 'button';
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    button.addEventListener('click', callback);
    return button;
  }

  function select(label, options, value, callback) {
    const field = make('label', 'workspace-field', label);
    const input = make('select');
    for (const [optionValue, name] of options) {
      const option = make('option', '', name);
      option.value = optionValue;
      input.append(option);
    }
    input.value = value;
    input.addEventListener('change', () => callback(input.value));
    field.append(input);
    return field;
  }

  function flow(labels, current) {
    const list = make('ol', 'workspace-flow');
    for (const [index, label] of labels.entries()) {
      const item = make('li', '', label);
      if (index === current) item.setAttribute('aria-current', 'step');
      list.append(item);
    }
    return list;
  }

  function facts(items) {
    const list = make('dl', 'workspace-facts');
    for (const [label, value] of items) {
      const item = make('div');
      item.append(make('dt', '', label), make('dd', '', value));
      list.append(item);
    }
    return list;
  }

  function surfaceFor(key) {
    if (!surfaces[key]) {
      const deposition = createDeposition(data, landings);
      deposition.seek(data.end);
      const heat = createHeatCanvas(data, deposition, aerial);
      heat.paint(deposition[key === 'wet' ? 'wet' : 'nv'], data.display.color_max_gm2[key === 'wet' ? 'wet' : 'nv']);
      surfaces[key] = heat.surface;
    }
    return surfaces[key];
  }

  function edgesFor(wind) {
    if (edgeWind === wind) return downwindEdges;
    edgeWind = wind;
    const rad = (wind + 180) * Math.PI / 180;
    const score = ([east, north]) => east * Math.sin(rad) + north * Math.cos(rad);
    const extremes = data.field.map(score);
    const min = Math.min(...extremes);
    const limit = min + (Math.max(...extremes) - min) * .72;
    downwindEdges = data.field.map((point, i) => [point, data.field[(i + 1) % data.field.length]])
      .filter(([a, b]) => (score(a) + score(b)) / 2 >= limit);
    return downwindEdges;
  }

  function replaySurface() {
    if (!replayRaster) {
      replayRaster = createDeposition(data, landings);
      replayHeat = createHeatCanvas(data, replayRaster, aerial);
    }
    const time = Math.floor(mission.time / 12) * 12;
    if (time !== replayHeatTime) {
      replayHeatTime = time;
      replayRaster.seek(time);
      replayHeat.paint(replayRaster.wet, data.display.color_max_gm2.wet);
    }
    return replayHeat.surface;
  }

  function draw() {
    if (!map || workspace.hidden) return;
    const isReplay = panelMode === 'feedback';
    const isPhysics = ['edge', 'wet', 'tracer'].includes(activeEvidence) && !isReplay;
    const plan = isPhysics ? 'A' : mission.plan;
    const end = routeEnd(plan);
    const flight = isReplay ? flightAt({ segments: segments[plan], routeEnd: end }, Math.min(mission.time, end)) : undefined;
    const wind = isReplay && mission.windShift ? 0 : isPhysics ? baseWind : windFrom;
    const showEdge = isPhysics || isReplay || activeEvidence === 'weather';
    const edge = showEdge ? edgesFor(wind) : [];
    const showDeposition = isReplay && plan === 'A' && mission.deposition;
    const segment = isPhysics && receptor && edge[Math.floor(edge.length / 2)];
    const marks = segment ? [{
      point: [(segment[0][0] + segment[1][0]) / 2 + 15, (segment[0][1] + segment[1][1]) / 2],
      offset: [25, -22], label: 'R',
    }] : [];
    if (isReplay && mission.scene) {
      updateScene(flight, mission.time, showDeposition, edge);
    } else {
      drawMap(map, data, aerial, {
        surface: showDeposition ? replaySurface() : isPhysics && activeEvidence !== 'edge' ? surfaceFor(activeEvidence) : undefined,
        segments: activeEvidence === 'weather' && !isReplay ? [] : segments[plan],
        flight, selected: flight?.number, edge, marks,
      });
    }
    const windLabel = 'Wind from ' + cardinal[wind] + ' toward ' + cardinal[(wind + 180) % 360];
    headline.textContent = isReplay ? 'Farmland operation replay'
      : isPhysics ? { edge: 'Downwind boundary', wet: 'Wet spray deposition', tracer: 'Tracer deposition' }[activeEvidence]
        : activeEvidence === 'weather' ? 'Farmland boundary' : 'Plan ' + plan + ' · ' + routeName(plan);
    condition.textContent = isPhysics ? 'Plan A · Run-03 simulation' : windLabel;
    map.setAttribute('aria-label', headline.textContent + '. ' + (showEdge ? windLabel + '. Downwind edge highlighted in amber.' : 'Planned spray passes and transfers.'));
    if (isReplay) {
      output.textContent = timeLabel(mission.time) + ' / ' + timeLabel(end) + ' · Segment ' + flight.number + ' of ' + segments[plan].length + ' · ' + (flight.spray ? 'Spray on' : 'Spray off');
      range.value = mission.time;
      mapStatus.textContent = [
        mission.windShift ? 'Example wind shift · north wind' : 'Planned route replay · ' + baseSpeed + ' m/s from the west',
        showDeposition ? 'Run-03 layer · case wind' : '',
      ].filter(Boolean).join('    ');
    } else if (isPhysics && activeEvidence !== 'edge') {
      mapStatus.textContent = 'Deposition in g/m² · scale 0–' + data.display.color_max_gm2[activeEvidence === 'wet' ? 'wet' : 'nv'];
    } else {
      mapStatus.textContent = showEdge ? 'White · field boundary    Amber · downwind edge' : 'Coral · spray pass    Dashed · transfer';
    }
  }

  function stop() {
    mission.playing = false;
    cancelAnimationFrame(replayFrame);
    if (play) play.textContent = 'Play replay';
  }

  function tick(now) {
    if (!mission.playing || workspace.hidden) return;
    const end = routeEnd(mission.plan);
    if (previousTime) mission.time = Math.min(end, mission.time + (now - previousTime) * .04);
    previousTime = now;
    if (now - drawFrame > 80 || mission.time === end) {
      draw();
      drawFrame = now;
    }
    if (mission.time === end) stop();
    else replayFrame = requestAnimationFrame(tick);
  }

  function playReplay() {
    if (mission.playing) return stop();
    if (mission.time >= routeEnd(mission.plan)) mission.time = 0;
    mission.playing = true;
    previousTime = drawFrame = 0;
    play.textContent = 'Pause replay';
    replayFrame = requestAnimationFrame(tick);
  }

  function choosePlan(id) {
    stop();
    mission.plan = id;
    mission.confirmed = false;
    mission.time = 0;
    mission.windShift = mission.reviewed = mission.acknowledged = mission.deposition = mission.scene = false;
    render('.workspace-actions [aria-pressed="true"]');
  }

  function planTable() {
    const table = make('table', 'workspace-table');
    const head = table.createTHead().insertRow();
    for (const label of ['Planned metric', 'Plan A', 'Plan B']) {
      const cell = make('th', '', label);
      cell.scope = 'col';
      head.append(cell);
    }
    const body = table.createTBody();
    for (const [label, format] of [
      ['Target covered', (p) => p.coveragePercent.toFixed(1) + '%'],
      ['Flight time', (p) => p.seconds.toFixed(1) + ' s'],
      ['Spray passes / all segments', (p) => p.segments.filter((s) => s.spray).length + ' / ' + p.segments.length],
      ['Transfer distance', (p) => number.format(p.transferDistance) + ' m'],
    ]) {
      const row = body.insertRow();
      const title = make('th', '', label);
      title.scope = 'row';
      row.append(title);
      for (const plan of Object.values(plans)) row.insertCell().textContent = format(plan);
    }
    return table;
  }

  function planControls() {
    const buttons = make('div', 'workspace-actions');
    buttons.append(...['A', 'B'].map((id) => action('Plan ' + id + ' · ' + routeName(id), () => choosePlan(id), mission.plan === id)));
    return buttons;
  }

  function confirmation() {
    const buttons = make('div', 'workspace-actions');
    buttons.append(action(mission.confirmed ? 'Plan ' + mission.plan + ' confirmed' : 'Confirm Plan ' + mission.plan, () => {
      mission.confirmed = true;
      render();
      sidebar.querySelector('[data-continue]')?.focus();
    }, mission.confirmed));
    if (mission.confirmed) {
      const next = action(view === 'planning' ? 'Open replay' : 'Continue to replay', () => {
        if (view === 'planning') navigate('feedback');
        else stepGuide(6);
      });
      next.setAttribute('data-continue', '');
      buttons.append(next);
    }
    return buttons;
  }

  function planning() {
    const result = weather.scenarios.find((item) => item.weather.windFromDeg === windFrom
      && item.weather.windSpeedMps === windSpeed && item.weather.gustPercent === 0);
    const recommended = result?.options.find((option) => option.bearingDeg === result.recommendedBearing);
    const inputs = make('div', 'workspace-actions');
    inputs.append(
      select('Wind from', Object.entries(cardinal), windFrom, (value) => {
        windFrom = Number(value);
        render('[data-weather] select');
      }),
      select('Wind speed', [[2, '2.0 m/s'], [4.6, '4.6 m/s']], windSpeed, (value) => {
        windSpeed = Number(value);
        render('[data-weather] label:nth-child(2) select');
      }),
    );
    inputs.setAttribute('data-weather', '');
    const direction = recommended?.bearingDeg === 0 ? 'north–south' : 'east–west';
    sidebar.append(flow(['Weather', 'Field limits', 'Routes', 'Confirm'], mission.confirmed ? 3 : 2), inputs,
      make('p', 'workspace-annotation', recommended
        ? 'The wind-only estimate favors ' + direction + ' flight lines at ' + windSpeed + ' m/s from the ' + cardinal[windFrom].toLowerCase() + '.'
        : 'Choose a wind scenario to compare flight directions.'),
      make('p', 'workspace-note', 'Both plans use a 20 m swath and an 11 m setback. Plan A has the complete Run-03 deposition simulation.'),
      planControls(), planTable(), confirmation());
  }

  function drift() {
    const buttons = make('div', 'workspace-actions');
    for (const [id, label] of [['edge', 'Downwind edge'], ['wet', 'Wet spray'], ['tracer', 'Tracer']]) {
      buttons.append(action(label, () => { layer = id; render('[aria-pressed="true"]'); }, layer === id));
    }
    const exceeded = data.metrics.outside_fraction_of_sprayed_nonvolatile * 100 > threshold;
    const limit = select('Example off-field limit', [[1, '1%'], [2, '2%'], [3, '3%'], [5, '5%']], threshold, (value) => {
      threshold = Number(value);
      render('.workspace-field select');
    });
    const mark = action(receptor ? 'Hide example receptor' : 'Mark an example receptor', () => {
      receptor = !receptor;
      render('[data-receptor]');
    }, receptor);
    mark.setAttribute('data-receptor', '');
    sidebar.append(flow(['Sense wind', 'Model droplets', 'Assess risk'], layer === 'edge' ? 0 : 2), buttons,
      facts([['Water evaporated', model[0]], ['In-field tracer', model[1]], ['Off-field tracer', model[2]], ['Drift P95', model[3]]]),
      limit, make('p', 'workspace-annotation', 'Modeled off-field tracer is ' + (exceeded ? 'above' : 'within') + ' the selected example limit.'),
      make('p', 'workspace-note', 'Wind carries droplets toward the amber edge. Evaporation reduces liquid water. Tracer shows where the nonvolatile material lands. Drift P95 is the distance within which 95% of landed tracer mass settles.'),
      mark,
      action('Watch droplet flight', () => navigate('spraying')));
    if (receptor) sidebar.append(make('p', 'workspace-note', 'R marks an example location to check for a sensitive crop, waterway or occupied area.'));
  }

  function assistant() {
    const [, , title, next] = questions[question];
    const evidence = {
      weather: () => facts([['Case wind', baseSpeed + ' m/s from the west'], ['Temperature & humidity', climate]]),
      route: planTable,
      edge: () => facts([['Off-field tracer', model[2]], ['Drift P95', model[3]]]),
      tracer: () => facts([['In-field tracer', model[1]], ['Off-field tracer', model[2]]]),
      wet: () => facts([['Water evaporated', model[0]], ['In-field tracer', model[1]]]),
    };
    sidebar.append(flow(['Question', 'Case evidence', 'Map', 'Next action'], 2),
      select('Explore a question', questions.map(([label], index) => [index, label]), question, (value) => {
        question = Number(value);
        render('.workspace-field select');
      }),
      make('h2', '', title), evidence[activeEvidence](), make('p', 'workspace-annotation', next),
      action('Open AI Decision Assistant in AeroGuard', () => openDashboard('mid', 'aiTitle')));
    if (['edge', 'wet', 'tracer'].includes(activeEvidence)) sidebar.append(make('p', 'workspace-note', modelDescription));
  }

  function feedback(includeFlow = true) {
    const buttons = make('div', 'workspace-actions');
    play = action('Play replay', playReplay);
    const example = action(mission.windShift ? 'Restore case wind' : 'Show an example wind shift', () => {
      mission.windShift = !mission.windShift;
      mission.reviewed = false;
      mission.acknowledged = false;
      const resume = mission.playing;
      stop();
      render('[data-wind-shift]');
      if (resume) playReplay();
    });
    example.setAttribute('data-wind-shift', '');
    buttons.append(play, example);
    const replay = make('label', 'workspace-field', 'Replay position');
    range = make('input');
    range.type = 'range';
    range.min = 0;
    range.max = routeEnd(mission.plan);
    range.step = .1;
    range.addEventListener('input', () => { mission.time = range.valueAsNumber; draw(); });
    output = make('output', 'workspace-timeline');
    replay.append(range, output);
    const stage = mission.acknowledged ? 3 : mission.reviewed ? 2 : mission.windShift ? 1 : 0;
    if (includeFlow) sidebar.append(flow(['Sense', 'Understand', 'Recommend', 'Respond'], stage));
    if (mission.plan === 'A') buttons.append(action('Run-03 deposition', (event) => {
      mission.deposition = !mission.deposition;
      event.currentTarget.setAttribute('aria-pressed', String(mission.deposition));
      draw();
    }, mission.deposition));
    if (mission.plan === 'A') buttons.append(action('3D field view', (event) => {
      mission.scene = !mission.scene;
      event.currentTarget.setAttribute('aria-pressed', String(mission.scene));
      map.hidden = mission.scene;
      showScene(mission.scene ? map.parentElement : null);
      draw();
    }, mission.scene));
    sidebar.append(facts([
      ['Route', 'Plan ' + mission.plan + ' · ' + routeName(mission.plan)],
      [mission.windShift ? 'Example wind' : 'Case wind', baseSpeed + ' m/s from the ' + (mission.windShift ? 'north' : 'west')],
    ]), replay, buttons);
    if (!mission.windShift) {
      sidebar.append(make('p', 'workspace-note', 'The aircraft marker and spray state follow the same planned route clock. Transfers run with spray off.'));
      return;
    }
    const messages = {
      1: 'The example wind shift moves the downwind edge south. The map marks the boundary to inspect.',
      2: 'Pause and check the southern boundary for sensitive areas before proceeding.',
      3: 'Review acknowledged. The replay is paused at the selected segment.',
    };
    sidebar.append(make('p', 'workspace-annotation', messages[stage]));
    if (stage === 1) {
      const review = action('Review changed boundary', () => {
        mission.reviewed = true;
        const resume = mission.playing;
        stop();
        render('[data-acknowledge]');
        if (resume) playReplay();
      });
      sidebar.append(review);
    }
    if (stage === 2) {
      const acknowledge = action('Pause and acknowledge', () => {
        stop();
        mission.acknowledged = true;
        render('[data-wind-shift]');
      });
      acknowledge.setAttribute('data-acknowledge', '');
      sidebar.append(acknowledge);
    }
  }

  function stepGuide(index) {
    stop();
    guide = index;
    render('[aria-current="step"]');
  }

  function guided() {
    const navigation = make('div', 'workspace-guide');
    for (const [index, [label]] of guideSteps.entries()) {
      const button = action(label, () => stepGuide(index));
      if (index === guide) button.setAttribute('aria-current', 'step');
      navigation.append(button);
    }
    sidebar.append(navigation, make('h2', '', guideSteps[guide][0]), make('p', 'workspace-annotation', guideSteps[guide][2]));
    if (guide === 2) sidebar.append(facts([['Wind', baseSpeed + ' m/s from the west'], ['Temperature & humidity', climate]]));
    if (guide === 4) sidebar.append(planControls(), planTable());
    if (guide === 5) sidebar.append(planControls(), confirmation());
    if (guide === 6) feedback(false);
    if (guide === 7) {
      if (mission.plan === 'B') sidebar.append(make('p', 'workspace-note', 'Plan B has a planned route and flight metrics. The reference report shows the full Plan A simulation.'));
      sidebar.append(action(mission.plan === 'A' ? 'Open operation report' : 'Open Plan A reference report',
        () => openDashboard('post', 'reportDocument')));
    }
    const buttons = make('div', 'workspace-actions');
    if (guide < 7 && guide !== 5) buttons.append(action('Continue', () => stepGuide(guide + 1)));
    buttons.append(action('Advanced view', () => openDashboard(guide >= 6 ? 'post' : 'pre')));
    sidebar.append(buttons);
  }

  function comparison() {
    const list = make('div', 'workspace-comparison');
    for (const [name, type, description, actionLabel, destination, secondLabel, secondUrl] of comparisons) {
      const item = make('article');
      item.append(make('h2', '', name), make('strong', '', type), make('p', '', description));
      for (const [label, url] of [[actionLabel, destination], [secondLabel, secondUrl]]) {
        if (!url) continue;
        if (url.startsWith('https:')) {
          const link = make('a', 'workspace-link', label);
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(link);
        } else item.append(action(label, () => navigate(url)));
      }
      list.append(item);
    }
    workspace.replaceChildren(list);
  }

  function render(focus) {
    if (view === 'comparison') return comparison();
    sidebar.replaceChildren();
    panelMode = view === 'accessibility' ? 'guided' : view;
    if (panelMode === 'guided' && guide === 6) panelMode = 'feedback';
    if (panelMode !== 'feedback') mission.scene = false;
    map.hidden = mission.scene;
    showScene(mission.scene ? map.parentElement : null);
    activeEvidence = {
      planning: 'route', drift: layer, assistant: questions[question][1], feedback: 'route',
      guided: guideSteps[guide][1], accessibility: guideSteps[guide][1],
    }[view];
    if (view === 'planning') planning();
    else if (view === 'drift') drift();
    else if (view === 'assistant') assistant();
    else if (view === 'feedback') feedback();
    else guided();
    draw();
    if (focus) sidebar.querySelector(focus)?.focus({ preventScroll: true });
  }

  function show(chapter) {
    stop();
    mission.scene = false;
    showScene(null);
    view = chapter;
    workspace.hidden = !view;
    if (!view) return;
    windFrom = baseWind;
    windSpeed = baseSpeed;
    layer = 'edge';
    receptor = false;
    question = guide = 0;
    workspace.dataset.view = chapter;
    if (view === 'comparison') return comparison();
    const figure = make('figure', 'workspace-map');
    const header = make('figcaption');
    headline = make('strong');
    condition = make('span');
    header.append(headline, condition);
    map = make('canvas');
    map.setAttribute('role', 'img');
    mapStatus = make('small', 'workspace-map-status');
    figure.append(header, map, mapStatus);
    sidebar = make('div', 'workspace-side');
    workspace.replaceChildren(figure, sidebar);
    render();
  }

  function present(progress) {
    if (reducedMotion.matches || workspace.hidden) return;
    if (view === 'planning') {
      const desiredWind = progress > .47 ? 0 : baseWind;
      const desiredPlan = progress > .47 ? 'A' : 'B';
      if (windFrom !== desiredWind || mission.plan !== desiredPlan || mission.confirmed !== (progress > .78)) {
        windFrom = desiredWind;
        mission.plan = desiredPlan;
        mission.confirmed = progress > .78;
        render();
      }
    } else if (view === 'drift') {
      const desired = progress > .66 ? 'tracer' : progress > .32 ? 'wet' : 'edge';
      if (layer !== desired) { layer = desired; render(); }
    } else if (view === 'assistant') {
      const desired = progress > .70 ? 4 : progress > .37 ? 3 : 1;
      if (question !== desired) { question = desired; render(); }
    } else if (view === 'feedback') {
      const shift = progress > .35;
      const reviewed = progress > .56;
      const acknowledged = progress > .72;
      const scene = mission.plan === 'A' && progress > .13 && progress < .35;
      if (mission.windShift !== shift || mission.reviewed !== reviewed || mission.acknowledged !== acknowledged || mission.scene !== scene) {
        mission.windShift = shift;
        mission.reviewed = reviewed;
        mission.acknowledged = acknowledged;
        mission.deposition = mission.plan === 'A';
        mission.scene = scene;
        render();
      }
      if (performance.now() - drawFrame > 100 || !drawFrame) {
        mission.time = routeEnd(mission.plan) * Math.min(progress, .72);
        draw();
        drawFrame = performance.now();
      }
    }
  }

  return { show, present, selectedPlan: () => mission.plan };
}
