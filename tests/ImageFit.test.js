import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverRect, cropLoss, exportSize } from '../src/js/poster/ImageFit.js';
import { makeConfig } from './fixture.js';

test('картинка тех же пропорций берётся целиком', () => {
  assert.deepEqual(coverRect(600, 900, 200, 300), { sx: 0, sy: 0, sw: 600, sh: 900 });
});

// Альбомная фотография на книжной пластине — самый частый случай у постеров.
test('широкая картинка режется по бокам симметрично', () => {
  const r = coverRect(1000, 500, 200, 300);
  assert.equal(r.sh, 500, 'высота идёт целиком');
  assert.equal(r.sw, 500 * (200 / 300));
  assert.equal(r.sy, 0);
  assert.equal(r.sx, (1000 - r.sw) / 2, 'обрез поровну слева и справа');
});

test('высокая картинка режется сверху и снизу симметрично', () => {
  const r = coverRect(500, 1000, 300, 200);
  assert.equal(r.sw, 500, 'ширина идёт целиком');
  assert.equal(r.sh, 500 / (300 / 200));
  assert.equal(r.sx, 0);
  assert.equal(r.sy, (1000 - r.sh) / 2);
});

test('обрезанная область не выходит за пределы картинки', () => {
  const r = coverRect(1000, 500, 200, 300);
  assert.ok(r.sx >= 0 && r.sy >= 0);
  assert.ok(r.sx + r.sw <= 1000);
  assert.ok(r.sy + r.sh <= 500);
});

test('нулевые размеры не роняют расчёт', () => {
  assert.deepEqual(coverRect(0, 0, 200, 300), { sx: 0, sy: 0, sw: 0, sh: 0 });
});

test('при совпадении пропорций в обрез не уходит ничего', () => {
  assert.equal(cropLoss(600, 900, 200, 300), 0);
});

// Этим числом честно говорим покупателю, сколько он теряет.
test('доля обреза считается по площади', () => {
  const loss = cropLoss(1000, 500, 200, 300);
  assert.ok(loss > 0.6 && loss < 0.7, 'ожидали около 2/3, получено ' + loss);
});

test('размер экспорта считается по dpi из конфига', () => {
  // 30 см при 150 dpi = 1772 точки.
  assert.deepEqual(exportSize(30, 40, makeConfig()), { w: 1772, h: 2362 });
});

// Иначе 40×60 при 300 dpi просила бы холст 4724×7087 — телефон такой не создаст.
test('длинная сторона прижимается к потолку с сохранением пропорций', () => {
  const cfg = makeConfig({ export: { dpi: 300, maxSidePx: 4000 } });
  const size = exportSize(40, 60, cfg);
  assert.equal(Math.max(size.w, size.h), 4000);
  const было = (40 / 60);
  assert.ok(Math.abs(size.w / size.h - было) < 0.01, 'пропорции пластины обязаны сохраниться');
});

test('без раздела export берутся значения по умолчанию', () => {
  assert.deepEqual(exportSize(10, 15, {}), { w: 591, h: 886 });
});

test('размер экспорта никогда не нулевой', () => {
  const size = exportSize(0.001, 0.001, makeConfig());
  assert.ok(size.w >= 1 && size.h >= 1);
});
