/**
 * Собирает assets/catalog.js из catalog.json и settings.json.
 *
 * Источник правды ровно один — те же файлы, что читает бот и редактирует
 * админка. Отдельный файл для доставки и оплаты заведём в третий источник,
 * который админка не знает и потому при первом же сохранении сотрёт.
 *
 * Запуск: node tools/build-data.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

/* Телефон магазина. В settings.json его пока нет — панель им не управляет,
   поэтому он живёт здесь и подставляется сразу и в данные, и в статическую
   разметку (мета-теги, JSON-LD, блок «без JavaScript»). */
const PHONE = "+79366007345";

const SEGMENT_SLUG = {
  luxury: "luxury",
  middle: "middle",
  budget: "budget",
};

/** Латинский транслит для ЧПУ: «Miss Dior Chérie» -> miss-dior-cherie. */
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugify(value) {
  const base = String(value ?? "")
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return base
    .replace(/&/g, "-and-")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Одно поле notes -> плоская структура, чтобы не тащить вложенный объект в разметку. */
function notesOf(item) {
  const notes = item && typeof item.notes === "object" && item.notes !== null ? item.notes : {};
  return {
    top: String(notes.top ?? "").trim(),
    heart: String(notes.heart ?? "").trim(),
    base: String(notes.base ?? "").trim(),
  };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function asInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

/**
 * JSON, безопасный для вставки внутрь <script>.
 *
 * HTML-парсер закрывает <script> на первой же последовательности «</script»,
 * не глядя на кавычки в JS. Название товара приходит из админки, поэтому
 * опечатка вида «Acqua di Gio</script><img src=x onerror=…>» вырвалась бы
 * наружу и выполнилась бы у каждого покупателя витрины.
 *
 * Поэтому «<» (и заодно «>» и «&») заменяем на escape-последовательности:
 * JSON их понимает и отдаёт те же самые символы, а HTML-парсер — нет.
 * U+2028 и U+2029 — тоже: это валидный JSON, но невалидный JS в строках.
 */
function jsonForScript(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Экранирование значения для HTML-атрибута. */
function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Русское окончание числительных: 21 аромат, 22 аромата, 25 ароматов. */
function plural(count, one, few, many) {
  const abs = Math.abs(count) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (tail > 1 && tail < 5) return few;
  if (tail === 1) return one;
  return many;
}

/** Число с разрядами: 3000 -> «3 000». */
function formatPrice(value) {
  const n = Math.trunc(Number(value) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function money(value) {
  return `${formatPrice(value)} ₽`;
}

const catalogRaw = readJson(resolve(root, "catalog.json"));
const settingsRaw = readJson(resolve(root, "settings.json"));

const settings = settingsRaw ?? {};
const segmentsCfg = settings.segments ?? {};

// Порядок сегментов берём из настроек: он задаёт и порядок в меню, и подписи.
const segmentOrder = Object.entries(segmentsCfg)
  .sort((a, b) => (a[1]?.order ?? 99) - (b[1]?.order ?? 99))
  .map(([key]) => key)
  .filter((key) => Array.isArray(catalogRaw?.[key]));

const products = [];
const seenSlugs = new Map();

for (const segment of segmentOrder) {
  for (const item of catalogRaw[segment] ?? []) {
    const brand = String(item.brand ?? "").trim();
    const name = String(item.name ?? "").trim();
    let slug = slugify(name);
    // Два аромата с одинаковым названием не должны делить один адрес.
    if (seenSlugs.has(slug)) {
      seenSlugs.set(slug, seenSlugs.get(slug) + 1);
      slug = `${slug}-${seenSlugs.get(slug)}`;
    } else {
      seenSlugs.set(slug, 1);
    }

    products.push({
      id: String(item.id ?? ""),
      slug,
      name,
      brand,
      segment,
      segmentName: String(segmentsCfg[segment]?.name ?? segment),
      // price — цена за base_ml, а не за флакон. От неё считаются все объёмы.
      baseMl: asInt(item.base_ml, 10) > 0 ? asInt(item.base_ml, 10) : 10,
      basePrice: Math.max(0, asInt(item.price)),
      // Панель меняет текущую цену, сохраняя исторические поля товара.
      // После исправления владельцем старая отметка не должна оставаться.
      priceProvisional: item.price_provisional === true &&
        asInt(item.price_reference?.price, asInt(item.price)) === asInt(item.price),
      description: String(item.description ?? "").trim(),
      notes: notesOf(item),
      gender: String(item.gender ?? "unisex"),
      season: String(item.season ?? "all"),
    });
  }
}

/** Черновики в настройках («new», «test») на витрине выглядят как поломка. */
const PLACEHOLDER = /^(new|test|tests|none|null|-|без|нет)$/i;

function normalizeMethod(raw) {
  const name = String(raw.name ?? "").trim();
  return {
    key: String(raw.key ?? "").trim(),
    // Способ без названия не исчезает: название становится ключом. Так же
    // поступает и Python, иначе витрина и бот показывают разное число
    // способов.
    name: name || String(raw.key ?? "").trim(),
    desc: String(raw.desc ?? "").trim(),
    emoji: String(raw.emoji ?? "").trim(),
    price: Math.max(0, asInt(raw.price)),
    // Сумма, от которой способ становится бесплатным (0 — всегда платный).
    freeOver: Math.max(0, asInt(raw.free_over)),
    order: asInt(raw.order, 99),
    service: String(raw.service ?? "own"),
    status: raw.status === "planned" ? "planned" : "live",
    // Подсказка после заказа: «пришлём QR-код», «пришлём реквизиты».
    hint: String(raw.hint ?? "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean) : [],
  };
}

/**
 * Способы доставки и оплаты из settings.json — того же файла, которым
 * пользуются бот и админка. Метка на сарае «Скоро» и бесплатная доставка
 * от суммы берутся отсюда же, а не из отдельной настройки сайта.
 */
function methods(list) {
  // Правило чистки — ТО ЖЕ, что в store_schema.clean_methods. Это вторая
  // реализация одного правила на двух языках, и они разошлись: Python
  // оставляет способ без названия (подставляя ключ) и отбрасывает
  // повторяющиеся ключи, а здесь способ без названия просто исчезал, а
  // дубликаты оставались оба. На витрине появлялись два одинаковых способа
  // там, где бот показывал один.
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    const m = normalizeMethod(raw);
    if (!m.key || seen.has(m.key)) continue;
    if (PLACEHOLDER.test(m.key) || PLACEHOLDER.test(m.name)) continue;
    seen.add(m.key);
    out.push(m);
  }
  return out.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

const promoRaw = settings.promo ?? {};
const promoPercent = Math.min(90, Math.max(0, asInt(promoRaw.percent)));
const cityRaw = settings.city ?? {};

/**
 * Диапазон цен сегмента по базовому объёму: «от 500 ₽» или «500–800 ₽».
 *
 * Считается из каталога, а не берётся из настроек. Настройка — это
 * рекламная подпись, и она со временем расходится с данными: покупатель
 * видел «Люкс · от 1 200 ₽» над товаром за 500 ₽.
 */
function segmentRange(key) {
  const prices = (catalogRaw?.[key] ?? [])
    .map((item) => asInt(item?.price))
    .filter((p) => p > 0);
  if (!prices.length) return "";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `от ${formatPrice(min)} ₽`;
  return `${formatPrice(min)}–${formatPrice(max)} ₽`;
}

const payload = {
  brand: "MARI PARFUM",
  manager: String(settings.manager_username ?? "").trim().replace(/^@/, ""),
  // Бот, на которого ведёт кнопка «Бот» на витрине, и адрес витрины, на
  // который бот ведёт в ответ. Оба из settings.json — меняются в панели.
  botUsername: String(settings.bot_username ?? "").trim().replace(/^@/, ""),
  siteUrl: String(settings.site_url ?? "").trim(),
  phone: PHONE,
  volumes: (settings.volumes ?? [10]).map((v) => asInt(v)).filter((v) => v > 0),
  segments: segmentOrder.map((key) => ({
    key,
    name: String(segmentsCfg[key]?.name ?? key),
    emoji: String(segmentsCfg[key]?.emoji ?? ""),
    // Диапазон цен сегмента считаем из каталога, а не берём из настроек.
    // Запись в настройках — это рекламная подпись, и она разошлась с
    // данными: «Люкс · от 1 200 ₽» стояло над товаром за 500 ₽, а вся
    // лестница цен, которую обещали сегменты, в каталоге отсутствовала.
    // Считать надо здесь: подпись тогда физически не сможет разойтись
    // с тем, что лежит в каталоге.
    range: segmentRange(key) || String(segmentsCfg[key]?.range ?? ""),
  })),
  products,
  delivery: methods(settings.delivery_methods),
  payment: methods(settings.payment_methods),
  services: settings.services && typeof settings.services === "object" ? settings.services : {},
  city: {
    name: String(cityRaw.name ?? "").trim(),
    region: String(cityRaw.region ?? "").trim(),
    note: String(cityRaw.note ?? "").trim(),
  },
  promo: {
    title: String(promoRaw.title ?? "").trim() || (promoPercent ? `Скидка ${promoPercent}%` : ""),
    percent: promoPercent,
    minTotal: Math.max(0, asInt(promoRaw.min_total)),
  },
};

/* =========================================================================
   Статическая разметка: мета-теги, JSON-LD, подвал, блок «без JavaScript».

   Поисковики читают HTML без запуска скриптов, а покупатель без скриптов
   вообще не видит ни каталога, ни контактов. Поэтому город, акция, телефон
   и число товаров подставляются сюда на сборке из settings.json и
   catalog.json — иначе страница рассказывает поисковику про один город,
   а покупателю показывает другой.

   Подстановка идемпотентна: каждый блок перезаписывается целиком, поэтому
   повторная сборка не наслаивает правки, а ручная вёрстка вокруг них
   остаётся нетронутой.
   ========================================================================= */

/* Самый дешёвый товар задаёт «от N ₽», а его базовый объём — «за N мл». */
const cheapest = products.reduce(
  (best, item) => (!best || item.basePrice < best.basePrice ? item : best),
  null
);
const baseMl = cheapest ? cheapest.baseMl : 10;
const minPrice = cheapest ? cheapest.basePrice : 0;
const maxPrice = products.reduce((max, item) => Math.max(max, item.basePrice), 0);
const minVolume = payload.volumes.length ? Math.min(...payload.volumes) : baseMl;
const maxVolume = payload.volumes.length ? Math.max(...payload.volumes) : baseMl;

/* В форме заказа клиент выбирает только живые способы — в счётчиках
   показываем то же самое, иначе цифра будет больше, чем вариантов. */
const liveDelivery = payload.delivery.filter((m) => m.status !== "planned");
const livePayment = payload.payment.filter((m) => m.status !== "planned");

const brands = [];
for (const item of products) {
  if (item.brand && !brands.includes(item.brand)) brands.push(item.brand);
}

const cityLabel = [payload.city.name, payload.city.region].filter(Boolean).join(", ");
const brandList = brands.slice(0, 3).join(", ");
const deliveryCount = `${liveDelivery.length} ${plural(
  liveDelivery.length,
  "способ доставки",
  "способа доставки",
  "способов доставки"
)}`;
const paymentCount = `${livePayment.length} ${plural(
  livePayment.length,
  "способ оплаты",
  "способа оплаты",
  "способов оплаты"
)}`;

const metaDescription =
  `MARI PARFUM — парфюмерия по миллилитрам: ${brandList} и другие дома. ` +
  `От ${formatPrice(minPrice)} ₽ за ${baseMl} мл, объём от ${minVolume} до ${maxVolume} мл.` +
  (cityLabel ? ` Город: ${cityLabel}.` : "");

const ogDescription =
  `От ${formatPrice(minPrice)} ₽ за ${baseMl} мл. Объём от ${minVolume} до ${maxVolume} мл. ` +
  `${deliveryCount}, ${paymentCount}.` +
  (cityLabel ? ` Город: ${cityLabel}.` : "");

/* JSON-LD: город и телефон — из настроек. Раньше там был зашит «Дрезна»,
   и поисковики получали areaServed не того города, который витрина
   показывала покупателю. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Store",
  "name": payload.brand,
  "description": `Парфюмерия по миллилитрам: оригинальные ароматы от ${minVolume} до ${maxVolume} мл`,
  "priceRange": `${formatPrice(minPrice)}–${formatPrice(maxPrice)} ₽`,
  ...(payload.siteUrl ? { url: payload.siteUrl } : {}),
  ...(payload.city.name ? { areaServed: { "@type": "City", "name": payload.city.name } } : {}),
  address: {
    "@type": "PostalAddress",
    ...(payload.city.name ? { addressLocality: payload.city.name } : {}),
    ...(payload.city.region ? { addressRegion: payload.city.region } : {}),
    addressCountry: "RU",
  },
  telephone: PHONE,
  currenciesAccepted: "RUB",
  ...(livePayment.length ? { paymentAccepted: livePayment.map((m) => m.name).join(", ") } : {}),
};

/* Подвал: базовый объём и акция — тоже из настроек, иначе в подвале
   остаётся старая цифра, пока в корзине уже новая. */
const legalParts = [
  `Цены на сайте совпадают с ценами бота магазина: стоимость объёма считается от базовых ${baseMl} мл.`,
];
if (payload.promo.percent) {
  legalParts.push(
    `Акция «${payload.promo.title}» начисляется на сумму товаров` +
      (payload.promo.minTotal ? ` при заказе от ${money(payload.promo.minTotal)}` : "") +
      "."
  );
}
legalParts.push(
  "Заказы обрабатывает менеджер вручную, поэтому наличие конкретного объёма подтверждается при звонке."
);
const legalText = legalParts.join(" ");

/* Контакты для тех, у кого JavaScript выключен. */
const phoneDigits = PHONE.replace(/[^\d+]/g, "");
const phonePretty = PHONE.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 $1 $2-$3-$4");
const botLink = payload.botUsername ? `https://t.me/${encodeURIComponent(payload.botUsername)}` : "";
const managerLink = payload.manager ? `https://t.me/${encodeURIComponent(payload.manager)}` : "";

const noscriptHtml = `<noscript>
  <div class="noscript">
    <p class="noscript__title">Каталог и корзина работают на JavaScript</p>
    <p>Включите JavaScript — витрина покажет все ${products.length} ${plural(
  products.length,
  "аромат",
  "аромата",
  "ароматов"
)}, цены и способы доставки. А пока можно связаться напрямую:</p>
    <ul class="noscript__list">
      <li>Телефон: <a href="tel:${phoneDigits}">${phonePretty}</a></li>
      ${botLink ? `<li>Бот в Telegram: <a href="${botLink}" target="_blank" rel="noopener">@${payload.botUsername}</a></li>` : ""}
      ${managerLink ? `<li>Менеджер: <a href="${managerLink}" target="_blank" rel="noopener">@${payload.manager}</a></li>` : ""}
    </ul>
  </div>
</noscript>`;

/**
 * Замена по регулярке.
 *
 * Значение-функция получает совпадение и его группы: текст подстановки
 * не нужно экранировать от «$&» и «$1», а строковое значение вставляется
 * как есть — в нём тоже никаких «$» быть не должно.
 */
function replaceAll(text, pattern, replacement) {
  return text.replace(pattern, (...args) => {
    // Аргументы колбэка String.replace: совпадение, группы, смещение, строка.
    // Последние два — служебные, их отбрасываем.
    if (typeof replacement === "function") return replacement(...args.slice(0, -2));
    return replacement;
  });
}
function patchPage(html) {
  let out = html;

  // Мета-теги: описание для поисковиков и для карточки в соцсетях.
  out = replaceAll(
    out,
    /(<meta name="description" content=")[^"]*(")/,
    (match, open, close) => `${open}${escapeAttr(metaDescription)}${close}`
  );
  out = replaceAll(
    out,
    /(<meta property="og:description" content=")[^"]*(")/,
    (match, open, close) => `${open}${escapeAttr(ogDescription)}${close}`
  );

  // JSON-LD целиком: город, телефон и цены — из настроек и каталога.
  out = replaceAll(
    out,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`
  );

  /* Кнопки «Бот» в шапке и плавающая — без JavaScript они вели бы в «#».
     Адрес бота и так публичен (он виден в данных), поэтому проставляем его
     прямо в разметку: с работающим скриптом app.js перезапишет его тем же
     адресом, а без скрипта кнопка останется рабочей.
     Подстановка идемпотентна: после первой сборки href="#" в теге уже нет. */
  if (botLink) {
    out = replaceAll(out, /<a\b[^>]*>/g, (tag) => {
      if (!/\bdata-bot-link\b/.test(tag)) return tag;
      return tag.replace(/\shref="#"/, ` href="${escapeAttr(botLink)}"`);
    });
  }

  // Подвал: акция и базовый объём — из настроек.
  out = replaceAll(
    out,
    /<p class="footer__legal">[\s\S]*?<\/p>/,
    `<p class="footer__legal">${legalText}</p>`
  );

  // Контакты без JavaScript.
  if (/<noscript>[\s\S]*?<\/noscript>/.test(out)) {
    out = replaceAll(out, /<noscript>[\s\S]*?<\/noscript>/, noscriptHtml);
  }

  // Число товаров на странице 404: «девятнадцать» превратилось бы в
  // «одиннадцать» после первого же добавленного аромата.
  out = replaceAll(
    out,
    /<span data-products-count>[\s\S]*?<\/span>/,
    `<span data-products-count>${products.length} ${plural(
      products.length,
      "аромат",
      "аромата",
      "ароматов"
    )}</span>`
  );

  return out;
}

const site = resolve(here, "..");
const js = `// СГЕНЕРИРОВАНО tools/build-data.mjs из catalog.json и settings.json.
// Правьте источник (catalog.json / settings.json) и пересоберите: node tools/build-data.mjs
window.MP_DATA = ${jsonForScript(payload)};
`;

await writeFile(resolve(site, "assets", "catalog.js"), js, "utf8");

/* Версия ресурсов.

   GitHub Pages отдаёт файлы с `max-age=600`, поэтому после выкладки
   браузер до десяти минут показывает прошлую версию — а это значит
   «я поправил, а на сайте ничего не изменилось». Лечится подстановкой
   метки в адрес: хеш считается по содержимому самих ресурсов, поэтому
   меняется только тогда, когда меняется код, и руками его трогать не нужно.
*/
const assetsDir = resolve(site, "assets");
const fingerprint = createHash("sha1");
for (const name of readdirSync(assetsDir).sort()) {
  if (!/\.(js|css|svg)$/.test(name)) continue;
  fingerprint.update(name);
  fingerprint.update(readFileSync(resolve(assetsDir, name), "utf8"));
}
const version = fingerprint.digest("hex").slice(0, 8);

for (const page of ["index.html", "product.html", "404.html"]) {
  const file = resolve(site, page);
  let html;
  try {
    html = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // Сначала снимаем прежнюю метку, иначе query накапливался бы: ?v=ab?v=cd
  const before = html;
  // Данные из settings.json и catalog.json — в статику: мета-теги, JSON-LD,
  // подвал, контакты без JavaScript.
  html = patchPage(html);
  html = html.replace(/([/"'])assets\/([\w.-]+)\?v=[0-9a-f]+/g, "$1assets/$2");
  html = html.replace(/([/"'])assets\/([\w.-]+)(["'])/g, `$1assets/$2?v=${version}$3`);
  if (html !== before) await writeFile(file, html, "utf8");
}

console.log(
  `catalog.js: ${products.length} товаров, сегментов ${segmentOrder.length}, ` +
    `доставка ${payload.delivery.length}, оплата ${payload.payment.length}, ` +
    `сервисов ${Object.keys(payload.services).length}; версия ресурсов v=${version}`
);
