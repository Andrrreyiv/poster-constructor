// OrderSpec — что именно уходит в заказ. Структура без DOM, чтобы проверялась тестом.
//
// Клиент 13.09 (голосовое 10:27) на вопрос «корзина или заявка на почту» ответил:
// «сразу всё: загрузил файл, выбрал размер, добавил рамку — и заказать, сразу заявку
// в корзину и заказ». То есть касса нужна с самого начала, откладывать её на потом нельзя.
//
// ⚠️ Для прототипа на GitHub Pages кассы физически нет — там некуда класть заказ.
// Поэтому спецификация здесь ГОТОВИТСЯ полностью, а отправляет её уже боевой слой
// этапа 2 (mu-plugin, копия jetron-tshirt-orders.php). Так состав заказа не придётся
// переписывать при выкладке.
//
// ☠️ Сумма отсюда — СПРАВОЧНАЯ. На боевом цену обязан пересчитывать сервер по id пластины
// и id рамы, а присланное браузером идёт только на сверку расхождений. У конструктора
// футболок это уже оплаченный урок: set_price из браузера не берётся никогда.

import { plateById, plateSize } from './Plates.js?v=20260913c';
import { frameById } from './FrameOption.js?v=20260913c';
import { priceOf } from './PosterPrice.js?v=20260913c';
import { assessResolution } from './Resolution.js?v=20260913c';

/**
 * Полный состав заказа.
 *
 * @param {object} config конфиг конструктора
 * @param {object} state  { plateId, frameId, orientation, image: {src, w, h, origin} }
 * @returns {object} спецификация, пригодная и для показа покупателю, и для отправки
 */
export function buildOrderSpec(config, state = {}) {
  const plate = plateById(config, state.plateId);
  const size = plateSize(plate, state.orientation);
  const frame = frameById(config, state.frameId);
  const price = priceOf(config, state);
  const image = state.image ?? null;

  const quality = image && size
    ? assessResolution({ w: image.w, h: image.h }, size, config)
    : { level: 'ok', dpi: 0, need: { w: 0, h: 0 }, message: null };

  return {
    plate: plate
      ? { id: plate.id, label: plate.label, wCm: size.wCm, hCm: size.hCm }
      : null,
    orientation: state.orientation === 'landscape' ? 'landscape' : 'portrait',
    frame: frame ? { id: frame.id, label: frame.label } : null,
    image: image
      ? { origin: image.origin ?? 'library', w: image.w ?? 0, h: image.h ?? 0, src: image.src ?? null }
      : null,
    quality: { level: quality.level, dpi: quality.dpi },
    price: { plate: price.plate, frame: price.frame, total: price.total },
    ready: isReady({ plate, image }),
  };
}

/**
 * Можно ли оформлять. Нужны две вещи: выбранная пластина и картинка.
 *
 * Низкое разрешение заказ НЕ блокирует: клиент просил предупреждать, а не запрещать,
 * и запрет без его слова был бы отсебятиной. Поэтому качество здесь не смотрят вовсе —
 * решение закреплено тестом «низкое качество не мешает оформить заказ».
 */
export function isReady({ plate, image }) {
  return Boolean(plate && image && image.src);
}

/** Человекочитаемый состав — им заполняется и панель, и письмо менеджеру. */
export function specLines(spec) {
  if (!spec) return [];
  const lines = [];
  if (spec.plate) {
    lines.push(['Пластина', spec.plate.wCm + ' × ' + spec.plate.hCm + ' см']);
  }
  lines.push(['Рама', spec.frame ? spec.frame.label : 'без рамы']);
  if (spec.image) {
    lines.push(['Картинка', spec.image.origin === 'upload' ? 'своя, загружена покупателем' : 'из библиотеки']);
    if (spec.image.w && spec.image.h) {
      lines.push(['Разрешение', spec.image.w + '×' + spec.image.h + ' точек, ' + spec.quality.dpi + ' dpi']);
    }
  }
  return lines;
}
