<?php
/**
 * Plugin Name: Jetron Poster Constructor Admin
 * Description: Страница настроек конструктора постеров на металле: размеры и цены пластин, рамы, порог качества, библиотека картинок. Пишет poster/admin.json и poster/prints.json.
 * Version: 1.0.0
 *
 * Устанавливать как mu-plugin: wp-content/mu-plugins/jetron-poster-admin.php.
 * Тот же подход, что у jetron-admin.php (форма) и jetron-tshirt-admin.php (футболки):
 * права администратора плюс nonce, валидация на входе, запись JSON рядом с конструктором.
 * Конструктор накладывает настройки поверх базового конфига (src/js/poster/AdminOverrides.js)
 * и БИТЫЙ РАЗДЕЛ ИГНОРИРУЕТ ЦЕЛИКОМ И МОЛЧА — покупатель не должен видеть пустой экран
 * из-за ошибки в одном поле.
 *
 * ⚠️ Зачем эта страница вообще: клиент голосовым 13.09 сказал, что размеры и цены сейчас
 * условные и «мы потом её подстроим». Подстройка идёт отсюда, без правки кода и без выкладки.
 *
 * Чего здесь НЕТ по сравнению с админкой футболок (1221 строка) и почему:
 *   · вкладки фото-мокапов — у постера нет фотографии изделия, есть сама пластина;
 *   · редактора зон печати — печать идёт во всю пластину, зоны не существует;
 *   · плотностей, фасонов и цветов изделия — у металла их нет.
 */

if (!defined('ABSPATH')) {
    exit;
}

const JETRON_PS_NONCE = 'jetron_poster_admin';
const JETRON_PS_ROOT  = 'poster/';

/** Разрешённые форматы: картинки библиотеки и текстуры рам. */
const JETRON_PS_IMG_EXT = array('png', 'jpg', 'jpeg', 'webp', 'svg');

function jetron_ps_path($file) {
    return ABSPATH . JETRON_PS_ROOT . $file;
}

function jetron_ps_dir($sub) {
    return ABSPATH . JETRON_PS_ROOT . 'assets/' . $sub . '/';
}

function jetron_ps_url($rel) {
    return home_url('/' . JETRON_PS_ROOT . ltrim($rel, '/'));
}

/** Чтение JSON настроек. Нет файла или битый — пустой массив, конструктор живёт на базовом конфиге. */
function jetron_ps_load($file) {
    $path = jetron_ps_path($file);
    if (!file_exists($path)) {
        return array();
    }
    $data = json_decode(file_get_contents($path), true);
    return is_array($data) ? $data : array();
}

function jetron_ps_save($file, $data) {
    // serialize_precision на хостинге стоит 17, и round($v, 4) уходил в файл как
    // 0.20000000000000001110223024625. Значение верное, но файл распухает и не читается
    // глазами. -1 включает кратчайшую запись, которая разбирается обратно в то же число.
    $prev = @ini_get('serialize_precision');
    @ini_set('serialize_precision', '-1');
    $json = wp_json_encode(empty($data) ? new stdClass() : $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($prev !== false) {
        @ini_set('serialize_precision', $prev);
    }
    return file_put_contents(jetron_ps_path($file), $json, LOCK_EX);
}

/** Число из формы. Запятая как разделитель тоже принимается: её набирают чаще точки. */
function jetron_ps_num($v) {
    if ($v === null || $v === '') {
        return null;
    }
    $v = str_replace(',', '.', (string) $v);
    if (!is_numeric($v)) {
        return null;
    }
    $n = (float) $v;
    return $n >= 0 ? $n : null;
}

/** Безопасное имя файла: транслит плюс белый список расширений. */
function jetron_ps_safe_name($name, $allowed) {
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) {
        return null;
    }
    $base = sanitize_title(pathinfo($name, PATHINFO_FILENAME));
    if ($base === '') {
        $base = 'file-' . substr(md5($name . microtime()), 0, 6);
    }
    return $base . '.' . $ext;
}

