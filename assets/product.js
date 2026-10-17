/* =========================================================================
   Страница товара.

   Главный элемент здесь — селектор объёма: флакон наполняется тем выше, чем
   больше миллилитров, а цена пересчитывается на глазах. Покупатель видит
   не «кнопку 20 мл», а «на сколько полнее стал флакон и на сколько дороже».
   ========================================================================= */

(function () {
  "use strict";

  const MP = window.MP;
  if (!MP) return;

  let product = null;
  let volumes = [];
  let selectedMl = 0;
  let qty = 1;

  const params = new URLSearchParams(window.location.search);
  const key = params.get("id") || params.get("slug") || "";

  function crumbs() {
    const nav = document.getElementById("crumbs");
    if (!nav) return;
    nav.innerHTML = `
      <a href="/">MARI PARFUM</a><span aria-hidden="true">/</span>
      <a href="/#catalog">${MP.escapeHtml(MP.segmentName(product.segment))}</a><span aria-hidden="true">/</span>
      <span>${MP.escapeHtml(product.name)}</span>`;
  }

  function pyramid() {
    const rows = [
      ["Верхние ноты", product.notes.top],
      ["Сердце", product.notes.heart],
      ["База", product.notes.base],
    ].filter((row) => row[1]);

    if (!rows.length) return "";
    return `
    <div class="pyramid">
      ${rows
        .map(
          ([key, value]) => `
      <div class="pyramid__row">
        <span class="pyramid__key">${MP.escapeHtml(key)}</span>
        <span class="pyramid__val">${MP.escapeHtml(value)}</span>
      </div>`
        )
        .join("")}
    </div>`;
  }

  function related() {
    const others = MP.products
      .filter((p) => p.id !== product.id)
      // Сначала тот же сегмент, потом тот же аромат «для него» — так полезнее,
      // чем просто «ещё что-то из каталога».
      .sort((a, b) => score(b) - score(a))
      .slice(0, 4);

    const section = document.getElementById("related");
    const list = document.getElementById("related-list");
    if (!section || !list || !others.length) return;

    function score(p) {
      let value = 0;
      if (p.segment === product.segment) value += 2;
      if (p.gender === product.gender) value += 1;
      if (p.season === product.season) value += 1;
      return value;
    }

    list.innerHTML = others
      .map(
        (p) => `
      <a class="entry" href="${MP.escapeHtml(MP.productHref(p))}">
        <span class="entry__thumb"><span class="flacon">${window.MPFlacon.render(p, {
          ml: MP.minVolume(p),
          volumes: MP.volumesFor(p),
          label: false,
        })}</span></span>
        <span>
          <span class="entry__name">${MP.escapeHtml(p.name)}</span>
          <span class="entry__brand">${MP.escapeHtml(p.brand)} · ${MP.escapeHtml(MP.segmentName(p.segment))}</span>
        </span>
        <span class="entry__aside">
          <span class="entry__price">${MP.escapeHtml(MP.money(MP.priceForVolume(p, MP.minVolume(p))))}</span>
          <span class="entry__unit">за ${MP.minVolume(p)} мл</span>
        </span>
      </a>`
      )
      .join("");

    section.hidden = false;
  }

  function paintVolume() {
    const price = MP.priceForVolume(product, selectedMl);
    const perMl = MP.pricePerMl(product, selectedMl);

    document.getElementById("price").textContent = MP.money(price);
    document.getElementById("per-ml").textContent = `${MP.money(perMl)} за 1 мл · всего ${selectedMl} мл`;
    document.getElementById("plinth-ml").textContent = `${selectedMl} мл`;
    document.getElementById("buy-label").textContent = `Добавить в корзину · ${MP.money(price * qty)}`;

    const factKey = document.querySelector(".facts dt:nth-of-type(4)");
    const factValue = document.getElementById("fact-per-ml");
    if (factKey && factValue) {
      factKey.textContent = `За ${selectedMl} мл`;
      factValue.textContent = `${MP.money(perMl)} за 1 мл`;
    }

    // Флакон наполняется на глазах — это и есть главный жест страницы.
    const stage = document.querySelector(".product__flacon .flacon__level");
    if (stage) {
      const level = window.MPFlacon.fillFor(product, selectedMl, volumes);
      stage.style.transform = `scaleY(${level.toFixed(3)})`;
    }

    document.querySelectorAll("[data-ml-option]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.mlOption) === selectedMl));
    });

    const output = document.getElementById("qty-output");
    if (output) output.textContent = String(qty);
  }

  function render() {
    const stage = document.getElementById("product");
    if (!stage) return;

    document.title = `${product.name} — ${product.brand} | MARI PARFUM`;

    stage.innerHTML = `
    <div class="product__stage">
      <div class="product__plinth">
        <div class="product__flacon">
          <span class="flacon">${window.MPFlacon.render(product, { ml: selectedMl, volumes: volumes, label: true })}</span>
        </div>
        <p class="product__ml" id="plinth-ml">${selectedMl} мл</p>
      </div>

      <dl class="facts">
        <dt>Сегмент</dt><dd>${MP.escapeHtml(MP.segmentName(product.segment))}</dd>
        <dt>Базовая цена</dt><dd>${MP.escapeHtml(MP.money(product.basePrice))} за ${product.baseMl} мл</dd>
        <dt>Объёмы</dt><dd>${volumes.map((v) => `${v} мл`).join(" · ")}</dd>
        <dt>За ${selectedMl} мл</dt><dd id="fact-per-ml">${MP.escapeHtml(MP.money(MP.pricePerMl(product, selectedMl)))} за 1 мл</dd>
      </dl>
    </div>

    <div id="dossier">
      <p class="product__brand">${MP.escapeHtml(product.brand)}</p>
      <h1 class="product__name">${MP.escapeHtml(product.name)}</h1>
      <p class="product__desc">${MP.escapeHtml(product.description)}</p>

      <p class="product__price" id="price"></p>
      <p class="product__per-ml" id="per-ml"></p>

      ${pyramid()}

      <div class="volumes">
        <p class="volumes__legend" id="volumes-legend">Объём</p>
        <div class="volumes__list" role="group" aria-labelledby="volumes-legend">
          ${volumes
            .map(
              (ml) => `<button type="button" data-ml-option="${ml}" aria-pressed="false">${ml} мл</button>`
            )
            .join("")}
        </div>
      </div>

      <div class="buy-row">
        <div class="stepper">
          <button type="button" data-qty="dec" aria-label="Уменьшить количество">−</button>
          <output id="qty-output" aria-label="Количество флаконов">1</output>
          <button type="button" data-qty="inc" aria-label="Увеличить количество">+</button>
        </div>
        <button class="btn btn--plum" type="button" data-add id="buy-label"></button>
      </div>

      <div class="product__meta">
        <span>Цена считается от базовых 10 мл: ${MP.escapeHtml(MP.money(product.basePrice))} за ${product.baseMl} мл.</span>
        <span>Наличие и срок подтверждает менеджер по телефону.</span>
        <span>Оригинальная парфюмерия, разлив в фабричный флакон.</span>
      </div>
    </div>`;

    const group = document.querySelector(".volumes__list");
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ml-option]");
      if (!button) return;
      selectedMl = Number(button.dataset.mlOption);
      paintVolume();
    });

    document.querySelector("[data-qty='dec']").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      paintVolume();
    });
    document.querySelector("[data-qty='inc']").addEventListener("click", () => {
      qty = Math.min(99, qty + 1);
      paintVolume();
    });

    document.querySelector("[data-add]").addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent("mp:add-to-cart", {
          detail: { id: product.id, ml: selectedMl, qty: qty, name: product.name },
        })
      );
    });

    paintVolume();
    crumbs();
    related();

    renderContactLists();
  }

  /* Доставка и оплата нужны и здесь: форма оформления общая для страниц. */
  function renderContactLists() {
    const delivery = MP.data.delivery || [];
    const payment = MP.data.payment || [];

    const dBox = document.getElementById("delivery-options");
    if (dBox && !dBox.children.length) {
      dBox.innerHTML = delivery
        .map(
          (method, i) => `
      <label class="option">
        <input type="radio" name="delivery" value="${MP.escapeHtml(method.key)}"${i === 0 ? " checked" : ""}>
        <span class="option__text">
          <span class="option__name">${MP.escapeHtml(method.name)}</span>
          ${method.desc ? `<span class="option__meta">${MP.escapeHtml(method.desc)}</span>` : ""}
        </span>
        <span class="option__price">${method.price ? MP.escapeHtml(MP.money(method.price)) : "бесплатно"}</span>
      </label>`
        )
        .join("");
    }

    const pBox = document.getElementById("payment-options");
    if (pBox && !pBox.children.length) {
      pBox.innerHTML = payment
        .map(
          (method, i) => `
      <label class="option">
        <input type="radio" name="payment" value="${MP.escapeHtml(method.key)}"${i === 0 ? " checked" : ""}>
        <span class="option__text">
          <span class="option__name">${MP.escapeHtml(method.name)}</span>
          ${method.desc ? `<span class="option__meta">${MP.escapeHtml(method.desc)}</span>` : ""}
        </span>
      </label>`
        )
        .join("");
    }
  }

  function notFound() {
    const stage = document.getElementById("product");
    if (!stage) return;
    stage.style.gridTemplateColumns = "minmax(0,1fr)";
    stage.innerHTML = `
    <div class="notfound">
      <h1>Такого аромата нет</h1>
      <p>Возможно, он ушёл из каталога или в адресе опечатка.</p>
      <a class="btn btn--solid" href="/#catalog">Открыть каталог</a>
    </div>`;
    document.title = "Аромат не найден — MARI PARFUM";
  }

  function boot() {
    product = MP.findProduct(key);
    if (!product) {
      notFound();
      renderContactLists();
      return;
    }
    volumes = MP.volumesFor(product);
    selectedMl = volumes[0];
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();