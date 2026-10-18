/* =========================================================================
   Флаконы.

   Товаров с фотографиями нет, а чужие снимки нельзя ни по лицензии, ни
   стабильно: отваливается горячая ссылка. Поэтому флакон рисуется кодом —
   он честный, весит ноль байт и не мигает при загрузке.

   Силуэт, крышка и цвет жидкости привязаны к бренду и к базе аромата, а не к
   id товара: у Dior на странице товара и в реестре цен должен быть один и
   тот же флакон. Никаких чужих логотипов и этикеток — только инициалы.
   ========================================================================= */

(function () {
  "use strict";

  /* Крышки: приглушённые металлы, не пластиково-игрушечные. */
  const CAPS = [
    { fill: "#1b1f1d", edge: "#4c5450", name: "чернильный" },
    { fill: "#33202a", edge: "#6b4653", name: "сливовый" },
    { fill: "#22302a", edge: "#4a6156", name: "зелёный" },
    { fill: "#5c5137", edge: "#a08c5e", name: "латунный" },
    { fill: "#242a33", edge: "#4d5a6b", name: "сине-серый" },
    { fill: "#3a3d3b", edge: "#6e726f", name: "свинцовый" },
    { fill: "#4a2b20", edge: "#8a5a44", name: "медный" },
  ];

  /* Жидкость по базе аромата: восточные базы тёмные и плотные,
     цветочные — светлые и прозрачные. */
  const LIQUIDS = [
    { a: "#e8b98a", b: "#a66c3c", foam: "#fff2e0" },
    { a: "#e4c867", b: "#9c7a20", foam: "#fff8d8" },
    { a: "#a8446a", b: "#5e1734", foam: "#ffd9e6" },
    { a: "#a9bd8c", b: "#5c7048", foam: "#eaf6d8" },
    { a: "#d8c2e6", b: "#8f7aa6", foam: "#f6ecff" },
    { a: "#b3c4d4", b: "#6a8399", foam: "#e8f3ff" },
    { a: "#d07a5e", b: "#8a3f2c", foam: "#ffd9cc" },
    { a: "#e8d3a8", b: "#b39a68", foam: "#fff6e2" },
  ];

  /* Стекло полупрозрачное: на тёмном фоне пустая часть флакона должна
     просвечивать фон, а не выглядеть белым пластиком. */
  const GLASS = [
    { a: "rgba(238,246,242,0.30)", b: "rgba(168,190,180,0.13)", rim: "rgba(255,255,255,0.42)" },
    { a: "rgba(236,240,246,0.28)", b: "rgba(160,178,196,0.13)", rim: "rgba(255,255,255,0.40)" },
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

  /* Силуэты. viewBox 120×176: корпус примерно 40…164, плечо, горло, крышка.
     Шесть форм хватает, чтобы бренды не выглядели клонами друг друга. */
  const SHAPES = {
    rect: {
      body: "M32 62 Q32 44 52 40 H68 Q88 44 88 62 V164 H32 Z",
      interior: "M35 66 Q35 47 53 43 H67 Q85 47 85 66 V164 H35 Z",
      neck: { x: 53, y: 22, w: 14, h: 20 },
      cap: { x: 47, y: 4, w: 26, h: 20, r: 2 },
      label: { x: 40, y: 96, w: 40, h: 30 },
    },
    faceted: {
      body: "M40 44 L80 44 L92 70 L92 164 L28 164 L28 70 Z",
      interior: "M43 47 L77 47 L87 71 L87 164 L33 164 L33 71 Z",
      neck: { x: 53, y: 24, w: 14, h: 18 },
      cap: { x: 48, y: 6, w: 24, h: 20, r: 1 },
      label: { x: 42, y: 98, w: 36, h: 28 },
    },
    round: {
      body: "M60 38 C84 38 96 58 96 100 C96 140 82 164 60 164 C38 164 24 140 24 100 C24 58 36 38 60 38 Z",
      interior: "M60 42 C81 42 92 60 92 100 C92 137 80 164 60 164 C40 164 28 137 28 100 C28 60 39 42 60 42 Z",
      neck: { x: 52, y: 18, w: 16, h: 22 },
      cap: { x: 46, y: 2, w: 28, h: 18, r: 9 },
      label: { x: 42, y: 88, w: 36, h: 30 },
    },
    slim: {
      body: "M42 56 Q42 42 60 40 Q78 42 78 56 V164 H42 Z",
      interior: "M45 59 Q45 45 60 43 Q75 45 75 59 V164 H45 Z",
      neck: { x: 54, y: 24, w: 12, h: 18 },
      cap: { x: 50, y: 8, w: 20, h: 18, r: 1 },
      label: { x: 46, y: 100, w: 28, h: 26 },
    },
    oval: {
      body: "M60 52 C92 52 104 72 104 106 C104 142 84 164 60 164 C36 164 16 142 16 106 C16 72 28 52 60 52 Z",
      interior: "M60 56 C88 56 99 74 99 106 C99 139 82 164 60 164 C38 164 21 139 21 106 C21 74 32 56 60 56 Z",
      neck: { x: 51, y: 30, w: 18, h: 24 },
      cap: { x: 45, y: 12, w: 30, h: 20, r: 2 },
      label: { x: 40, y: 92, w: 40, h: 30 },
    },
    tall: {
      body: "M38 48 Q38 36 60 34 Q82 36 82 48 V164 H38 Z",
      interior: "M41 51 Q41 39 60 37 Q79 39 79 51 V164 H41 Z",
      neck: { x: 55, y: 18, w: 10, h: 18 },
      cap: { x: 51, y: 2, w: 18, h: 18, r: 1 },
      label: { x: 44, y: 92, w: 32, h: 28 },
    },
  };

  const SHAPE_KEYS = Object.keys(SHAPES);

  function shapeFor(product) {
    const key = SHAPE_KEYS[hash((product || {}).brand || (product || {}).id) % SHAPE_KEYS.length];
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
   * @param {object} [options] { ml, volumes, label, bubbles }
   * @returns {string} разметка флакона
   */
  function flacon(product, options) {
    const opts = options || {};
    const item = product || {};
    const shape = shapeFor(item);
    const cap = CAPS[hash(item.brand) % CAPS.length];
    const glass = GLASS[hash(item.brand) % GLASS.length];

    const notes = item.notes || {};
    // База аромата решает цвет: восточные базы тёмные и плотные.
    const seed = hash(`${notes.base || ""}${notes.heart || ""}${item.name || ""}`);
    const liquid = LIQUIDS[seed % LIQUIDS.length];

    const level = opts.ml == null ? 0.4 : fillFor(item, opts.ml, opts.volumes);
    const id = `fc${(uid += 1)}`;
    const showLabel = opts.label !== false;
    const labelText = initials(item.brand);
    const bubbles = opts.bubbles !== false;

    // Пузырьки стоят на границе «жидкость / воздух». Их позиция зависит от
    // уровня, поэтому при смене объёма они поднимаются вместе с ним.
    const surfaceY = 176 - 176 * level;
    const bubbleMarkup = bubbles
      ? [
          [46, 0.55, 2.6],
          [63, 0.72, 1.7],
          [72, 0.42, 2.1],
          [54, 0.86, 1.3],
        ]
          .map(([x, t, r], i) => {
            const y = surfaceY + 6 + t * 52;
            if (y > 168) return "";
            return `<circle class="flacon__bubble flacon__bubble--${i % 2}" cx="${x}" cy="${y}" r="${r}"
                      fill="${liquid.foam}" opacity="0.4"/>`;
          })
          .join("")
      : "";

    return `
<svg viewBox="0 0 120 176" role="img" aria-label="${escape(item.name || "Флакон")}">
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
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="0.32" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-cap" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${cap.edge}"/>
      <stop offset="0.45" stop-color="${cap.fill}"/>
      <stop offset="1" stop-color="${cap.edge}"/>
    </linearGradient>
    <radialGradient id="${id}-halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#e9cfa4" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#e9cfa4" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${id}-clip"><path d="${shape.interior}"/></clipPath>
  </defs>

  <!-- мягкий ореол вокруг флакона: он же работает бликом на тёмном фоне -->
  <ellipse cx="60" cy="104" rx="52" ry="66" fill="url(#${id}-halo)"/>

  <g class="flacon__cap">
    <rect x="${shape.cap.x}" y="${shape.cap.y}" width="${shape.cap.w}" height="${shape.cap.h}"
          rx="${shape.cap.r}" fill="url(#${id}-cap)"/>
    <rect x="${shape.cap.x + 3}" y="${shape.cap.y + 2}" width="${Math.max(2.5, shape.cap.w / 6)}"
          height="${shape.cap.h - 4}" rx="${shape.cap.r}" fill="#ffffff" opacity="0.26"/>
  </g>

  <rect x="${shape.neck.x}" y="${shape.neck.y}" width="${shape.neck.w}" height="${shape.neck.h}"
        fill="${glass.b}" opacity="0.95"/>
  <rect x="${shape.neck.x + 2}" y="${shape.neck.y}" width="2.5" height="${shape.neck.h}"
        fill="#ffffff" opacity="0.45"/>

  <path d="${shape.body}" fill="url(#${id}-glass)"/>

  <g clip-path="url(#${id}-clip)">
    <!-- Тень у стенок: стекло толще по краям, как в настоящем флаконе. -->
    <rect x="0" y="0" width="120" height="176" fill="#050404" opacity="0.22"/>
    <g class="flacon__level" style="transform: scaleY(${level.toFixed(3)});">
      <rect x="0" y="0" width="120" height="176" fill="url(#${id}-liquid)"/>
      ${bubbleMarkup}
      <!-- мениск: тёмная линия поверхности, чтобы уровень читался -->
      <ellipse cx="60" cy="0" rx="62" ry="5" fill="${liquid.foam}" opacity="0.34"/>
      <ellipse cx="60" cy="0" rx="46" ry="2.6" fill="#ffffff" opacity="0.22"/>
    </g>
  </g>

  <g class="flacon__shine">
    <path d="${shape.body}" fill="url(#${id}-shine)"/>
    <!-- вертикальная рефлексия на левом ребре стекла -->
    <path d="${shape.interior}" fill="none" stroke="#ffffff" stroke-opacity="0.55"
          stroke-width="2" stroke-linecap="round" transform="translate(4 0) scale(0.97 1)"/>
  </g>

  <!-- Двойной кант: тёмный внешний и светлый внутренний дают объём стеклу. -->
  <path d="${shape.body}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.6"/>
  <path d="${shape.body}" fill="none" stroke="${glass.rim}" stroke-width="0.9"/>

  ${
    showLabel
      ? `<rect x="${shape.label.x}" y="${shape.label.y}" width="${shape.label.w}" height="${shape.label.h}"
            rx="1" fill="rgba(18,15,12,0.62)" stroke="rgba(233,207,164,0.45)" stroke-width="0.8"/>
         <text x="60" y="${shape.label.y + shape.label.h / 2 + 4}" text-anchor="middle"
               font-family="Prata, serif" font-size="11" fill="#e9cfa4" letter-spacing="0.6">${escape(labelText)}</text>`
      : ""
  }
</svg>`;
  }

  /** Полка на главной: без этикетки и пузырьков — на мелком размере это шум. */
  function shelfFlacon(product) {
    return flacon(product, { ml: null, volumes: null, label: false, bubbles: false });
  }

  window.MPFlacon = {
    render: flacon,
    shelf: shelfFlacon,
    fillFor: fillFor,
    shapeFor: shapeFor,
    hues: { caps: CAPS, liquids: LIQUIDS },
  };
})();