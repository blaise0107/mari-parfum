/* =========================================================================
   Флаконы.

   У товаров нет фотографий, а чужие снимки нельзя ни по лицензии, ни
   стабильно: у них отваливается горячая ссылка. Поэтому флакон рисуется
   кодом — зато он честный, весит ноль байт и не мигает при загрузке.

   Силуэт и цвет привязаны к бренду, а не к id товара: у Dior на странице
   товара и в прайс-листе должен быть один и тот же флакон.
   ========================================================================= */

(function () {
  "use strict";

  /* Крышки: приглушённые, «стеклянные», не пластиково-игрушечные. */
  const CAPS = [
    { fill: "#22292", name: "чернильный" },
    { fill: "#4a2b3c", name: "сливовый" },
    { fill: "#3d4a44", name: "зелёный" },
    { fill: "#8a7a5c", name: "латунный" },
    { fill: "#2f3540", name: "сине-серый" },
    { fill: "#6b6f6c", name: "свинцовый" },
  ];

  /* Жидкость подобрана по базе аромата: восточные базы — тёмные,
     цветочные — светлые и прозрачные. */
  const LIQUIDS = [
    { a: "#d9a06b", b: "#b9763f" },
    { a: "#c9a227", b: "#9a7518" },
    { a: "#6e1e3c", b: "#4a1228" },
    { a: "#7d8f6a", b: "#566848" },
    { a: "#c7b8d6", b: "#a294b6" },
    { a: "#8f9fae", b: "#6a7c8c" },
    { a: "#a4573f", b: "#7c3a29" },
    { a: "#d8c39a", b: "#b39a68" },
  ];

  const GLASS = [
    { a: "#eef1ee", b: "#cfd6d1" },
    { a: "#e9eae6", b: "#c6ccc7" },
  ];

  /** Стабильный хеш строки — чтобы цвет не «прыгал» между страницами. */
  function hash(value) {
    let h = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function initials(brand) {
    const words = String(brand || "")
      .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return "MP";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  function escape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Силуэты. viewBox 120×176: корпус 40…164, плечо, горло, крышка. */
  const SHAPES = {
    rect: {
      body: "M32 62 Q32 44 52 40 H68 Q88 44 88 62 V164 H32 Z",
      interior: "M35 66 Q35 47 53 43 H67 Q85 47 85 66 V164 H35 Z",
      neck: { x: 53, y: 22, w: 14, h: 20 },
      cap: { x: 47, y: 4, w: 26, h: 20, r: 2 },
      label: { x: 40, y: 96, w: 40, h: 30 },
      width: 0.55,
    },
    faceted: {
      body: "M40 44 L80 44 L92 70 L92 164 L28 164 L28 70 Z",
      interior: "M43 47 L77 47 L87 71 L87 164 L33 164 L33 71 Z",
      neck: { x: 53, y: 24, w: 14, h: 18 },
      cap: { x: 48, y: 6, w: 24, h: 20, r: 1 },
      label: { x: 42, y: 98, w: 36, h: 28 },
      width: 0.6,
    },
    round: {
      body: "M60 38 C84 38 96 58 96 100 C96 140 82 164 60 164 C38 164 24 140 24 100 C24 58 36 38 60 38 Z",
      interior: "M60 42 C81 42 92 60 92 100 C92 137 80 164 60 164 C40 164 28 137 28 100 C28 60 39 42 60 42 Z",
      neck: { x: 52, y: 18, w: 16, h: 22 },
      cap: { x: 46, y: 2, w: 28, h: 18, r: 9 },
      label: { x: 42, y: 88, w: 36, h: 30 },
      width: 0.66,
    },
    slim: {
      body: "M42 56 Q42 42 60 40 Q78 42 78 56 V164 H42 Z",
      interior: "M45 59 Q45 45 60 43 Q75 45 75 59 V164 H45 Z",
      neck: { x: 54, y: 24, w: 12, h: 18 },
      cap: { x: 50, y: 8, w: 20, h: 18, r: 1 },
      label: { x: 46, y: 100, w: 28, h: 26 },
      width: 0.42,
    },
    oval: {
      body: "M60 52 C92 52 104 72 104 106 C104 142 84 164 60 164 C36 164 16 142 16 106 C16 72 28 52 60 52 Z",
      interior: "M60 56 C88 56 99 74 99 106 C99 139 82 164 60 164 C38 164 21 139 21 106 C21 74 32 56 60 56 Z",
      neck: { x: 51, y: 30, w: 18, h: 24 },
      cap: { x: 45, y: 12, w: 30, h: 20, r: 2 },
      label: { x: 40, y: 92, w: 40, h: 30 },
      width: 0.72,
    },
    tall: {
      body: "M38 48 Q38 36 60 34 Q82 36 82 48 V164 H38 Z",
      interior: "M41 51 Q41 39 60 37 Q79 39 79 51 V164 H41 Z",
      neck: { x: 55, y: 18, w: 10, h: 18 },
      cap: { x: 51, y: 2, w: 18, h: 18, r: 1 },
      label: { x: 44, y: 92, w: 32, h: 28 },
      width: 0.4,
    },
  };

  const SHAPE_KEYS = Object.keys(SHAPES);

  function shapeFor(product) {
    const key = SHAPE_KEYS[hash(product.brand || product.id) % SHAPE_KEYS.length];
    return SHAPES[key];
  }

  /** Уровень жидкости: чем больше объём, тем выше флакон. */
  function fillFor(product, ml, volumes) {
    const list = Array.isArray(volumes) && volumes.length ? volumes : [10, 100];
    const min = Math.min.apply(null, list);
    const max = Math.max.apply(null, list);
    const value = Number(ml) || min;
    if (max === min) return 0.42;
    const ratio = (value - min) / (max - min);
    // Нижняя граница намеренно выше нуля: пустой флакон на витрине
    // выглядит сломанным, а не нераспакованным.
    return 0.3 + ratio * 0.62;
  }

  let uid = 0;

  /**
   * @param {object} product  товар из MP_DATA
   * @param {object} [options] { ml, volumes, label }
   * @returns {string} разметка флакона
   */
  function flacon(product, options) {
    const opts = options || {};
    const shape = shapeFor(product || {});
    const cap = CAPS[hash((product || {}).brand) % CAPS.length];
    const glass = GLASS[hash((product || {}).brand) % GLASS.length];

    const notes = (product || {}).notes || {};
    // База аромата решает цвет: восточные базы тёмные и плотные.
    const seed = hash(`${notes.base || ""}${notes.heart || ""}${product || ""}`);
    const liquid = LIQUIDS[seed % LIQUIDS.length];

    const level = opts.ml == null ? 0.4 : fillFor(product, opts.ml, opts.volumes);
    const id = `fc${(uid += 1)}`;

    const showLabel = opts.label !== false;
    const labelText = initials((product || {}).brand);

    return `
<svg viewBox="0 0 120 176" role="img" aria-label="${escape((product || {}).name || "Флакон")}">
  <defs>
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${glass.a}"/>
      <stop offset="1" stop-color="${glass.b}"/>
    </linearGradient>
    <linearGradient id="${id}-liquid" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${liquid.b}"/>
      <stop offset="1" stop-color="${liquid.a}"/>
    </linearGradient>
    <linearGradient id="${id}-shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${id}-clip"><path d="${shape.interior}"/></clipPath>
  </defs>

  <g class="flacon__cap">
    <rect x="${shape.cap.x}" y="${shape.cap.y}" width="${shape.cap.w}" height="${shape.cap.h}"
          rx="${shape.cap.r}" fill="${cap.fill}"/>
    <rect x="${shape.cap.x + 3}" y="${shape.cap.y + 2}" width="${Math.max(3, shape.cap.w / 5)}"
          height="${shape.cap.h - 4}" fill="#ffffff" opacity="0.14"/>
  </g>

  <rect x="${shape.neck.x}" y="${shape.neck.y}" width="${shape.neck.w}" height="${shape.neck.h}"
        fill="${glass.b}" opacity="0.9"/>

  <path d="${shape.body}" fill="url(#${id}-glass)"/>

  <g clip-path="url(#${id}-clip)">
    <g class="flacon__level" style="transform: scaleY(${level.toFixed(3)});">
      <rect x="0" y="0" width="120" height="176" fill="url(#${id}-liquid)"/>
      <ellipse cx="60" cy="0" rx="60" ry="6" fill="#ffffff" opacity="0.18"/>
    </g>
  </g>

  <path d="${shape.body}" fill="url(#${id}-shine)"/>
  <path d="${shape.body}" fill="none" stroke="rgba(23,29,26,0.28)" stroke-width="1"/>

  ${
    showLabel
      ? `<rect x="${shape.label.x}" y="${shape.label.y}" width="${shape.label.w}" height="${shape.label.h}"
            fill="rgba(246,246,242,0.88)"/>
         <text x="60" y="${shape.label.y + shape.label.h / 2 + 4}" text-anchor="middle"
               font-family="Prata, serif" font-size="11" fill="#171d1a" letter-spacing="0.5">${escape(labelText)}</text>`
      : ""
  }
</svg>`;
  }

  /** Отдельная функция, чтобы полка на главной не таскала подписи. */
  function shelfFlacon(product) {
    return flacon(product, { ml: null, volumes: null, label: false });
  }

  window.MPFlacon = { render: flacon, shelf: shelfFlacon, fillFor: fillFor, shapeFor: shapeFor };
})();