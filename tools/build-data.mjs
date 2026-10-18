/**
 * Собирает assets/catalog.js из catalog.json и settings.json бота.
 *
 * Источник правды — файлы бота, а не выдуманные данные: цены, промо, способы
 * доставки и оплаты на сайте должны совпадать с ботом, иначе клиент увидит одну
 * сумму, а менеджер другую.
 *
 * Запуск: node tools/build-data.mjs
 */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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

/** Одно поле notes -> плоская строка, чтобы не тащить вложенный объект в разметку. */
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

const catalogRaw = readJson(resolve(root, "catalog.json"));
const settingsRaw = readJson(resolve(root, "settings.json"));
const providersRaw = readJson(resolve(here, "..", "providers.json"));

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
      baseMl: Number(item.base_ml) > 0 ? Number(item.base_ml) : 10,
      basePrice: Math.max(0, Math.trunc(Number(item.price) || 0)),
      description: String(item.description ?? "").trim(),
      notes: notesOf(item),
      gender: String(item.gender ?? "unisex"),
      season: String(item.season ?? "all"),
    });
  }
}

/** Черновики в настройках бота («new», «test») на витрине выглядят как поломка. */
const PLACEHOLDER = /^(new|test|tests|none|null|-|без|нет)$/i;

function normalizeMethod(raw, fallbackOrder = 99) {
  return {
    key: String(raw.key ?? ""),
    name: String(raw.name ?? "").trim(),
    desc: String(raw.desc ?? "").trim(),
    emoji: String(raw.emoji ?? "").trim(),
    price: Math.max(0, Math.trunc(Number(raw.price) || 0)),
    // Сумма, от которой способ становится бесплатным (0 — всегда платный).
    freeOver: Math.max(0, Math.trunc(Number(raw.freeOver) || 0)),
    order: Math.trunc(Number(raw.order ?? fallbackOrder)),
    service: String(raw.service ?? "own"),
    status: raw.status === "planned" ? "planned" : "live",
    // Подсказка после заказа: «пришлём QR-код», «пришлём реквизиты».
    // Текст живёт в данных, а не в коде — иначе каждая правка копирайта
    // требует релиза сайта.
    hint: String(raw.hint ?? "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean) : [],
  };
}

/**
 * Методы = настройки бота + providers.json.
 *
 * Зачем два источника: settings.json принадлежит боту, и трогать его ради
 * витрины нельзя. providers.json дописывает витрине то, чего у бота нет:
 * привязку к внешнему сервису, статус готовности и город. Один и тот же key
 * в обоих файлах — запись из providers.json перекрывает запись бота.
 */
function mergeMethods(fromBot, fromProviders) {
  const byKey = new Map();

  for (const raw of fromBot) {
    if (!raw || typeof raw !== "object") continue;
    const method = normalizeMethod(raw);
    // Заглушки без названия (в настройках бота их полно) на витрине не показываем.
    if (!method.key || !method.name || PLACEHOLDER.test(method.name) || PLACEHOLDER.test(method.key)) continue;
    byKey.set(method.key, method);
  }

  for (const raw of fromProviders || []) {
    if (!raw || typeof raw !== "object") continue;
    const method = normalizeMethod(raw);
    if (!method.key || !method.name || PLACEHOLDER.test(method.name)) continue;
    byKey.set(method.key, method);
  }

  return [...byKey.values()].sort((a, b) => a.order - b.order);
}

const promoRaw = settings.promo ?? {};
const promoPercent = Math.min(90, Math.max(0, Math.trunc(Number(promoRaw.percent) || 0)));

const payload = {
  brand: "MARI PARFUM",
  manager: String(settings.manager_username ?? "").trim().replace(/^@/, ""),
  phone: "+79366007345",
  volumes: (settings.volumes ?? [10]).map((v) => Math.trunc(Number(v) || 0)).filter((v) => v > 0),
  segments: segmentOrder.map((key) => ({
    key,
    name: String(segmentsCfg[key]?.name ?? key),
    emoji: String(segmentsCfg[key]?.emoji ?? ""),
    range: String(segmentsCfg[key]?.range ?? ""),
  })),
  products,
  delivery: mergeMethods(settings.delivery_methods, providersRaw.delivery),
  payment: mergeMethods(settings.payment_methods, providersRaw.payment),
  services: providersRaw.services ?? {},
  city: {
    name: String(providersRaw.city?.name ?? "").trim(),
    region: String(providersRaw.city?.region ?? "").trim(),
    note: String(providersRaw.city?.note ?? "").trim(),
  },
  promo: {
    title: String(promoRaw.title ?? "").trim() || (promoPercent ? `Скидка ${promoPercent}%` : ""),
    percent: promoPercent,
    minTotal: Math.max(0, Math.trunc(Number(promoRaw.min_total) || 0)),
  },
};

const js = `// СГЕНЕРИРОВАНО tools/build-data.mjs из catalog.json, settings.json бота и providers.json.
// Правьте источник и пересоберите: node tools/build-data.mjs
window.MP_DATA = ${JSON.stringify(payload, null, 2)};
`;

await writeFile(resolve(here, "..", "assets", "catalog.js"), js, "utf8");
console.log(`catalog.js: ${products.length} товаров, сегментов ${segmentOrder.length}, доставка ${payload.delivery.length}, оплата ${payload.payment.length}`);