/** Файлы поля в едином виде: поле бывает одиночным (name="x") и множественным (name="x[]"). */
function jetron_ps_field_files($field) {
    if (empty($_FILES[$field]['name'])) {
        return array();
    }
    $f = $_FILES[$field];
    if (!is_array($f['name'])) {
        return array(array('name' => $f['name'], 'tmp_name' => $f['tmp_name'], 'size' => $f['size']));
    }
    $out = array();
    foreach ($f['name'] as $i => $name) {
        if ($name === '') {
            continue;
        }
        $out[] = array('name' => $name, 'tmp_name' => $f['tmp_name'][$i], 'size' => $f['size'][$i]);
    }
    return $out;
}

/**
 * Проверка и перенос одного файла в poster/assets/<sub>/.
 *
 * ⚠️ В КАЖДОМ отказе называем имя файла, вес и расширение. Урок футболок: клиент 30.07
 * не смог загрузить картинку и не понял почему, потому что сообщение было общим.
 */
function jetron_ps_store_file($file, $sub, $allowed, $max_mb = 25) {
    $who = '«' . sanitize_text_field($file['name']) . '»';
    $ext = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
    $mb  = round(((float) $file['size']) / 1048576, 1);

    if (!is_uploaded_file($file['tmp_name'])) {
        return array('error' => $who . ': файл не дошёл до сервера, попробуйте ещё раз.');
    }
    if ($file['size'] > $max_mb * 1024 * 1024) {
        return array('error' => $who . ': весит ' . $mb . ' МБ, а можно до ' . $max_mb . ' МБ. Сожмите файл.');
    }
    // SVG через getimagesize не проходит, а нам он нужен: рамы и часть принтов векторные.
    if ($ext !== 'svg' && !@getimagesize($file['tmp_name'])) {
        return array('error' => $who . ': это не картинка' . ($ext ? ' (расширение .' . $ext . ')' : '')
            . '. Нужен PNG, JPG или WebP. Формат HEIC с айфона и Mac не подходит, пересохраните в PNG.');
    }
    $name = jetron_ps_safe_name($file['name'], $allowed);
    if ($name === null) {
        return array('error' => $who . ': формат .' . ($ext ?: '?') . ' не подходит. Разрешены: '
            . implode(', ', $allowed) . '.');
    }
    $dir = jetron_ps_dir($sub);
    if (!is_dir($dir)) {
        wp_mkdir_p($dir);
    }
    if (file_exists($dir . $name)) {
        $e    = pathinfo($name, PATHINFO_EXTENSION);
        $name = pathinfo($name, PATHINFO_FILENAME) . '-' . substr(md5(microtime()), 0, 4) . '.' . $e;
    }
    if (!move_uploaded_file($file['tmp_name'], $dir . $name)) {
        return array('error' => 'Не удалось сохранить файл. Проверьте права на папку.');
    }
    return 'assets/' . $sub . '/' . $name;
}

/** Загрузка одиночного файла: путь, null (файла нет) или массив с ошибкой. */
function jetron_ps_upload($field, $sub, $allowed, $max_mb = 25) {
    $files = jetron_ps_field_files($field);
    if (!count($files)) {
        return null;
    }
    return jetron_ps_store_file($files[0], $sub, $allowed, $max_mb);
}

// ── Меню ─────────────────────────────────────────────────────────────────────

add_action('admin_menu', function () {
    add_menu_page(
        'Конструктор постеров',
        'Конструктор постеров',
        'manage_options',
        'jetron-poster',
        'jetron_ps_page',
        'dashicons-format-image',
        // ☠️ Позиция 60, а НЕ 59. При совпадении позиции WordPress может молча вытеснить
        // один пункт меню другим, и владелец потерял бы доступ к настройкам футболок.
        // Занято на сайте: 58 — конструктор формы, 59 — конструктор футболок.
        60
    );
});

// ── Обработка форм ───────────────────────────────────────────────────────────

/**
 * Разбор вкладки «Пластины и цены».
 *
 * Правило то же, что в AdminOverrides.js: строка без id, без размера или без цены
 * отбрасывается, а годные сохраняются. Пустой итог НЕ пишется: лучше остаться
 * на прежних настройках, чем стереть каталог одной опечаткой.
 */
