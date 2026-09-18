// LibraryPanel — библиотека готовых принтов для постеров плюс загрузка своей картинки.
//
// Перенесено из конструктора футболок и УПРОЩЕНО. Что выброшено и почему:
//   · отбор по тону изделия (PrintTone, «показать остальные») — у постера нет цвета
//     изделия, пластина всегда одна и та же, подбирать принт под неё не под что;
//   · тёмная подложка плитки — по той же причине.
// Что осталось дословно: положение окна в iframe (pinStyle), иерархия клавиш (keyAction),
// сетка с категориями справа и просмотр принта крупно.
//
// Клиент 13.09 (голосовое 10:27) про библиотеку: «всё как для футболок… там будут постеры
// по тематикам, там Месси, Роналду, Неймар, всё то же самое… 10 категорий нормально».
// ⚠️ Файлов принтов он НЕ прислал — сейчас в манифесте заглушки.

import { PrintPreview } from './PrintPreview.js?v=20260918b';

/**
 * Куда положить окно библиотеки, когда конструктор стоит в iframe без своей прокрутки.
 * box — рамка iframe в координатах РОДИТЕЛЬСКОЙ страницы, viewportH — высота её экрана.
 *
 * ⚠️ Перенесено дословно вместе с уроком. У футболок было position:absolute, и клиент
 * 25.08 прислал видео: «видишь, ползёт вниз, вот этот экран, он ползёт и ползёт
 * до бесконечности». Абсолютный элемент входит в scrollHeight документа, а скрипт сайта
 * подгоняет высоту iframe под эту же величину — петля на 60 кадрах в секунду.
 * fixed из высоты документа выпадает, кормить петлю нечем.
 */
export function pinStyle(box, viewportH) {
  const top = Math.max(0, -box.top);
  const height = Math.max(240, Math.min(viewportH, box.bottom) - Math.max(0, box.top));
  return { position: 'fixed', top, height };
}

/**
 * Что делает клавиша при открытой библиотеке. Пока принт открыт крупно, Esc гасит
 * ТОЛЬКО просмотр: иначе покупатель, закрывая увеличенную картинку, вылетал бы
 * из библиотеки целиком и искал бы её заново.
 */
export function keyAction(key, previewOpen) {
  if (previewOpen) {
    if (key === 'Escape') return 'closePreview';
    if (key === 'ArrowRight') return 'next';
    if (key === 'ArrowLeft') return 'prev';
    return 'none';
  }
  return key === 'Escape' ? 'closeModal' : 'none';
}

const ALL_SLUG = '__all__';

const LOUPE_SVG = '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">'
  + '<path fill="currentColor" d="M8.5 3a5.5 5.5 0 1 1-3.9 9.4A5.5 5.5 0 0 1 8.5 3Zm0 1.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Zm4.9 7.7 3.3 3.3-1.1 1.1-3.3-3.3 1.1-1.1Z"/>'
  + '<path fill="currentColor" d="M7.8 6.2h1.4v4.6H7.8zM6.2 7.8h4.6v1.4H6.2z"/></svg>';

export class LibraryPanel {
  /**
   * @param {object} config poster-config
   * @param {{categories:{slug,label,items:{id,file}[]}[]}|null} manifest
   */
  constructor(config, manifest = null) {
    this.config = config;
    this.manifest = manifest;
    this.categories = manifest?.categories ?? [];
    this.activeSlug = ALL_SLUG;
    this.overlay = null;
    this.preview = new PrintPreview();
  }

  get hasLibrary() {
    return this.categories.length > 0;
  }

  /** Все принты одним списком — для категории «Все картинки». */
  allItems() {
    return this.categories.flatMap((c) => c.items);
  }

  /** Принты выбранной категории (ALL_SLUG — все). */
  itemsOf(slug) {
    if (slug === ALL_SLUG) return this.allItems();
    return this.categories.find((c) => c.slug === slug)?.items ?? [];
  }

  /** Категории для списка в окне: «Все картинки» плюс папки манифеста. */
  categoryList() {
    return [
      { slug: ALL_SLUG, label: 'Все картинки', count: this.allItems().length },
      ...this.categories.map((c) => ({ slug: c.slug, label: c.label, count: c.items.length })),
    ];
  }

