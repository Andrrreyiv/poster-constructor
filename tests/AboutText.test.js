import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutBlock, frameHint } from '../src/js/poster/AboutText.js';
import { makeConfig } from './fixture.js';

// Описание товара под превью: просьба клиента из голосового 17.09 18:10.
// Проверяется главное свойство блока: он либо показывает текст, либо не показывает
// ничего. Пустая рамка с заголовком под картинкой читается покупателем как поломка.

const с = (about) => makeConfig({ about });

test('без раздела описания блока нет', () => {
  assert.equal(aboutBlock(makeConfig()), null);
});

test('текст из конфига доходит до блока целиком', () => {
  const b = aboutBlock(с({
    title: 'О постере',
    lead: 'Изображение наносится на металлическую пластину.',
    details: ['Пластина лёгкая и не бьётся.', 'Печать по всей поверхности.'],
  }));
  assert.equal(b.title, 'О постере');
  assert.equal(b.lead, 'Изображение наносится на металлическую пластину.');
  assert.deepEqual(b.details, ['Пластина лёгкая и не бьётся.', 'Печать по всей поверхности.']);
});

test('один заголовок без единой строки текста блок не показывает', () => {
  assert.equal(aboutBlock(с({ title: 'О постере' })), null);
});

test('одной первой строки достаточно, подробности необязательны', () => {
  const b = aboutBlock(с({ lead: 'Печать на металле.' }));
  assert.equal(b.lead, 'Печать на металле.');
  assert.deepEqual(b.details, []);
});

test('флаг enabled=false гасит описание целиком', () => {
  assert.equal(aboutBlock(с({ enabled: false, lead: 'Печать на металле.' })), null);
});

test('пробелы по краям обрезаются, строка из одних пробелов не текст', () => {
  const b = aboutBlock(с({ lead: '  Печать на металле.  ', details: ['   ', 'Живая строка'] }));
  assert.equal(b.lead, 'Печать на металле.');
  assert.deepEqual(b.details, ['Живая строка']);
});

test('мусор среди подробностей отсеивается, годные строки живы', () => {
  const b = aboutBlock(с({ lead: 'Печать на металле.', details: [null, 42, {}, 'Годная', []] }));
  assert.deepEqual(b.details, ['Годная']);
});

test('подробности не массив — блок остаётся на первой строке и не падает', () => {
  const b = aboutBlock(с({ lead: 'Печать на металле.', details: 'строкой, а не списком' }));
  assert.deepEqual(b.details, []);
});

test('простыня текста обрезается по потолку в 12 абзацев', () => {
  const много = Array.from({ length: 30 }, (_, i) => 'Абзац ' + (i + 1));
  const b = aboutBlock(с({ lead: 'Печать на металле.', details: много }));
  assert.equal(b.details.length, 12);
  assert.equal(b.details[11], 'Абзац 12');
});

test('битый раздел описания не роняет конструктор', () => {
  assert.equal(aboutBlock(с('строкой вместо объекта')), null);
  assert.equal(aboutBlock(с(['списком вместо объекта'])), null);
  assert.equal(aboutBlock(makeConfig({ about: null })), null);
});

test('подсказка у рам берётся из того же раздела', () => {
  assert.equal(frameHint(с({ frameHint: 'Раму можно подобрать под цвет принта.' })),
    'Раму можно подобрать под цвет принта.');
});

test('подсказки у рам может не быть, и это законно', () => {
  assert.equal(frameHint(с({ lead: 'Печать на металле.' })), null);
  assert.equal(frameHint(makeConfig()), null);
});

test('выключенные тексты гасят и подсказку у рам, второго тумблера нет', () => {
  assert.equal(frameHint(с({ enabled: false, frameHint: 'Раму можно подобрать.' })), null);
});