function jetron_ps_handle_catalog(&$admin, &$notices) {
    $plates = array();
    $rows   = isset($_POST['plate']) && is_array($_POST['plate']) ? $_POST['plate'] : array();
    $skipped = 0;

    foreach ($rows as $row) {
        $w  = jetron_ps_num($row['wCm'] ?? null);
        $h  = jetron_ps_num($row['hCm'] ?? null);
        $pr = jetron_ps_num($row['price'] ?? null);
        // Пустая строка внизу формы — это «здесь ничего не заполнили», а не ошибка.
        if ($w === null && $h === null && $pr === null) {
            continue;
        }
        if (!$w || !$h || $pr === null) {
            $skipped++;
            continue;
        }
        // id собираем из размера: он и так уникален и читается в заказе глазами.
        $id = rtrim(rtrim(number_format($w, 2, '.', ''), '0'), '.') . 'x'
            . rtrim(rtrim(number_format($h, 2, '.', ''), '0'), '.');
        $plates[] = array('id' => $id, 'wCm' => $w + 0, 'hCm' => $h + 0, 'price' => $pr + 0);
    }

    // Дубль id ломает лукап цены МОЛЧА: находится первая пластина, а выбрана вторая.
    $seen = array();
    $uniq = array();
    foreach ($plates as $p) {
        if (isset($seen[$p['id']])) {
            $notices[] = array('warn', 'Пластина ' . $p['id'] . ' встречается дважды, оставлена первая.');
            continue;
        }
        $seen[$p['id']] = true;
        $uniq[] = $p;
    }

    if ($skipped) {
        $notices[] = array('warn', 'Пропущено строк с неполными данными: ' . $skipped
            . '. У пластины нужны ширина, высота и цена.');
    }
    if (count($uniq)) {
        $admin['plates'] = $uniq;
    } else {
        $notices[] = array('warn', 'Ни одной годной пластины не пришло, прежний список оставлен без изменений.');
    }

    // ── Рамы ──
    $frames = array();
    $rows   = isset($_POST['frame']) && is_array($_POST['frame']) ? $_POST['frame'] : array();
    $prev   = array();
    foreach (($admin['frames'] ?? array()) as $f) {
        if (!empty($f['id'])) {
            $prev[$f['id']] = $f;
        }
    }

    foreach ($rows as $i => $row) {
        $id    = sanitize_key($row['id'] ?? '');
        $label = sanitize_text_field($row['label'] ?? '');
        $price = jetron_ps_num($row['price'] ?? null);
        if ($id === '' && $label === '' && $price === null) {
            continue;
        }
        if ($id === '' || $label === '') {
            $notices[] = array('warn', 'Рама без названия пропущена.');
            continue;
        }
        // Цена рамы может быть нулевой: владелец вправе не брать за неё денег.
        $frame = $prev[$id] ?? array();
        $frame['id']    = $id;
        $frame['label'] = $label;
        $frame['price'] = $price === null ? 0 : $price + 0;

        $slice = jetron_ps_num($row['slice'] ?? null);
        if ($slice) {
            $frame['slice'] = (int) $slice;
        }

        // Картинка рамы. Поле множественное, потому что строк несколько.
        $files = jetron_ps_field_files('frame_texture');
        if (isset($files[$i])) {
            $stored = jetron_ps_store_file($files[$i], 'frames', JETRON_PS_IMG_EXT, 10);
            if (is_array($stored)) {
                $notices[] = array('error', $stored['error']);
            } else {
                $frame['texture'] = $stored;
            }
        }
        $frames[] = $frame;
    }

    if (count($frames)) {
        $admin['frames'] = $frames;
    }

    // ── Порог качества ──
    $target = jetron_ps_num($_POST['quality_target'] ?? null);
    $min    = jetron_ps_num($_POST['quality_min'] ?? null);
    if ($target || $min) {
        $q = $admin['quality'] ?? array();
        if ($target) {
            $q['targetDpi'] = (int) $target;
        }
        if ($min) {
            $q['minDpi'] = (int) $min;
        }
        // Перевёрнутые пороги молча ломали бы логику: «впритык» никогда бы не наступало.
        if (!empty($q['targetDpi']) && !empty($q['minDpi']) && $q['minDpi'] > $q['targetDpi']) {
            $notices[] = array('warn', 'Нижний порог был выше целевого, поменяли местами.');
            $tmp = $q['minDpi'];
            $q['minDpi'] = $q['targetDpi'];
            $q['targetDpi'] = $tmp;
        }
        $admin['quality'] = $q;
    }

    // ── Поворот пластины ──
    $admin['orientation'] = array('enabled' => !empty($_POST['orientation_enabled']));

    // ── Описание товара ──
    // Клиент 17.09 просил текст под картинкой и сказал, что формулировку подберёт сам.
    // Поэтому он правится здесь, без выкладки кода. Отдельного тумблера «показывать»
    // нет намеренно: пустой текст и есть «не показывать», лишний переключатель только
    // добавил бы владельцу способ выключить блок и потом искать, почему он пропал.
    $about = $admin['about'] ?? array();
    $about['title']     = sanitize_text_field($_POST['about_title'] ?? '');
    $about['lead']      = sanitize_textarea_field($_POST['about_lead'] ?? '');
    $about['frameHint'] = sanitize_text_field($_POST['about_frame_hint'] ?? '');

    $details = array();
    foreach (preg_split('/\r\n|\r|\n/', (string) ($_POST['about_details'] ?? '')) as $line) {
        $line = sanitize_textarea_field($line);
        if (trim($line) !== '') {
            $details[] = $line;
        }
    }
    $about['details'] = $details;
    $about['enabled'] = (trim($about['lead']) !== '' || count($details) > 0);
    $admin['about']   = $about;
}

