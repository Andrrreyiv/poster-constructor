<?php
/**
 * Plugin Name: Jetron — заказы конструктора ПОСТЕРОВ
 * Description: Скрытый товар, приём заказа из конструктора постеров и пересчёт цены НА СЕРВЕРЕ.
 * Version: 1.0.0
 *
 * Устанавливать как mu-plugin: wp-content/mu-plugins/jetron-poster-orders.php.
 * Механика повторяет кассу футболок (jetron-tshirt-orders.php), но формула цены здесь
 * своя и сильно проще: пластина плюс рама, без ступеней и без надписей.
 *
 * Клиент 13.09 (голосовое 10:27) на вопрос «корзина или заявка на почту» ответил прямо:
 * «сразу всё: загрузил файл, выбрал размер, добавил рамку и заказать, сразу заявку
 * в корзину и заказ». Поэтому касса нужна с самого начала, а не потом.
 *
 * ☠️ ГЛАВНОЕ ПРАВИЛО, оплаченное на футболках: присланное браузером число (poster_total)
 * НИКОГДА не становится ценой. Оно сохраняется рядом только для сверки. Цена считается
 * заново из спецификации и серверных прайсов, иначе покупатель подменит сумму в браузере
 * и купит постер за рубль.
 *
 * Откат: удалить этот файл. Конструктор вернётся к показу состава без приёма заказа.
 */

if (!defined('ABSPATH')) { exit; }

const JETRON_PS_ORD_ROOT   = 'poster/';
const JETRON_PS_ORD_OPTION = 'jetron_poster_wc_product';
const JETRON_PS_ORD_TITLE  = 'Постер на металле — конструктор';
const JETRON_PS_ORD_SUBDIR = 'jetron-poster-orders';
const JETRON_PS_ORD_BASE   = 300;      // цена товара-заглушки; реальную ставит пересчёт
const JETRON_PS_ORD_MIN    = 50;       // страховка: ниже этого цену не ставим
const JETRON_PS_ORD_MAX    = 1000000;
const JETRON_PS_ORD_MAXQTY = 1000;

add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) { return; }

    add_action('init', 'jetron_ps_ord_ensure_product', 20);
    add_filter('woocommerce_add_cart_item_data', 'jetron_ps_ord_capture', 10, 2);
    add_action('woocommerce_before_calculate_totals', 'jetron_ps_ord_apply_price', 20);
    add_filter('woocommerce_get_item_data', 'jetron_ps_ord_cart_view', 10, 2);
    add_filter('woocommerce_cart_item_thumbnail', 'jetron_ps_ord_cart_thumb', 10, 3);
    add_action('woocommerce_checkout_create_order_line_item', 'jetron_ps_ord_line_meta', 10, 4);

    // ☠️ Товар скрыт из каталога, поэтому обычные проверки его бы отсекли. Нужны ОБЕ:
    // is_purchasable пускает его в корзину как покупаемый, а add_to_cart_validation
    // проходит проверку самого добавления. Без второй симптом обманчив: товар создан
    // и опубликован, add-to-cart отвечает 200 без ошибок, а корзина МОЛЧА пуста.
    // Замер на футболках 13.09, полдня поиска.
    add_filter('woocommerce_is_purchasable', 'jetron_ps_ord_purchasable', 99, 2);
    add_filter('woocommerce_add_to_cart_validation', 'jetron_ps_ord_force_valid', 99, 3);
});

function jetron_ps_ord_file($name) {
    return ABSPATH . JETRON_PS_ORD_ROOT . $name;
}

