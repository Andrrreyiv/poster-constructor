// Просмотр принта крупно — модель без DOM.
//
// Перенесено без изменений из конструктора футболок (src/js/tshirt/PrintPreview.js),
// где это появилось по просьбе клиента 09.09: «человек по сути не может этот принт
// разглядеть… нет кнопочки, как в Ютубе, увеличить». У постеров причина та же и сильнее:
// плитка библиотеки маленькая, а покупатель выбирает картинку, которую повесит на стену.

export class PrintPreview {
  constructor() {
    this.items = [];
    this.index = -1;
  }

  /**
   * Открыть просмотр на позиции index списка items.
   * Пустой список молча не открывается, индекс за границами прижимается к краю —
   * вызывающему коду не нужно его стеречь.
   */
  open(items, index) {
    if (!Array.isArray(items) || items.length === 0) return;
    this.items = items;
    this.index = clamp(index, 0, items.length - 1);
  }

  get isOpen() {
    return this.index >= 0;
  }

  get current() {
    return this.isOpen ? this.items[this.index] : null;
  }

  /** Листание зациклено: молчащая кнопка на последней картинке читается как поломка. */
  next() {
    if (!this.isOpen) return;
    this.index = (this.index + 1) % this.items.length;
  }

  prev() {
    if (!this.isOpen) return;
    this.index = (this.index - 1 + this.items.length) % this.items.length;
  }

  /** Файл картинки, которая сейчас на экране. Листание само по себе ничего не выбирает. */
  pick() {
    return this.current ? this.current.file : null;
  }

  close() {
    this.items = [];
    this.index = -1;
  }
}

function clamp(n, lo, hi) {
  const v = Number.isFinite(n) ? n : lo;
  return Math.min(hi, Math.max(lo, v));
}