/**
 * Разбор вкладки «Библиотека принтов».
 * Категория без имени отбрасывается, категория без картинок остаётся: в неё ещё догрузят.
 */
function jetron_ps_handle_prints(&$prints, &$notices) {
    $cats = isset($_POST['cat']) && is_array($_POST['cat']) ? $_POST['cat'] : array();
    $prev = array();
    foreach (($prints['categories'] ?? array()) as $c) {
        if (!empty($c['slug'])) {
            $prev[$c['slug']] = $c;
        }
    }

    $out = array();
    foreach ($cats as $i => $row) {
        $label = sanitize_text_field($row['label'] ?? '');
        if ($label === '') {
            continue;
        }
        $slug = sanitize_key($row['slug'] ?? '');
        if ($slug === '') {
            $slug = sanitize_title($label);
        }
        $items = $prev[$slug]['items'] ?? array();

        // Удаление отмеченных картинок. Файл с диска НЕ трогаем: вернуть его потом
        // нельзя, а место дешевле, чем заново выпрашивать принт у клиента.
        $drop = isset($row['drop']) && is_array($row['drop']) ? array_map('strval', $row['drop']) : array();
        if (count($drop)) {
            $items = array_values(array_filter($items, function ($it) use ($drop) {
                return !in_array((string) ($it['file'] ?? ''), $drop, true);
            }));
        }

        // Новые картинки категории. Поле множественное: cat[i][files][].
        $field = 'cat_files_' . $i;
        foreach (jetron_ps_field_files($field) as $file) {
            $stored = jetron_ps_store_file($file, 'prints/' . $slug, JETRON_PS_IMG_EXT, 25);
            if (is_array($stored)) {
                $notices[] = array('error', $stored['error']);
                continue;
            }
            $items[] = array(
                'id'   => $slug . '-' . (count($items) + 1),
                'file' => $stored,
            );
        }

        $out[] = array('slug' => $slug, 'label' => $label, 'items' => array_values($items));
    }

    if (count($out)) {
        $prints['categories'] = $out;
    } else {
        $notices[] = array('warn', 'Ни одной категории не пришло, библиотека оставлена прежней.');
    }
}

function jetron_ps_handle() {
    if (empty($_POST['jetron_ps_section'])) {
        return array();
    }
    if (!current_user_can('manage_options')) {
        wp_die('Недостаточно прав.');
    }
    check_admin_referer(JETRON_PS_NONCE);

    $section = sanitize_key($_POST['jetron_ps_section']);
    $notices = array();

    if ($section === 'catalog') {
        $admin = jetron_ps_load('admin.json');
        jetron_ps_handle_catalog($admin, $notices);
        $written = jetron_ps_save('admin.json', $admin);
        if ($written === false) {
            $notices[] = array('error', 'Не удалось записать poster/admin.json. Проверьте права на папку.');
        } else {
            $notices[] = array('ok', 'Пластины и рамы сохранены. Обновите страницу конструктора, чтобы увидеть.');
        }
    } elseif ($section === 'prints') {
        $prints = jetron_ps_load('prints.json');
        jetron_ps_handle_prints($prints, $notices);
        $written = jetron_ps_save('prints.json', $prints);
        if ($written === false) {
            $notices[] = array('error', 'Не удалось записать poster/prints.json. Проверьте права на папку.');
        } else {
            $notices[] = array('ok', 'Библиотека сохранена.');
        }
    }

    return $notices;
}