/** Скрытый товар-контейнер: покупатель приходит к нему только из конструктора. */
function jetron_ps_ord_ensure_product() {
    $id = (int) get_option(JETRON_PS_ORD_OPTION, 0);
    if ($id && get_post_status($id) === 'publish') {
        jetron_ps_ord_write_woo_json($id);
        return $id;
    }
    if (!class_exists('WC_Product_Simple')) { return 0; }

    $product = new WC_Product_Simple();
    $product->set_name(JETRON_PS_ORD_TITLE);
    $product->set_status('publish');
    $product->set_catalog_visibility('hidden');
    $product->set_regular_price((string) JETRON_PS_ORD_BASE);
    $product->set_price((string) JETRON_PS_ORD_BASE);
    $product->set_sold_individually(false);
    $product->set_manage_stock(false);
    $id = $product->save();
    if ($id) {
        update_option(JETRON_PS_ORD_OPTION, $id);
        jetron_ps_ord_write_woo_json($id);
    }
    return $id;
}

/**
 * Конструктор читает этот файл, чтобы знать, в какой товар слать заказ.
 * Его ОТСУТСТВИЕ — тоже рабочее состояние: на демо-стенде кассы нет, и конструктор
 * тогда просто показывает состав заказа, не пытаясь никуда его отправить.
 */
function jetron_ps_ord_write_woo_json($id) {
    $path = jetron_ps_ord_file('woo.json');
    $data = wp_json_encode(array(
        'productId' => (int) $id,
        'siteUrl'   => home_url(),
        'price'     => JETRON_PS_ORD_BASE,
    ));
    $prev = is_readable($path) ? (string) file_get_contents($path) : '';
    if ($prev === $data) { return; }   // не трогаем файл на каждом запросе
    if (is_dir(dirname($path))) {
        file_put_contents($path, $data, LOCK_EX);
    }
}

function jetron_ps_ord_force_valid($passed, $product_id, $qty) {
    $id = (int) get_option(JETRON_PS_ORD_OPTION, 0);
    return ($id && (int) $product_id === $id) ? true : $passed;
}

function jetron_ps_ord_purchasable($purchasable, $product) {
    $id = (int) get_option(JETRON_PS_ORD_OPTION, 0);
    return ($id && $product && $product->get_id() === $id) ? true : $purchasable;
}

/** Забираем данные заказа из POST в позицию корзины. */
function jetron_ps_ord_capture($data, $product_id) {
    $mine = (int) get_option(JETRON_PS_ORD_OPTION, 0);
    if (!$mine || (int) $product_id !== $mine) { return $data; }

    $data['poster_uid'] = wp_generate_uuid4();
    if (isset($_POST['poster_spec'])) {
        $data['poster_spec'] = sanitize_textarea_field(wp_unslash($_POST['poster_spec']));
    }
    if (isset($_POST['poster_total'])) {
        // Только для сверки. В цену не попадает нигде.
        $data['poster_total'] = (int) wp_unslash($_POST['poster_total']);
    }
    if (isset($_POST['poster_order'])) {
        $data['poster_order'] = jetron_ps_ord_parse(wp_unslash($_POST['poster_order']));
    }
    if (isset($_POST['poster_png'])) {
        $url = jetron_ps_ord_save_png(wp_unslash($_POST['poster_png']), $data['poster_uid']);
        if ($url) { $data['poster_png'] = $url; }
    }
    return $data;
}

/**
 * Разбор спецификации с жёсткими границами: она пришла из браузера.
 * Принимаем только известные ключи и приводим типы — всё прочее отбрасывается.
 */
function jetron_ps_ord_parse($raw) {
    if (!is_string($raw) || strlen($raw) > 8192) { return null; }
    $o = json_decode($raw, true, 8);
    if (!is_array($o)) { return null; }

    $qty = isset($o['quantity']) ? (int) $o['quantity'] : 1;
    if ($qty < 1) { $qty = 1; }
    if ($qty > JETRON_PS_ORD_MAXQTY) { $qty = JETRON_PS_ORD_MAXQTY; }

    return array(
        // id пластины — КЛЮЧ прайса. Цену по нему сервер найдёт сам.
        'plateId'     => isset($o['plateId']) ? sanitize_text_field((string) $o['plateId']) : '',
        'frameId'     => isset($o['frameId']) && $o['frameId'] !== null
                            ? sanitize_key((string) $o['frameId']) : '',
        'orientation' => (isset($o['orientation']) && $o['orientation'] === 'landscape')
                            ? 'landscape' : 'portrait',
        'quantity'    => $qty,
    );
}

