import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pxNeeded, dpiOf, assessResolution, blocksOrder } from '../src/js/poster/Resolution.js';
import { makeConfig } from './fixture.js';

test('нужное число пикселей считается из сантиметров и dpi', () => {
  // 10 см при 150 dpi = 10/2.54*150 = 590.55 → округляем вверх, недобор хуже перебора.
  assert.equal(pxNeeded(10, 150), 591);
  assert.equal(pxNeeded(40, 150), 2363);
});

test('плотность печати берётся по худшей из двух осей', () => {
  // По ширине 300 dpi, по высоте 75 — печать тянется по обеим, значит 75.
  assert.equal(dpiOf(1181, 443, 10, 15), 75);
});

test('пустые размеры дают нулевую плотность, а не деление на ноль', () => {
  assert.equal(dpiOf(0, 0, 10, 15), 0);
  assert.equal(dpiOf(1000, 1000, 0, 0), 0);
});

test('хорошая картинка проходит молча', () => {
  const r = assessResolution({ w: 2400, h: 3600 }, { wCm: 30, hCm: 40 }, makeConfig());
  assert.equal(r.level, 'ok');
  assert.equal(r.message, null);
});

// ☠️ Контрольный случай из плана: фото с телефона на самую большую пластину
// ОБЯЗАНО дать предупреждение, а не молчаливое «готово».
test('фото 800×600 на пластину 40×60 даёт уровень bad', () => {
  const r = assessResolution({ w: 800, h: 600 }, { wCm: 40, hCm: 60 }, makeConfig());
  assert.equal(r.level, 'bad');
  assert.ok(r.dpi < 100, 'плотность обязана быть ниже нижнего порога, получено ' + r.dpi);
  assert.match(r.message, /Низкое качество/);
});

test('сообщение о низком качестве называет нужный размер в точках', () => {
  const r = assessResolution({ w: 800, h: 600 }, { wCm: 40, hCm: 60 }, makeConfig());
  // 40 см → 2363 точки, 60 см → 3544. Округление ВВЕРХ: недобор пикселей хуже перебора.
  assert.match(r.message, /2363×3544/);
});

test('между нижним и целевым порогом предупреждаем мягко', () => {
  // 30×40 см: цель 1772×2362 точек, нижний порог ~1181×1575. Берём середину.
  const r = assessResolution({ w: 1500, h: 2000 }, { wCm: 30, hCm: 40 }, makeConfig());
  assert.equal(r.level, 'warn');
  assert.match(r.message, /впритык/);
});

test('ровно на целевом пороге предупреждения нет', () => {
  const need = { w: pxNeeded(30, 150), h: pxNeeded(40, 150) };
  const r = assessResolution({ w: need.w, h: need.h }, { wCm: 30, hCm: 40 }, makeConfig());
  assert.equal(r.level, 'ok');
});

// Предупреждение на пустом месте покупатель читает как поломку.
test('без картинки молчим', () => {
  const r = assessResolution(null, { wCm: 30, hCm: 40 }, makeConfig());
  assert.equal(r.level, 'ok');
  assert.equal(r.message, null);
});

test('пороги берутся из конфига, а не зашиты в код', () => {
  const строгий = makeConfig({ quality: { targetDpi: 300, minDpi: 200 } });
  const r = assessResolution({ w: 2400, h: 3600 }, { wCm: 30, hCm: 40 }, строгий);
  assert.equal(r.level, 'warn', 'при цели 300 dpi та же картинка уже не дотягивает');
});

test('одна и та же картинка на маленькой пластине проходит, на большой — нет', () => {
  const cfg = makeConfig();
  assert.equal(assessResolution({ w: 800, h: 1200 }, { wCm: 10, hCm: 15 }, cfg).level, 'ok');
  assert.equal(assessResolution({ w: 800, h: 1200 }, { wCm: 40, hCm: 60 }, cfg).level, 'bad');
});

// Клиент просил ПОКАЗЫВАТЬ сообщение, а не запрещать покупку. Запрет без его слова
// был бы отсебятиной — тест держит это решение явным.
test('низкое качество не запрещает заказ', () => {
  assert.equal(blocksOrder(), false);
});
