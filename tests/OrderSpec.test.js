import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderSpec, isReady, specLines } from '../src/js/poster/OrderSpec.js';
import { makeConfig } from './fixture.js';

const картинка = { src: 'assets/prints/messi/1.svg', w: 2400, h: 3600, origin: 'library' };

test('спецификация собирает пластину, раму и картинку', () => {
  const spec = buildOrderSpec(makeConfig(), {
    plateId: '30x40', frameId: 'wood', orientation: 'portrait', image: картинка,
  });
  assert.equal(spec.plate.id, '30x40');
  assert.equal(spec.plate.wCm, 30);
  assert.equal(spec.frame.id, 'wood');
  assert.equal(spec.image.origin, 'library');
  assert.equal(spec.price.total, 2100);
});

// Поворот обязан доехать до заказа: печатнику важно, как резать и как вешать.
test('альбомная ориентация доезжает до спецификации размерами', () => {
  const spec = buildOrderSpec(makeConfig(), {
    plateId: '30x40', orientation: 'landscape', image: картинка,
  });
  assert.equal(spec.orientation, 'landscape');
  assert.equal(spec.plate.wCm, 40);
  assert.equal(spec.plate.hCm, 30);
});

test('без рамы раздел рамы пустой, а не выдуманный', () => {
  const spec = buildOrderSpec(makeConfig(), { plateId: '10x15', frameId: null, image: картинка });
  assert.equal(spec.frame, null);
  assert.equal(spec.price.frame, 0);
});

test('оценка качества попадает в спецификацию', () => {
  const spec = buildOrderSpec(makeConfig(), {
    plateId: '40x60', image: { src: 'x', w: 800, h: 600, origin: 'upload' },
  });
  assert.equal(spec.quality.level, 'bad');
  assert.ok(spec.quality.dpi > 0);
});

// Клиент просил предупреждать, а не запрещать — плохое качество заказ не блокирует.
test('низкое качество не мешает оформить заказ', () => {
  const spec = buildOrderSpec(makeConfig(), {
    plateId: '40x60', image: { src: 'x', w: 800, h: 600, origin: 'upload' },
  });
  assert.equal(spec.ready, true);
});

test('без картинки заказ не готов', () => {
  assert.equal(buildOrderSpec(makeConfig(), { plateId: '10x15' }).ready, false);
});

test('без пластины заказ не готов', () => {
  assert.equal(isReady({ plate: null, image: картинка }), false);
});

test('картинка без адреса не считается выбранной', () => {
  assert.equal(isReady({ plate: { id: 'x' }, image: { w: 100, h: 100 } }), false);
});

test('состав для человека перечисляет размер, раму и происхождение картинки', () => {
  const spec = buildOrderSpec(makeConfig(), {
    plateId: '30x40', frameId: 'white', image: { ...картинка, origin: 'upload' },
  });
  const labels = specLines(spec).map(([l]) => l);
  assert.deepEqual(labels, ['Пластина', 'Рама', 'Картинка', 'Разрешение']);
  assert.equal(specLines(spec)[1][1], 'Белая');
  assert.match(specLines(spec)[2][1], /своя/);
});

test('без рамы состав честно пишет «без рамы»', () => {
  const spec = buildOrderSpec(makeConfig(), { plateId: '10x15', frameId: null, image: картинка });
  assert.equal(specLines(spec).find(([l]) => l === 'Рама')[1], 'без рамы');
});

test('пустая спецификация не роняет состав', () => {
  assert.deepEqual(specLines(null), []);
});
