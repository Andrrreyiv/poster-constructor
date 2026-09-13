import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plateList, plateLabel, plateById, defaultPlate,
  plateSize, orientationEnabled, defaultOrientation,
} from '../src/js/poster/Plates.js';
import { makeConfig } from './fixture.js';

test('список пластин сохраняет порядок конфига', () => {
  assert.deepEqual(plateList(makeConfig()).map((p) => p.id), ['10x15', '30x40', '40x60']);
});

test('подпись пишется как ширина × высота с единицей', () => {
  assert.equal(plateLabel({ wCm: 30, hCm: 40 }), '30 × 40 см');
});

test('подпись у пустой пластины не падает, а даёт пустую строку', () => {
  assert.equal(plateLabel(null), '');
});

test('пластина находится по id', () => {
  assert.equal(plateById(makeConfig(), '30x40').price, 1500);
});

// Неизвестный id приходит из сохранённого состояния или из чужой ссылки.
test('неизвестный id даёт null, а не падение', () => {
  assert.equal(plateById(makeConfig(), 'нет-такой'), null);
});

test('по умолчанию берётся первая пластина списка', () => {
  assert.equal(defaultPlate(makeConfig()).id, '10x15');
});

test('пустой список пластин не роняет defaultPlate', () => {
  assert.equal(defaultPlate({ plates: { items: [] } }), null);
});

test('книжная ориентация оставляет размеры как в конфиге', () => {
  assert.deepEqual(plateSize({ wCm: 30, hCm: 40 }, 'portrait'), { wCm: 30, hCm: 40 });
});

// Главный смысл переключателя: та же пластина, повёрнутая на бок.
test('альбомная ориентация меняет стороны местами', () => {
  assert.deepEqual(plateSize({ wCm: 30, hCm: 40 }, 'landscape'), { wCm: 40, hCm: 30 });
});

test('ориентация по умолчанию — книжная, мусор тоже даёт книжную', () => {
  assert.deepEqual(plateSize({ wCm: 30, hCm: 40 }), { wCm: 30, hCm: 40 });
  assert.deepEqual(plateSize({ wCm: 30, hCm: 40 }, 'ерунда'), { wCm: 30, hCm: 40 });
});

// Клиент об ориентации не просил — флаг обязан её гасить целиком.
test('переключатель ориентации выключается флагом конфига', () => {
  assert.equal(orientationEnabled(makeConfig()), true);
  assert.equal(orientationEnabled(makeConfig({ orientation: { enabled: false } })), false);
});

test('отсутствие раздела ориентации считается включённым', () => {
  assert.equal(orientationEnabled({}), true);
});

test('ориентация по умолчанию читается из конфига', () => {
  assert.equal(defaultOrientation(makeConfig()), 'portrait');
  assert.equal(defaultOrientation(makeConfig({ orientation: { default: 'landscape' } })), 'landscape');
});
