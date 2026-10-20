/* =========================================================================
   Главная страница: полка, фильтры, реестр цен, доставка и оплата.
   ========================================================================= */

(function () {
  "use strict";

  const MP = window.MP;
  if (!MP) return;

  const state = { q: "", segment: "", gender: "", season: "" };

  const GENDER_LABEL = { female: "Женский", male: "Мужской", unisex: "Унисекс" };
  const SEASON_LABEL = { all: "Всесезонный", summer: "Летний", spring: "Весенний", winter: "Зимний" };

  /* ---------- полка ---------- */

  function renderShelf() {
    const track = document.getElementById("shelf");
    if (!track) return;

    // На полке — по одному флакону на бренд: девятнадцать почти одинаковых
    // бутылок подряд не читаются, а бренды — читаются.
    //
    // Каждый флакон лежит в своём role="listitem": роль list требует, чтобы
    // детьми списка были именно элементы списка, а не ссылки. Поэтому ссылка
    // вложена в обёртку — иначе скринридер объявил бы «полка», а позицию
    // («3 из 11») не сообщил бы.
    const seen = new Set();
    const picks = [];
    for (const product of MP.products) {
      if (seen.has(product.brand)) continue;
      seen.add(product.brand);
      picks.push(product);
    }

    track.innerHTML = picks
      .slice(0, 14)
      .map(
        (product) => `
      <div class="shelf__slot" role="listitem">
        <a class="shelf__item" href="${MP.escapeHtml(MP.productHref(product))}">
          <span class="flacon">${window.MPFlacon.shelf(product)}</span>
          <span class="shelf__caption"><b>${MP.escapeHtml(product.name)}</b><span>${MP.escapeHtml(product.brand)}</span></span>
        </a>
      </div>`
      )
      .join("");
  }

  /* ---------- фильтры ---------- */

  function renderSegmentChips() {
    const group = document.querySelector('[role="group"][aria-label="Сегмент"]');
    if (!group) return;
    MP.data.segments.forEach((segment) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.dataset.filter = "segment";
      chip.dataset.value = segment.key;
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = `${segment.emoji} ${segment.name}`.trim();
      group.appendChild(chip);
    });

    group.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (!chip) return;
      state.segment = chip.dataset.value || "";
      Array.prototype.forEach.call(group.querySelectorAll(".chip"), (el) => {
        el.setAttribute("aria-pressed", el === chip ? "true" : "false");
      });
      renderLedger();
    });
  }

  function matches(product) {
    if (state.segment && product.segment !== state.segment) return false;
    if (state.gender && product.gender !== state.gender) return false;
    if (state.season && product.season !== state.season) return false;
    if (state.q) {
      const haystack = `${product.name} ${product.brand} ${product.description} ${product.notes.top} ${product.notes.heart} ${product.notes.base}`.toLowerCase();
      // Все слова запроса должны найтись: «dior miss» не должен выдавать все Dior.
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  }

  /* ---------- реестр ---------- */

  function entryMarkup(product) {
    const volumes = MP.volumesFor(product);
    const min = volumes[0];
    const price = MP.priceForVolume(product, min);
    const perMl = MP.pricePerMl(product, min);
    const notes = [
      product.notes.top ? `верхние ноты — ${product.notes.top}` : "",
      product.notes.heart ? `сердце — ${product.notes.heart}` : "",
      product.notes.base ? `база — ${product.notes.base}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const tags = [];
    if (GENDER_LABEL[product.gender]) tags.push(GENDER_LABEL[product.gender]);
    if (SEASON_LABEL[product.season]) tags.push(SEASON_LABEL[product.season]);

    return `
    <a class="entry reveal" href="${MP.escapeHtml(MP.productHref(product))}">
      <span class="entry__thumb"><span class="flacon">${window.MPFlacon.render(product, {
        ml: min,
        volumes: volumes,
        label: false,
      })}</span></span>
      <span>
        <span class="entry__name">${MP.escapeHtml(product.name)}</span>
        <span class="entry__brand">${MP.escapeHtml(product.brand)} · ${MP.escapeHtml(MP.segmentName(product.segment))}</span>
        <span class="entry__notes"><span>${MP.escapeHtml(notes)}</span></span>
      </span>
      <span class="entry__aside">
        <span class="entry__price">${MP.escapeHtml(MP.money(price))}</span>
        <span class="entry__unit">за ${min} мл · ${MP.escapeHtml(MP.money(perMl))}/мл</span>
        ${tags.length ? `<span class="entry__tags">${tags.map((t) => `<span class="tag">${MP.escapeHtml(t)}</span>`).join("")}</span>` : ""}
      </span>
    </a>`;
  }

  function renderLedger() {
    const root = document.getElementById("catalog");
    const counter = document.getElementById("count");
    if (!root) return;

    const found = MP.products.filter(matches);

    if (counter) {
      counter.textContent = found.length
        ? `${found.length} ${MP.plural(found.length, "аромат", "аромата", "ароматов")}`
        : "Ничего не найдено";
    }

    if (!found.length) {
      root.innerHTML = `
      <div class="blank">
        <h2>Ничего не нашлось</h2>
        <p>Попробуйте другой запрос или сбросьте фильтры — в каталоге ${MP.products.length} ароматов.</p>
        <p class="blank__action"><button class="btn" type="button" id="reset-filters">Сбросить фильтры</button></p>
      </div>`;
      const reset = document.getElementById("reset-filters");
      if (reset) reset.addEventListener("click", resetFilters);
      return;
    }

    // Группируем по сегментам: покупатель думает «хочу люкс», а не «хочу l001».
    const groups = [];
    MP.data.segments.forEach((segment) => {
      const items = found.filter((product) => product.segment === segment.key);
      if (items.length) groups.push({ segment: segment, items: items });
    });

    root.innerHTML = groups
      .map(
        (group, index) => `
      <section class="ledger__segment reveal" style="--reveal-delay: ${index * 70}ms">
        <div class="ledger__heading">
          <h2>${MP.escapeHtml(group.segment.name)}</h2>
          <span class="ledger__range">${MP.escapeHtml(group.segment.range || "")}</span>
        </div>
        <div class="ledger__list">${group.items.map(entryMarkup).join("")}</div>
      </section>`
      )
      .join("");

    MP.reveal();
  }

  function resetFilters() {
    state.q = "";
    state.segment = "";
    state.gender = "";
    state.season = "";
    document.getElementById("q").value = "";
    document.getElementById("gender").value = "";
    document.getElementById("season").value = "";
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-filter="segment"]'), (chip) => {
      chip.setAttribute("aria-pressed", chip.dataset.value === "" ? "true" : "false");
    });
    renderLedger();
  }

  /* ---------- доставка и оплата ---------- */

  function methodMarkup(method, kind) {
    const tags = (method.tags || [])
      .map((tag) => `<span class="tag">${MP.escapeHtml(tag)}</span>`)
      .join("");
    const desc = method.desc ? `<span class="services__desc">${MP.escapeHtml(method.desc)}</span>` : "";
    // Подпись о цене доставки — одна на весь сайт (MP.deliveryPriceLabel),
    // иначе витрина и корзина со временем начнут считать по-разному.
    const cost =
      kind === "delivery"
        ? `<span class="services__cost">${MP.escapeHtml(MP.deliveryPriceLabel(method))}</span>`
        : "";
    return `
      <li class="services__item${MP.isLive(method) ? "" : " services__item--planned"}">
        <span class="services__top">
          <span class="services__name">${MP.escapeHtml(method.name)}</span>
          ${MP.serviceBadge(method)}
          ${cost}
        </span>
        ${desc}
        ${tags ? `<span class="entry__tags">${tags}</span>` : ""}
      </li>`;
  }

  function renderServices() {
    const delivery = document.getElementById("delivery-list");
    const payment = document.getElementById("payment-list");
    if (delivery) delivery.innerHTML = (MP.data.delivery || []).map((m) => methodMarkup(m, "delivery")).join("");
    if (payment) payment.innerHTML = (MP.data.payment || []).map((m) => methodMarkup(m, "payment")).join("");

    const city = MP.data.city || {};
    const cityLine = document.getElementById("city-line");
    if (cityLine) cityLine.textContent = [city.name, city.region].filter(Boolean).join(", ");
    const note = document.getElementById("city-note");
    if (note && city.note) note.textContent = city.note;
  }

  function renderContacts() {
    const list = document.getElementById("contact-list");
    if (!list) return;
    const phone = MP.data.phone;
    const manager = MP.data.manager;
    const links = [];
    if (phone) {
      const digits = String(phone).replace(/[^\d+]/g, "");
      links.push(`<li><a href="tel:${digits}">${MP.escapeHtml(phone)}</a></li>`);
    }
    if (manager) {
      links.push(
        `<li><a href="https://t.me/${encodeURIComponent(manager)}" target="_blank" rel="noopener">@${MP.escapeHtml(manager)}</a></li>`
      );
    }
    links.push("<li>Ежедневно, 10:00–21:00</li>");
    list.innerHTML = links.join("");
  }

  /* ---------- запуск ---------- */

  function boot() {
    renderShelf();
    renderSegmentChips();
    renderLedger();
    renderContacts();
    renderServices();

    MP.renderOptions("delivery-options", MP.data.delivery, "delivery");
    MP.renderOptions("payment-options", MP.data.payment, "payment");

    const search = document.getElementById("q");
    if (search) {
      let timer = 0;
      search.addEventListener("input", () => {
        // Ждём паузу в наборе: перерисовка реестра на каждый символ
        // дёргает layout и мешает печатать.
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          state.q = search.value.trim();
          renderLedger();
        }, 140);
      });
    }

    ["gender", "season"].forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;
      select.addEventListener("change", () => {
        state[id] = select.value;
        renderLedger();
      });
    });

    // Блик, пробежавший по странице, снимаем: он нужен один раз.
    const sheen = document.querySelector(".page-sheen");
    if (sheen) window.setTimeout(() => sheen.remove(), 2200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();