// ── Страница ─────────────────────────────────────────────────────────────────

function jetron_ps_page() {
    if (!current_user_can('manage_options')) {
        wp_die('Недостаточно прав.');
    }
    $notices = jetron_ps_handle();
    $tab     = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'catalog';
    $nonce   = wp_create_nonce(JETRON_PS_NONCE);

    echo '<div class="wrap"><h1>Конструктор постеров</h1>';

    foreach ($notices as $n) {
        $cls = $n[0] === 'error' ? 'notice-error' : ($n[0] === 'warn' ? 'notice-warning' : 'notice-success');
        echo '<div class="notice ' . $cls . '"><p>' . esc_html($n[1]) . '</p></div>';
    }

    echo '<p>Конструктор: <a href="' . esc_url(jetron_ps_url('')) . '" target="_blank">'
        . esc_html(jetron_ps_url('')) . '</a></p>';

    echo '<h2 class="nav-tab-wrapper">';
    foreach (array('catalog' => 'Пластины и цены', 'prints' => 'Библиотека принтов') as $k => $label) {
        $cls = 'nav-tab' . ($tab === $k ? ' nav-tab-active' : '');
        echo '<a class="' . $cls . '" href="' . esc_url(admin_url('admin.php?page=jetron-poster&tab=' . $k))
            . '">' . esc_html($label) . '</a>';
    }
    echo '</h2>';

    if ($tab === 'prints') {
        jetron_ps_tab_prints($nonce);
    } else {
        jetron_ps_tab_catalog($nonce);
    }
    echo '</div>';
}

/** Базовые значения: то же, что лежит в poster-config.json, на случай пустого admin.json. */
function jetron_ps_default_plates() {
    return array(
        array('id' => '10x15', 'wCm' => 10, 'hCm' => 15, 'price' => 300),
        array('id' => '15x20', 'wCm' => 15, 'hCm' => 20, 'price' => 500),
        array('id' => '20x30', 'wCm' => 20, 'hCm' => 30, 'price' => 700),
        array('id' => '25x30', 'wCm' => 25, 'hCm' => 30, 'price' => 1000),
        array('id' => '30x40', 'wCm' => 30, 'hCm' => 40, 'price' => 1500),
        array('id' => '40x60', 'wCm' => 40, 'hCm' => 60, 'price' => 2200),
    );
}

function jetron_ps_default_frames() {
    return array(
        array('id' => 'white', 'label' => 'Белая', 'price' => 400, 'texture' => 'assets/frames/white.png', 'slice' => 48),
        array('id' => 'black', 'label' => 'Чёрная', 'price' => 400, 'texture' => 'assets/frames/black.png', 'slice' => 48),
        array('id' => 'wood',  'label' => 'Под дерево', 'price' => 600, 'texture' => 'assets/frames/wood.png', 'slice' => 48),
    );
}

/** Базовый текст описания: то же, что в poster-config.json, на случай пустого admin.json. */
function jetron_ps_default_about() {
    return array(
        'enabled'   => true,
        'title'     => 'О постере',
        'lead'      => 'Изображение наносится на металлическую пластину: такой постер долговечнее бумажного.',
        'details'   => array(
            'Пластина лёгкая и не бьётся, повесить её можно и там, где стекло ставить не хочется.',
            'Изображение занимает всю поверхность пластины, поля и рамка на картинке не обрезаются.',
            'ЗАГЛУШКА: сюда встанут толщина пластины, способ нанесения изображения и способ крепления на стену. Ждём эти три вещи от владельца магазина.',
        ),
        'frameHint' => 'Раму можно подобрать под цвет принта.',
    );
}

