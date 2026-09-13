// Генератор текстур рам. ЗАГЛУШКИ: клиент фотографий своих рам не присылал, а без
// картинки рамы конструктор показывать нечего. Три файла по его словам из голосового
// 13.09 10:27 — «белая, чёрная и под дерево».
//
// Почему свой кодировщик PNG, а не библиотека: в проекте нет сборки и нет зависимостей
// (vanilla JS + ESM, как у двух предыдущих конструкторов). Ставить пакет ради трёх
// картинок дороже, чем сорок строк на встроенном zlib.
//
// Формат картинки — «девятка» (9-slice): углы не тянутся, тянутся только стороны.
// Простое растягивание всей картинки испортило бы углы: пластины отличаются по
// пропорциям втрое (10×15 против 40×60), и багет на узкой стал бы кривым.
//
// Запуск: node scripts/make-frame-textures.cjs

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 240;   // сторона текстуры
const BORDER = 48;  // ширина багета в текстуре = slice для девятки

/** Минимальный кодировщик PNG: RGBA, 8 бит, без чересстрочности. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    // Байт фильтра в начале каждой строки. 0 = «без фильтра»: картинки мелкие,
    // экономия от фильтров не стоит усложнения.
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // бит на канал
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Одна текстура. Середина полностью прозрачная — там видна пластина с картинкой.
 * По багету рисуется скос: снаружи темнее, к середине светлее, у внутреннего края
 * снова тень. Без скоса рама читается как наклеенная полоска, а не как предмет.
 */
function makeFrame({ face, dark, light, grain }) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const faceRGB = hex(face);
  const darkRGB = hex(dark);
  const lightRGB = hex(light);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      // Расстояние до ближайшего края — по нему и строится профиль багета.
      const d = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);

      if (d >= BORDER) continue; // середина остаётся прозрачной

      const t = d / BORDER; // 0 — внешний край, 1 — внутренний
      let rgb;
      if (t < 0.12) {
        rgb = mix(darkRGB, faceRGB, t / 0.12);            // внешняя кромка
      } else if (t < 0.45) {
        rgb = mix(faceRGB, lightRGB, (t - 0.12) / 0.33);  // подъём к свету
      } else if (t < 0.85) {
        rgb = mix(lightRGB, faceRGB, (t - 0.45) / 0.40);  // спуск обратно
      } else {
        rgb = mix(faceRGB, darkRGB, (t - 0.85) / 0.15);   // тень у внутреннего края
      }

      if (grain) {
        // Волокно: редкие тёмные полосы вдоль багета. Псевдослучайность детерминирована,
        // чтобы пересборка текстур не меняла картинку в репозитории.
        const n = Math.sin((x * 12.9898 + y * 78.233)) * 43758.5453;
        const s = (n - Math.floor(n) - 0.5) * 22;
        const w = Math.sin(y * 0.7 + x * 0.08) * 10;
        rgb = [
          Math.max(0, Math.min(255, rgb[0] + s + w)),
          Math.max(0, Math.min(255, rgb[1] + s * 0.8 + w * 0.7)),
          Math.max(0, Math.min(255, rgb[2] + s * 0.6 + w * 0.5)),
        ].map(Math.round);
      }

      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(SIZE, SIZE, rgba);
}

const frames = {
  white: { face: '#f0eee9', dark: '#c6c1b7', light: '#ffffff' },
  black: { face: '#232323', dark: '#0b0b0b', light: '#4a4a4a' },
  wood: { face: '#a06a3c', dark: '#5f3b1c', light: '#c89460', grain: true },
};

const dir = path.join(__dirname, '..', 'assets', 'frames');
fs.mkdirSync(dir, { recursive: true });
for (const [id, spec] of Object.entries(frames)) {
  const file = path.join(dir, id + '.png');
  fs.writeFileSync(file, makeFrame(spec));
  console.log(id + '.png — ' + fs.statSync(file).size + ' байт, slice ' + BORDER);
}
