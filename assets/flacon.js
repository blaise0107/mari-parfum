/* Авторский стеклянный распылитель: корпус и отражения неподвижны,
   меняется только жидкость. Фотографии и чужие этикетки не используются.
   viewBox и прежние методы MPFlacon сохранены для полки и карточки товара. */
(function () {
  "use strict";

  const FLOOR = 154;
  const CHAMBER_HEIGHT = 90;
  const SHAPES = {
    cylinder: {
      body: "M43 55 H77 C90 55 99 73 99 88 V150 Q99 164 85 164 H35 Q21 164 21 150 V88 C21 73 30 55 43 55 Z",
      interior: "M44 60 H76 C87 60 94 75 94 89 V147 Q94 157 83 157 H37 Q26 157 26 147 V89 C26 75 33 60 44 60 Z",
      span: [21, 99],
      cap: { x: 37, y: 5, w: 46, h: 50 },
    },
    atelier: {
      body: "M43 55 H77 C87 55 96 68 96 85 V150 Q96 164 83 164 H37 Q24 164 24 150 V85 C24 68 33 55 43 55 Z",
      interior: "M44 60 H76 C85 60 91 71 91 87 V147 Q91 157 82 157 H38 Q29 157 29 147 V87 C29 71 35 60 44 60 Z",
      span: [24, 96],
      cap: { x: 38, y: 5, w: 44, h: 50 },
    },
  };

  const LIQUIDS = [
    { a: "#e0cd9d", b: "#c0a365" },
    { a: "#e4d8bc", b: "#bdaa83" },
    { a: "#dfc2ac", b: "#ba9281" },
  ];
  let uid = 0;

  function hash(value) {
    let h = 2166136261;
    for (const char of String(value || "")) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  function escape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function shapeFor(product) {
    return hash(product?.brand || product?.id) % 3 === 0 ? SHAPES.atelier : SHAPES.cylinder;
  }

  function fillFor(product, ml, volumes) {
    const list = (Array.isArray(volumes) ? volumes : [])
      .map(Number).filter(value => Number.isFinite(value) && value > 0);
    if (!list.length) list.push(10, 100);
    const min = Math.min(...list);
    const max = Math.max(...list);
    if (min === max) return 0.42;
    const parsed = Number(ml);
    const value = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
    return Math.min(0.92, 0.3 + ((value - min) / (max - min)) * 0.62);
  }

  function surfaceAt(level) {
    return FLOOR - CHAMBER_HEIGHT * level;
  }

  function setFill(svg, ml, volumes) {
    if (!svg) return;
    const level = fillFor(null, ml, volumes);
    const liquid = svg.querySelector(".flacon__level");
    const meniscus = svg.querySelector(".flacon__meniscus");
    if (liquid) liquid.style.transform = `scaleY(${level.toFixed(3)})`;
    if (meniscus) meniscus.style.transform = `translateY(${surfaceAt(level).toFixed(3)}px)`;
  }

  function labelLines(item) {
    let name = String(item.name || "Parfum");
    if (item.brand && name.toLowerCase().startsWith(String(item.brand).toLowerCase() + " ")) {
      name = name.slice(String(item.brand).length + 1);
    }
    const words = name.split(/\s+/);
    const lines = [""];
    for (const word of words) {
      const last = lines.length - 1;
      if (lines[last] && (lines[last] + " " + word).length > 19 && lines.length < 2) {
        lines.push(word);
      } else {
        lines[last] += (lines[last] ? " " : "") + word;
      }
    }
    return lines.slice(0, 2).map(line => line.length > 23 ? line.slice(0, 22) + "…" : line);
  }

  function flacon(product, options) {
    const item = product || {};
    const opts = options || {};
    const shape = shapeFor(item);
    const id = `mpglass${++uid}`;
    const liquid = LIQUIDS[hash(item.notes?.base || item.name) % LIQUIDS.length];
    const level = opts.ml == null ? 0.4 : fillFor(item, opts.ml, opts.volumes);
    const cap = shape.cap;
    const [left, right] = shape.span;
    const width = right - left;
    const label = opts.label !== false;
    const nameLines = labelLines(item);
    // Собственная этикетка выглядит нанесённой на стекло, а не заслоняет
    // его огромной плашкой. На миниатюре остаётся только знак мастерской.
    const labelMarkup = label ? `
      <g class="flacon__label">
        <rect x="31" y="100" width="58" height="36" rx="0.8" fill="url(#${id}-paper)"/>
        <path d="M33 102 H87 V134 H33 Z" fill="none" stroke="#8c816c" stroke-opacity=".36" stroke-width=".35"/>
        <text x="60" y="109" text-anchor="middle" font-family="Onest, sans-serif" font-size="4.6" letter-spacing="1.05" fill="#37332b">MARI PARFUM</text>
        ${nameLines.map((line, i) => `<text class="flacon__label-name" x="60" y="${119 + i * 5.5}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="5.8" fill="#302d27">${escape(line)}</text>`).join("")}
        <path d="M54 129 H66" stroke="#9d8a61" stroke-width=".5"/>
        <text x="60" y="132.5" text-anchor="middle" font-family="Onest, sans-serif" font-size="2.5" letter-spacing=".5" fill="#6f6655">ATELIER</text>
      </g>` : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 176" class="flacon__svg" role="img" aria-label="${escape(item.name || "Стеклянный флакон")}">
  <defs>
    <clipPath id="${id}-body"><path d="${shape.body}"/></clipPath>
    <clipPath id="${id}-inside"><path d="${shape.interior}"/></clipPath>
    <linearGradient id="${id}-glass" x1="${left}" y1="0" x2="${right}" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e9f2f7" stop-opacity=".27"/>
      <stop offset=".035" stop-color="#101113" stop-opacity=".6"/>
      <stop offset=".13" stop-color="#eaf4ff" stop-opacity=".23"/>
      <stop offset=".28" stop-color="#d9e3e9" stop-opacity=".08"/>
      <stop offset=".55" stop-color="#dbe1e5" stop-opacity=".015"/>
      <stop offset=".8" stop-color="#121418" stop-opacity=".23"/>
      <stop offset=".93" stop-color="#edf7ff" stop-opacity=".3"/>
      <stop offset="1" stop-color="#abb7c3" stop-opacity=".6"/>
    </linearGradient>
    <linearGradient id="${id}-liquid" x1="26" y1="64" x2="26" y2="154" gradientUnits="userSpaceOnUse">
      <stop stop-color="${liquid.a}" stop-opacity=".15"/>
      <stop offset=".35" stop-color="${liquid.a}" stop-opacity=".24"/>
      <stop offset=".8" stop-color="${liquid.b}" stop-opacity=".4"/>
      <stop offset="1" stop-color="${liquid.b}" stop-opacity=".56"/>
    </linearGradient>
    <linearGradient id="${id}-softbox" x1="29" y1="0" x2="53" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".25" stop-color="#f8fbff" stop-opacity=".34"/>
      <stop offset=".55" stop-color="#ffffff" stop-opacity=".8"/>
      <stop offset=".78" stop-color="#e8edf3" stop-opacity=".26"/>
      <stop offset="1" stop-color="#e8edf3" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}-edge" x1="0" y1="73" x2="0" y2="161" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f1f7ff" stop-opacity=".64"/>
      <stop offset=".3" stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset=".76" stop-color="#c5d5e0" stop-opacity=".3"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".7"/>
    </linearGradient>
    <linearGradient id="${id}-cap" x1="${cap.x}" y1="0" x2="${cap.x + cap.w}" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#060708"/>
      <stop offset=".035" stop-color="#9c9eaa"/>
      <stop offset=".085" stop-color="#16191e"/>
      <stop offset=".2" stop-color="#565a65"/>
      <stop offset=".31" stop-color="#34373f"/>
      <stop offset=".48" stop-color="#090b0e"/>
      <stop offset=".77" stop-color="#040507"/>
      <stop offset=".93" stop-color="#1a1d25"/>
      <stop offset=".975" stop-color="#626774"/>
      <stop offset="1" stop-color="#050608"/>
    </linearGradient>
    <linearGradient id="${id}-cap-top" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#555b65"/>
      <stop offset=".4" stop-color="#14171c"/>
      <stop offset="1" stop-color="#040506"/>
    </linearGradient>
    <linearGradient id="${id}-paper" x1="31" y1="100" x2="89" y2="100" gradientUnits="userSpaceOnUse">
      <stop stop-color="#c7c4bd"/>
      <stop offset=".25" stop-color="#eeeae1"/>
      <stop offset=".7" stop-color="#e7e1d6"/>
      <stop offset="1" stop-color="#b7b2a9"/>
    </linearGradient>
    <linearGradient id="${id}-base" x1="0" y1="151" x2="0" y2="165" gradientUnits="userSpaceOnUse">
      <stop stop-color="#d8e4ef" stop-opacity=".13"/>
      <stop offset=".32" stop-color="#ffffff" stop-opacity=".46"/>
      <stop offset=".5" stop-color="#8e9ba6" stop-opacity=".06"/>
      <stop offset=".78" stop-color="#0a0c10" stop-opacity=".8"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".52"/>
    </linearGradient>
    <radialGradient id="${id}-shadow">
      <stop stop-color="#000000" stop-opacity=".85"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}-soft" x="-35%" y="-20%" width="170%" height="140%"><feGaussianBlur stdDeviation=".75"/></filter>
  </defs>

  <ellipse cx="60" cy="165.5" rx="45" ry="7" fill="url(#${id}-shadow)"/>
  <ellipse cx="60" cy="165" rx="${width * .39}" ry="2.2" fill="#030405" fill-opacity=".7"/>
  <path d="${shape.body}" fill="url(#${id}-glass)"/>

  <g clip-path="url(#${id}-inside)">
    <g class="flacon__level" style="transform:scaleY(${level.toFixed(3)});">
      <rect x="24" y="64" width="72" height="90" fill="url(#${id}-liquid)"/>
    </g>
    <g class="flacon__tube">
      <path d="M60 52 V135 Q60 141 56 146 L48 155" fill="none" stroke="#080b0e" stroke-opacity=".46" stroke-width="2.4"/>
      <path d="M60.7 52 V135 Q60.7 141 56.7 146 L48.7 155" fill="none" stroke="#e9f4fa" stroke-opacity=".42" stroke-width="1.05"/>
      <path d="M59.4 53 V134" fill="none" stroke="#f5faff" stroke-opacity=".15" stroke-width=".35"/>
    </g>
    <g class="flacon__meniscus" style="transform:translateY(${surfaceAt(level).toFixed(3)}px);">
      <ellipse cx="60" cy=".8" rx="34" ry="3.6" fill="${liquid.a}" fill-opacity=".12"/>
      <path d="M26 0 Q60 6 94 0" fill="none" stroke="#05080b" stroke-opacity=".42" stroke-width="1.3"/>
      <path d="M26 -.6 Q60 5.4 94 -.6" fill="none" stroke="#f5f4de" stroke-opacity=".62" stroke-width=".65"/>
      <path d="M28 0 Q60 -4.3 92 0" fill="none" stroke="#d9e1d6" stroke-opacity=".18" stroke-width=".55"/>
    </g>
  </g>

  <g class="flacon__glass" clip-path="url(#${id}-body)">
    <path d="M30 82 C34 66 40 60 48 58 C41 72 42 101 40 125 L38 151 L29 153 C25 125 26 99 30 82 Z" fill="url(#${id}-softbox)" filter="url(#${id}-soft)"/>
    <path d="M31 89 C33 72 39 65 43 63 C36 84 35 124 34 151" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="1.25"/>
    <path d="M73 60 C84 63 92 76 92 90 V150" fill="none" stroke="url(#${id}-edge)" stroke-width="3.2"/>
    <path d="M77 58 C91 63 97 79 96.5 93 V148" fill="none" stroke="#f3f7fa" stroke-opacity=".24" stroke-width=".7"/>
    <path d="M36 66 Q60 49 86 68" fill="none" stroke="#dce9f4" stroke-opacity=".28" stroke-width=".9"/>
    <path d="M26 90 V148 Q26 159 38 160 H83" fill="none" stroke="#eef6fc" stroke-opacity=".16" stroke-width=".8"/>
    <rect x="20" y="150" width="80" height="15" fill="url(#${id}-base)"/>
    <ellipse cx="60" cy="155" rx="34" ry="4.1" fill="none" stroke="#dce7ee" stroke-opacity=".52" stroke-width=".7"/>
    <path d="M28 158 Q60 167 93 157" fill="none" stroke="#ffffff" stroke-opacity=".56" stroke-width=".8"/>
    <path d="M29 160 Q60 167 91 160" fill="none" stroke="#cad9e4" stroke-opacity=".22" stroke-width="1.2"/>
  </g>
  <path d="${shape.body}" fill="none" stroke="#f0f6fc" stroke-opacity=".26" stroke-width=".6"/>
  <path d="${shape.interior}" fill="none" stroke="#04070b" stroke-opacity=".44" stroke-width=".7"/>

  ${labelMarkup}

  <g class="flacon__neck">
    <path d="M52 43 H68 V59 Q60 61 52 59 Z" fill="#85919c" fill-opacity=".2"/>
    <path d="M54 43 H57 V59 H54 Z" fill="#f5f8fa" fill-opacity=".42"/>
    <path d="M63 44 H65 V59 H63 Z" fill="#ffffff" fill-opacity=".25"/>
    <ellipse cx="60" cy="54" rx="17" ry="2" fill="#767d87" fill-opacity=".45" stroke="#e3e8ed" stroke-opacity=".3" stroke-width=".6"/>
  </g>
  <g class="flacon__cap">
    <rect x="${cap.x}" y="${cap.y}" width="${cap.w}" height="${cap.h}" rx="1.2" fill="url(#${id}-cap)"/>
    <ellipse cx="60" cy="${cap.y}" rx="${cap.w / 2}" ry="3.1" fill="url(#${id}-cap-top)" stroke="#9fa7b3" stroke-opacity=".25" stroke-width=".5"/>
    <path d="M${cap.x + .8} ${cap.y + 2} V${cap.y + cap.h - 1}" stroke="#f4f7ff" stroke-opacity=".36" stroke-width=".65"/>
    <path d="M${cap.x + 7} ${cap.y + 3} V${cap.y + cap.h - 2}" stroke="#e8edfa" stroke-opacity=".075" stroke-width="4"/>
    <path d="M${cap.x} ${cap.y + cap.h - .6} Q60 ${cap.y + cap.h + 2} ${cap.x + cap.w} ${cap.y + cap.h - .6}" fill="none" stroke="#0b0c0f" stroke-width="1.2"/>
  </g>
</svg>`;
  }

  function shelfFlacon(product, options) {
    return flacon(product, { label: true, bubbles: false, ...(options || {}) });
  }

  window.MPFlacon = {
    render: flacon,
    shelf: shelfFlacon,
    fillFor,
    setFill,
    shapeFor,
    hues: { caps: [{ fill: "#111316", edge: "#626774" }], liquids: LIQUIDS },
  };
})();
