import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelAccordion } from '../src/js/ui/PanelAccordion.js';

test('в начале ничего не раскрыто', () => {
  assert.equal(new PanelAccordion().open, null);
});

test('клик по своей кнопке раскрывает поле', () => {
  const a = new PanelAccordion();
  assert.equal(a.toggle('details'), 'details');
  assert.equal(a.isOpen('details'), true);
});

test('повторный клик по той же кнопке сворачивает', () => {
  const a = new PanelAccordion('details');
  assert.equal(a.toggle('details'), null);
});

// Смысл аккордеона: открыто не больше одного поля.
test('открытие другого поля вытесняет прежнее', () => {
  const a = new PanelAccordion('plate');
  a.toggle('details');
  assert.equal(a.isOpen('plate'), false);
  assert.equal(a.isOpen('details'), true);
});

test('клик мимо открытого поля его сворачивает', () => {
  const a = new PanelAccordion('details');
  assert.equal(a.closeIfOutside(false), true);
  assert.equal(a.open, null);
});

// Кнопка поля лежит внутри его корня: иначе вышло бы «закрыл и сразу открыл».
test('клик внутри открытого поля ничего не меняет', () => {
  const a = new PanelAccordion('details');
  assert.equal(a.closeIfOutside(true), false);
  assert.equal(a.open, 'details');
});

test('клик мимо при всём свёрнутом не требует перерисовки', () => {
  assert.equal(new PanelAccordion().closeIfOutside(false), false);
});

test('openOnly согласует состояние, когда поле раскрылось мимо toggle', () => {
  const a = new PanelAccordion('plate');
  assert.equal(a.openOnly('details'), 'details');
});
