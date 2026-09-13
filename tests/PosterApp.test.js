import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PosterApp } from '../src/js/ui/PosterApp.js';
import { makeConfig } from './fixture.js';

// Модули по отдельности уже проверены. Здесь проверяется СКЛЕЙКА: что оркестратор
// берёт из состояния верные величины и передаёт их в верные модули. Именно здесь
// ломаются вещи при правках, и именно это до сих пор проверялось только руками.
//
// ⚠️ Браузера здесь нет и не будет: в проекте намеренно нет ни сборки, ни зависимостей
// (то же решение, что у обоих предыдущих конструкторов — у футболок 26 тестовых файлов
// и ни одного браузерного). Поэтому тестируются методы состояния, которые DOM не трогают,
// а start() и render() не вызываются. Сквозной проход по живой странице остаётся ручным,
// и его шаги записаны в CLAUDE.md в разделе проверки.

/** Оркестратор без DOM: сцена и панель ему в этих методах не нужны. */
function makeApp(patch = {}) {
  return new PosterApp({
    config: makeConfig(),
    stageEl: null,
    panelEl: null,
    manifest: { categories: [{ slug: 'a', label: 'А', items: [{ id: 'a-1', file: '1.svg' }] }] },
    ...patch,
  });
}

const картинка = { src: '1.svg', w: 2400, h: 3600, origin: 'library' };

test('на старте выбрана первая пластина, книжная, без рамы и без картинки', () => {
  const app = makeApp();
  assert.equal(app.state.plateId, '10x15');
  assert.equal(app.state.orientation, 'portrait');
  assert.equal(app.state.frameId, null);
  assert.equal(app.state.image, null);
});

test('ориентация по умолчанию берётся из конфига', () => {
  const app = new PosterApp({
    config: makeConfig({ orientation: { enabled: true, default: 'landscape' } }),
    stageEl: null, panelEl: null,
  });
  assert.equal(app.state.orientation, 'landscape');
});

test('текущий размер учитывает поворот пластины', () => {
  const app = makeApp();
  app.state.plateId = '30x40';
  assert.deepEqual(app.currentSize(), { wCm: 30, hCm: 40 });
  app.state.orientation = 'landscape';
  assert.deepEqual(app.currentSize(), { wCm: 40, hCm: 30 });
});

test('без картинки оценка качества молчит', () => {
  const app = makeApp();
  const q = app.currentQuality();
  assert.equal(q.level, 'ok');
  assert.equal(q.message, null);
});

// ☠️ Тот самый контрольный случай, но через оркестратор: важно, что он берёт размер
// ПЛАСТИНЫ С УЧЁТОМ ПОВОРОТА, а не сырые числа из конфига.
test('фото 800×600 на пластину 40×60 доходит до оценки как bad', () => {
  const app = makeApp();
  app.state.plateId = '40x60';
  app.state.image = { src: 'x', w: 800, h: 600, origin: 'upload' };
  const q = app.currentQuality();
  assert.equal(q.level, 'bad');
  assert.ok(q.dpi > 0 && q.dpi < 100, 'ожидали плотность ниже нижнего порога, получено ' + q.dpi);
});

test('поворот пластины пересчитывает качество, а не остаётся на старом', () => {
  const app = makeApp();
  app.state.plateId = '30x40';
  // Картинка вытянута по горизонтали: на книжной пластине не хватит высоты,
  // на альбомной та же картинка ляжет свободнее.
  app.state.image = { src: 'x', w: 2400, h: 1400, origin: 'upload' };
  const книжная = app.currentQuality().dpi;
  app.state.orientation = 'landscape';
  const альбомная = app.currentQuality().dpi;
  assert.notEqual(книжная, альбомная);
  assert.ok(альбомная > книжная, 'поворот под картинку обязан улучшать плотность');
});

test('состав заказа собирается из текущего состояния', () => {
  const app = makeApp();
  app.state.plateId = '30x40';
  app.state.frameId = 'wood';
  app.state.image = картинка;
  const spec = app.currentSpec();
  assert.equal(spec.plate.id, '30x40');
  assert.equal(spec.frame.id, 'wood');
  assert.equal(spec.price.total, 2100);
  assert.equal(spec.ready, true);
});

test('без картинки заказ не готов', () => {
  assert.equal(makeApp().currentSpec().ready, false);
});

test('смена пластины меняет итог', () => {
  const app = makeApp();
  app.state.image = картинка;
  assert.equal(app.currentSpec().price.total, 300);
  app.state.plateId = '40x60';
  assert.equal(app.currentSpec().price.total, 2200);
});

test('рама прибавляется к итогу и снимается обратно', () => {
  const app = makeApp();
  app.state.image = картинка;
  const без = app.currentSpec().price.total;
  app.state.frameId = 'white';
  assert.equal(app.currentSpec().price.total, без + 400);
  app.state.frameId = null;
  assert.equal(app.currentSpec().price.total, без);
});

// Поворот это тот же кусок металла на боку, платить за него не за что.
test('поворот на цену не влияет', () => {
  const app = makeApp();
  app.state.image = картинка;
  app.state.plateId = '30x40';
  const книжная = app.currentSpec().price.total;
  app.state.orientation = 'landscape';
  assert.equal(app.currentSpec().price.total, книжная);
});

test('без рамы текстура не запрашивается', () => {
  assert.equal(makeApp().frameImage(), null);
});

// Текстура грузится асинхронно: пока её нет, холст обязан получить null
// и нарисовать запасную заливку, а не упасть.
test('пока текстура рамы не доехала, отдаётся null', () => {
  const app = makeApp();
  app.state.frameId = 'wood';
  assert.equal(app.frameImage(), null);
});

test('доехавшая текстура отдаётся для выбранной рамы и только для неё', () => {
  const app = makeApp();
  const fake = { naturalWidth: 240, naturalHeight: 240 };
  app._frameImgs = { wood: fake };
  app.state.frameId = 'wood';
  assert.equal(app.frameImage(), fake);
  app.state.frameId = 'white';
  assert.equal(app.frameImage(), null);
});
