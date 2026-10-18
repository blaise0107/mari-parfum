/* =========================================================================
   Флаконы.

   Товаров с фотографиями нет, а чужие снимки нельзя ни по лицензии, ни
   стабильно: отваливается горячая ссылка. Поэтому флакон рисуется кодом —
   он честный, весит ноль байт и не мигает при загрузке.

   Силуэт, крышка и цвет жидкости привязаны к бренду и к базе аромата, а не к
   id товара: у Dior на странице товара и в реестре цен должен быть один и
   тот же флакон. Никаких чужих логотипов и этикеток — только инициалы.

   Что именно даёт стеклу объём (это правки к прежней версии):

   1. Корпус — не заливка, а цилиндр: широкая полоса света слева, тёмное
      ядро, тонкий отражённый свет по правому ребру.
   2. Отдельно рисуется узкий блик-полоса и «толстое дно», где стекло
      собирает свет. Плоский прямоугольник этого не даёт.
   3. Крышка — цилиндр: видно верхнюю эллиптическую грань и несколько
      металлических полос, а не серый прямоугольник.
   4. Ореол вокруг флакона подкрашен цветом жидкости, а не золотом: свет на
      полке идёт от самих ароматов.
   5. Тень на «полу» — вместо CSS-фильтра на всей карточке.

   Контракт, который нельзя ломать:
   - `<g class="flacon__level">` — product.js выставляет ему `scaleY()`
     при смене объёма;
   - `MPFlacon.fillFor()` — та же формула, что и в боте;
   - viewBox 120×176 — на него завязан `aspect-ratio: 3 / 4.4` в styles.css.
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

  const FLOOR = 164; // низ корпуса у всех силуэтов

  /* Силуэты. viewBox 120×176. `span` — левая и правая граница корпуса:
     по ней считаются цилиндрические блики, иначе они съезжают с формы. */
  const SHAPES = {
    rect: {
      body: "M30 58 Q30 44 44 42 H76 Q90 44 90 58 V164 H30 Z",
      interior: "M33 61 Q33 47 45 45 H75 Q87 47 87 61 V164 H33 Z",
      span: [30, 90],
      neck: { x: 52, y: 24, w: 16, h: 20 },
      cap: { x: 45, y: 4, w: 30, h: 22, r: 3 },
      label: { x: 38, y: 96, w: 44, h: 34 },
    },
    faceted: {
      body: "M38 40 H82 L94 68 V164 H26 V68 Z",
      interior: "M41 43 H79 L91 69 V164 H29 V69 Z",
      span: [26, 94],
      neck: { x: 54, y: 21, w: 12, h: 21 },
      cap: { x: 45, y: 3, w: 30, h: 20, r: 1 },
      label: { x: 42, y: 98, w: 36, h: 30 },
    },
    round: {
      body: "M60 40 C82 40 96 62 96 102 C96 142 82 164 60 164 C38 164 24 142 24 102 C24 62 38 40 60 40 Z",
      interior: "M60 43 C79 43 93 63 93 102 C93 139 80 164 60 164 C40 164 27 139 27 102 C27 63 41 43 60 43 Z",
      span: [24, 96],
      neck: { x: 52, y: 20, w: 16, h: 22 },
      cap: { x: 43, y: 1, w: 34, h: 21, r: 10 },
      label: { x: 42, y: 88, w: 36, h: 32 },
    },
    slim: {
      body: "M44 54 Q44 40 60 38 Q76 40 76 54 V164 H44 Z",
      interior: "M47 57 Q47 43 60 41 Q73 43 73 57 V164 H47 Z",
      span: [44, 76],
      neck: { x: 54, y: 23, w: 12, h: 17 },
      cap: { x: 47, y: 5, w: 26, h: 20, r: 2 },
      label: { x: 46, y: 100, w: 28, h: 28 },
    },
    oval: {
      body: "M60 50 C90 50 104 70 104 104 C104 140 84 164 60 164 C36 164 16 140 16 104 C16 70 30 50 60 50 Z",
      interior: "M60 53 C87 53 101 72 101 104 C101 137 82 164 60 164 C38 164 19 137 19 104 C19 72 33 53 60 53 Z",
      span: [16, 104],
      neck: { x: 51, y: 29, w: 18, h: 23 },
      cap: { x: 43, y: 9, w: 34, h: 22, r: 3 },
      label: { x: 40, y: 92, w: 40, h: 32 },
    },
    tall: {
      body: "M40 46 Q40 34 60 32 Q80 34 80 46 V164 H40 Z",
      interior: "M43 49 Q43 37 60 35 Q77 37 77 49 V164 H43 Z",
      span: [40, 80],
      neck: { x: 55, y: 17, w: 10, h: 17 },
      cap: { x: 47, y: 1, w: 26, h: 18, r: 2 },
      label: { x: 44, y: 92, w: 32, h: 30 },
    },
  };

  const SHAPE_KEYS = Object.keys(SHAPES);

  function shapeFor(product) {
    const key = SHAPE_KEYS[hash((product || {}).brand || (product || {}).id) % SHAPE_KEYS.length];
    return SHAPES[key];
  }

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

  /* ---------- цвет ---------- */

  function rgb(hex) {
    const value = String(hex || "").replace("#", "");
    const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
    const int = parseInt(full, 16);
    if (!Number.isFinite(int)) return { r: 255, g: 255, b: 255 };
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  /** Смешение с белым/чёрным — чтобы из двух цветов крышки собрать металл. */
  function tone(hex, amount) {
    const c = rgb(hex);
    const target = amount < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    const t = Math.abs(amount);
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mix(c.r, target.r)} ${mix(c.g, target.g)} ${mix(c.b, target.b)})`;
  }

  function fade(hex, alpha) {
    const c = rgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
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
    const glassTint = hash(`${item.brand || ""}glass`) % 2;

    const notes = item.notes || {};
    // База аромата решает цвет: восточные базы тёмные и плотные.
    const seed = hash(`${notes.base || ""}${notes.heart || ""}${item.name || ""}`);
    const liquid = LIQUIDS[seed % LIQUIDS.length];

    const level = opts.ml == null ? 0.4 : fillFor(item, opts.ml, opts.volumes);
    const id = `fc${(uid += 1)}`;
    const showLabel = opts.label !== false;
    const bubbles = opts.bubbles !== false;
    const labelText = initials(item.brand);

    const [x0, x1] = shape.span;
    const w = x1 - x0;
    const surfaceY = FLOOR - FLOOR * level;
    const capCx = shape.cap.x + shape.cap.w / 2;
    const capRy = Math.max(2, shape.cap.w * 0.16);

    /* Цилиндр корпуса: широкая полоса света слева, тёмное ядро,
       тонкий отражённый свет по правому ребру. */
    const cyl = [
      ["0", "rgba(255,255,255,0.16)"],
      ["0.06", "rgba(0,0,0,0.26)"],
      ["0.17", "rgba(255,255,255,0.18)"],
      ["0.28", "rgba(255,255,255,0.03)"],
      ["0.46", "rgba(0,0,0,0.10)"],
      ["0.7", "rgba(0,0,0,0.22)"],
      ["0.88", "rgba(255,255,255,0.13)"],
      ["0.95", "rgba(255,255,255,0.04)"],
      ["1", "rgba(0,0,0,0.38)"],
    ]
      .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
      .join("");

    /* Узкая блик-полоса — главный признак стекла на флаконе. */
    const specX = x0 + w * 0.16;
    const specW = w * 0.15;
    const spec = [
      ["0", "rgba(255,255,255,0)"],
      ["0.4", "rgba(255,255,255,0.62)"],
      ["0.6", "rgba(255,255,255,0.34)"],
      ["1", "rgba(255,255,255,0)"],
    ]
      .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
      .join("");

    /* Металл крышки: тёмный кант, свет, ядро, вторая вспышка, тёмный кант. */
    const capGrad = [
      ["0", tone(cap.edge, -0.45)],
      ["0.1", tone(cap.edge, 0.35)],
      ["0.22", tone(cap.fill, 0.05)],
      ["0.44", tone(cap.fill, -0.4)],
      ["0.68", tone(cap.fill, -0.05)],
      ["0.86", tone(cap.edge, 0.2)],
      ["1", tone(cap.edge, -0.5)],
    ]
      .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
      .join("");

    /* Пузырьки стоят строго под мениском и не масштабируются вместе с
       жидкостью — иначе при смене объёма они уезжают из флакона. */
    const room = FLOOR - 8 - surfaceY;
    const bubbleMarkup =
      bubbles && room > 10
        ? [
            [0.3, 0.62, 2.6],
            [0.56, 0.86, 1.7],
            [0.72, 0.44, 2.1],
            [0.44, 0.3, 1.3],
            [0.64, 0.16, 1.9],
          ]
            .map(([t, depth, r], i) => {
              const y = surfaceY + 6 + depth * room;
              if (y > FLOOR - 5) return "";
              const cx = x0 + w * t;
              return `<circle class="flacon__bubble flacon__bubble--${i % 2}" cx="${cx.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"
                      fill="${liquid.foam}" opacity="${(0.16 + 0.16 * (i % 2)).toFixed(2)}"/>`;
            })
            .join("")
        : "";

    const labelMarkup = showLabel
      ? `<g class="flacon__label">
           <rect x="${shape.label.x}" y="${shape.label.y}" width="${shape.label.w}" height="${shape.label.h}" rx="1.5"
                 fill="rgba(22,18,14,0.72)" stroke="rgba(233,207,164,0.42)" stroke-width="0.7"/>
           <rect x="${shape.label.x + 2.4}" y="${shape.label.y + 2.4}" width="${shape.label.w - 4.8}" height="${shape.label.h - 4.8}"
                 fill="none" stroke="rgba(233,207,164,0.18)" stroke-width="0.5"/>
           <text x="60" y="${shape.label.y + shape.label.h / 2 + 4}" text-anchor="middle"
                 font-family="Prata, serif" font-size="11" fill="#e9cfa4" letter-spacing="0.8">${escape(labelText)}</text>
         </g>`
      : "";

    return `
