import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameList, frameById, frameThickness, frameGeometry,
} from '../src/js/poster/FrameOption.js';
import { makeConfig } from './fixture.js';

test('список рам приходит из конфига', () => {
  assert.deepEqual(frameList(makeConfig()).map((f) => f.id), ['white', 'wood']);
});

test('выключенная опция рамы даёт пустой список', () => {
  assert.deepEqual(frameList(makeConfig({ frames: { enabled: false, options: [{ id: 'x' }] } })), []);
});

// null — это «без рамы», законное состояние по умолчанию, а не ошибка.
test('null и неизвестный id одинаково означают «без рамы»', () => {
  assert.equal(frameById(makeConfig(), null), null);
  assert.equal(frameById(makeConfig(), 'нет-такой'), null);
});

// Физически багет одинаков по периметру, поэтому считаем от МЕНЬШЕЙ стороны.
test('толщина багета считается от меньшей стороны', () => {
  assert.equal(frameThickness(400, 600, makeConfig()), 20);
  assert.equal(frameThickness(600, 400, makeConfig()), 20);
});

test('отсутствие widthRatio даёт разумную толщину по умолчанию', () => {
  assert.equal(frameThickness(1000, 1000, { frames: {} }), 55);
});

test('слишком большой widthRatio прижимается к потолку', () => {
  assert.equal(frameThickness(1000, 1000, { frames: { widthRatio: 5 } }), 250);
});

// ГЛАВНОЕ отличие от «рисуемой рамки», как было записано до голосового клиента:
// рама физическая и НАРУЖНАЯ — пластина не уменьшается, растёт общий габарит.
test('рама добавляется снаружи: пластина не уменьшается', () => {
  const geo = frameGeometry(400, 600, makeConfig(), 'white');
  assert.equal(geo.thickness, 20);
  assert.equal(geo.outerW, 440);
  assert.equal(geo.outerH, 640);
  assert.equal(geo.offset, 20);
  // Внутренняя область равна исходной пластине — картинка ничем не перекрыта.
  assert.equal(geo.outerW - geo.offset * 2, 400);
  assert.equal(geo.outerH - geo.offset * 2, 600);
});

test('без рамы габарит равен пластине, сдвига нет', () => {
  const geo = frameGeometry(400, 600, makeConfig(), null);
  assert.deepEqual(
    { outerW: geo.outerW, outerH: geo.outerH, offset: geo.offset, thickness: geo.thickness },
    { outerW: 400, outerH: 600, offset: 0, thickness: 0 },
  );
  assert.equal(geo.frame, null);
});

test('геометрия отдаёт саму раму — по ней рисуется цвет и волокно', () => {
  assert.equal(frameGeometry(400, 600, makeConfig(), 'wood').frame.grain, true);
});
