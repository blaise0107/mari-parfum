/* =========================================================================
   Ядро витрины: цены, корзина, корзина-диалог, оформление, отправка заказа.

   Всё, что считает деньги, повторяет арифметику бота (bot.py):
   цена объёма = price × ml ÷ base_ml целочисленно, скидка — процент только
   от товаров, доставка прибавляется после вычета. Если разойтись с ботом,
   клиент увидит одну сумму, а менеджер выставит другую.
   ========================================================================= */

(function () {
  "use strict";

  const DATA = window.MP_DATA || { products: [], volumes: [], segments: [], delivery: [], payment: [], promo: {} };

  /* Адрес, на который сайт отправляет заказ. Пусто — заказ уходит
     открытым текстом в чат менеджера (это рабочий вариант по умолчанию,
     он не требует ни сервера, ни токена в браузере). */
  const ORDER_ENDPOINT = "";

  const CART_KEY = "mari-parfum.cart.v1";
  const LAST_ORDER_KEY = "mari-parfum.last-order.v1";

  /* ---------- мелкие утилиты ---------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function formatPrice(value) {
    const n = Math.trunc(Number(value) || 0);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function money(value) {
    return `${formatPrice(value)} ₽`;
  }

  function plural(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const tail = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (tail > 1 && tail < 5) return few;
    if (tail === 1) return one;
    return many;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- каталог и цены ---------- */

  const products = DATA.products || [];

  function findProduct(idOrSlug) {
    const key = String(idOrSlug || "").trim().toLowerCase();
    if (!key) return null;
    for (const product of products) {
      if (String(product.id).toLowerCase() === key) return product;
      if (String(product.slug).toLowerCase() === key) return product;
    }
    return null;
  }

  /** Цена одного флакона выбранного объёма. */
  function priceForVolume(product, ml) {
    const base = Math.max(1, Math.trunc(Number(product.baseMl) || 10));
    const wanted = Math.trunc(Number(ml) || 0);
    if (wanted <= 0) return 0;
    return Math.floor((Math.max(0, Math.trunc(Number(product.basePrice) || 0)) * wanted) / base);
  }

  function pricePerMl(product, ml) {
    const wanted = Math.trunc(Number(ml) || 0);
    if (wanted <= 0) return 0;
    return Math.floor(priceForVolume(product, wanted) / wanted);
  }

  function volumesFor(product) {
    const list = (DATA.volumes || []).filter((v) => v > 0);
    if (list.length) return list.slice();
    return [Math.max(1, Math.trunc(Number(product.baseMl) || 10))];
  }

  function minVolume(product) {
    return volumesFor(product)[0];
  }

  function segmentName(key) {
    const found = (DATA.segments || []).find((s) => s.key === key);
    return found ? found.name : key;
  }

  function productHref(product) {
    return `product.html?id=${encodeURIComponent(product.slug || product.id)}`;
  }

  /* ---------- корзина ---------- */

  function readCart() {
    let raw;
    try {
      raw = localStorage.getItem(CART_KEY);
    } catch (e) {
      return [];
    }
    if (!raw) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    // Сохраняем только то, что ещё есть в каталоге: иначе после правки
    // витрины в корзине остаются несуществующие товары с нулевой ценой.
    return parsed
      .map((line) => {
        const product = findProduct(line && line.id);
        if (!product) return null;
        const list = volumesFor(product);
        const ml = list.indexOf(Number(line.ml)) >= 0 ? Number(line.ml) : list[0];
        const qty = Math.min(99, Math.max(1, Math.trunc(Number(line.qty) || 1)));
        return { id: product.id, slug: product.slug, ml: ml, qty: qty };
      })
      .filter(Boolean);
  }

  function writeCart(lines) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch (e) {
      /* приватный режим — корзина живёт только в памяти страницы */
    }
    emit();
  }

  const listeners = [];

  function onCartChange(fn) {
    listeners.push(fn);
  }

  function emit() {
    const lines = readCart();
    listeners.forEach((fn) => {
      try {
        fn(lines);
      } catch (e) {
        /* один сломанный слушатель не должен ломать остальных */
      }
    });
  }

  function cartLines() {
    return readCart().map((line) => {
      const product = findProduct(line.id);
      const unit = priceForVolume(product, line.ml);
      return {
        id: line.id,
        slug: line.slug,
        ml: line.ml,
        qty: line.qty,
        product: product,
        unit: unit,
        sum: unit * line.qty,
      };
    });
  }

  function cartCount() {
    return readCart().reduce((acc, line) => acc + line.qty, 0);
  }

  function addToCart(id, ml, qty) {
    const product = findProduct(id);
    if (!product) return false;
    const list = volumesFor(product);
    const volume = list.indexOf(Number(ml)) >= 0 ? Number(ml) : list[0];
    const count = Math.min(99, Math.max(1, Math.trunc(Number(qty) || 1)));
    const lines = readCart();
    const found = lines.find((line) => line.id === product.id && line.ml === volume);
    if (found) {
      found.qty = Math.min(99, found.qty + count);
    } else {
      lines.push({ id: product.id, slug: product.slug, ml: volume, qty: count });
    }
    writeCart(lines);
    return true;
  }

  function setQty(id, ml, qty) {
    const lines = readCart();
    const found = lines.find((line) => line.id === id && line.ml === Number(ml));
    if (!found) return;
    const count = Math.trunc(Number(qty) || 0);
    if (count <= 0) {
      writeCart(lines.filter((line) => line !== found));
      return;
    }
    found.qty = Math.min(99, count);
    writeCart(lines);
  }

  function removeLine(id, ml) {
    writeCart(readCart().filter((line) => !(line.id === id && line.ml === Number(ml))));
  }

  function clearCart() {
    writeCart([]);
  }

  /* ---------- промо и итоги ---------- */

  function promoSettings() {
    const promo = DATA.promo || {};
    const percent = Math.min(90, Math.max(0, Math.trunc(Number(promo.percent) || 0)));
    if (!percent) return { title: "", percent: 0, minTotal: 0 };
    return {
      title: String(promo.title || `Скидка ${percent}%`),
      percent: percent,
      minTotal: Math.max(0, Math.trunc(Number(promo.minTotal) || 0)),
    };
  }

  /** Скидка только от товаров: доставку клиент платит и без акции. */
  function discountFor(itemsTotal) {
    const promo = promoSettings();
    const total = Math.max(0, Math.trunc(Number(itemsTotal) || 0));
    if (!promo.percent || !total) return { amount: 0, promo: promo };
    if (promo.minTotal && total < promo.minTotal) return { amount: 0, promo: promo };
    return { amount: Math.floor((total * promo.percent) / 100), promo: promo };
  }

  function deliveryMethod(key) {
    return (DATA.delivery || []).find((m) => m.key === key) || (DATA.delivery || [])[0] || null;
  }

  function paymentMethod(key) {
    return (DATA.payment || []).find((m) => m.key === key) || (DATA.payment || [])[0] || null;
  }

  /** Полная смета: сумма товаров, скидка, доставка, итого. */
  function quote(deliveryKey) {
    const lines = cartLines();
    const itemsTotal = lines.reduce((acc, line) => acc + line.sum, 0);
    const { amount: discount, promo } = discountFor(itemsTotal);
    const delivery = deliveryMethod(deliveryKey);
    let deliveryPrice = delivery ? Math.max(0, Math.trunc(Number(delivery.price) || 0)) : 0;
    // «Бесплатно от 3000 ₽»: порог считаем от суммы товаров — той же базы,
    // что и акция, чтобы клиенту не приходилось держать в голове два разных
    // правила на одни и те же деньги.
    if (delivery && delivery.freeOver && itemsTotal >= delivery.freeOver) deliveryPrice = 0;
    return {
      lines: lines,
      itemsTotal: itemsTotal,
      discount: discount,
      promo: promo,
      delivery: delivery,
      deliveryPrice: deliveryPrice,
      deliveryFree: Boolean(delivery && delivery.freeOver && itemsTotal >= delivery.freeOver),
      total: itemsTotal - discount + deliveryPrice,
    };
  }

  /* ---------- уведомления ---------- */

  function toast(message) {
    let area = $(".toast-area");
    if (!area) {
      area = document.createElement("div");
      area.className = "toast-area";
      document.body.appendChild(area);
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("popover", "manual");
    el.textContent = message;
    area.appendChild(el);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (typeof el.hidePopover === "function") el.hidePopover();
      el.remove();
    };

    if (typeof el.showPopover === "function") {
      el.showPopover();
    } else {
      // Старый браузер без Popover API: показываем обычным блоком.
      el.style.position = "fixed";
      el.style.insetBlockEnd = "1.25rem";
      el.style.insetInline = "0";
      el.style.marginInline = "auto";
      el.style.width = "max-content";
      el.style.maxWidth = "min(90vw, 30rem)";
      el.style.zIndex = "50";
    }

    setTimeout(close, 2600);
    return close;
  }

  /* ---------- диалоги ---------- */

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("is-locked");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("is-locked");
  }

  /** Клик по подложке закрывает окно: событие приходит с самого <dialog>. */
  function wireBackdrop(dialog) {
    if (!dialog || dialog.dataset.backdrop === "ready") return;
    dialog.dataset.backdrop = "ready";
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) document.body.classList.remove("is-locked");
    });
  }

  /* ---------- внешние сервисы ---------- */

  /**
 * Название внешнего сервиса для способа. У «курьера по Дрезне» сервиса
 * нет, у СДЭК — есть. Возвращает пустую строку для своих способов:
 * «(Своими силами)» в заказе менеджеру только мешает.
 */
  function serviceName(key) {
    const service = (DATA.services || {})[key || ""];
    if (!service || !service.name || service.name === "Своими силами") return "";
    return service.name;
  }

  /** Живой сервис (работает сегодня) или ещё нет (нужен договор). */
  function isLive(method) {
    return !method || method.status !== "planned";
  }

  /** Способы, которые покупатель реально может выбрать прямо сейчас. */
  function selectableMethods(list) {
    return (list || []).filter(isLive);
  }

  /**
   * Бейдж внешнего сервиса в интерфейсе. Не рисуем ничего, если сервис
   * свой: метка «Своими силами» только шумит.
   */
  function serviceBadge(method) {
    if (!method) return "";
    const service = (DATA.services || {})[method.service || ""];
    if (!service || service.name === "Своими силами") return "";
    const planned = !isLive(method);
    return `<span class="badge${planned ? " badge--planned" : ""}">${escapeHtml(service.name)}</span>`;
  }

  /* ---------- появление секций ---------- */

  let revealObserver = null;

  /**
   * Появление блоков при прокрутке.
   *
   * Класс .reveal-ready на <html> включает скрытие: без скриптов каталог
   * остаётся видимым. Где браузер умеет scroll-driven animation, оформление
   * ведёт CSS сам — тогда скрытие не нужно вовсе.
   */
  function reveal() {
    const nodes = document.querySelectorAll(".reveal:not(.is-in)");
    if (!nodes.length) return;

    const root = document.documentElement;
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("is-in"));
      return;
    }
    if (CSS.supports && CSS.supports("animation-timeline", "view()")) {
      // Нативная анимация уже рисует появление — не включаем скрытие,
      // иначе блок мигнёт, пока CSS-анимация не дойдёт до своего диапазона.
      return;
    }

    root.classList.add("reveal-ready");
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 }
    );
    nodes.forEach((el) => revealObserver.observe(el));
  }

  /* ---------- анимация чисел ---------- */

  function animateNumber(el, to, format) {
    if (!el) return;
    const fmt = format || ((value) => `${formatPrice(value)} ₽`);
    const from = Number(el.dataset.value);
    const target = Math.trunc(Number(to) || 0);

    // Первое заполнение и отсутствие поддержки — просто пишем число.
    if (!Number.isFinite(from) || from === target) {
      el.dataset.value = String(target);
      el.textContent = fmt(target);
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.dataset.value = String(target);
      el.textContent = fmt(target);
      return;
    }

    const duration = 460;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic: цифры быстро разгоняются и мягко останавливаются.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(from + (target - from) * eased));
      if (t < 1) requestAnimationFrame(step);
      else {
        el.dataset.value = String(target);
        el.textContent = fmt(target);
      }
    };

    requestAnimationFrame(step);
  }

  /** Человеческая цена доставки с учётом «бесплатно от N ₽». */
  function deliveryPriceLabel(method) {
    if (!method) return "—";
    if (method.freeOver) return `бесплатно от ${money(method.freeOver)}`;
    return method.price ? money(method.price) : "бесплатно";
  }

  /**
   * Радиогруппы в форме оформления. Показываем только то, что работает
   * сегодня: способ со статусом planned клиент выбрать не может, а обещать
   * оплату картой, которой ещё нет, нельзя. Недоступное перечисляем словами
   * под списком — чтобы подготовка к сервису была видна, но не вводила в
   * заблуждение.
   */
  function renderOptions(targetId, methods, name) {
    const box = $("#" + targetId);
    if (!box) return;
    const live = selectableMethods(methods);
    const soon = (methods || []).filter((m) => !isLive(m));

    box.innerHTML =
      live
        .map(
          (method, index) => `
      <label class="option">
        <input type="radio" name="${name}" value="${escapeHtml(method.key)}"${index === 0 ? " checked" : ""}>
        <span class="option__text">
          <span class="option__name">${escapeHtml(method.name)}</span>
          ${method.desc ? `<span class="option__meta">${escapeHtml(method.desc)}</span>` : ""}
        </span>
        ${
          name === "delivery"
            ? `<span class="option__price">${escapeHtml(deliveryPriceLabel(method))}</span>`
            : serviceBadge(method)
        }
      </label>`
        )
        .join("") +
      (soon.length
        ? `<p class="fieldset__soon">Скоро: ${soon.map((m) => escapeHtml(m.name)).join(", ")}.
             Уже подготовлено, включится после договора с сервисом.</p>`
        : "");
  }

  /* ---------- отрисовка корзины ---------- */

  function renderCart() {
    const drawer = $("#cart");
    if (!drawer) return;

    const list = $(".cart-list", drawer);
    const empty = $(".cart-empty", drawer);
    const foot = $(".drawer__foot", drawer);
    const promoBox = $(".promo", drawer);
    const lines = cartLines();
    const count = cartCount();

    $$("[data-cart-count]").forEach((el) => {
      el.textContent = String(count);
      if (el.dataset.empty !== undefined) el.dataset.empty = count === 0 ? "true" : "false";
    });

    if (!lines.length) {
      list.innerHTML = "";
      list.hidden = true;
      empty.hidden = false;
      foot.hidden = true;
      return;
    }

    list.hidden = false;
    empty.hidden = true;
    foot.hidden = false;

    list.innerHTML = lines
      .map((line) => {
        const product = line.product;
        return `
        <li class="cart-row" data-line="${escapeHtml(line.id)}" data-ml="${escapeHtml(line.ml)}">
          <a class="cart-row__thumb" href="${escapeHtml(productHref(product))}" tabindex="-1" aria-hidden="true">
            <span class="flacon">${window.MPFlacon.render(product, { ml: line.ml, volumes: volumesFor(product), label: false })}</span>
          </a>
          <div>
            <div class="cart-row__name">${escapeHtml(product.name)}</div>
            <div class="cart-row__meta">${escapeHtml(segmentName(product.segment))} · ${escapeHtml(line.ml)} мл · ${escapeHtml(money(line.unit))} за флакон</div>
            <div class="cart-row__controls">
              <div class="stepper">
                <button type="button" data-action="dec" aria-label="Убрать один ${escapeHtml(product.name)}">−</button>
                <output aria-label="Количество">${line.qty}</output>
                <button type="button" data-action="inc" aria-label="Добавить ещё ${escapeHtml(product.name)}">+</button>
              </div>
              <button type="button" class="cart-row__remove" data-action="remove">Убрать</button>
            </div>
          </div>
          <div class="cart-row__end">
            <div class="cart-row__price">${escapeHtml(money(line.sum))}</div>
          </div>
        </li>`;
      })
      .join("");

    const deliveryKey = drawer.dataset.delivery || (DATA.delivery[0] && DATA.delivery[0].key) || "";
    const q = quote(deliveryKey);

    $("[data-total-items]", drawer).textContent = money(q.itemsTotal);

    const discountRow = $("[data-total-discount]", drawer);
    if (q.discount > 0) {
      discountRow.hidden = false;
      discountRow.querySelector("[data-value]").textContent = `− ${money(q.discount)}`;
    } else {
      discountRow.hidden = true;
    }

    const deliveryRow = $("[data-total-delivery]", drawer);
    deliveryRow.hidden = !q.delivery;
    if (q.delivery) {
      deliveryRow.querySelector("[data-value]").textContent = q.deliveryFree
        ? "бесплатно"
        : q.deliveryPrice
          ? money(q.deliveryPrice)
          : "бесплатно";
    }

    $("[data-total-sum]", drawer).textContent = money(q.total);

    if (promoBox && q.promo.percent) {
      if (q.discount > 0) {
        promoBox.innerHTML = `<b>${escapeHtml(q.promo.title)}</b> — уже применена, −${escapeHtml(formatPrice(q.discount))} ₽`;
      } else if (q.promo.minTotal && q.itemsTotal < q.promo.minTotal) {
        promoBox.innerHTML = `<b>${escapeHtml(q.promo.title)}</b> — добавьте ещё ${escapeHtml(money(q.promo.minTotal - q.itemsTotal))}`;
      } else {
        promoBox.innerHTML = `<b>${escapeHtml(q.promo.title)}</b>`;
      }
    }
  }

  /* ---------- текст заказа ---------- */

  function orderText(order) {
    const rows = order.items
      .map(
        (item) =>
          `• ${item.name} — ${item.ml} мл × ${item.qty} — ${formatPrice(item.sum)} ₽`
      )
      .join("\n");

    const delivery = order.delivery && order.delivery.name ? order.delivery.name : "—";
    const payment = order.payment && order.payment.name ? order.payment.name : "—";
    // Сервис в заказе нужен менеджеру, чтобы сразу открыть нужный личный
    // кабинет и не переспрашивать клиента.
    const deliveryService = order.delivery ? serviceName(order.delivery.service) : "";
    const paymentService = order.payment ? serviceName(order.payment.service) : "";

    const parts = [
      `Заказ с сайта ${DATA.brand || "MARI PARFUM"}`,
      "",
      rows,
      "",
      `Товары: ${formatPrice(order.itemsTotal)} ₽`,
    ];

    if (order.discount > 0) {
      parts.push(`${order.discountTitle}: −${formatPrice(order.discount)} ₽`);
    }

    parts.push(
      `Доставка: ${delivery}${deliveryService ? ` (${deliveryService})` : ""} — ${order.deliveryPrice ? `${formatPrice(order.deliveryPrice)} ₽` : "бесплатно"}`,
      `Оплата: ${payment}${paymentService ? ` (${paymentService})` : ""}`,
      `Имя: ${order.name}`,
      `Телефон: ${order.phone}`,
      `Адрес: ${order.address}`
    );

    if (order.comment) parts.push(`Комментарий: ${order.comment}`);
    parts.push(`Итого: ${formatPrice(order.total)} ₽`);

    return parts.join("\n");
  }

  function telegramLink(text) {
    const manager = String(DATA.manager || "").trim().replace(/^@/, "");
    if (!manager) return "";
    return `https://t.me/${encodeURIComponent(manager)}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Кнопки «Бот» — в шапке и плавающая на телефоне.
   *
   * Адрес приходит из настроек, а не зашит в код: имя бота меняется, и
   * менять его в двух местах — в коде и в панели — неправильно. Панель
   * одна меняет, витрина подхватывает.
   *
   * Если бота в настройках нет, кнопок нет: витрина может появиться раньше
   * бота, и пустая кнопка, ведущая в никуда, хуже её отсутствия.
   */
  function applyBotLinks() {
    const bot = String(DATA.botUsername || "").trim().replace(/^@/, "");
    const links = document.querySelectorAll("[data-bot-link]");
    if (!bot) {
      links.forEach((link) => link.remove());
      return;
    }
    const href = `https://t.me/${encodeURIComponent(bot)}`;
    links.forEach((link) => {
      link.href = href;
      link.title = `Бот-консультант @${bot} в Telegram`;
    });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      /* переходим к запасному пути */
    }
    // Запасной путь для http и старых браузеров.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  /* ---------- оформление ---------- */

  function buildOrderFromForm(form) {
    const data = new FormData(form);
    const deliveryKey = String(data.get("delivery") || "");
    const paymentKey = String(data.get("payment") || "");
    const q = quote(deliveryKey);

    return {
      createdAt: new Date().toISOString(),
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      address: String(data.get("address") || "").trim(),
      comment: String(data.get("comment") || "").trim(),
      delivery: q.delivery,
      deliveryPrice: q.deliveryPrice,
      deliveryFree: q.deliveryFree,
      payment: paymentMethod(paymentKey),
      items: q.lines.map((line) => ({
        id: line.id,
        name: line.product.name,
        brand: line.product.brand,
        ml: line.ml,
        qty: line.qty,
        unit: line.unit,
        sum: line.sum,
      })),
      itemsTotal: q.itemsTotal,
      discount: q.discount,
      discountTitle: q.promo.title,
      promoPercent: q.promo.percent,
      total: q.total,
      source: "site",
    };
  }

  function renderCheckoutSummary(target, order) {
    const rows = order.items
      .map(
        (item) =>
          `<li class="totals__line"><span>${escapeHtml(item.name)} · ${item.ml} мл × ${item.qty}</span><span>${escapeHtml(money(item.sum))}</span></li>`
      )
      .join("");
    target.innerHTML = `
      <ul class="totals">${rows}</ul>
      <div class="totals">
        <div class="totals__line"><span>Товары</span><span>${escapeHtml(money(order.itemsTotal))}</span></div>
        ${
          order.discount > 0
            ? `<div class="totals__line totals__line--discount"><span>${escapeHtml(order.discountTitle)}</span><span>− ${escapeHtml(money(order.discount))}</span></div>`
            : ""
        }
        <div class="totals__line"><span>Доставка · ${escapeHtml(order.delivery ? order.delivery.name : "—")}</span><span>${escapeHtml(order.deliveryFree || !order.deliveryPrice ? "бесплатно" : money(order.deliveryPrice))}</span></div>
        <div class="totals__line totals__line--sum"><span>Итого</span><span>${escapeHtml(money(order.total))}</span></div>
      </div>`;
  }

  function wireCheckout() {
    const sheet = $("#checkout");
    const form = $("#checkout-form");
    if (!sheet || !form) return;

    // Блок ошибки лежит рядом с формой, но внутри листа — ищем от листа,
// иначе селектор вернёт null и уронит весь обработчик отправки.
const errorBox = $("[data-form-error]", sheet);
    const formPanel = $("[data-form-panel]", sheet);
    const donePanel = $("[data-done-panel]", sheet);
    const summary = $("[data-order-summary]", sheet);

    const submit = $("[data-submit]", form);

    // Итог пересчитывается при смене доставки. Слушатель висит на самой
    // форме, а не на радиокнопках: на момент загрузки их ещё нет —
    // renderOptions() рисует их позже, и слушатели по узлам молча терялись бы,
    // а итог оставался бы от способа по умолчанию.
    form.addEventListener("change", (event) => {
      const input = event.target;
      if (!input || input.name !== "delivery") return;
      const q = quote(input.value);
      const cost = $("[data-form-delivery-cost]", form);
      const total = $("[data-form-total]", form);
      if (cost) {
        cost.textContent = q.deliveryFree || !q.deliveryPrice ? "бесплатно" : money(q.deliveryPrice);
      }
      if (total) animateNumber(total, q.total);
    });

    // Менеджера в поле телефон подставляем, чтобы не вводить вручную.
    const phoneField = form.querySelector("#phone");
    if (phoneField && DATA.phone && !phoneField.dataset.touched) {
      phoneField.placeholder = DATA.phone;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (errorBox) errorBox.textContent = "";

      // Honeypot: поле скрыто от людей, но заполняется ботами.
      const trap = form.querySelector('input[name="website"]');
      if (trap && trap.value) return;

      if (!form.reportValidity()) return;
      if (!cartLines().length) {
        if (errorBox) errorBox.textContent = "Корзина пуста — добавьте хотя бы один аромат.";
        return;
      }

      const order = buildOrderFromForm(form);
      submit.disabled = true;
      submit.textContent = "Отправляем…";

      try {
        if (ORDER_ENDPOINT) {
          const response = await fetch(ORDER_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(order),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        showDone(order);
      } catch (e) {
        // Сеть или сервер упали — заказ всё равно не должен потеряться:
        // показываем ссылку в Telegram и копирование текста.
        showDone(order, e.message || "не удалось отправить автоматически");
      } finally {
        submit.disabled = false;
        submit.textContent = "Оформить заказ";
      }
    });

    function showDone(order, problem) {
      const text = orderText(order);
      try {
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch (e) {
        /* не критично */
      }
      clearCart();

      renderCheckoutSummary(summary, order);
      formPanel.hidden = true;
      donePanel.hidden = false;

      const notice = $("[data-done-notice]", donePanel);
      if (problem) {
        notice.hidden = false;
        notice.innerHTML = `Автоматическая отправка не прошла (${escapeHtml(problem)}). Отправьте заказ кнопкой ниже или скопируйте текст.`;
      } else {
        notice.hidden = true;
      }

      $("[data-done-title]", donePanel).textContent = problem
        ? "Заказ собран"
        : "Заказ принят";
      $("[data-done-text]", donePanel).textContent =
        `${DATA.manager ? `@${DATA.manager}` : "Менеджер"} свяжется с вами по телефону ${order.phone}. ` +
        (order.payment && order.payment.hint
          ? order.payment.hint
          : " Оплата при получении — наличными или картой.");

      const tglink = $("[data-done-telegram]", donePanel);
      const href = telegramLink(text);
      if (href) {
        tglink.href = href;
        tglink.hidden = false;
      } else {
        tglink.hidden = true;
      }

      $("[data-done-copy]", donePanel).onclick = async () => {
        const ok = await copyText(text);
        toast(ok ? "Заказ скопирован — вставьте менеджеру" : "Не удалось скопировать");
      };

      closeDialog($("#cart"));
    }
  }

  /* ---------- публичный интерфейс ---------- */

  const MP = {
    data: DATA,
    products: products,
    $: $,
    $$: $$,
    formatPrice: formatPrice,
    money: money,
    plural: plural,
    escapeHtml: escapeHtml,
    findProduct: findProduct,
    priceForVolume: priceForVolume,
    pricePerMl: pricePerMl,
    volumesFor: volumesFor,
    minVolume: minVolume,
    segmentName: segmentName,
    productHref: productHref,
    addToCart: addToCart,
    setQty: setQty,
    removeLine: removeLine,
    clearCart: clearCart,
    cartLines: cartLines,
    cartCount: cartCount,
    quote: quote,
    discountFor: discountFor,
    deliveryMethod: deliveryMethod,
    paymentMethod: paymentMethod,
    orderText: orderText,
    deliveryPriceLabel: deliveryPriceLabel,
    renderOptions: renderOptions,
    serviceName: serviceName,
    serviceBadge: serviceBadge,
    isLive: isLive,
    selectableMethods: selectableMethods,
    reveal: reveal,
    animateNumber: animateNumber,
    telegramLink: telegramLink,
    copyText: copyText,
    toast: toast,
    openDialog: openDialog,
    closeDialog: closeDialog,
    wireBackdrop: wireBackdrop,
    onCartChange: onCartChange,
    renderCart: renderCart,
    wireCheckout: wireCheckout,
  };

  window.MP = MP;

  /* ---------- запуск ---------- */

  function boot() {
    const drawer = $("#cart");
    wireBackdrop(drawer);
    wireBackdrop($("#checkout"));
    applyBotLinks();
    renderCart();
    onCartChange(renderCart);
    reveal();

    $$("[data-cart-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        renderCart();
        openDialog(drawer);
      });
    });

    $$("[data-cart-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeDialog(drawer));
    });

    const checkout = $("#checkout");
    const openCheckout = $("[data-checkout-open]");
    if (openCheckout) {
      openCheckout.addEventListener("click", () => {
        if (!cartLines().length) {
          toast("Корзина пуста");
          return;
        }
        closeDialog(drawer);
        const deliveryKey = drawer ? drawer.dataset.delivery : "";
        const q = quote(deliveryKey);
        $("[data-form-total]", checkout).textContent = money(q.total);
        $("[data-form-delivery-cost]", checkout).textContent = q.deliveryPrice
          ? money(q.deliveryPrice)
          : "бесплатно";
        openDialog(checkout);
      });
    }

    $$("[data-checkout-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeDialog(checkout));
    });

    wireCheckout();

    // +/- в корзине: делегирование, список перерисовывается целиком.
    if (drawer) {
      const list = $(".cart-list", drawer);
      if (list) {
        list.addEventListener("click", (event) => {
          const button = event.target.closest("button[data-action]");
          if (!button) return;
          const row = button.closest(".cart-row");
          if (!row) return;
          const id = row.dataset.line;
          const ml = Number(row.dataset.ml);
          const line = cartLines().find((l) => l.id === id && l.ml === ml);
          if (!line) return;
          if (button.dataset.action === "inc") setQty(id, ml, line.qty + 1);
          if (button.dataset.action === "dec") setQty(id, ml, line.qty - 1);
          if (button.dataset.action === "remove") removeLine(id, ml);
        });
      }
    }

    // Кнопки «в корзину» на странице товара вызывают это.
    document.addEventListener("mp:add-to-cart", (event) => {
      const detail = event.detail || {};
      if (addToCart(detail.id, detail.ml, detail.qty)) {
        const btn = $("[data-cart-button]");
        if (btn) {
          btn.classList.remove("is-bumped");
          void btn.offsetWidth;
          btn.classList.add("is-bumped");
        }
        toast(`${detail.name || "Аромат"} — ${detail.ml} мл в корзине`);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();