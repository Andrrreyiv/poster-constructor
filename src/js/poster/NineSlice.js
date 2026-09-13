// NineSlice — раскладка накладной картинки рамы по «девятке».
//
// Зачем не простое растягивание: пластины отличаются по пропорциям втрое
// (10×15 против 40×60). Если тянуть картинку рамы целиком, на узкой пластине углы
// расплющиваются, и багет читается как кривой. В девятке углы копируются один в один,
// тянутся только четыре стороны, а середина не рисуется вовсе — там пластина с картинкой.
//
// Геометрия вынесена сюда отдельным модулем, потому что холст в тестах без браузера
// не создать: здесь чистая арифметика прямоугольников, и она проверяется.

/**
 * Восемь прямоугольников для drawImage: четыре угла и четыре стороны.
 * Середина намеренно пропущена — рама накладывается ПОВЕРХ готовой пластины,
 * и её центр обязан остаться прозрачным, иначе рама закроет картинку.
 *
 * @param {{w:number,h:number}} img натуральный размер картинки рамы
 * @param {number} slice ширина багета В КАРТИНКЕ (её край, который не тянется)
 * @param {{x:number,y:number,w:number,h:number}} target куда кладём (весь габарит с рамой)
 * @param {number} border ширина багета НА ХОЛСТЕ
 * @returns {{sx,sy,sw,sh,dx,dy,dw,dh}[]}
 */
export function nineSliceRects(img, slice, target, border) {
  const iw = Number(img?.w) || 0;
  const ih = Number(img?.h) || 0;
  const s = Number(slice) || 0;
  const b = Number(border) || 0;
  const { x, y, w, h } = target;

  // Без картинки, без багета или если рама шире самого изделия — рисовать нечего.
  if (!(iw > 0 && ih > 0 && s > 0 && b > 0)) return [];
  if (s * 2 > iw || s * 2 > ih) return [];
  if (b * 2 > w || b * 2 > h) return [];

  // Середина источника и цели: то, что тянется.
  const smw = iw - s * 2;
  const smh = ih - s * 2;
  const dmw = w - b * 2;
  const dmh = h - b * 2;

  return [
    // Углы — один в один, без растягивания.
    { sx: 0, sy: 0, sw: s, sh: s, dx: x, dy: y, dw: b, dh: b },
    { sx: iw - s, sy: 0, sw: s, sh: s, dx: x + w - b, dy: y, dw: b, dh: b },
    { sx: 0, sy: ih - s, sw: s, sh: s, dx: x, dy: y + h - b, dw: b, dh: b },
    { sx: iw - s, sy: ih - s, sw: s, sh: s, dx: x + w - b, dy: y + h - b, dw: b, dh: b },
    // Стороны — тянутся только вдоль своей оси.
    { sx: s, sy: 0, sw: smw, sh: s, dx: x + b, dy: y, dw: dmw, dh: b },
    { sx: s, sy: ih - s, sw: smw, sh: s, dx: x + b, dy: y + h - b, dw: dmw, dh: b },
    { sx: 0, sy: s, sw: s, sh: smh, dx: x, dy: y + b, dw: b, dh: dmh },
    { sx: iw - s, sy: s, sw: s, sh: smh, dx: x + w - b, dy: y + b, dw: b, dh: dmh },
  ];
}
