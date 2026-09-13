// Проверка конфига на старте. Смысл тот же, что у одноимённого модуля футболок, но
// проверяются другие сущности: у постера нет зон печати и сторон, есть пластины и рамы.
//
// Возвращаем список ошибок, а не бросаем: конструктор должен уметь показать понятное
// сообщение вместо пустого экрана, а в консоль положить, что именно не так.

export function validateConfig(config = {}) {
  const errors = [];

  const plates = config?.plates?.items;
  if (!Array.isArray(plates) || plates.length === 0) {
    errors.push('plates.items: список пластин пуст — конструктору нечего показывать');
  } else {
    plates.forEach((p, i) => {
      const where = 'пластина #' + (i + 1) + (p?.id ? ' (' + p.id + ')' : '');
      if (!p?.id) errors.push(where + ': нет id');
      if (!(Number(p?.wCm) > 0) || !(Number(p?.hCm) > 0)) {
        errors.push(where + ': размер должен быть в сантиметрах и больше нуля');
      }
      if (!Number.isFinite(Number(p?.price))) errors.push(where + ': нет цены');
    });

    const ids = plates.map((p) => p?.id).filter(Boolean);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) {
      // Дубль id ломает лукап цены молча: находится первая пластина, а выбрана вторая.
      errors.push('plates.items: повторяются id — ' + [...new Set(dupes)].join(', '));
    }
  }

  // Рамы необязательны: клиент вправе отключить опцию целиком (frames.enabled=false).
  if (config?.frames?.enabled !== false) {
    const frames = config?.frames?.options;
    if (!Array.isArray(frames) || frames.length === 0) {
      errors.push('frames.options: опция рамы включена, но список рам пуст');
    }
  }

  return { ok: errors.length === 0, errors };
}
