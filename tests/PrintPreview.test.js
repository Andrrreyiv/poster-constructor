import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrintPreview } from '../src/js/poster/PrintPreview.js';
import { pinStyle, keyAction } from '../src/js/poster/LibraryPanel.js';

const items = [{ file: 'a.svg' }, { file: 'b.svg' }, { file: 'c.svg' }];

test('в начале просмотр закрыт', () => {
  assert.equal(new PrintPreview().isOpen, false);
});

test('открывается на нужной позиции', () => {
  const p = new PrintPreview();
  p.open(items, 1);
  assert.equal(p.isOpen, true);
  assert.equal(p.current.file, 'b.svg');
});

test('пустой список молча не открывается', () => {
  const p = new PrintPreview();
  p.open([], 0);
  assert.equal(p.isOpen, false);
});

test('индекс за границами прижимается к краю', () => {
  const p = new PrintPreview();
  p.open(items, 99);
  assert.equal(p.current.file, 'c.svg');
});

// Молчащая кнопка на последней картинке читается как поломка, а не как конец списка.
test('листание вперёд зациклено', () => {
  const p = new PrintPreview();
  p.open(items, 2);
  p.next();
  assert.equal(p.current.file, 'a.svg');
});

test('листание назад зациклено', () => {
  const p = new PrintPreview();
  p.open(items, 0);
  p.prev();
  assert.equal(p.current.file, 'c.svg');
});

test('pick отдаёт файл того, что сейчас на экране', () => {
  const p = new PrintPreview();
  p.open(items, 1);
  assert.equal(p.pick(), 'b.svg');
});

test('закрытие сбрасывает состояние', () => {
  const p = new PrintPreview();
  p.open(items, 1);
  p.close();
  assert.equal(p.isOpen, false);
  assert.equal(p.pick(), null);
});

// ⚠️ Урок перенесён вместе с кодом: position:absolute внутри iframe замыкал петлю
// «страница ползёт до бесконечности». Поэтому fixed и расчёт от экрана родителя.
test('окно библиотеки крепится к экрану родителя, а не к документу', () => {
  const pin = pinStyle({ top: -120, bottom: 900 }, 800);
  assert.equal(pin.position, 'fixed');
  assert.equal(pin.top, 120);
  assert.equal(pin.height, 800);
});

test('рамка целиком в экране — окно по её высоте', () => {
  const pin = pinStyle({ top: 100, bottom: 600 }, 800);
  assert.equal(pin.top, 0);
  assert.equal(pin.height, 500);
});

test('окно не схлопывается ниже читаемой высоты', () => {
  assert.equal(pinStyle({ top: 0, bottom: 50 }, 800).height, 240);
});

// Иначе покупатель, закрывая увеличенную картинку, вылетал бы из библиотеки целиком.
test('Esc при открытом просмотре гасит только просмотр', () => {
  assert.equal(keyAction('Escape', true), 'closePreview');
  assert.equal(keyAction('Escape', false), 'closeModal');
});

test('стрелки листают только при открытом просмотре', () => {
  assert.equal(keyAction('ArrowRight', true), 'next');
  assert.equal(keyAction('ArrowLeft', true), 'prev');
  assert.equal(keyAction('ArrowRight', false), 'none');
});

test('прочие клавиши ничего не делают', () => {
  assert.equal(keyAction('Enter', true), 'none');
  assert.equal(keyAction('a', false), 'none');
});
