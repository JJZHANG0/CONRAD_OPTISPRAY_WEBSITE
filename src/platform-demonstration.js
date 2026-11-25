const asset = (file) => import.meta.env.BASE_URL + 'product-demo/' + file;
const capture = (file, width, height, alt, target) => ({ file, width, height, alt, target });

export const workflow = [
  { card: 'field', seconds: 2.8, label: 'At the field edge' },
  {
    card: 'before', seconds: 2.5, label: 'Check the wind',
    note: 'The route comparison starts with the wind over the farmland.',
    image: capture('route-west.jpg', 432, 428, 'Field Route weather inputs', [1.6, 19.8, 88, 13.5]),
  },
  {
    card: 'before', seconds: 2.4, label: 'Compare directions',
    note: 'In the wind-only estimate, changing the wind direction changes the preferred flight direction.',
    image: capture('route-north.jpg', 432, 428, 'Field Route north-wind estimate', [1.6, 66.5, 88, 9]),
  },
  {
    card: 'before', seconds: 2.5, label: 'Plan A selected',
    note: 'The farmland replay follows Plan A, the north–south route.',
    image: capture('route-choice.jpg', 367, 209, 'AeroGuard north–south Plan A and east–west Plan B cards', [2.7, 4, 94, 40]),
  },
  {
    card: 'during', seconds: 2.5, label: 'Watch the flight',
    note: 'Follow the aircraft and the active spray or transfer segment on the map.',
    image: capture('monitor-progress.jpg', 1023, 198, 'AeroGuard playback controls, route progress and map legend', [1, 1, 24, 47]),
  },
  {
    card: 'during', seconds: 2, label: 'Read the spray status',
    note: 'The status row shows when spray is on during the replay and off during a transfer.',
    image: capture('monitor-spray.jpg', 720, 47, 'AeroGuard operation replay spray status', [51, 5, 13, 90]),
  },
  {
    card: 'during', seconds: 2.7, label: 'Check the drift',
    note: 'The deposition and tracer layers show where spray settles and reaches the downwind edge.',
    image: capture('monitor-drift.jpg', 706, 509, 'AeroGuard drift layer and downwind field boundary', [74, 19, 16, 77]),
  },
  {
    card: 'after', seconds: 2.7, label: 'Review the report',
    note: 'Check in-field tracer, off-field tracer and drift distance together.',
    image: capture('report-summary.jpg', 742, 412, 'AeroGuard farmland operation report and drift metrics', [26, 72, 71, 26]),
  },
  {
    card: 'after', seconds: 2, label: 'Check the safety limits',
    note: 'Compare the tracer results with the configured in-field and off-field limits.',
    image: capture('report-thresholds.jpg', 475, 56, 'AeroGuard minimum in-field and maximum off-field thresholds', [.5, 4, 93, 90]),
  },
  {
    card: 'after', seconds: 2, label: 'Export the report',
    note: 'AeroGuard can print the reviewed report or save it as a PDF.',
    image: capture('report-export.jpg', 205, 45, 'AeroGuard Print / Save PDF button', [43, 10, 54, 78]),
  },
  {
    card: 'after', seconds: 2.7, label: 'Find the saved record',
    note: 'Open the farmland operation report again from the history list.',
    image: capture('report-history.jpg', 742, 362, 'AeroGuard history with the saved farmland operation', [1, 59, 97, 40]),
  },
];

const cards = [
  ['field', 'Field tablet', 'At the field edge', 'See what the AeroGuard operator follows across one farmland operation.'],
  ['before', 'Before operation', 'Choose the route'],
  ['during', 'During operation', 'Follow the flight'],
  ['after', 'After operation', 'Review the results'],
];

