import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/js/core/ConfigLoader.js';
import { makeConfig } from './fixture.js';

test('боевой конфиг проходит проверку', () => {
  const { ok, errors } = validateConfig(makeConfig());
  assert.equal(ok, true, errors.join(' · '));
});

test('пустой список пластин — ошибка: показывать нечего', () => {
  const { ok, errors } = validateConfig(makeConfig({ plates: { items: [] } }));
  assert.equal(ok, false);
  assert.match(errors[0], /список пластин пуст/);
});

test('пластина без размера ловится', () => {
  const cfg = makeConfig({ plates: { items: [{ id: 'a', wCm: 0, hCm: 15, price: 300 }] } });
  assert.match(validateConfig(cfg).errors.join(' '), /сантиметрах/);
});

test('пластина без цены ловится', () => {
  const cfg = makeConfig({ plates: { items: [{ id: 'a', wCm: 10, hCm: 15 }] } });
  assert.match(validateConfig(cfg).errors.join(' '), /нет цены/);
});

test('пластина без id ловится', () => {
  const cfg = makeConfig({ plates: { items: [{ wCm: 10, hCm: 15, price: 300 }] } });
  assert.match(validateConfig(cfg).errors.join(' '), /нет id/);
});

// Дубль id ломает лукап цены МОЛЧА: находится первая пластина, а выбрана вторая.
test('повторяющиеся id ловятся отдельно', () => {
  const cfg = makeConfig({
    plates: {
      items: [
        { id: 'a', wCm: 10, hCm: 15, price: 300 },
        { id: 'a', wCm: 30, hCm: 40, price: 1500 },
      ],
    },
  });
  assert.match(validateConfig(cfg).errors.join(' '), /повторяются id/);
});

test('включённая опция рамы с пустым списком — ошибка', () => {
  const cfg = makeConfig({ frames: { enabled: true, options: [] } });
  assert.match(validateConfig(cfg).errors.join(' '), /список рам пуст/);
});

test('выключенная опция рамы пустой список разрешает', () => {
  const cfg = makeConfig({ frames: { enabled: false, options: [] } });
  assert.equal(validateConfig(cfg).ok, true);
});

test('пустой объект не роняет проверку', () => {
  assert.equal(validateConfig({}).ok, false);
});
