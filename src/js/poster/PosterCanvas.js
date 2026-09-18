// PosterCanvas — сборка изделия на холсте: пластина с картинкой и, если выбрана, рама.
//
// Приём взят у конструктора футболок: там макет собирается вручную в canvas и уходит
// и на скачивание, и в заказ одним и тем же кодом (_composeMockup). Здесь сборка проще —
// нет мокапа, нет сторон, нет слоёв.
//
// ⚠️ ПОРЯДОК РИСОВАНИЯ ВАЖЕН: сначала пластина с картинкой, ПОТОМ рама поверх.
// Рама — накладная картинка с прозрачной серединой, и кладётся она сверху, как надевается
// в жизни. Если поменять порядок, пластина закрасит багет.

import { coverRect, exportSize } from './ImageFit.js?v=20260918b';
import { frameGeometry, frameTexture, frameSlice } from './FrameOption.js?v=20260918b';
import { nineSliceRects } from './NineSlice.js?v=20260918b';
import { plateSize } from './Plates.js?v=20260918b';

/**
 * Нарисовать изделие на готовом контексте.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} img картинка покупателя или принт из библиотеки
 * @param {object} geo результат frameGeometry: outerW, outerH, offset, thickness, frame
 * @param {HTMLImageElement|null} frameImg загруженная текстура рамы (накладной PNG)
 */
export function drawPoster(ctx, img, geo, frameImg = null) {
  const { outerW, outerH, offset } = geo;
  const plateW = outerW - offset * 2;
  const plateH = outerH - offset * 2;

  ctx.clearRect(0, 0, outerW, outerH);

  // Металл под картинкой: если у картинки есть прозрачность, из-под неё должна
  // просвечивать пластина, а не чернота холста.
  ctx.fillStyle = '#f2f3f5';
  ctx.fillRect(offset, offset, plateW, plateH);

  if (img && img.width && img.height) {
    const r = coverRect(img.width, img.height, plateW, plateH);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, offset, offset, plateW, plateH);
  }

  if (geo.frame && geo.thickness > 0) drawFrame(ctx, geo, frameImg);
}

/**
 * Багет вокруг пластины накладной картинкой.
 *
 * ⚠️ Это ИЗОБРАЖЕНИЕ физической рамы, а не печать по краю картинки. Клиент 13.09:
 * «это железная пластина алюминиевая, на неё наносится картинка, и можно эту картинку
 * в рамку поставить». Середина картинки рамы прозрачна, поэтому пластина под ней
 * видна целиком и ничем не обрезается.
 *
 * Текстура ещё не загрузилась или её нет — рисуем запасную раму заливкой. Пустая
 * рамка вместо выбранной читается как поломка, поэтому молчаливого пропуска здесь нет.
 */
export function drawFrame(ctx, geo, frameImg = null) {
  const { outerW, outerH, thickness, frame } = geo;

  const ready = frameImg && frameImg.naturalWidth > 0 && frameImg.naturalHeight > 0;
  if (!ready) {
    drawFrameFallback(ctx, geo);
    return;
  }

  const rects = nineSliceRects(
    { w: frameImg.naturalWidth, h: frameImg.naturalHeight },
    frameSlice(frame),
    { x: 0, y: 0, w: outerW, h: outerH },
    thickness,
  );
  if (!rects.length) {
    drawFrameFallback(ctx, geo);
    return;
  }
  for (const r of rects) {
    ctx.drawImage(frameImg, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  }
}

/**
 * Запасная рама заливкой — на случай, когда текстура не доехала (нет сети, битый файл).
 * Она заведомо проще накладной, но показывает верную ширину и цвет, и покупатель видит,
 * что рама выбрана.
 */
export function drawFrameFallback(ctx, geo) {
  const { outerW, outerH, offset, thickness, frame } = geo;
  if (!frame) return;

  ctx.save();
  // Рисуем только периметр: середину уже занимает пластина с картинкой.
  ctx.beginPath();
  ctx.rect(0, 0, outerW, outerH);
  ctx.rect(offset, offset, outerW - offset * 2, outerH - offset * 2);
  ctx.fillStyle = frame.face || '#222';
  ctx.fill('evenodd');

  ctx.strokeStyle = frame.edge || 'rgba(0,0,0,.35)';
  ctx.lineWidth = Math.max(1, thickness * 0.12);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, outerW - ctx.lineWidth, outerH - ctx.lineWidth);

  ctx.strokeStyle = 'rgba(0,0,0,.28)';
  ctx.lineWidth = Math.max(1, thickness * 0.10);
  ctx.strokeRect(offset - ctx.lineWidth / 2, offset - ctx.lineWidth / 2,
    outerW - offset * 2 + ctx.lineWidth, outerH - offset * 2 + ctx.lineWidth);
  ctx.restore();
}

/**
 * Холст изделия в печатном разрешении — он же уходит на скачивание и в заказ.
 * Возвращает null, если нечего рисовать: молчаливая кнопка лучше, чем пустой файл.
 */
export function composePoster(config, state, img, frameImg = null) {
  if (!img) return null;
  const plate = (config?.plates?.items ?? []).find((p) => p.id === state.plateId);
  if (!plate) return null;

  const size = plateSize(plate, state.orientation);
  const px = exportSize(size.wCm, size.hCm, config);
  const geo = frameGeometry(px.w, px.h, config, state.frameId);

  const canvas = document.createElement('canvas');
  canvas.width = geo.outerW;
  canvas.height = geo.outerH;
  const ctx = canvas.getContext('2d');
  drawPoster(ctx, img, geo, frameImg);
  return canvas;
}

/**
 * Предзагрузка текстур рам. Без неё первый клик по раме показывал бы запасную заливку,
 * а накладная появлялась бы вторым кадром — мигание на глазах у покупателя.
 */
export function preloadFrames(config, onReady) {
  const out = {};
  for (const frame of config?.frames?.options ?? []) {
    const src = frameTexture(frame);
    if (!src) continue;
    const im = new Image();
    im.onload = () => onReady(frame.id, im);
    im.onerror = () => onReady(frame.id, null); // останемся на запасной раме
    im.src = src;
    out[frame.id] = im;
  }
  return out;
}

/** Имя файла макета: по нему печатник должен понять состав без переписки. */
export function mockupFileName(spec) {
  const parts = ['poster'];
  if (spec?.plate) parts.push(spec.plate.wCm + 'x' + spec.plate.hCm);
  if (spec?.frame) parts.push('ramka-' + spec.frame.id);
  return parts.join('-') + '.png';
}
