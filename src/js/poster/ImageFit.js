// ImageFit — как картинка ложится на пластину.
//
// У постера, в отличие от принта на футболке, картинка ЗАПОЛНЯЕТ всю пластину: пластина
// и есть постер, полей вокруг изображения не бывает. Поэтому основной режим — cover:
// картинка масштабируется до полного покрытия и лишнее обрезается симметрично.
//
// Математика взята из общей части Crop / fitBox конструктора футболок, но упрощена:
// там кадр надо было ещё вписывать в зону печати и держать пропорции физической зоны,
// здесь прямоугольник один.

/**
 * Прямоугольник-источник для drawImage: какую часть картинки показать, чтобы она
 * заполнила пластину целиком без искажения пропорций.
 *
 * @param {number} imgW пиксельная ширина картинки
 * @param {number} imgH пиксельная высота
 * @param {number} boxW ширина пластины (любые единицы, важно отношение)
 * @param {number} boxH высота пластины
 * @returns {{sx:number, sy:number, sw:number, sh:number}} область в пикселях картинки
 */
export function coverRect(imgW, imgH, boxW, boxH) {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) {
    return { sx: 0, sy: 0, sw: Math.max(imgW, 0), sh: Math.max(imgH, 0) };
  }
  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;

  if (imgAspect > boxAspect) {
    // Картинка шире пластины — режем по бокам, высота идёт целиком.
    const sw = imgH * boxAspect;
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH };
  }
  // Картинка выше пластины — режем сверху и снизу.
  const sh = imgW / boxAspect;
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh };
}

/**
 * Какая доля картинки уходит в обрез (0..1). Нужно, чтобы честно сказать покупателю,
 * что от его альбомной фотографии на книжной пластине останется половина.
 */
export function cropLoss(imgW, imgH, boxW, boxH) {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) return 0;
  const r = coverRect(imgW, imgH, boxW, boxH);
  const kept = (r.sw * r.sh) / (imgW * imgH);
  return Math.max(0, Math.min(1, 1 - kept));
}

/**
 * Размер холста для экспорта: пластина в пикселях при заданной плотности точек,
 * с потолком по длинной стороне. Потолок нужен, чтобы 40×60 при 300 dpi не выдавала
 * файл на 4724×7087 — такой холст браузер на телефоне просто не создаст.
 */
export function exportSize(wCm, hCm, config) {
  const dpi = Number(config?.export?.dpi) || 150;
  const maxSide = Number(config?.export?.maxSidePx) || 4000;
  let w = Math.round((wCm / 2.54) * dpi);
  let h = Math.round((hCm / 2.54) * dpi);
  const longest = Math.max(w, h);
  if (longest > maxSide) {
    const k = maxSide / longest;
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { w: Math.max(1, w), h: Math.max(1, h) };
}