/** Макет из конструктора: data-URL превращаем в файл в uploads. */
function jetron_ps_ord_save_png($dataurl, $uid) {
    if (!is_string($dataurl) || !preg_match('#^data:image/(png|jpe?g);base64,#i', $dataurl, $m)) {
        return '';
    }
    $ext = (strtolower($m[1]) === 'png') ? 'png' : 'jpg';
    $b64 = substr($dataurl, strpos($dataurl, ',') + 1);
    $bin = base64_decode($b64, true);
    if ($bin === false || strlen($bin) < 32 || strlen($bin) > 8 * 1024 * 1024) { return ''; }

    $up  = wp_upload_dir();
    $dir = trailingslashit($up['basedir']) . JETRON_PS_ORD_SUBDIR;
    if (!wp_mkdir_p($dir)) { return ''; }
    $name = 'poster-' . sanitize_file_name($uid) . '.' . $ext;
    if (file_put_contents(trailingslashit($dir) . $name, $bin) === false) { return ''; }
    return trailingslashit($up['baseurl']) . JETRON_PS_ORD_SUBDIR . '/' . $name;
}

// ── Пересчёт цены на сервере ────────────────────────────────────────────────
// Зеркало формулы из src/js/poster/PosterPrice.js: total = цена пластины + доплата за раму.
// Ступеней тут нет и быть не должно: размер у постера не произвольный, а ключ списка.

/** Прайсы: базовый конфиг конструктора плюс правки владельца из админки. */
function jetron_ps_ord_config() {
    $cfg = array();
    $base_file = jetron_ps_ord_file('src/config/poster-config.json');
    if (is_readable($base_file)) {
        $j = json_decode((string) file_get_contents($base_file), true);
        if (is_array($j)) { $cfg = $j; }
    }
    $admin_file = jetron_ps_ord_file('admin.json');
    if (!is_readable($admin_file)) { return $cfg; }
    $a = json_decode((string) file_get_contents($admin_file), true);
    if (!is_array($a)) { return $cfg; }

    // Правило то же, что в AdminOverrides.js: битый раздел игнорируем целиком.
    if (isset($a['plates']) && is_array($a['plates']) && count($a['plates'])) {
        $cfg['plates']['items'] = $a['plates'];
    }
    if (isset($a['frames']) && is_array($a['frames']) && count($a['frames'])) {
        $cfg['frames']['options'] = $a['frames'];
    }
    return $cfg;
}

function jetron_ps_ord_plate_price($cfg, $plateId) {
    $items = isset($cfg['plates']['items']) && is_array($cfg['plates']['items'])
        ? $cfg['plates']['items'] : array();
    foreach ($items as $p) {
        if (isset($p['id']) && (string) $p['id'] === (string) $plateId && isset($p['price'])
            && is_numeric($p['price'])) {
            return (float) $p['price'];
        }
    }
    return null;
}

function jetron_ps_ord_frame_price($cfg, $frameId, $plateId) {
    if ($frameId === '') { return 0.0; }   // без рамы — законное состояние
    $opts = isset($cfg['frames']['options']) && is_array($cfg['frames']['options'])
        ? $cfg['frames']['options'] : array();
    foreach ($opts as $f) {
        if (isset($f['id']) && (string) $f['id'] === (string) $frameId) {
            // Цена по размеру пластины (клиент 19.09). ☠️ Пустая клетка значит «такой рамы
            // под этот размер НЕТ», поэтому пара отвергается целиком: посчитать её нулём
            // значит подарить раму, а взять цену другого размера — обсчитать покупателя.
            if (isset($f['prices']) && is_array($f['prices'])) {
                return (isset($f['prices'][$plateId]) && is_numeric($f['prices'][$plateId]))
                    ? (float) $f['prices'][$plateId]
                    : null;
            }
            // Карты цен ещё нет (админку по рамам не сохраняли) — работает плоская цена.
            return (isset($f['price']) && is_numeric($f['price'])) ? (float) $f['price'] : 0.0;
        }
    }
    // Рама названа, но в прайсе её нет: считать «бесплатно» опасно, лучше не трогать цену.
    return null;
}

