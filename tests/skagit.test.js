import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeposition, flightAt, pointAt } from '../src/skagit-data.js';
import { project, unproject } from '../src/skagit-map.js';

function data(name) {
  const bytes = readFileSync(new URL(`../public/skagit/${name}`, import.meta.url));
  return JSON.parse(name.endsWith('.bin') ? gunzipSync(bytes) : bytes);
}

const field = data('case.json');
const events = data('landings.bin');

test('field and landings share the image projection and full-route extent', () => {
  const [x, y, width, height] = field.display.overview_crop_px;
  const contains = (east, north) => {
    const [u, v] = project(field, east, north);
    assert.ok(u >= x && u <= x + width && v >= y && v <= y + height);
    const [e, n] = unproject(field, u, v);
    assert.ok(Math.abs(e - east) < 1e-8 && Math.abs(n - north) < 1e-8);
  };
  for (const p of field.field) contains(...p);
  for (const [, east, north] of events) contains(east, north);
});

test('the aircraft follows every reviewed segment and turns continuously with spray off in transfers', () => {
  const epsilon = 1e-5;
  assert.equal(field.reviewed.length, field.segments.length);
  assert.equal(field.segments.filter(segment => segment.spray).length, 11);
  field.segments.forEach((segment, i) => {
    const start = segment.start_time_s;
    const middle = flightAt(field, start + segment.duration_s / 2);
    assert.equal(middle.spray, field.reviewed[i].spray);
    assert.equal(middle.number, field.reviewed[i].number);
    if (!i) return;
    const before = flightAt(field, start - epsilon);
    const at = flightAt(field, start);
    assert.deepEqual(at.position, segment.start_enu_m);
    assert.equal(at.spray, segment.spray);
    assert.ok(Math.hypot(...at.position.map((value, k) => value - before.position[k])) < 1e-4);
    assert.ok(Math.cos(at.yaw - before.yaw) > .999999);
  });
  assert.equal(flightAt(field, field.routeEnd).spray, false);
  assert.deepEqual(flightAt(field, field.end).position, field.segments.at(-1).end_enu_m);
});

test('deposition appears at landing and the final wet spray and tracer rasters preserve mass', () => {
  const raster = createDeposition(field, events);
  const time = events[0][0];
  raster.seek(time - 1e-6);
  assert.equal(raster.count, 0);
  raster.seek(time);
  assert.ok(raster.count > 0);
  assert.ok(raster.wet.some(value => value > 0));
  raster.seek(0);
  assert.equal(raster.count, 0);
  assert.ok(raster.wet.every(value => value === 0));
  assert.equal(field.end, events.at(-1)[0]);
  raster.seek(field.end);
  assert.equal(raster.count, field.metrics.landed_particles);
  assert.deepEqual(field.display.color_max_gm2, { wet: 15, nv: .02 });
  for (const [kind, column] of [['wet', 3], ['nv', 4]]) {
    let mass = 0;
    for (const value of raster[kind]) mass += value;
    mass *= raster.cell ** 2 / 1000;
    const expected = events.reduce((sum, row) => sum + row[column] + (kind === 'wet' ? row[4] : 0), 0);
    assert.ok(Math.abs(mass - expected) < 1e-8);
  }
});

test('Physics and Mapping use releases from the planned spray passes and stop tracks at landing', () => {
  const physics = data('physics.json');
  physics.paths.forEach((points, i) => {
    assert.equal(points[0][4], physics.samples[i].diameter);
    assert.equal(flightAt(field, points[0][0]).number, 1);
    assert.equal(points.at(-1)[3], 0);
    assert.equal(pointAt(points, points.at(-1)[0]), null);
    assert.equal(pointAt(points, points.at(-1)[0], { includeLanding: true }), points.at(-1));
  });
  const tracks = data('tracks.bin');
  assert.equal(tracks.length, 1024);
  for (const [diameter, points] of tracks) {
    assert.ok(diameter >= field.display.trajectory_display.minimum_initial_diameter_um);
    assert.equal(flightAt(field, points[0][0]).spray, true);
  }
});
