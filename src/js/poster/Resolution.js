// Resolution — годится ли картинка для печати на этой пластине.
//
// Клиент 13.09 (голосовое 10:27): «здесь надо выдавать ошибку, если низкое качество…
// наши принты все в хорошем качестве, но если человек загружает какое-то вообще просто
// низкое качество — сразу надо показывать… выскакивает сообщение, что низкое качество».
// Порог он НЕ НАЗВАЛ, числа берутся из конфига и помечены там заглушками.
//
// ☠️ Писалось С НУЛЯ, а не переносилось. У футболок есть QualityHint, но это пустышка:
// shouldWarn() возвращает false всегда, помечена «TODO(фаза 6)» и не была реализована
// ни разу за всю историю проекта. Ключи compressOverMB / maxDimension / quality
// в том конфиге тоже мёртвые — их никто не читает. Копировать было нечего.
//
// Почему это здесь важнее, чем там: у футболок принт приходит из библиотеки или
// обрезается на месте. Сюда покупатель грузит «хоть фотографию, хоть что» (слова клиента
// из первого голосового), и фото с телефона 800×600 на пластину 40×60 см даст 50 dpi.

const CM_PER_INCH = 2.54;

/** Сколько пикселей нужно на сторону в сантиметрах при заданной плотности точек. */
export function pxNeeded(cm, dpi) {
  return Math.ceil((cm / CM_PER_INCH) * dpi);
}

/**
 * Фактическая плотность печати. Берём ХУДШУЮ из двух осей: печать тянется
 * по обеим сразу, и хорошая ширина не спасает растянутую высоту.
 */
export function dpiOf(imgW, imgH, wCm, hCm) {
  if (!(imgW > 0 && imgH > 0 && wCm > 0 && hCm > 0)) return 0;
  const dpiX = (imgW / wCm) * CM_PER_INCH;
  const dpiY = (imgH / hCm) * CM_PER_INCH;
  return Math.floor(Math.min(dpiX, dpiY));
}

/**
 * Оценка картинки под конкретную пластину.
 *
 * Три уровня, а не два: «чуть не дотягивает» и «печатать нельзя» — разные разговоры
 * с покупателем. Клиент просил показывать сообщение именно во втором случае
 * («вообще просто низкое качество»), первый предупреждает мягко.
 *
 * @returns {{level:'ok'|'warn'|'bad', dpi:number, need:{w:number,h:number}, message:string|null}}
 */
export function assessResolution(image, size, config) {
  const targetDpi = Number(config?.quality?.targetDpi) || 150;
  const minDpi = Number(config?.quality?.minDpi) || 100;

  const imgW = Number(image?.w) || 0;
  const imgH = Number(image?.h) || 0;
  const wCm = Number(size?.wCm) || 0;
  const hCm = Number(size?.hCm) || 0;

  const need = { w: pxNeeded(wCm, targetDpi), h: pxNeeded(hCm, targetDpi) };
  const dpi = dpiOf(imgW, imgH, wCm, hCm);

  // Картинку ещё не загрузили или размеры не пришли — молчим. Предупреждение
  // на пустом месте хуже, чем его отсутствие: покупатель решит, что сломано.
  if (!dpi) return { level: 'ok', dpi: 0, need, message: null };

  if (dpi >= targetDpi) return { level: 'ok', dpi, need, message: null };

  const where = wCm + ' × ' + hCm + ' см';
  const got = imgW + '×' + imgH;
  const want = need.w + '×' + need.h;

  if (dpi < minDpi) {
    return {
      level: 'bad',
      dpi,
      need,
      message: 'Низкое качество: для пластины ' + where + ' этой картинки не хватает ('
        + got + ' точек, это примерно ' + dpi + ' dpi). Печать выйдет размытой. Нужна картинка от '
        + want + ' точек — или выберите пластину поменьше.',
    };
  }
  return {
    level: 'warn',
    dpi,
    need,
    message: 'Качества впритык: ' + got + ' точек на пластину ' + where + ' — около ' + dpi
      + ' dpi. Для чёткой печати лучше от ' + want + ' точек.',
  };
}

// ⛔ Здесь был blocksOrder(), всегда возвращавший false. Удалён 13.09: он ничего
// не решал, никем не вызывался и был обещанием без исполнения — ровно тем же, чем
// у футболок оказался QualityHint.shouldWarn(). Решение «низкое качество заказ
// не запрещает» живёт там, где и должно: OrderSpec.isReady() качество не смотрит,
// и это закреплено тестом «низкое качество не мешает оформить заказ».
