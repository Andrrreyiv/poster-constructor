import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateAmount, frameAmount, priceOf } from '../src/js/poster/PosterPrice.js';
import { makeConfig } from './fixture.js';

test('цена пластины берётся из её строки конфига', () => {
  assert.equal(plateAmount(makeConfig(), '30x40'), 1500);
});

test('неизвестная пластина стоит ноль, а не NaN', () => {
  assert.equal(plateAmount(makeConfig(), 'нет-такой'), 0);
});

test('доплата за раму берётся из её строки конфига', () => {
  assert.equal(frameAmount(makeConfig(), 'wood'), 600);
});

test('без рамы доплаты нет', () => {
  assert.equal(frameAmount(makeConfig(), null), 0);
});

// Иначе в итоговой строке появлялось бы «NaN ₽».
test('неизвестная рама стоит ноль, а не NaN', () => {
  assert.equal(frameAmount(makeConfig(), 'битый'), 0);
});

test('итог — это пластина плюс рама', () => {
  const p = priceOf(makeConfig(), { plateId: '30x40', frameId: 'wood' });
  assert.equal(p.plate, 1500);
  assert.equal(p.frame, 600);
  assert.equal(p.total, 2100);
});

test('снятая рама возвращает цену к цене пластины', () => {
  const cfg = makeConfig();
  const сРамой = priceOf(cfg, { plateId: '10x15', frameId: 'white' }).total;
  const безРамы = priceOf(cfg, { plateId: '10x15', frameId: null }).total;
  assert.equal(сРамой - безРамы, 400);
  assert.equal(безРамы, 300);
});

test('детализация перечисляет пластину и раму отдельными строками', () => {
  const p = priceOf(makeConfig(), { plateId: '40x60', frameId: 'white' });
  assert.deepEqual(p.lines, [
    { label: 'Пластина 40 × 60 см', amount: 2200 },
    { label: 'Рама: белая', amount: 400 },
  ]);
});

test('без рамы в детализации только пластина', () => {
  const p = priceOf(makeConfig(), { plateId: '10x15', frameId: null });
  assert.equal(p.lines.length, 1);
});

test('пустое состояние даёт ноль и пустую детализацию, а не падение', () => {
  const p = priceOf(makeConfig(), {});
  assert.equal(p.total, 0);
  assert.deepEqual(p.lines, []);
});


// ── Итог с ценой рамы под выбранную пластину (клиент 19.09) ───────────────────

const сМатрицейЦен = makeConfig({
  frames: {
    enabled: true,
    widthRatio: 0.05,
    options: [{ id: 'white', label: 'Белая', prices: { '10x15': 200, '30x40': 350 } }],
  },
});

test('одна и та же рама стоит по-разному на разных пластинах', () => {
  assert.equal(priceOf(сМатрицейЦен, { plateId: '10x15', frameId: 'white' }).total, 300 + 200);
  assert.equal(priceOf(сМатрицейЦен, { plateId: '30x40', frameId: 'white' }).total, 1500 + 350);
});

test('рама без цены под этот размер не добавляет к итогу и не даёт NaN', () => {
  const p = priceOf(сМатрицейЦен, { plateId: '40x60', frameId: 'white' });
  assert.equal(p.frame, 0);
  assert.equal(p.total, 2200);
});
