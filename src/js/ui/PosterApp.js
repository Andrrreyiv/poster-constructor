// PosterApp — оркестратор конструктора постеров.
//
// Писался с нуля, образцом приёмов служил TshirtApp.js (аккордеон одной панели, единая
// точка updatePrice, пересборка панели на каждом действии). Он заметно короче: у постера
// нет сторон, цветов изделия, шрифтов, слоёв, таблицы размеров и фото-мокапов.
//
// Состав экрана ровно по пяти требованиям клиента из голосового 13.09 09:47 и уточнениям
// из голосового 10:27. Ничего сверх них здесь нет, кроме переключателя ориентации —
// он помечен в конфиге как наша добавка и выключается одним флагом.

import { PanelAccordion } from './PanelAccordion.js?v=20260918a';
import { LibraryPanel } from '../poster/LibraryPanel.js?v=20260918a';
import {
  plateList, plateById, defaultPlate, plateSize,
  orientationEnabled, defaultOrientation,
} from '../poster/Plates.js?v=20260918a';
import { frameList, frameGeometry } from '../poster/FrameOption.js?v=20260918a';
import { assessResolution } from '../poster/Resolution.js?v=20260918a';
import { priceOf } from '../poster/PosterPrice.js?v=20260918a';
import { buildOrderSpec, specLines } from '../poster/OrderSpec.js?v=20260918a';
import { drawPoster, composePoster, mockupFileName, preloadFrames } from '../poster/PosterCanvas.js?v=20260918a';
import { aboutBlock, frameHint } from '../poster/AboutText.js?v=20260918a';

