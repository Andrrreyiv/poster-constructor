// PosterPrice — итог заказа: пластина плюс рама.
//
// Вся цена здесь — плоский лукап по id пластины и id рамы. Никаких ставок за см², никаких
// ступеней: клиент 13.09 дал цену ЗА РАЗМЕР («самый маленький допустим 300, потом следующий
// 500, 700, тысяча, полторы тысячи»), а размер выбирается кнопкой из списка.
//
// ⚠️ На боевом сайте источником цены изделия может стать карточка WooCommerce — так вышло
// у обоих предыдущих конструкторов этого заказчика. Тогда меняется только plateAmount():
// разбор состава заказа и детализация остаются прежними.

import { plateById } from './Plates.js?v=20260919a';
import { frameById, framePriceFor } from './FrameOption.js?v=20260919a';

/** Цена самой пластины. Неизвестный id даёт 0, а не NaN в итоговой строке. */
export function plateAmount(config, plateId) {
  const plate = plateById(config, plateId);
  return plate ? Number(plate.price) || 0 : 0;
}

/**
 * Доплата за раму ПОД ВЫБРАННУЮ ПЛАСТИНУ. Без рамы — ноль.
 *
 * Рамы под этот размер нет — тоже ноль, но пара «пластина + недоступная рама» до сюда
 * не доходит: PosterApp снимает недоступную раму при смене пластины. Ноль здесь страхует
 * от NaN в итоговой строке, а настоящую защиту держит сервер — в кассе такая пара
 * отвергается целиком, а не считается бесплатной.
 */
export function frameAmount(config, frameId, plateId) {
  const v = framePriceFor(config, frameId, plateId);
  return v === null ? 0 : v;
}

/**
 * Полный расчёт с детализацией.
 *
 * Детализация возвращается строками, а не собранным текстом: её показывают и в панели,
 * и в составе заказа, и верстать её в двух местах по-разному не нужно.
 *
 * @returns {{plate:number, frame:number, total:number, lines:{label:string, amount:number}[]}}
 */
export function priceOf(config, state = {}) {
  const plate = plateAmount(config, state.plateId);
  const frame = frameAmount(config, state.frameId, state.plateId);
  const lines = [];

  const plateItem = plateById(config, state.plateId);
  if (plateItem) {
    lines.push({ label: 'Пластина ' + plateItem.label, amount: plate });
  }
  const frameItem = frameById(config, state.frameId);
  if (frameItem) {
    lines.push({ label: 'Рама: ' + frameItem.label.toLowerCase(), amount: frame });
  }

  return { plate, frame, total: plate + frame, lines };
}
