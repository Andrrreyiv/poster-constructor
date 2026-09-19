// Настройки из админки поверх базового конфига конструктора постеров.
//
// Архитектура перенесена с обоих предыдущих конструкторов этого заказчика; правило то же
// и нарушать его нельзя: БИТЫЙ РАЗДЕЛ ИГНОРИРУЕТСЯ ЦЕЛИКОМ И МОЛЧА, конструктор остаётся
// на базовом конфиге и не падает. Покупатель не должен видеть пустой экран из-за того,
// что владелец ошибся в одном поле админки.
//
// Здесь это важнее обычного: клиент 13.09 прямым текстом сказал, что размеры и цены
// сейчас условные и «мы потом её подстроим». Подстройка и пойдёт через admin.json,
// без правки кода и без выкладки.
//
// На этапе 1 (прототип на GitHub Pages) админки нет — файл admin.json просто отсутствует,
// и всё работает на базовом конфиге. Модуль написан заранее, чтобы на этапе 2 не переделывать
// загрузку конфига.

export function applyPosterAdmin(config, admin) {
  const out = clone(config);
  if (!admin || typeof admin !== 'object') return out;

  if (Array.isArray(admin.plates)) {
    const годные = admin.plates.filter(isPlate);
    if (годные.length) out.plates = { ...out.plates, items: годные.map((p) => ({ ...p })) };
  }

  if (Array.isArray(admin.frames)) {
    const годные = admin.frames.filter(isFrame);
    if (годные.length) out.frames = { ...out.frames, options: годные.map(cleanFrame) };
  }

  // Порог качества приходит одним числом или парой. Мусор оставляет базовые значения:
  // выключенная проверка опаснее строгой, покупатель напечатает мыло и не узнает.
  if (admin.quality && typeof admin.quality === 'object') {
    const target = positive(admin.quality.targetDpi);
    const min = positive(admin.quality.minDpi);
    out.quality = {
      ...out.quality,
      ...(target ? { targetDpi: target } : {}),
      ...(min ? { minDpi: min } : {}),
    };
  }

  // Ориентация — наша добавка, и выключать её клиент вправе одним флагом.
  if (admin.orientation && typeof admin.orientation === 'object'
      && typeof admin.orientation.enabled === 'boolean') {
    out.orientation = { ...out.orientation, enabled: admin.orientation.enabled };
  }

  // Описание товара под превью. Клиент 17.09 сказал, что формулировку подберёт сам
  // и «попозже поищет» в интернете, поэтому текст обязан правиться из админки, без
  // выкладки кода. Пустая строка законна: это «убрать», а не «ошибка».
  if (admin.about && typeof admin.about === 'object' && !Array.isArray(admin.about)) {
    const about = { ...(out.about || {}) };
    if (typeof admin.about.enabled === 'boolean') about.enabled = admin.about.enabled;
    for (const ключ of ['title', 'lead', 'frameHint']) {
      const v = admin.about[ключ];
      if (typeof v === 'string') about[ключ] = v.trim();
    }
    if (Array.isArray(admin.about.details)) {
      about.details = admin.about.details
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => s.trim());
    }
    out.about = about;
  }

  return out;
}

/** Библиотека принтов из админки. Битый манифест оставляет прежний. */
export function applyPrintsOverride(manifest, override) {
  if (!override || !Array.isArray(override.categories)) return manifest;
  const cats = override.categories.filter(isCategory);
  if (!cats.length) return manifest;
  return { ...manifest, categories: cats.map((c) => ({ ...c, items: c.items.filter(isItem) })) };
}

// ── Проверки ────────────────────────────────────────────────────────────────
// Пластина без цены или без размера бессмысленна: размер — ключ выбора, цена — итог.
function isPlate(p) {
  return !!p && typeof p.id === 'string' && p.id !== ''
    && positive(p.wCm) && positive(p.hCm) && Number.isFinite(Number(p.price)) && Number(p.price) >= 0;
}

// У рамы цена может быть нулевой (владелец решит не брать за неё денег), а вот без id
// и подписи её не показать.
function isFrame(f) {
  if (!f || typeof f.id !== 'string' || f.id === '') return false;
  if (typeof f.label !== 'string' || f.label === '') return false;
  // Цена рамы бывает в двух видах: плоская (до 19.09) и карта «id пластины → цена»
  // (клиент 19.09: под каждый размер своя цена). Годна рама, у которой есть хотя бы
  // одно из двух, иначе покупателю нечего показать.
  const плоская = Number.isFinite(Number(f.price)) && Number(f.price) >= 0;
  return плоская || priceMapSize(f.prices) > 0;
}

/** Сколько годных цен в карте «id пластины → цена». Мусор не считается. */
function priceMapSize(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 0;
  return Object.keys(map).filter((k) => {
    const v = Number(map[k]);
    return Number.isFinite(v) && v >= 0;
  }).length;
}

/**
 * Копия рамы с вычищенной картой цен: мусорное значение ВЫБРАСЫВАЕТСЯ, а не приводится
 * к нулю. Ноль означает «рама бесплатна», пустая клетка — «такой рамы под этот размер
 * нет в наличии». Путать эти два смысла нельзя: первый подарит раму, второй её спрячет.
 */
function cleanFrame(f) {
  const out = { ...f };
  if (f.prices && typeof f.prices === 'object' && !Array.isArray(f.prices)) {
    const prices = {};
    for (const key of Object.keys(f.prices)) {
      const v = Number(f.prices[key]);
      if (Number.isFinite(v) && v >= 0) prices[key] = v;
    }
    out.prices = prices;
  }
  return out;
}

function isCategory(c) {
  return !!c && typeof c.slug === 'string' && c.slug !== ''
    && typeof c.label === 'string' && Array.isArray(c.items);
}

function isItem(i) {
  return !!i && typeof i.file === 'string' && i.file !== '';
}

function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clone(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}
