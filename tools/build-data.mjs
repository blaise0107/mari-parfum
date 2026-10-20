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
  return {
    key: String(raw.key ?? ""),
    name: String(raw.name ?? "").trim(),
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
  return (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof m === "object")
    .map(normalizeMethod)
    .filter((m) => m.key && m.name && !PLACEHOLDER.test(m.name) && !PLACEHOLDER.test(m.key))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

const promoRaw = settings.promo ?? {};
const promoPercent = Math.min(90, Math.max(0, asInt(promoRaw.percent)));
const cityRaw = settings.city ?? {};

const payload = {
  brand: "MARI PARFUM",
  manager: String(settings.manager_username ?? "").trim().replace(/^@/, ""),
  // Бот, на которого ведёт кнопка «Бот» на витрине, и адрес витрины, на
  // который бот ведёт в ответ. Оба из settings.json — меняются в панели.
  botUsername: String(settings.bot_username ?? "").trim().replace(/^@/, ""),
  siteUrl: String(settings.site_url ?? "").trim(),
  phone: "+79366007345",
  volumes: (settings.volumes ?? [10]).map((v) => asInt(v)).filter((v) => v > 0),
  segments: segmentOrder.map((key) => ({
    key,
    name: String(segmentsCfg[key]?.name ?? key),
    emoji: String(segmentsCfg[key]?.emoji ?? ""),
    range: String(segmentsCfg[key]?.range ?? ""),
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

const site = resolve(here, "..");
const js = `// СГЕНЕРИРОВАНО tools/build-data.mjs из catalog.json и settings.json.
// Правьте источник (catalog.json / settings.json) и пересоберите: node tools/build-data.mjs
window.MP_DATA = ${JSON.stringify(payload, null, 2)};
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
  html = html.replace(/([/"'])assets\/([\w.-]+)\?v=[0-9a-f]+/g, "$1assets/$2");
  html = html.replace(/([/"'])assets\/([\w.-]+)(["'])/g, `$1assets/$2?v=${version}$3`);
  if (html !== before) await writeFile(file, html, "utf8");
}

console.log(
  `catalog.js: ${products.length} товаров, сегментов ${segmentOrder.length}, ` +
    `доставка ${payload.delivery.length}, оплата ${payload.payment.length}, ` +
    `сервисов ${Object.keys(payload.services).length}; версия ресурсов v=${version}`
);