// Описание товара под превью.
//
// Появилось по голосовому клиента 17.09.2026 18:10: слева под подписью с размером
// остаётся пустое место, и туда он просил текст о том, что принт изготавливается
// на металле, про долговечность и толщину пластины, «какие-то такие общие
// характеристики». Отдельной строкой он просил подсказку о том, что раму можно
// выбрать под цвет принта, и поставить её у выбора рамы.
//
// Модуль намеренно ЧИСТЫЙ и не трогает DOM: браузера в тестах этого проекта нет
// и не будет (см. шапку tests/PosterApp.test.js), поэтому вся отбраковка мусора
// живёт здесь и проверяется без разметки, а PosterApp только раскладывает готовые
// строки по узлам.
//
// Правило то же, что у остальных разделов конфига: мусор игнорируется молча, и блок
// просто не показывается. Пустая рамка с заголовком под картинкой читается как
// поломка вёрстки, а её отсутствие не читается никак.

// Потолок на случай, если в админку вставят простыню текста целиком: подпись под
// картинкой не должна превращаться в статью и уносить кнопку заказа за экран.
const MAX_DETAILS = 12;

/**
 * Блок описания для сцены.
 * @returns {{title: string|null, lead: string|null, details: string[]}|null}
 *          null, если показывать нечего.
 */
export function aboutBlock(config) {
  const raw = section(config);
  if (!raw) return null;

  const lead = text(raw.lead);
  const details = lines(raw.details);
  // Заголовок сам по себе текстом не считается: «О постере» без единой строки под ним
  // выглядит так, будто содержимое не догрузилось.
  if (!lead && !details.length) return null;

  return { title: text(raw.title), lead, details };
}

/**
 * Подсказка под кнопками выбора рамы. Гасится тем же флагом, что и описание:
 * выключил тексты — выключил все, искать второй тумблер владельцу не придётся.
 * @returns {string|null}
 */
export function frameHint(config) {
  const raw = section(config);
  return raw ? text(raw.frameHint) : null;
}

function section(config) {
  const raw = config?.about;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw.enabled === false ? null : raw;
}

function text(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function lines(v) {
  if (!Array.isArray(v)) return [];
  return v.map(text).filter((s) => s !== null).slice(0, MAX_DETAILS);
}