  /** Строка-приглашение в панели: кнопка и миниатюра выбранного. */
  renderTrigger(el, { onOpen, thumbSrc = null }) {
    el.innerHTML = '';
    const row = mk('div', 'design-row');
    const btn = mk('button', 'design-row__btn', 'Выбрать картинку');
    btn.type = 'button';
    row.append(btn);
    row.append(mk('span', 'design-row__arrow', '→'));
    const src = thumbSrc || this.allItems()[0]?.file;
    if (src) {
      const th = mk('img', 'design-row__thumb');
      th.src = src;
      th.alt = '';
      th.loading = 'lazy';
      row.append(th);
    }
    btn.addEventListener('click', onOpen);
    row.addEventListener('click', (e) => { if (e.target !== btn) onOpen(); });
    el.append(row);
  }

  /** Открыть окно библиотеки. Повторный вызов не плодит окна. */
  openModal({ onPick, onUpload }) {
    if (this.overlay) return;

    const overlay = mk('div', 'libm');
    const card = mk('div', 'libm__card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Библиотека картинок');

    const head = mk('div', 'libm__head');
    head.append(mk('h3', 'libm__title', 'Выберите картинку'));
    const close = mk('button', 'libm__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    head.append(close);
    card.append(head);

    // Загрузка своего файла. Клиент в первом голосовом: «либо человек загружает свою
    // картинку — хоть фотографию, хоть что, любую».
    const upload = mk('div', 'libm__upload');
    const upBtn = mk('button', 'libm__upload-btn', 'Загрузить свою');
    upBtn.type = 'button';
    const input = mk('input', 'libm__file');
    input.type = 'file';
    input.accept = (this.config.upload?.formats ?? ['png', 'jpeg', 'webp'])
      .map((f) => 'image/' + f).join(',');
    input.style.display = 'none';
    upload.append(upBtn, mk('span', 'libm__upload-hint', 'или перетяните файл сюда'), input);

    const take = (file) => { if (file) { onUpload(file); this.closeModal(); } };
    upBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { take(input.files?.[0]); input.value = ''; });
    upload.addEventListener('dragover', (e) => {
      e.preventDefault();
      upload.classList.add('libm__upload--over');
    });
    upload.addEventListener('dragleave', () => upload.classList.remove('libm__upload--over'));
    upload.addEventListener('drop', (e) => {
      e.preventDefault();
      upload.classList.remove('libm__upload--over');
      take(e.dataTransfer?.files?.[0]);
    });
    card.append(upload);

    const body = mk('div', 'libm__body');
    const grid = mk('div', 'libm__grid');
    const cats = mk('div', 'libm__cats');
    body.append(grid, cats);
    card.append(body);

    const paint = () => {
      grid.innerHTML = '';
      const items = this.itemsOf(this.activeSlug);
      if (!items.length) {
        grid.append(mk('div', 'libm__empty', 'В этой категории пока нет картинок.'));
      }
      items.forEach((item, idx) => {
        // ⚠️ Лупа — СЕСТРА кнопки выбора, а не вложена в неё: кнопка внутри кнопки
        // невалидна, и клик по лупе всплывал бы в выбор — картинка молча легла бы
        // на пластину, а окно закрылось.
        const wrap = mk('div', 'libm__cellwrap');
        const cell = mk('button', 'libm__cell');
        cell.type = 'button';
        const img = mk('img', 'libm__thumb');
        img.src = item.file;
        img.loading = 'lazy';
        img.alt = item.id ?? '';
        cell.append(img);
        cell.addEventListener('click', () => { onPick(item); this.closeModal(); });

        const zoom = mk('button', 'libm__zoom');
        zoom.type = 'button';
        zoom.title = 'Посмотреть крупнее';
        zoom.setAttribute('aria-label', 'Посмотреть картинку крупнее');
        zoom.innerHTML = LOUPE_SVG;
        zoom.addEventListener('click', (e) => {
          e.stopPropagation();
          this._openPreview(items, idx, onPick);
        });
        wrap.append(cell, zoom);
        grid.append(wrap);
      });

      cats.innerHTML = '';
      for (const c of this.categoryList()) {
        const row = mk('button', 'libm__cat' + (c.slug === this.activeSlug ? ' libm__cat--active' : ''));
        row.type = 'button';
        row.append(mk('span', 'libm__cat-label', c.label));
        row.append(mk('span', 'libm__cat-count', String(c.count)));
        row.addEventListener('click', () => { this.activeSlug = c.slug; paint(); });
        cats.append(row);
      }
    };
    paint();

    overlay.append(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(); });
    close.addEventListener('click', () => this.closeModal());
    this._onKey = (e) => {
      switch (keyAction(e.key, this.preview.isOpen)) {
        case 'closePreview': this._closePreview(); break;
        case 'next': this.preview.next(); this._paintPreview(); break;
        case 'prev': this.preview.prev(); this._paintPreview(); break;
        case 'closeModal': this.closeModal(); break;
        default: break;
      }
    };
    document.addEventListener('keydown', this._onKey);

