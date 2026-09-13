// FrameOption — физическая рама, в которую вставляется готовая пластина.
//
// ☠️ ИМЯ ВЫБРАНО СПЕЦИАЛЬНО. У конструктора футболок есть PrintFrame.js, и это
// СОВСЕМ ДРУГОЕ: там «рамка» — это зона печати, clip-область на мокапе. Если назвать
// модуль так же, следующая сессия перепутает понятия. Здесь рама — предмет из пластика
// или дерева, надеваемый на пластину снаружи.
//
// Клиент 13.09 (голосовое 10:27), дословно: «рамка физическая обычная, то есть смотрите,
// это железная пластина алюминиевая, на неё наносится картинка, и можно эту картинку
// в рамку поставить, рамка обычная пластиковая или деревянная… надо добавить кнопку
// с рамкой / без рамки… и сделать вариации рамки: белая, чёрная и под дерево».
//
// ⚠️ Это ОПРОВЕРГАЕТ решение, записанное в плане до голосового: там рама считалась
// рисуемой обводкой ПОВЕРХ картинки (ширина + цвет). Рама физическая, значит она
// обрамляет пластину СНАРУЖИ, а картинка остаётся во всю пластину и ничем не
// перекрывается. Геометрия ниже именно такая.

/** Список рам из конфига. Пустой список = опция рамы просто не показывается. */
export function frameList(config) {
  if (config?.frames?.enabled === false) return [];
  return config?.frames?.options ?? [];
}

/** Рама по id. null — это «без рамы», законное состояние, а не ошибка. */
export function frameById(config, id) {
  if (id === null || id === undefined) return null;
  return frameList(config).find((f) => f.id === id) ?? null;
}

/** Доплата за раму. Без рамы — ноль. Неизвестный id тоже ноль, а не NaN в итоге. */
export function framePrice(config, id) {
  const f = frameById(config, id);
  return f ? Number(f.price) || 0 : 0;
}

/**
 * Толщина багета в пикселях для холста, где пластина занимает plateW × plateH.
 *
 * Считаем от МЕНЬШЕЙ стороны: иначе на вытянутой 40×60 рама по бокам выглядела бы
 * заметно толще, чем сверху, хотя физически багет одинаков по всему периметру.
 */
export function frameThickness(plateW, plateH, config) {
  const ratio = Number(config?.frames?.widthRatio);
  const safe = Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, 0.25) : 0.055;
  return Math.round(Math.min(plateW, plateH) * safe);
}

/**
 * Полный габарит изделия вместе с рамой и положение пластины внутри него.
 *
 * Рама НАРУЖНАЯ: пластина не уменьшается, растёт общий размер. Так это и в жизни —
 * багет добавляется по периметру, а печать остаётся во всю пластину.
 * Без рамы возвращается тот же габарит, что и пластина, со сдвигом 0.
 */
export function frameGeometry(plateW, plateH, config, frameId = null) {
  const frame = frameById(config, frameId);
  if (!frame) {
    return { outerW: plateW, outerH: plateH, offset: 0, thickness: 0, frame: null };
  }
  const thickness = frameThickness(plateW, plateH, config);
  return {
    outerW: plateW + thickness * 2,
    outerH: plateH + thickness * 2,
    offset: thickness,
    thickness,
    frame,
  };
}
