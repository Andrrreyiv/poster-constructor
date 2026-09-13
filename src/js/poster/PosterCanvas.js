// PosterCanvas — сборка изделия на холсте: пластина с картинкой и, если выбрана, рама.
//
// Приём взят у конструктора футболок: там макет собирается вручную в canvas и уходит
// и на скачивание, и в заказ одним и тем же кодом (_composeMockup). Здесь сборка проще —
// нет мокапа, нет сторон, нет слоёв. Один прямоугольник и опциональный багет вокруг.
//
// Рисование разнесено на мелкие функции не ради красоты: холст в тестах без браузера
// не создать, поэтому вся геометрия вынесена в ImageFit и FrameOption и проверяется там,
// а здесь остаются только вызовы ctx.*

import { coverRect, exportSize } from './ImageFit.js?v=20260913c';
import { frameGeometry } from './FrameOption.js?v=20260913c';
import { plateSize } from './Plates.js?v=20260913c';

/**
 * Нарисовать изделие на готовом контексте.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img картинка покупателя или принт из библиотеки
 * @param {object} geo результат frameGeometry: outerW, outerH, offset, thickness, frame
 */
export function drawPoster(ctx, img, geo) {
  const { outerW, outerH, offset, thickness, frame } = geo;
  const plateW = outerW - offset * 2;
  const plateH = outerH - offset * 2;

  ctx.clearRect(0, 0, outerW, outerH);

  if (frame && thickness > 0) drawFrame(ctx, geo);

  // Металл под картинкой: если у картинки есть прозрачность, из-под неё должна
  // просвечивать пластина, а не чернота холста.
  ctx.fillStyle = '#f2f3f5';
  ctx.fillRect(offset, offset, plateW, plateH);

  if (img && img.width && img.height) {
    const r = coverRect(img.width, img.height, plateW, plateH);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, offset, offset, plateW, plateH);
  }
}

/**
 * Багет вокруг пластины. Рисуется как заливка всего габарита плюс тёмная кромка
 * по внутреннему и внешнему краю — этого хватает, чтобы рама читалась как предмет,
 * а не как цветная полоска.
 *
 * ⚠️ Это ИЗОБРАЖЕНИЕ физической рамы, а не печать по краю картинки. Клиент 13.09:
 * «это железная пластина алюминиевая, на неё наносится картинка, и можно эту картинку
 * в рамку поставить». Картинка под рамой не обрезается — рама снаружи.
 */
export function drawFrame(ctx, geo) {
  const { outerW, outerH, offset, thickness, frame } = geo;

  ctx.fillStyle = frame.face || '#222';
  ctx.fillRect(0, 0, outerW, outerH);

  if (frame.grain) drawWoodGrain(ctx, outerW, outerH, frame);

  // Внешняя кромка и тень во внутренний край: без них рама выглядит наклейкой.
  ctx.strokeStyle = frame.edge || 'rgba(0,0,0,.35)';
  ctx.lineWidth = Math.max(1, thickness * 0.12);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, outerW - ctx.lineWidth, outerH - ctx.lineWidth);

  ctx.strokeStyle = 'rgba(0,0,0,.28)';
  ctx.lineWidth = Math.max(1, thickness * 0.10);
  ctx.strokeRect(offset - ctx.lineWidth / 2, offset - ctx.lineWidth / 2,
    outerW - offset * 2 + ctx.lineWidth, outerH - offset * 2 + ctx.lineWidth);
}

/** Волокно у деревянной рамы. Дешёвый приём: редкие полупрозрачные полосы поперёк багета. */
function drawWoodGrain(ctx, w, h, frame) {
  ctx.save();
  ctx.strokeStyle = frame.edge || 'rgba(0,0,0,.2)';
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  const step = Math.max(6, Math.round(Math.min(w, h) / 48));
  for (let y = step; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + step * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Холст изделия в печатном разрешении — он же уходит на скачивание и в заказ.
 * Возвращает null, если нечего рисовать: молчаливая кнопка лучше, чем пустой файл.
 */
export function composePoster(config, state, img) {
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
  drawPoster(ctx, img, geo);
  return canvas;
}

/** Имя файла макета: по нему печатник должен понять состав без переписки. */
export function mockupFileName(spec) {
  const parts = ['poster'];
  if (spec?.plate) parts.push(spec.plate.wCm + 'x' + spec.plate.hCm);
  if (spec?.frame) parts.push('ramka-' + spec.frame.id);
  return parts.join('-') + '.png';
}