export class PosterApp {
  constructor({ config, stageEl, panelEl, manifest = null }) {
    this.config = config;
    this.stageEl = stageEl;
    this.panelEl = panelEl;

    const first = defaultPlate(config);
    this.state = {
      plateId: first?.id ?? null,
      orientation: defaultOrientation(config),
      frameId: null,          // null = без рамы, законное состояние по умолчанию
      image: null,            // { src, w, h, origin: 'library' | 'upload' }
    };

    this.panels = new PanelAccordion();
    this.panelRefs = {};
    this.library = new LibraryPanel(config, manifest);
    this._img = null;         // загруженный HTMLImageElement для отрисовки

    // Узкий экран: там колонки идут одна под другой, и подробное описание отодвинуло бы
    // кнопку «Заказать» вниз. Слушатель заводится ОДИН раз на приложение, а не на каждую
    // перерисовку сцены: renderStage вызывается на любое действие покупателя.
    // В тестах браузера нет, matchMedia не существует — тогда текст просто открыт.
    this._narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 900px)') : null;
    this._aboutEl = null;
    this._narrow?.addEventListener?.('change', () => {
      if (this._aboutEl) this._aboutEl.open = !this._narrow.matches;
    });
    this._frameImgs = {};     // накладные картинки рам по id
    this._lastTotal = null;
  }

  start() {
    this._wireAccordion();
    // Текстуры рам тянем заранее: иначе первый клик по раме показал бы запасную
    // заливку, а накладная появилась бы вторым кадром — мигание на глазах покупателя.
    preloadFrames(this.config, (id, img) => {
      this._frameImgs[id] = img;
      if (this.state.frameId === id) this.renderStage();
    });
    this.render();
  }

  /** Текстура выбранной рамы, если она уже доехала. */
  frameImage() {
    return this.state.frameId ? (this._frameImgs[this.state.frameId] ?? null) : null;
  }

  // ── Аккордеон ──────────────────────────────────────────────────────────────
  // Приём перенесён из TshirtApp дословно вместе с двумя предупреждениями.

  _registerPanel(name, root, apply) {
    this.panelRefs[name] = { root, apply };
    apply(this.panels.isOpen(name));
  }

  /**
   * ⚠️ Фаза ПЕРЕХВАТА, а не всплытия: обработчик самой кнопки обязан сработать ПОСЛЕ нас,
   * иначе клик по чужой кнопке открыл бы её поле, а мы бы тут же его закрыли.
   * ⚠️ Подписка вешается ОДИН раз в start(), а не в renderPanel(): панель пересобирается
   * на каждом действии, и подписки оттуда копились бы десятками.
   */
  _wireAccordion(doc = (typeof document === 'undefined' ? null : document)) {
    if (!doc) return;
    doc.addEventListener('click', (e) => {
      const ref = this.panelRefs[this.panels.open];
      const inside = !!(ref && ref.root && ref.root.contains(e.target));
      if (this.panels.closeIfOutside(inside)) this._syncPanels();
    }, true);
  }

  _syncPanels() {
    for (const name of Object.keys(this.panelRefs)) {
      this.panelRefs[name].apply(this.panels.isOpen(name));
    }
  }

  // ── Состояние ──────────────────────────────────────────────────────────────

  currentPlate() {
    return plateById(this.config, this.state.plateId);
  }

  currentSize() {
    return plateSize(this.currentPlate(), this.state.orientation);
  }

  /** Оценка качества под текущую пластину. Пересчитывается при смене чего угодно. */
  currentQuality() {
    const size = this.currentSize();
    if (!this.state.image || !size) return { level: 'ok', dpi: 0, message: null };
    return assessResolution(
      { w: this.state.image.w, h: this.state.image.h }, size, this.config,
    );
  }

  currentSpec() {
    return buildOrderSpec(this.config, this.state);
  }

  /**
   * Положить картинку. Размеры берём у самого браузера после загрузки: у файла
   * покупателя их взять больше неоткуда, а именно от них зависит проверка качества.
   */
  setImage(src, origin) {
    const im = new Image();
    im.onload = () => {
      this._img = im;
      this.state.image = { src, w: im.naturalWidth, h: im.naturalHeight, origin };
      this.render();
    };
    im.onerror = () => {
      this._img = null;
      this.state.image = null;
      this.render();
    };
    im.src = src;
  }

  // ── Отрисовка ──────────────────────────────────────────────────────────────

  render() {
    this.renderStage();
    this.renderPanel();
    this.updatePrice();
    this._syncPanels();
  }

  /** Сцена: изделие целиком, в пропорциях пластины, с рамой если выбрана. */
  renderStage() {
    const size = this.currentSize();
    this.stageEl.innerHTML = '';
    if (!size) return;

    const shell = el('div', 'stage__shell');
    const canvas = document.createElement('canvas');
    canvas.className = 'stage__canvas';

    // Размер холста берём в экранных пикселях так, чтобы длинная сторона была
    // постоянной: пластины отличаются в шесть раз, и без этого 10×15 выглядела бы
    // маркой, а 40×60 не влезала бы в экран.
    const LONG = 560;
    const aspect = size.wCm / size.hCm;
    const plateW = aspect >= 1 ? LONG : Math.round(LONG * aspect);
    const plateH = aspect >= 1 ? Math.round(LONG / aspect) : LONG;
    const geo = frameGeometry(plateW, plateH, this.config, this.state.frameId);

    canvas.width = geo.outerW;
    canvas.height = geo.outerH;
    const ctx = canvas.getContext('2d');
    drawPoster(ctx, this._img, geo, this.frameImage());

    shell.append(canvas);
    this.stageEl.append(shell);

    const caption = el('div', 'stage__caption');
    caption.append(el('span', 'stage__size', size.wCm + ' × ' + size.hCm + ' см'));
    if (!this.state.image) {
      caption.append(el('span', 'stage__hint', 'Выберите картинку — она ляжет на пластину целиком'));
    }
    this.stageEl.append(caption);

    // Описание товара: клиент 17.09 просил занять текстом пустое место слева, под
    // подписью с размером. Раздела нет или он пуст — блока просто не будет.
    const about = aboutBlock(this.config);
    if (about) this.stageEl.append(this.aboutField(about));
  }

  /**
   * Текст под подписью. На компьютере виден целиком, на телефоне подробности свёрнуты
   * под «Подробнее»: на ширине до 900px панель с кнопкой «Заказать» уезжает ПОД сцену
   * (см. медиазапрос в app.css), и полный текст утащил бы кнопку заказа за сгиб экрана.
   */
  aboutField(about) {
    const box = el('section', 'about');
    if (about.title) box.append(el('h2', 'about__title', about.title));
    if (about.lead) box.append(el('p', 'about__lead', about.lead));
    if (about.details.length) {
      const more = document.createElement('details');
      more.className = 'about__more';
      more.append(el('summary', 'about__toggle', 'Подробнее'));
      for (const абзац of about.details) more.append(el('p', 'about__p', абзац));
      more.open = !this._narrow?.matches;
      this._aboutEl = more;
      box.append(more);
    }
    return box;
  }

  renderPanel() {
    this.panelEl.innerHTML = '';
    this.panelRefs = {};

    this.panelEl.append(this.plateField());
    if (orientationEnabled(this.config)) this.panelEl.append(this.orientationField());
    this.panelEl.append(this.imageField());
    const warn = this.qualityField();
    if (warn) this.panelEl.append(warn);
    if (frameList(this.config).length) this.panelEl.append(this.frameField());
    this.panelEl.append(this.totalField());
    this.panelEl.append(this.actionsField());
  }

  /** Размер пластины — шесть кнопок с ценой под подписью. */
  plateField() {
    const sec = section('Размер пластины');
    const grid = el('div', 'plates');
    for (const plate of plateList(this.config)) {
      const btn = el('button', 'plate' + (plate.id === this.state.plateId ? ' plate--on' : ''));
      btn.type = 'button';
      btn.append(el('span', 'plate__size', plate.label));
      btn.append(el('span', 'plate__price', plate.price + ' ₽'));
      btn.addEventListener('click', () => {
        this.state.plateId = plate.id;
        this.render();
      });
      grid.append(btn);
    }
    sec.append(grid);
    return sec;
  }

  /** Ориентация. Наша добавка — см. комментарий в Plates.plateSize. */
  orientationField() {
    const sec = section('Как повернуть');
    sec.append(this.segment(
      [{ id: 'portrait', label: 'Книжная' }, { id: 'landscape', label: 'Альбомная' }],
      this.state.orientation,
      (id) => { this.state.orientation = id; this.render(); },
    ));
    return sec;
  }

  /** Картинка: кнопка библиотеки и загрузка своего файла (обе — внутри окна). */
  imageField() {
    const sec = section('Картинка');
    const holder = el('div', '');
    this.library.renderTrigger(holder, {
      thumbSrc: this.state.image?.src ?? null,
      onOpen: () => this.library.openModal({
        onPick: (item) => this.setImage(item.file, 'library'),
        onUpload: (file) => this.uploadImage(file),
      }),
    });
    sec.append(holder);
    return sec;
  }

  /**
   * Предупреждение о качестве. Клиент 13.09: «сразу надо показывать… выскакивает
   * сообщение, что низкое качество». Показываем прямо в панели, рядом с картинкой,
   * а не всплывающим окном: всплывающее закрывают не читая.
   */
  qualityField() {
    const q = this.currentQuality();
    if (!q.message) return null;
    const box = el('div', 'quality quality--' + q.level);
    box.append(el('span', 'quality__icon', q.level === 'bad' ? '!' : '?'));
    box.append(el('span', 'quality__text', q.message));
    return box;
  }

  /** Рама: «без рамы» плюс три вида из конфига. */
  frameField() {
    const sec = section('Рама');
    const options = [
      { id: null, label: 'Без рамы' },
      ...frameList(this.config).map((f) => ({ id: f.id, label: f.label, price: f.price })),
    ];
    const grid = el('div', 'frames');
    for (const opt of options) {
      const on = (opt.id ?? null) === (this.state.frameId ?? null);
      const btn = el('button', 'frameopt' + (on ? ' frameopt--on' : ''));
      btn.type = 'button';
      const chip = el('span', 'frameopt__chip');
      const found = frameList(this.config).find((f) => f.id === opt.id);
      chip.style.background = found ? (found.face || '#888') : 'transparent';
      if (!found) chip.classList.add('frameopt__chip--none');
      btn.append(chip);
      btn.append(el('span', 'frameopt__label', opt.label));
      if (opt.price) btn.append(el('span', 'frameopt__price', '+' + opt.price + ' ₽'));
      btn.addEventListener('click', () => {
        this.state.frameId = opt.id;
        this.render();
      });
      grid.append(btn);
    }
    sec.append(grid);

    // Строка про подбор рамы под цвет принта. Клиент просил её голосовым 17.09 и именно
    // здесь, у выбора рамы, а не в общем описании товара.
    const hint = frameHint(this.config);
    if (hint) sec.append(el('p', 'frames__hint', hint));

    return sec;
  }

  /** Итог с раскрывающейся детализацией — поле аккордеона. */
  totalField() {
    const sec = section(null);
    sec.className = 'total';
    const head = el('button', 'total__head');
    head.type = 'button';
    head.append(el('span', 'total__label', 'Итого'));
    const value = el('span', 'total__value');
    value.id = 'totalPrice';
    head.append(value);
    head.append(el('span', 'total__caret', '▾'));

    const body = el('div', 'total__body');
    for (const line of priceOf(this.config, this.state).lines) {
      const row = el('div', 'total__row');
      row.append(el('span', '', line.label), el('span', '', line.amount + ' ₽'));
      body.append(row);
    }

    head.addEventListener('click', () => {
      this.panels.toggle('details');
      this._syncPanels();
    });
    sec.append(head, body);
    this._registerPanel('details', sec, (open) => {
      body.style.display = open ? 'block' : 'none';
      head.classList.toggle('total__head--open', open);
    });
    return sec;
  }

  actionsField() {
    const box = el('div', 'actions');
    const spec = this.currentSpec();

    const order = el('button', 'btn btn--primary', 'Заказать');
    order.type = 'button';
    order.disabled = !spec.ready;
    order.addEventListener('click', () => this.showOrder());

    const dl = el('button', 'btn btn--ghost', 'Скачать макет');
    dl.type = 'button';
    dl.disabled = !spec.ready;
    dl.addEventListener('click', () => this.downloadMockup());

    box.append(order, dl);
    if (!spec.ready) {
      box.append(el('p', 'actions__hint', 'Выберите картинку, чтобы оформить заказ.'));
    }
    return box;
  }

  // ── Действия ───────────────────────────────────────────────────────────────

  /**
   * Свой файл покупателя. Читаем в data:URL, а не по object URL: холст экспорта
   * иначе оказался бы «запятнан» и toDataURL бросил бы SecurityError при скачивании.
   */
  uploadImage(file) {
    const maxMB = Number(this.config.upload?.maxUploadMB) || 20;
    if (file.size > maxMB * 1024 * 1024) {
      alert('Файл больше ' + maxMB + ' МБ. Выберите файл полегче.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.setImage(String(reader.result), 'upload');
    reader.readAsDataURL(file);
  }

  downloadMockup() {
    const canvas = composePoster(this.config, this.state, this._img, this.frameImage());
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = mockupFileName(this.currentSpec());
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  /**
   * Настройки кассы. Файл woo.json кладёт mu-plugin приёма заказов на боевом сайте.
   *
   * ⚠️ Его ОТСУТСТВИЕ — рабочее состояние, а не поломка: на демо-стенде (GitHub Pages)
   * WordPress нет и файла не будет. 404 запоминаем, чтобы не дёргать сеть на каждый клик,
   * а вот сорванный запрос НЕ кешируем: сеть могла просто моргнуть.
   */
  async wooConfig() {
    if (this._woo !== undefined) return this._woo;
    try {
      const r = await fetch('woo.json', { cache: 'no-store' });
      this._woo = r.ok ? await r.json() : null;
    } catch {
      return null;
    }
    return this._woo;
  }

  /**
   * Окно заказа: состав, количество и отправка в корзину.
   *
   * Клиент 13.09 просил корзину прямо («сразу заявку в корзину и заказ»), поэтому
   * отправка тут настоящая. На стенде без WordPress кнопка честно говорит, что корзины
   * нет, вместо того чтобы молча ничего не делать.
   */
  showOrder() {
    const spec = this.currentSpec();
    if (!spec.ready) return;

    const overlay = el('div', 'ordm');
    const card = el('div', 'ordm__card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    const head = el('div', 'ordm__head');
    head.append(el('h3', 'ordm__title', 'Ваш постер'));
    const closeBtn = el('button', 'ordm__close', '×');
    closeBtn.type = 'button';
    head.append(closeBtn);
    card.append(head);

    const list = el('div', 'ordm__list');
    for (const [label, value] of specLines(spec)) {
      const row = el('div', 'ordm__row');
      row.append(el('span', 'ordm__row-label', label), el('span', 'ordm__row-value', value));
      list.append(row);
    }
    const totalRow = el('div', 'ordm__row ordm__row--total');
    totalRow.append(el('span', '', 'Итого'), el('span', '', spec.price.total + ' ₽'));
    list.append(totalRow);
    card.append(list);

    if (spec.quality.level !== 'ok') {
      card.append(el('p', 'ordm__warn', this.currentQuality().message));
    }

    const qtyRow = el('div', 'ordm__qty');
    qtyRow.append(el('label', '', 'Количество'));
    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '1';
    qty.max = '1000';
    qty.value = '1';
    qty.className = 'ordm__qty-input';
    qtyRow.append(qty);
    card.append(qtyRow);

    const err = el('p', 'ordm__err');
    err.hidden = true;
    card.append(err);

    const foot = el('div', 'ordm__foot');
    const confirm = el('button', 'btn btn--primary', 'В корзину');
    confirm.type = 'button';
    const cancel = el('button', 'btn btn--ghost', 'Вернуться');
    cancel.type = 'button';
    foot.append(confirm, cancel);
    card.append(foot);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    confirm.addEventListener('click', () => this.submitOrder({ qty, err, confirm, close }));

    overlay.append(card);
    document.body.append(overlay);
  }

  /**
   * Отправка заказа в корзину WooCommerce.
   *
   * ☠️ Сумма едет полем poster_total ТОЛЬКО ДЛЯ СВЕРКИ и ценой не становится: сервер
   * пересчитывает её сам по id пластины и id рамы. Это оплаченный урок конструктора
   * футболок, повторять подмену цены в браузере нельзя.
   */
  async submitOrder({ qty, err, confirm, close }) {
    confirm.disabled = true;
    err.hidden = true;
    try {
      const woo = await this.wooConfig();
      const spec = this.currentSpec();
      const count = Math.max(1, Math.min(1000, Number(qty.value) || 1));

      if (!woo || !woo.productId) {
        err.hidden = false;
        err.textContent = 'На этом стенде корзины нет: это демонстрация. '
          + 'Состав постера собран, макет можно скачать кнопкой ниже.';
        confirm.disabled = false;
        return;
      }

      const canvas = composePoster(this.config, this.state, this._img, this.frameImage());
      const png = canvas ? canvas.toDataURL('image/jpeg', 0.85) : null;

      const base = String(woo.siteUrl || '').replace(/\/$/, '');
      const form = document.createElement('form');
      form.method = 'POST';
      // ⚠️ На боевом конструктор живёт в iframe — уводим ВСЮ страницу в корзину,
      // иначе корзина откроется внутри рамки конструктора.
      form.target = '_top';
      form.action = base + '/?add-to-cart=' + encodeURIComponent(woo.productId);

      const add = (n, v) => {
        const i = document.createElement('input');
        i.type = 'hidden';
        i.name = n;
        i.value = v;
        form.append(i);
      };
      add('quantity', String(count));
      add('poster_spec', specLines(spec).map(([k, v]) => k + ': ' + v).join('\n'));
      add('poster_total', String(spec.price.total));
      add('poster_order', JSON.stringify({
        plateId: this.state.plateId,
        frameId: this.state.frameId,
        orientation: spec.orientation,
        quantity: count,
      }));
      if (png) add('poster_png', png);

      document.body.append(form);
      form.submit();
      close();
    } catch {
      err.hidden = false;
      err.textContent = 'Не получилось отправить заказ. Попробуйте ещё раз.';
      confirm.disabled = false;
    }
  }

  /** Единственная точка правды по сумме. Микро-удар цены — как у футболок. */
  updatePrice() {
    const out = document.getElementById('totalPrice');
    if (!out) return;
    const total = priceOf(this.config, this.state).total;
    out.textContent = total > 0 ? total + ' ₽' : '—';
    if (this._lastTotal != null && this._lastTotal !== total) {
      out.classList.remove('bump');
      void out.offsetWidth;
      out.classList.add('bump');
    }
    this._lastTotal = total;
  }

  /** Ряд кнопок-переключателей. Один выбран всегда. */
  segment(options, active, onPick) {
    const row = el('div', 'seg');
    for (const opt of options) {
      const btn = el('button', 'seg__btn' + (opt.id === active ? ' seg__btn--on' : ''), opt.label);
      btn.type = 'button';
      btn.addEventListener('click', () => onPick(opt.id));
      row.append(btn);
    }
    return row;
  }
}

// ── Хелперы DOM ──────────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function section(title) {
  const sec = document.createElement('section');
  sec.className = 'field';
  if (title) sec.append(el('h3', 'field__title', title));
  return sec;
}
