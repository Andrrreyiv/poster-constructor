import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPosterAdmin, applyPrintsOverride } from '../src/js/poster/AdminOverrides.js';
import { makeConfig } from './fixture.js';

test('без настроек конфиг остаётся прежним', () => {
  const cfg = makeConfig();
  assert.deepEqual(applyPosterAdmin(cfg, null).plates, cfg.plates);
});

// Ровно то, что клиент назвал «мы потом подстроим»: свой прайс без правки кода.
test('пластины из админки заменяют базовые', () => {
  const out = applyPosterAdmin(makeConfig(), {
    plates: [{ id: '20x20', wCm: 20, hCm: 20, price: 850 }],
  });
  assert.equal(out.plates.items.length, 1);
  assert.equal(out.plates.items[0].price, 850);
});

// Главное правило обоих предыдущих конструкторов: битый раздел игнорируется МОЛЧА,
// конструктор остаётся на базовом конфиге и не падает.
test('битые пластины игнорируются целиком, базовые живы', () => {
  const out = applyPosterAdmin(makeConfig(), {
    plates: [{ id: '', wCm: 'ерунда', price: null }],
  });
  assert.equal(out.plates.items.length, 3);
});

test('годные пластины проходят, битые из той же пачки отсеиваются', () => {
  const out = applyPosterAdmin(makeConfig(), {
    plates: [
      { id: 'ok', wCm: 20, hCm: 20, price: 850 },
      { id: 'bad', wCm: -5, hCm: 20, price: 100 },
    ],
  });
  assert.deepEqual(out.plates.items.map((p) => p.id), ['ok']);
});

test('рамы из админки заменяют базовые', () => {
  const out = applyPosterAdmin(makeConfig(), {
    frames: [{ id: 'gold', label: 'Золотая', price: 900 }],
  });
  assert.deepEqual(out.frames.options.map((f) => f.id), ['gold']);
});

// Владелец вправе не брать денег за раму — ноль это не «битая строка».
test('рама с нулевой ценой считается годной', () => {
  const out = applyPosterAdmin(makeConfig(), {
    frames: [{ id: 'free', label: 'В подарок', price: 0 }],
  });
  assert.equal(out.frames.options.length, 1);
});

test('рама без подписи отсеивается', () => {
  const out = applyPosterAdmin(makeConfig(), { frames: [{ id: 'x', price: 100 }] });
  assert.equal(out.frames.options.length, 2, 'остались базовые');
});

test('пороги качества настраиваются по отдельности', () => {
  const out = applyPosterAdmin(makeConfig(), { quality: { targetDpi: 300 } });
  assert.equal(out.quality.targetDpi, 300);
  assert.equal(out.quality.minDpi, 100, 'нетронутый порог остался базовым');
});

// Выключенная проверка опаснее строгой: покупатель напечатает мыло и не узнает.
test('мусор в порогах оставляет базовые значения', () => {
  const out = applyPosterAdmin(makeConfig(), { quality: { targetDpi: 'много', minDpi: -5 } });
  assert.equal(out.quality.targetDpi, 150);
  assert.equal(out.quality.minDpi, 100);
});

test('ориентацию можно выключить из админки', () => {
  const out = applyPosterAdmin(makeConfig(), { orientation: { enabled: false } });
  assert.equal(out.orientation.enabled, false);
});

test('настройки не портят исходный объект конфига', () => {
  const cfg = makeConfig();
  applyPosterAdmin(cfg, { plates: [{ id: 'z', wCm: 5, hCm: 5, price: 10 }] });
  assert.equal(cfg.plates.items.length, 3, 'базовый конфиг обязан остаться нетронутым');
});

test('библиотека из админки заменяет базовую', () => {
  const базовая = { categories: [{ slug: 'a', label: 'А', items: [{ file: '1.png' }] }] };
  const out = applyPrintsOverride(базовая, {
    categories: [{ slug: 'b', label: 'Б', items: [{ file: '2.png' }] }],
  });
  assert.deepEqual(out.categories.map((c) => c.slug), ['b']);
});

test('битая библиотека оставляет прежнюю', () => {
  const базовая = { categories: [{ slug: 'a', label: 'А', items: [] }] };
  assert.equal(applyPrintsOverride(базовая, { categories: [{ label: 'нет slug' }] }), базовая);
  assert.equal(applyPrintsOverride(базовая, null), базовая);
});

test('картинки без адреса отсеиваются внутри годной категории', () => {
  const out = applyPrintsOverride({ categories: [] }, {
    categories: [{ slug: 'b', label: 'Б', items: [{ file: '2.png' }, { id: 'нет файла' }] }],
  });
  assert.equal(out.categories[0].items.length, 1);
});