<svg viewBox="0 0 120 176" role="img" aria-label="${escape(item.name || "Флакон")}">
  <defs>
    <!-- Ореол подкрашен жидкостью: на полке свет идёт от самих ароматов. -->
    <radialGradient id="${id}-halo" cx="50%" cy="52%" r="50%">
      <stop offset="0" stop-color="${fade(liquid.a, 0.30)}"/>
      <stop offset="0.55" stop-color="${fade(liquid.b, 0.14)}"/>
      <stop offset="1" stop-color="${fade(liquid.b, 0)}"/>
    </radialGradient>

    <!-- Пол: контактная тень и мягкое пятно вокруг неё. -->
    <radialGradient id="${id}-ground" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="rgba(0,0,0,0.62)"/>
      <stop offset="0.45" stop-color="rgba(0,0,0,0.30)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>

    <!-- Пустое стекло почти прозрачно: на тёмном фоне светлый верх превращает
         флакон в молочный пластик, а не в стекло. -->
    <linearGradient id="${id}-empty" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(238,246,242,0.09)"/>
      <stop offset="0.45" stop-color="rgba(196,214,208,0.03)"/>
      <stop offset="1" stop-color="rgba(150,172,166,0.09)"/>
    </linearGradient>

    <!-- Жидкость плотнее к низу: так мутная тёмная база и не даёт «серого» флакона. -->
    <linearGradient id="${id}-liquid" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${tone(liquid.a, 0.16)}"/>
      <stop offset="0.28" stop-color="${liquid.a}"/>
      <stop offset="0.62" stop-color="${liquid.b}"/>
      <stop offset="1" stop-color="${tone(liquid.b, -0.35)}"/>
    </linearGradient>

    <radialGradient id="${id}-inner-glow" cx="34%" cy="78%" r="62%">
      <stop offset="0" stop-color="${fade(liquid.a, 0.34)}"/>
      <stop offset="0.6" stop-color="${fade(liquid.b, 0.10)}"/>
      <stop offset="1" stop-color="${fade(liquid.b, 0)}"/>
    </radialGradient>

    <!-- Толстое дно: здесь стекло собирает свет и кажется тяжёлым. -->
    <linearGradient id="${id}-foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0)"/>
      <stop offset="0.45" stop-color="rgba(255,255,255,0.20)"/>
      <stop offset="0.8" stop-color="rgba(255,255,255,0.07)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.30)"/>
    </linearGradient>

    <linearGradient id="${id}-foot-soft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0)"/>
      <stop offset="0.6" stop-color="rgba(255,255,255,0.07)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0.02)"/>
    </linearGradient>

    <linearGradient id="${id}-cyl" x1="0" y1="0" x2="1" y2="0">${cyl}</linearGradient>
    <linearGradient id="${id}-spec" x1="0" y1="0" x2="1" y2="0">${spec}</linearGradient>

    <linearGradient id="${id}-cap" x1="0" y1="0" x2="1" y2="0">${capGrad}</linearGradient>
    <linearGradient id="${id}-cap-top" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${tone(cap.edge, -0.3)}"/>
      <stop offset="0.32" stop-color="${tone(cap.edge, 0.5)}"/>
      <stop offset="1" stop-color="${tone(cap.fill, -0.2)}"/>
    </linearGradient>

    <clipPath id="${id}-body"><path d="${shape.body}"/></clipPath>
    <clipPath id="${id}-inner"><path d="${shape.interior}"/></clipPath>
  </defs>

  <ellipse cx="60" cy="106" rx="52" ry="66" fill="url(#${id}-halo)"/>
  <ellipse cx="60" cy="${FLOOR + 2}" rx="${(w * 0.44).toFixed(1)}" ry="7" fill="url(#${id}-ground)"/>
  <ellipse cx="60" cy="${FLOOR + 1}" rx="${(w * 0.3).toFixed(1)}" ry="3" fill="rgba(0,0,0,0.5)"/>

  <!-- Жидкость и стекло живут внутри силуэта -->
  <g clip-path="url(#${id}-inner)">
    <rect x="0" y="0" width="120" height="176" fill="url(#${id}-empty)"/>

    <g class="flacon__level" style="transform: scaleY(${level.toFixed(3)});">
      <rect x="0" y="0" width="120" height="176" fill="url(#${id}-liquid)"/>
      <rect x="0" y="0" width="120" height="176" fill="url(#${id}-inner-glow)"/>
      <!-- Мениск: не сплошная линия, а блик со стороны света плюс тень под ним.
           Ровная светлая полоса читалась бы как напечатанная черта. -->
      <linearGradient id="${id}-meniscus" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${fade(liquid.foam, 0)}"/>
        <stop offset="0.22" stop-color="${fade(liquid.foam, 0.42)}"/>
        <stop offset="0.62" stop-color="${fade(liquid.foam, 0.10)}"/>
        <stop offset="1" stop-color="${fade(liquid.foam, 0)}"/>
      </linearGradient>
      <ellipse cx="60" cy="0.6" rx="${(w * 0.44).toFixed(1)}" ry="4.6" fill="url(#${id}-meniscus)"/>
      <ellipse cx="60" cy="2.2" rx="${(w * 0.44).toFixed(1)}" ry="3.6" fill="${fade(liquid.b, 0.22)}"/>
      <ellipse cx="${specX + specW * 0.4}" cy="-0.2" rx="${(specW * 0.7).toFixed(1)}" ry="1.4" fill="rgba(255,255,255,0.45)"/>
    </g>

    ${bubbleMarkup}

    <rect x="0" y="150" width="120" height="26" fill="url(#${id}-foot)"/>
  </g>

  <!-- Цилиндр стекла поверх жидкости: именно он делает корпус объёмным -->
  <g clip-path="url(#${id}-body)">
    <rect x="${x0}" y="0" width="${w}" height="176" fill="url(#${id}-cyl)"/>
    <rect x="${specX}" y="0" width="${specW}" height="176" fill="url(#${id}-spec)"/>
    <rect x="${x1 - w * 0.05}" y="0" width="${w * 0.028}" height="176" fill="rgba(255,255,255,0.34)"/>
    <rect x="${x0 + w * 0.012}" y="0" width="${w * 0.02}" height="176" fill="rgba(255,255,255,0.18)"/>
    <!-- Свет у самого дна. Без градиента по краю здесь получается горизонтальный шов. -->
    <rect x="${x0}" y="140" width="${w}" height="26" fill="url(#${id}-foot-soft)"/>
  </g>

  <!-- Горло: тот же цилиндр, что и корпус, иначе флакон выглядит разрезанным -->
  <g>
    <rect x="${shape.neck.x}" y="${shape.neck.y}" width="${shape.neck.w}" height="${shape.neck.h}" fill="url(#${id}-empty)"/>
    <rect x="${shape.neck.x}" y="${shape.neck.y}" width="${shape.neck.w}" height="${shape.neck.h}" fill="url(#${id}-cyl)"/>
    <rect x="${shape.neck.x + shape.neck.w * 0.16}" y="${shape.neck.y}" width="${shape.neck.w * 0.22}" height="${shape.neck.h}"
          fill="rgba(255,255,255,0.34)"/>
    <!-- воротник под крышкой -->
    <rect x="${shape.neck.x - 2.5}" y="${shape.neck.y + shape.neck.h - 4}" width="${shape.neck.w + 5}" height="4" rx="1"
          fill="rgba(0,0,0,0.34)" stroke="rgba(255,255,255,0.18)" stroke-width="0.5"/>
  </g>

  <!-- Крышка: верхняя эллиптическая грань + металлические полосы -->
  <g class="flacon__cap">
    <ellipse cx="${capCx}" cy="${shape.cap.y}" rx="${shape.cap.w / 2}" ry="${capRy.toFixed(1)}" fill="url(#${id}-cap-top)"/>
    <ellipse cx="${capCx}" cy="${shape.cap.y}" rx="${shape.cap.w / 2}" ry="${capRy.toFixed(1)}" fill="none"
             stroke="rgba(0,0,0,0.4)" stroke-width="0.5"/>
    <rect x="${shape.cap.x}" y="${shape.cap.y}" width="${shape.cap.w}" height="${shape.cap.h}"
          rx="${shape.cap.r}" fill="url(#${id}-cap)"/>
    <rect x="${shape.cap.x + shape.cap.w * 0.16}" y="${shape.cap.y + 1}" width="${Math.max(1.6, shape.cap.w * 0.1)}"
          height="${shape.cap.h - 2}" rx="${shape.cap.r}" fill="rgba(255,255,255,0.22)"/>
    <rect x="${shape.cap.x}" y="${shape.cap.y + shape.cap.h - 1.5}" width="${shape.cap.w}" height="1.5"
          fill="rgba(0,0,0,0.35)"/>
  </g>

  <!-- Канты стекла: тёмный внешний и светлый внутренний -->
  <path d="${shape.body}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1.4"/>
  <path d="${shape.body}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.7" opacity="0.8"/>
  <path d="${shape.interior}" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="0.6"/>

  ${labelMarkup}
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