export function createPlatformDemo(stage, reducedMotion, navigate, openDashboard) {
  const elements = new Map();
  const snapshots = new Map();
  for (const { image } of workflow) {
    if (!image || snapshots.has(image.file)) continue;
    const snapshot = new Image();
    snapshot.alt = image.alt;
    snapshot.src = asset(image.file);
    snapshot.decode().catch(() => {});
    snapshots.set(image.file, snapshot);
  }
  let previous = -1;
  let started = false;
  let controls;

  function setImage(card, step) {
    const { width, height, file, target } = step.image;
    const [left, top, boxWidth, boxHeight] = target;
    card.picture.style.setProperty('--picture-ratio', width / height);
    card.picture.style.setProperty('--picture-focus-x', left + boxWidth / 2 + '%');
    card.picture.style.setProperty('--picture-focus-y', top + boxHeight / 2 + '%');
    card.picture.toggleAttribute('data-wide', width / height > 3.4);
    const snapshot = snapshots.get(file);
    if (card.image !== snapshot) {
      card.image.replaceWith(snapshot);
      card.image = snapshot;
    }
    card.note.textContent = step.note;
    Object.assign(card.target.style, { left: left + '%', top: top + '%', width: boxWidth + '%', height: boxHeight + '%' });
  }

  function mount() {
    if (started) return;
    started = true;
    controls = document.createElement('nav');
    controls.className = 'workflow-controls';
    controls.setAttribute('aria-label', 'Operation stages');
    for (const [chapter, label] of [['workflow', 'Overview'], ['before', 'Before'], ['during', 'During'], ['after', 'After']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'workspace-button';
      button.dataset.phase = chapter;
      button.textContent = label;
      button.addEventListener('click', () => navigate(chapter));
      controls.append(button);
    }
    const dashboard = document.createElement('button');
    dashboard.type = 'button';
    dashboard.className = 'workspace-button workflow-dashboard';
    dashboard.textContent = 'Open AeroGuard';
    dashboard.addEventListener('click', () => openDashboard({ during: 'mid', after: 'post' }[stage.dataset.phase] ?? 'pre'));
    controls.append(dashboard);
    stage.append(controls);
    for (const [key, phase, title, description] of cards) {
      const article = document.createElement('article');
      article.className = 'workflow-card';
      article.dataset.phase = key;
      article.innerHTML = '<header><span></span><h2></h2></header><div class="workflow-media"><div class="workflow-picture"><img><i aria-hidden="true"></i></div></div><p></p>';
      article.querySelector('header span').textContent = phase;
      article.querySelector('h2').textContent = title;
      const picture = article.querySelector('.workflow-picture');
      const image = article.querySelector('img');
      const target = article.querySelector('.workflow-picture i');
      const note = article.querySelector('p');
      const card = { article, picture, image, target, note };
      if (key === 'field') {
        article.classList.add('workflow-field');
        picture.style.setProperty('--picture-ratio', 1.5);
        image.src = asset('field-tablet.webp');
        image.alt = 'Operator holding a tablet beside the field';
        const screen = document.createElement('img');
        screen.className = 'workflow-tablet-screen';
        screen.src = asset('monitor-drift.jpg');
        screen.alt = '';
        picture.append(screen);
        note.textContent = description;
      } else {
        setImage(card, workflow.find((step) => step.card === key));
      }
      elements.set(key, card);
      stage.append(article);
    }
  }

  function show(chapter) {
    stage.hidden = !chapter;
    if (!chapter) return;
    mount();
    stage.dataset.phase = chapter;
    for (const button of controls.querySelectorAll('[data-phase]')) {
      button.setAttribute('aria-pressed', String(button.dataset.phase === chapter));
    }
    for (const [phase, card] of elements) card.article.hidden = chapter !== 'workflow' && phase !== chapter;
    previous = -1;
    stage.scrollTop = 0;
    for (const key of ['before', 'during', 'after']) {
      setImage(elements.get(key), workflow.find((step) => step.card === key));
    }
  }

  function update(step) {
    if (step === previous) return;
    const card = elements.get(step.card);
    const changedCard = previous?.card !== step.card;
    previous = step;
    for (const [key, element] of elements) {
      element.article.toggleAttribute('data-active', key === step.card);
    }
    if (step.image) {
      setImage(card, step);
      card.target.getAnimations().forEach((animation) => { animation.cancel(); });
      if (!reducedMotion.matches) {
        card.target.animate([{ opacity: .15, transform: 'scale(1.15)' }, { opacity: 1, transform: 'scale(1)' }], {
          duration: 420, easing: 'cubic-bezier(.2,.8,.25,1)',
        });
      }
    }
    if (changedCard && stage.scrollHeight > stage.clientHeight + 8) {
      stage.scrollTo({
        top: card.article.offsetTop - controls.offsetTop,
        behavior: reducedMotion.matches ? 'instant' : 'smooth',
      });
    }
  }

  return { show, update };
}
