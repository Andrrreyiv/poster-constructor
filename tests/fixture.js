// Общий конфиг для тестов. Намеренно МЕНЬШЕ боевого: три пластины и две рамы хватает,
// чтобы проверить лукап, а лишние строки только мешают читать провал теста.

export function makeConfig(patch = {}) {
  return {
    plates: {
      items: [
        { id: '10x15', wCm: 10, hCm: 15, price: 300 },
        { id: '30x40', wCm: 30, hCm: 40, price: 1500 },
        { id: '40x60', wCm: 40, hCm: 60, price: 2200 },
      ],
    },
    orientation: { enabled: true, default: 'portrait' },
    frames: {
      enabled: true,
      widthRatio: 0.05,
      options: [
        { id: 'white', label: 'Белая', price: 400, face: '#f4f2ee', edge: '#d8d4cc' },
        { id: 'wood', label: 'Под дерево', price: 600, face: '#a46f3e', edge: '#7c5027', grain: true },
      ],
    },
    quality: { targetDpi: 150, minDpi: 100 },
    upload: { formats: ['png', 'jpeg'], maxUploadMB: 20 },
    export: { dpi: 150, maxSidePx: 4000 },
    ...patch,
  };
}
