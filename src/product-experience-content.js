export const chapters = {
  overview: {
    title: 'Smarter spraying. Clearer decisions.',
    description: 'AI-assisted spray planning, drift prediction and operation intelligence for agricultural drones.',
    animation: ['Know what to check before you spray', 'OptiSpray combines modular environmental sensors with AeroGuard. Ask the AI Decision Assistant about a route, a drift hotspot or a report and see what supports its recommendation.'],
    links: [['Explore the farmland case', 'guided'], ['Meet the AI Decision Assistant', 'assistant']],
  },
  advantages: {
    title: 'One field. Better-informed decisions.',
    description: 'See how conditions, spray physics and operation records inform each decision.',
    items: [
      ['Weather-aware planning', 'Change the wind and compare flight directions and planned coverage.', 'planning'],
      ['Physics-based spray analysis', 'Follow droplets and inspect the downwind edge and deposition map.', 'drift'],
      ['Explainable decisions', 'Ask the AI Decision Assistant about the evidence behind a recommendation.', 'assistant'],
      ['Operation traceability', 'Review the operation summary, risk checks, efficiency and economic scenarios.', 'after'],
    ],
  },
  assistant: {
    title: 'AI Decision Assistant',
    description: 'Ask about the current operation. Review the evidence and decide what to do next.',
    view: 'intelligence',
  },
  drift: {
    title: 'Drift risk prediction',
    description: 'Follow the spray from release to deposition and check the downwind edge.',
    view: 'intelligence',
  },
  planning: {
    title: 'Smart route planning',
    description: 'Compare two routes inside the same field boundary and see how wind can change the preferred flight direction.',
    view: 'intelligence',
  },
  feedback: {
    title: 'Real-time operation feedback',
    description: 'Follow the farmland operation replay and see how changing conditions inform the next action.',
    view: 'intelligence',
  },
  guided: {
    title: 'Guided operation',
    description: 'Work through the decisions from field selection to the operation report.',
    view: 'intelligence',
  },
  wind: {
    title: 'Ultrasonic wind sensor',
    description: 'Ultrasonic pulses reveal wind speed and direction.',
    part: 'sensor',
  },
  climate: {
    title: 'Temperature & humidity',
    description: 'Air temperature and humidity help explain how droplets travel.',
    part: 'climate',
  },
  light: {
    title: 'Light sensing',
    description: 'An optical window lets the sensor read ambient light.',
    part: 'light',
  },
  position: {
    title: 'GPS positioning',
    description: 'A position fix shows where the aircraft is above the field.',
    part: 'position',
  },
  control: {
    title: 'Pump & controller',
    description: 'In the bench test, the ESP32 microcontroller stops the pump after a three-second communication loss.',
    part: 'control',
  },
  flow: {
    title: 'Flow sensing',
    description: 'The flow sensor reads liquid moving from the pump to the boom.',
    part: 'flow',
  },
  pressure: {
    title: 'Pressure & valves',
    description: 'The pressure sensor reads the liquid line at the manifold.',
    part: 'pressure',
  },
  nozzle: {
    title: 'Nozzles',
    description: 'Seven outlets across the boom release the spray.',
    part: 'nozzle',
  },
  spraying: {
    title: 'Droplet flight',
    description: 'Follow the spray from nozzle release to drift, flight passes and deposition.',
  },
  workflow: {
    title: 'From planning to report',
    description: 'Follow an AeroGuard operation before, during and after spraying.',
    view: 'workflow',
  },
  before: { title: 'Before operation', description: 'Check the wind and decide which route to review.', view: 'workflow' },
  during: { title: 'During operation', description: 'Follow the aircraft, spray state and downwind edge.', view: 'workflow' },
  after: { title: 'After operation', description: 'Review the deposition estimate, flight efficiency and economic scenarios, then save the report.', view: 'workflow' },
  dashboard: { title: 'AeroGuard workspace', description: '', view: 'dashboard' },
  comparison: {
    title: 'Product comparison',
    description: 'Compare how each product fits into a spraying operation.',
    view: 'intelligence',
  },
  modular: {
    title: 'Modular integration',
    description: 'OptiSpray is designed to add environmental sensing and spray monitoring to an existing agricultural drone.',
    items: [
      ['Hardware attachment', 'Explore the pump, controller and bench-tested communication safeguard.', 'control'],
      ['AeroGuard software', 'Follow the sensor inputs, spray model and risk layers.', 'drift'],
      ['Operator services', 'Use the same case to guide planning and review.', 'guided'],
    ],
  },
  accessibility: {
    title: 'Accessibility',
    description: 'Start with a guided checklist and open the full AeroGuard workspace when you need more detail.',
    view: 'intelligence',
  },
  pricing: {
    title: 'Pricing & services',
    description: 'Planned pricing combines a one-time hardware purchase with annual AeroGuard software.',
    items: [
      ['RMB 1,980', 'Hardware per device'],
      ['RMB 299', 'Software per device per year'],
      ['Planning and reporting', 'See how the hardware and software support a farmland operation.', 'workflow'],
    ],
  },
};

const introduction = ['overview', 17];
const advantages = ['advantages', 16];

export const tours = {
  full: [['overview', 13, 'Before you spray', 'Wind can carry droplets across a field boundary. Plan for where the spray will land.'], introduction,
    ['spraying', 25], ['drift', 20], ['planning', 26], ['feedback', 22], ['assistant', 20], ['after', 21], advantages],
  short: [['overview', 10], ['drift', 11], ['planning', 15], ['feedback', 13], ['assistant', 13], ['after', 13], ['advantages', 15]],
};