function jetron_ps_tab_catalog($nonce) {
    $admin  = jetron_ps_load('admin.json');
    $plates = $admin['plates'] ?? jetron_ps_default_plates();
    $frames = $admin['frames'] ?? jetron_ps_default_frames();
    $q      = $admin['quality'] ?? array('targetDpi' => 150, 'minDpi' => 100);
    $orient = !isset($admin['orientation']['enabled']) || !empty($admin['orientation']['enabled']);
    // Предзаполнение обязательно: форма отправляет ВСЕ свои поля, и без него первое же
    // сохранение цен молча стёрло бы описание товара под картинкой.
    $about  = $admin['about'] ?? jetron_ps_default_about();

    // Три пустые строки внизу: добавить размер должно быть можно без отдельной кнопки.
    $rows = array_merge($plates, array(array(), array(), array()));

    echo '<form method="post" enctype="multipart/form-data">';
    wp_nonce_field(JETRON_PS_NONCE);
    echo '<input type="hidden" name="jetron_ps_section" value="catalog" />';

    echo '<h3>Размеры пластин и цены</h3>';
    echo '<p class="description">Ширина и высота в сантиметрах, цена в рублях за пластину без рамы. '
        . 'Пустые строки внизу можно заполнить, чтобы добавить размер. Чтобы убрать размер, '
        . 'очистите все три поля в его строке.</p>';
    echo '<table class="widefat striped" style="max-width:640px"><thead><tr>'
        . '<th>Ширина, см</th><th>Высота, см</th><th>Цена, ₽</th></tr></thead><tbody>';
    foreach ($rows as $i => $p) {
        echo '<tr>'
            . '<td><input type="text" size="8" name="plate[' . $i . '][wCm]" value="'
                . esc_attr($p['wCm'] ?? '') . '" /></td>'
            . '<td><input type="text" size="8" name="plate[' . $i . '][hCm]" value="'
                . esc_attr($p['hCm'] ?? '') . '" /></td>'
            . '<td><input type="text" size="8" name="plate[' . $i . '][price]" value="'
                . esc_attr($p['price'] ?? '') . '" /></td>'
            . '</tr>';
    }
    echo '</tbody></table>';

    echo '<h3>Рамы</h3>';
    echo '<p class="description">Рама надевается на готовую пластину снаружи и картинку не перекрывает. '
        . 'Цена это доплата к цене пластины. Картинка рамы нужна с прозрачной серединой; '
        . '«край» это ширина багета в самой картинке в пикселях, по нему рама тянется '
        . 'на любой размер пластины без искажения углов.</p>';
    $frows = array_merge($frames, array(array()));
    echo '<table class="widefat striped" style="max-width:900px"><thead><tr>'
        . '<th>Код</th><th>Название</th><th>Доплата, ₽</th><th>Край, px</th>'
        . '<th>Картинка рамы</th><th>Сейчас</th></tr></thead><tbody>';
    foreach ($frows as $i => $f) {
        echo '<tr>'
            . '<td><input type="text" size="8" name="frame[' . $i . '][id]" value="'
                . esc_attr($f['id'] ?? '') . '" /></td>'
            . '<td><input type="text" size="16" name="frame[' . $i . '][label]" value="'
                . esc_attr($f['label'] ?? '') . '" /></td>'
            . '<td><input type="text" size="8" name="frame[' . $i . '][price]" value="'
                . esc_attr($f['price'] ?? '') . '" /></td>'
            . '<td><input type="text" size="6" name="frame[' . $i . '][slice]" value="'
                . esc_attr($f['slice'] ?? '') . '" /></td>'
            . '<td><input type="file" name="frame_texture[]" accept="image/*" /></td>'
            . '<td>';
        if (!empty($f['texture'])) {
            echo '<img src="' . esc_url(jetron_ps_url($f['texture'])) . '" style="height:46px" alt="" />';
        } else {
            echo '<span class="description">нет</span>';
        }
        echo '</td></tr>';
    }
    echo '</tbody></table>';

    echo '<h3>Качество картинки</h3>';
    echo '<p class="description">Конструктор считает, сколько точек приходится на сантиметр пластины, '
        . 'и предупреждает покупателя. Ниже целевого порога это мягкое предупреждение «впритык», '
        . 'ниже нижнего — «низкое качество, печать выйдет размытой». Заказ при этом не запрещается.</p>';
    echo '<table class="form-table"><tr><th>Целевой порог, dpi</th><td>'
        . '<input type="text" size="6" name="quality_target" value="' . esc_attr($q['targetDpi'] ?? 150) . '" />'
        . '</td></tr><tr><th>Нижний порог, dpi</th><td>'
        . '<input type="text" size="6" name="quality_min" value="' . esc_attr($q['minDpi'] ?? 100) . '" />'
        . '</td></tr><tr><th>Поворот пластины</th><td><label>'
        . '<input type="checkbox" name="orientation_enabled" value="1" ' . checked($orient, true, false) . ' /> '
        . 'показывать покупателю выбор «книжная / альбомная»</label>'
        . '<p class="description">Без поворота горизонтальная фотография на вертикальной пластине '
        . 'обрезается по бокам. На цену поворот не влияет.</p></td></tr></table>';

    echo '<h3>Описание товара</h3>';
    echo '<p class="description">Текст под картинкой в конструкторе, слева. Первая строка видна '
        . 'сразу, подробности на телефоне прячутся под ссылку «Подробнее», на компьютере видны '
        . 'целиком. Очистите первую строку и подробности, чтобы убрать блок совсем.</p>';
    echo '<table class="form-table">'
        . '<tr><th>Заголовок</th><td>'
        . '<input type="text" size="40" name="about_title" value="' . esc_attr($about['title'] ?? '') . '" />'
        . '</td></tr>'
        . '<tr><th>Первая строка</th><td>'
        . '<textarea name="about_lead" rows="2" cols="70">' . esc_textarea($about['lead'] ?? '') . '</textarea>'
        . '</td></tr>'
        . '<tr><th>Подробности</th><td>'
        . '<textarea name="about_details" rows="6" cols="70">'
            . esc_textarea(implode("\n", (array) ($about['details'] ?? array()))) . '</textarea>'
        . '<p class="description">По одному абзацу на строку. Пустые строки пропускаются.</p>'
        . '</td></tr>'
        . '<tr><th>Подсказка у рам</th><td>'
        . '<input type="text" size="60" name="about_frame_hint" value="' . esc_attr($about['frameHint'] ?? '') . '" />'
        . '<p class="description">Строка под кнопками выбора рамы, например «Раму можно подобрать '
        . 'под цвет принта».</p>'
        . '</td></tr></table>';

    submit_button('Сохранить');
    echo '</form>';
}

