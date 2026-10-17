/* =========================================================================
   Главная страница: полка, фильтры, реестр цен, списки доставки и оплаты.
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
    const seen = new Set();
    const picks = [];
    for (const product of MP.products) {
      if (seen.has(product.brand)) continue;
      seen.add(product.brand);
      picks.push(product);
    }
    const featured = picks.slice(0, 14);

    track.innerHTML = featured
      .map(
        (product) => `
      <a class="shelf__item" href="${MP.escapeHtml(MP.productHref(product))}">
        <span class="flacon">${window.MPFlacon.shelf(product)}</span>
        <span class="shelf__caption"><b>${MP.escapeHtml(product.name)}</b><span>${MP.escapeHtml(product.brand)}</span></span>
      </a>`
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
    <a class="entry" href="${MP.escapeHtml(MP.productHref(product))}">
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
        <p style="margin-top:1.25rem"><button class="btn" type="button" id="reset-filters">Сбросить фильтры</button></p>
      </div>`;
      const reset = document.getElementById("reset-filters");
      if (reset) {
        reset.addEventListener("click", () => {
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
        });
      }
      return;
    }

    // Группируем по сегментам: покупатель думает «хочу люкс», а не «хочу l001».
    const groups = [];
    MP.data.segments.forEach((segment) => {
      const items = found.filter((product) => product.segment === segment.key);
      if (items.length) groups.push({ segment: segment, items: items });
    });
    // Найденные по запросу товары вне сегментов (их быть не должно, но вдруг).
    const loose = found.filter((product) => !MP.data.segments.some((s) => s.key === product.segment));
    if (loose.length) groups.push({ segment: { key: "", name: "Прочее", range: "" }, items: loose });

    root.innerHTML = groups
      .map(
        (group) => `
      <section class="ledger__segment">
        <div class="ledger__heading">
          <h2>${MP.escapeHtml(group.segment.name)}</h2>
          <span class="ledger__range">${MP.escapeHtml(group.segment.range || "")}</span>
        </div>
        <div class="ledger__list">${group.items.map(entryMarkup).join("")}</div>
      </section>`
      )
      .join("");
  }

  /* ---------- списки в подвале и форме ---------- */

  function renderMethodList(targetId, methods) {
    const list = document.getElementById(targetId);
    if (!list) return;
    list.innerHTML = methods
      .map((method) => {
        const cost = method.price ? `${MP.formatPrice(method.price)} ₽` : "бесплатно";
        const desc = method.desc ? ` — ${method.desc}` : "";
        return `<li>${MP.escapeHtml(method.emoji ? method.emoji + " " : "")}${MP.escapeHtml(method.name)}${MP.escapeHtml(desc)} · ${cost}</li>`;
      })
      .join("");
  }

  function renderOptions(targetId, methods, name, checkedKey) {
    const box = document.getElementById(targetId);
    if (!box) return;
    box.innerHTML = methods
      .map(
        (method, index) => `
      <label class="option">
        <input type="radio" name="${name}" value="${MP.escapeHtml(method.key)}"${index === 0 || method.key === checkedKey ? " checked" : ""}>
        <span class="option__text">
          <span class="option__name">${MP.escapeHtml(method.name)}</span>
          ${method.desc ? `<span class="option__meta">${MP.escapeHtml(method.desc)}</span>` : ""}
        </span>
        <span class="option__price">${method.price ? MP.escapeHtml(MP.money(method.price)) : "бесплатно"}</span>
      </label>`
      )
      .join("");
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
    links.push(`<li>Ежедневно, 10:00–21:00</li>`);
    list.innerHTML = links.join("");
  }

  /* ---------- запуск ---------- */

  function boot() {
    renderShelf();
    renderSegmentChips();
    renderLedger();
    renderContacts();

    renderMethodList("delivery-list", MP.data.delivery || []);
    renderMethodList("payment-list", MP.data.payment || []);
    renderOptions("delivery-options", MP.data.delivery || [], "delivery");
    renderOptions("payment-options", MP.data.payment || [], "payment");

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
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();