/**
 * Цена за ОДИН постер по спецификации.
 * null означает «посчитать не смогли» — тогда цену не трогаем вовсе, и менеджер увидит
 * заглушку вместо молча заниженной суммы.
 */
function jetron_ps_ord_calc($spec) {
    if (!is_array($spec) || empty($spec['plateId'])) { return null; }
    $cfg = jetron_ps_ord_config();

    $plate = jetron_ps_ord_plate_price($cfg, $spec['plateId']);
    if ($plate === null) { return null; }

    $frame = jetron_ps_ord_frame_price($cfg, isset($spec['frameId']) ? $spec['frameId'] : '',
        isset($spec['plateId']) ? $spec['plateId'] : '');
    if ($frame === null) { return null; }

    $unit = round($plate + $frame);
    if ($unit < JETRON_PS_ORD_MIN || $unit > JETRON_PS_ORD_MAX) { return null; }
    return array('unit' => $unit, 'plate' => $plate, 'frame' => $frame);
}

function jetron_ps_ord_apply_price($cart) {
    if (is_admin() && !defined('DOING_AJAX')) { return; }
    foreach ($cart->get_cart() as $item) {
        if (empty($item['poster_order']) || empty($item['data'])) { continue; }
        $calc = jetron_ps_ord_calc($item['poster_order']);
        if ($calc) { $item['data']->set_price($calc['unit']); }
    }
}

function jetron_ps_ord_cart_view($items, $item) {
    if (!empty($item['poster_spec'])) {
        $items[] = array('name' => 'Состав', 'value' => nl2br(esc_html($item['poster_spec'])));
    }
    if (!empty($item['poster_png'])) {
        $items[] = array(
            'name'  => 'Макет',
            'value' => '<a href="' . esc_url($item['poster_png']) . '" target="_blank" rel="noopener">открыть</a>',
        );
    }
    return $items;
}

function jetron_ps_ord_cart_thumb($thumb, $item) {
    if (!empty($item['poster_png'])) {
        return '<img src="' . esc_url($item['poster_png']) . '" alt="Макет постера" style="width:100%;height:auto">';
    }
    return $thumb;
}

function jetron_ps_ord_line_meta($line, $key, $values, $order) {
    if (!empty($values['poster_spec'])) {
        $line->add_meta_data('Состав', $values['poster_spec']);
    }
    if (!empty($values['poster_png'])) {
        $line->add_meta_data('Макет', $values['poster_png']);
    }
    if (empty($values['poster_order'])) { return; }

    $spec = $values['poster_order'];
    // Поворот печатнику важен: по нему он режет и по нему вешается рама.
    $line->add_meta_data('Ориентация', $spec['orientation'] === 'landscape' ? 'альбомная' : 'книжная');

    $calc = jetron_ps_ord_calc($spec);
    if ($calc) {
        $line->add_meta_data('Расчёт сервера, ₽ за штуку', (int) $calc['unit']);
        if ($calc['frame'] > 0) {
            $line->add_meta_data('в том числе рама, ₽', (int) $calc['frame']);
        }
    }
    if (!isset($values['poster_total'])) { return; }

    $client = (int) $values['poster_total'];
    $line->add_meta_data('Расчёт конструктора, ₽', $client);
    // Расхождение видно менеджеру сразу: либо прайсы разъехались, либо подмена в браузере.
    if ($calc && abs($client - (int) $calc['unit']) > 1) {
        $line->add_meta_data('Расхождение с расчётом браузера', 'да');
    }
}