function jetron_ps_tab_prints($nonce) {
    $prints = jetron_ps_load('prints.json');
    $cats   = $prints['categories'] ?? array();
    $rows   = array_merge($cats, array(array()));

    echo '<form method="post" enctype="multipart/form-data">';
    wp_nonce_field(JETRON_PS_NONCE);
    echo '<input type="hidden" name="jetron_ps_section" value="prints" />';
    echo '<p class="description">Категории показываются покупателю списком справа в окне выбора картинки. '
        . 'Чтобы завести новую, заполните пустую строку внизу. Удаление картинки убирает её из '
        . 'библиотеки, сам файл остаётся на сервере.</p>';

    foreach ($rows as $i => $c) {
        $label = $c['label'] ?? '';
        $slug  = $c['slug'] ?? '';
        $items = $c['items'] ?? array();

        echo '<div style="background:#fff;border:1px solid #ccd0d4;padding:12px 16px;margin:14px 0;max-width:900px">';
        echo '<p><label><strong>Название категории</strong><br />'
            . '<input type="text" size="30" name="cat[' . $i . '][label]" value="' . esc_attr($label) . '" /></label> '
            . '<input type="hidden" name="cat[' . $i . '][slug]" value="' . esc_attr($slug) . '" /></p>';

        if (count($items)) {
            echo '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0">';
            foreach ($items as $it) {
                $file = $it['file'] ?? '';
                if ($file === '') {
                    continue;
                }
                echo '<label style="width:110px;text-align:center;font-size:12px">'
                    . '<img src="' . esc_url(jetron_ps_url($file)) . '" '
                    . 'style="width:100%;height:110px;object-fit:contain;background:#f6f7f7;border:1px solid #ddd" alt="" /><br />'
                    . '<input type="checkbox" name="cat[' . $i . '][drop][]" value="' . esc_attr($file) . '" /> убрать'
                    . '</label>';
            }
            echo '</div>';
        } else {
            echo '<p class="description">Картинок пока нет.</p>';
        }

        echo '<p><label>Добавить картинки: '
            . '<input type="file" name="cat_files_' . $i . '[]" multiple accept="image/*" /></label></p>';
        echo '</div>';
    }

    submit_button('Сохранить');
    echo '</form>';
}
