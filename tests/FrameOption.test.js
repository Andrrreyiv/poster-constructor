import { framePriceFor, framesForPlate } from '../src/js/poster/FrameOption.js';
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


// ── Цена рамы под конкретную пластину (клиент 19.09) ───────────────────────────
// Главное правило, которое здесь закрепляется: ПУСТАЯ КЛЕТКА ЗНАЧИТ «РАМЫ НЕТ»,
// а не «рама бесплатна». Спутать эти два смысла значит подарить раму покупателю.

const сМатрицей = (white, wood) => makeConfig({
  frames: {
    enabled: true,
    widthRatio: 0.05,
    options: [
      { id: 'white', label: 'Белая', prices: white },
      { id: 'wood', label: 'Под дерево', prices: wood },
    ],
  },
});

test('цена рамы берётся по id пластины', () => {
  const c = сМатрицей({ '10x15': 200, '30x40': 350 }, {});
  assert.equal(framePriceFor(c, 'white', '10x15'), 200);
  assert.equal(framePriceFor(c, 'white', '30x40'), 350);
});

test('незаполненная цена означает, что рамы под этот размер НЕТ', () => {
  const c = сМатрицей({ '10x15': 200 }, {});
  assert.equal(framePriceFor(c, 'white', '40x60'), null);
  assert.equal(framePriceFor(c, 'wood', '10x15'), null);
});

test('ноль это законная цена: рама бесплатна, но она есть', () => {
  const c = сМатрицей({ '10x15': 0 }, {});
  assert.equal(framePriceFor(c, 'white', '10x15'), 0);
  assert.deepEqual(framesForPlate(c, '10x15').map((f) => f.id), ['white']);
});

test('мусор и отрицательное в клетке прячут раму, а не обнуляют цену', () => {
  const c = сМатрицей({ '10x15': 'дорого', '30x40': -100 }, {});
  assert.equal(framePriceFor(c, 'white', '10x15'), null);
  assert.equal(framePriceFor(c, 'white', '30x40'), null);
});

test('без карты цен работает прежняя плоская цена', () => {
  const c = makeConfig();
  assert.equal(framePriceFor(c, 'white', '10x15'), 400);
  assert.equal(framePriceFor(c, 'white', '40x60'), 400);
});

test('список рам под пластину отдаёт только доступные и с их ценой', () => {
  const c = сМатрицей({ '10x15': 200, '30x40': 350 }, { '30x40': 900 });
  assert.deepEqual(framesForPlate(c, '10x15').map((f) => [f.id, f.price]), [['white', 200]]);
  assert.deepEqual(framesForPlate(c, '30x40').map((f) => [f.id, f.price]), [['white', 350], ['wood', 900]]);
});

test('под размер без единой цены рам нет вовсе', () => {
  const c = сМатрицей({ '10x15': 200 }, { '10x15': 500 });
  assert.deepEqual(framesForPlate(c, '40x60'), []);
});

test('неизвестная рама цены не имеет', () => {
  assert.equal(framePriceFor(makeConfig(), 'нет-такой', '10x15'), null);
});
