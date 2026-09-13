import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nineSliceRects } from '../src/js/poster/NineSlice.js';
import { frameTexture, frameSlice } from '../src/js/poster/FrameOption.js';

const img = { w: 240, h: 240 };
const target = { x: 0, y: 0, w: 600, h: 900 };

test('раскладка даёт восемь кусков: четыре угла и четыре стороны', () => {
  assert.equal(nineSliceRects(img, 48, target, 30).length, 8);
});

// Ради этого девятка и нужна: углы копируются один в один и не расплющиваются
// на вытянутых пластинах.
test('углы не растягиваются — источник и цель квадратные', () => {
  const [tl, tr, bl, br] = nineSliceRects(img, 48, target, 30);
  for (const c of [tl, tr, bl, br]) {
    assert.equal(c.sw, 48);
    assert.equal(c.sh, 48);
    assert.equal(c.dw, 30);
    assert.equal(c.dh, 30);
  }
});

test('углы стоят по четырём вершинам габарита', () => {
  const [tl, tr, bl, br] = nineSliceRects(img, 48, target, 30);
  assert.deepEqual([tl.dx, tl.dy], [0, 0]);
  assert.deepEqual([tr.dx, tr.dy], [570, 0]);
  assert.deepEqual([bl.dx, bl.dy], [0, 870]);
  assert.deepEqual([br.dx, br.dy], [570, 870]);
});

test('верхняя и нижняя стороны тянутся только по ширине', () => {
  const [, , , , top, bottom] = nineSliceRects(img, 48, target, 30);
  assert.equal(top.dw, 600 - 60);
  assert.equal(top.dh, 30);
  assert.equal(bottom.dw, 600 - 60);
  assert.equal(bottom.dy, 870);
});

test('боковые стороны тянутся только по высоте', () => {
  const [, , , , , , left, right] = nineSliceRects(img, 48, target, 30);
  assert.equal(left.dh, 900 - 60);
  assert.equal(left.dw, 30);
  assert.equal(right.dx, 570);
});

test('куски не выходят за габарит изделия', () => {
  for (const r of nineSliceRects(img, 48, target, 30)) {
    assert.ok(r.dx >= 0 && r.dy >= 0, 'кусок ушёл за левый или верхний край');
    assert.ok(r.dx + r.dw <= target.w, 'кусок ушёл за правый край');
    assert.ok(r.dy + r.dh <= target.h, 'кусок ушёл за нижний край');
  }
});

test('куски не выходят за пределы картинки рамы', () => {
  for (const r of nineSliceRects(img, 48, target, 30)) {
    assert.ok(r.sx >= 0 && r.sy >= 0);
    assert.ok(r.sx + r.sw <= img.w);
    assert.ok(r.sy + r.sh <= img.h);
  }
});

// Середина НЕ рисуется намеренно: там уже лежит пластина с картинкой, и закрасить
// её рамой значило бы спрятать то, что покупатель выбирал.
test('середина не рисуется — ни один кусок не накрывает центр', () => {
  const cx = target.w / 2;
  const cy = target.h / 2;
  for (const r of nineSliceRects(img, 48, target, 30)) {
    const накрывает = cx > r.dx && cx < r.dx + r.dw && cy > r.dy && cy < r.dy + r.dh;
    assert.equal(накрывает, false);
  }
});

test('на квадратной пластине раскладка тоже корректна', () => {
  const rects = nineSliceRects(img, 48, { x: 0, y: 0, w: 400, h: 400 }, 20);
  assert.equal(rects.length, 8);
  assert.equal(rects[4].dw, 360);
});

// Запасная заливка должна включаться, а не рисоваться мусором.
test('без картинки рамы раскладки нет', () => {
  assert.deepEqual(nineSliceRects({ w: 0, h: 0 }, 48, target, 30), []);
});

test('нулевая толщина багета раскладки не даёт', () => {
  assert.deepEqual(nineSliceRects(img, 48, target, 0), []);
});

// Крошечная пластина с толстым багетом: куски бы наложились друг на друга.
test('багет шире самого изделия раскладки не даёт', () => {
  assert.deepEqual(nineSliceRects(img, 48, { x: 0, y: 0, w: 40, h: 40 }, 30), []);
});

test('slice больше половины картинки раскладки не даёт', () => {
  assert.deepEqual(nineSliceRects(img, 200, target, 30), []);
});

test('смещённая цель сдвигает все куски вместе с собой', () => {
  const rects = nineSliceRects(img, 48, { x: 100, y: 50, w: 600, h: 900 }, 30);
  assert.deepEqual([rects[0].dx, rects[0].dy], [100, 50]);
});

test('адрес текстуры берётся из конфига рамы', () => {
  assert.equal(frameTexture({ texture: 'assets/frames/wood.png' }), 'assets/frames/wood.png');
});

// Текстуры нет — конструктор обязан работать на запасной заливке, а не падать.
test('рама без текстуры даёт null, а не пустую строку', () => {
  assert.equal(frameTexture({}), null);
  assert.equal(frameTexture({ texture: '' }), null);
  assert.equal(frameTexture(null), null);
});

test('slice читается из конфига рамы', () => {
  assert.equal(frameSlice({ slice: 64 }), 64);
});

test('без slice берётся значение по умолчанию, мусор тоже', () => {
  assert.equal(frameSlice({}), 48);
  assert.equal(frameSlice({ slice: 'широкий' }), 48);
  assert.equal(frameSlice({ slice: -10 }), 48);
});
