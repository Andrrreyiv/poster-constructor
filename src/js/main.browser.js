// main.browser.js — точка входа: fetch конфига → настройки админки → валидация → start().
// Поток запуска повторяет оба предыдущих конструктора этого заказчика, чтобы выкладка
// на этап 2 не требовала переделки загрузки.

import { validateConfig } from './core/ConfigLoader.js?v=20260913c';
import { PosterApp } from './ui/PosterApp.js?v=20260913c';
import { applyPosterAdmin, applyPrintsOverride } from './poster/AdminOverrides.js?v=20260913c';

// Версия и у данных: без неё браузер отдавал старый конфиг из кеша, и правки не доезжали.
// ⚠️ Токен живёт в ДВУХ местах — здесь и в index.html. Забыл одно — «обновил, а ничего
// не поменялось» на дни. На боевом добавится третье место: src рамки на странице WP.
const CONFIG_URL = 'src/config/poster-config.json?v=20260913c';
const MANIFEST_URL = 'src/config/prints-manifest.json?v=20260913c';

async function boot() {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error('Конфиг не загружен: ' + res.status);
  const config = await res.json();

  // Настройки из админ-страницы WordPress. На прототипе файла нет — молча остаёмся
  // на базовом конфиге. Клиент 13.09 сказал, что размеры и цены потом «подстроит»:
  // подстройка пойдёт именно этим файлом, без правки кода.
  let merged = config;
  try {
    const ares = await fetch('admin.json', { cache: 'no-store' });
    if (ares.ok) merged = applyPosterAdmin(config, await ares.json());
  } catch { /* админки ещё нет */ }
  Object.assign(config, merged);

  const { ok, errors } = validateConfig(config);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.error('[boot] конфиг невалиден:', errors);
    showFatal('Конструктор не смог прочитать настройки. Разработчик уже видит ошибку в консоли.');
    return null;
  }

  // Библиотека картинок необязательна: без неё панель покажет только загрузку своего файла.
  let manifest = null;
  try {
    const mres = await fetch(MANIFEST_URL);
    if (mres.ok) manifest = await mres.json();
    const pres = await fetch('prints.json', { cache: 'no-store' });
    if (pres.ok) manifest = applyPrintsOverride(manifest, await pres.json());
  } catch { /* библиотека опциональна */ }

  const app = new PosterApp({
    config,
    stageEl: document.getElementById('stage'),
    panelEl: document.getElementById('panel'),
    manifest,
  });
  app.start();

  window.__posterApp = app; // отладка
  return app;
}

/** Понятное сообщение вместо пустого экрана: покупатель не обязан открывать консоль. */
function showFatal(text) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  stage.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'fatal';
  p.textContent = text;
  stage.append(p);
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[boot] ошибка запуска:', err);
  showFatal('Конструктор не запустился. Попробуйте обновить страницу.');
});