    document.body.append(overlay);
    this.overlay = overlay;
    this._pinToViewport();
  }

  // На сайте конструктор стоит в iframe без своей прокрутки: его «экран» равен всей высоте
  // документа, поэтому обычный fixed с inset:0 растянул бы окно по СЕРЕДИНЕ КОНСТРУКТОРА,
  // а не по экрану покупателя. На телефоне это выглядит так, будто кнопка не работает.
  _pinToViewport() {
    const frame = (() => { try { return window.frameElement; } catch { return null; } })();
    if (!frame || !this.overlay) return;
    const sync = () => {
      if (!this.overlay) return;
      let box;
      let viewportH;
      try {
        box = frame.getBoundingClientRect();
        viewportH = window.parent.innerHeight;
      } catch { return; }
      const pin = pinStyle(box, viewportH);
      this.overlay.style.position = pin.position;
      this.overlay.style.top = pin.top + 'px';
      this.overlay.style.height = pin.height + 'px';
      this.overlay.style.bottom = 'auto';
    };
    sync();
    this._onSync = sync;
    try {
      window.parent.addEventListener('scroll', sync, { passive: true });
      window.parent.addEventListener('resize', sync);
    } catch { /* другой домен — остаёмся на первом расчёте */ }
  }

  _openPreview(items, index, onPick) {
    this.preview.open(items, index);
    if (!this.preview.isOpen || !this.overlay) return;

    const box = mk('div', 'libp');
    const inner = mk('div', 'libp__box');
    const img = mk('img', 'libp__img');
    const close = mk('button', 'libp__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть просмотр');
    const prev = mk('button', 'libp__nav libp__nav--prev', '‹');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Предыдущая');
    const next = mk('button', 'libp__nav libp__nav--next', '›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Следующая');
    const foot = mk('div', 'libp__foot');
    const counter = mk('span', 'libp__counter');
    const take = mk('button', 'libp__take', 'Взять эту');
    take.type = 'button';
    foot.append(counter, take);
    inner.append(img, close, prev, next, foot);
    box.append(inner);

    close.addEventListener('click', () => this._closePreview());
    prev.addEventListener('click', () => { this.preview.prev(); this._paintPreview(); });
    next.addEventListener('click', () => { this.preview.next(); this._paintPreview(); });
    box.addEventListener('click', (e) => { if (e.target === box) this._closePreview(); });
    take.addEventListener('click', () => {
      const item = this.preview.current;
      this._closePreview();
      if (item) { onPick(item); this.closeModal(); }
    });

    this._previewEls = { box, img, counter };
    this.overlay.append(box);
    this._paintPreview();
  }

  _paintPreview() {
    if (!this._previewEls || !this.preview.isOpen) return;
    const item = this.preview.current;
    this._previewEls.img.src = item.file;
    this._previewEls.img.alt = item.id ?? '';
    this._previewEls.counter.textContent = (this.preview.index + 1) + ' из ' + this.preview.items.length;
  }

  _closePreview() {
    this.preview.close();
    this._previewEls?.box.remove();
    this._previewEls = null;
  }

  closeModal() {
    this._closePreview();
    if (this._onKey) {
      document.removeEventListener('keydown', this._onKey);
      this._onKey = null;
    }
    if (this._onSync) {
      try {
        window.parent.removeEventListener('scroll', this._onSync);
        window.parent.removeEventListener('resize', this._onSync);
      } catch { /* нечего снимать */ }
      this._onSync = null;
    }
    this.overlay?.remove();
    this.overlay = null;
  }
}

function mk(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
