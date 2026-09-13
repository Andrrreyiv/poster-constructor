// PanelAccordion — одно состояние на все раскрывающиеся поля панели.
//
// Перенесено без изменений из конструктора футболок (src/js/ui/PanelAccordion.js).
// Поведение задано клиентом там же 26.08: «в любое поле кликнул — то вот это поле
// должно сворачиваться… чтобы нам пространство не расширять». У постера полей меньше
// (размер, рама, картинка, состав заказа), но правило то же: открыто не больше одного.

export class PanelAccordion {
  constructor(open = null) {
    /** @type {string|null} имя открытой панели: 'plate' | 'frame' | 'details' */
    this.open = open;
  }

  isOpen(name) {
    return this.open === name;
  }

  /** Клик по собственной кнопке панели: открыть её (вытеснив прочие) либо свернуть. */
  toggle(name) {
    this.open = this.open === name ? null : name;
    return this.open;
  }

  /** Панель раскрылась мимо toggle (нативный details) — согласовать состояние. */
  openOnly(name) {
    this.open = name;
    return this.open;
  }

  /**
   * Клик где-то на странице. isInside — попал ли он в корень ОТКРЫТОЙ панели.
   * Её собственная кнопка тоже считается внутренней: иначе клик по кнопке закрыл бы
   * панель здесь и тут же снова открыл её собственным обработчиком.
   * @returns {boolean} что-то реально закрылось, значит надо обновить DOM
   */
  closeIfOutside(isInside) {
    if (this.open === null || isInside) return false;
    this.open = null;
    return true;
  }
}
