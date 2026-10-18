/* =========================================================================
   Полка: объём, который видно.

   Замысел. Сайт продаёт не флакон, а миллилитры: цена считается от 500 ₽
   за 10 мл, и объём — единственный параметр, который покупатель выбирает
   сам. На странице товара это уже работает: выбрал 100 мл — флакон
   наполнился, цена пересчиталась. На главной тот же жест был выключен:
   полка рисовалась с фиксированными 40 % и подписью «от 500 ₽ за 10 мл»,
   то есть называла цену, не объясняя, за что она.

   Здесь полка становится этим жестом: переключатель объёма перезаливает все
   бутылки и двигает цену. Ради этого магазин и отличается от витрины
   готовых флаконов.

   Файл отдельный и подключён ДО home.js намеренно. Он не правит чужой код:
   подменяет MPFlacon.shelf на время первого рендера и вешает делегированный
   слушатель. home.js, app.js и styles.css не тронуты — если этот файл
   убрать, сайт работает ровно как раньше.

   Цена перезаливается по той же формуле, что и в боте: MP.priceForVolume.
   Нижняя граница — минимум по всему каталогу, поэтому подпись не врёт.
   ========================================================================= */

(function () {
  "use strict";

  const MP = window.MP;
  const F = window.MPFlacon;
  if (!MP || !F) return;

  const volumes = (MP.data.volumes || [10]).filter((v) => v > 0);
  if (!volumes.length) return;

  /* По умолнию — самый маленький объём: с него начинают и с него считают цену. */
  let current = volumes[0];

  /** Нижняя цена выбранного объёма по всему каталогу. */
  function floorPrice(ml) {
    let min = Infinity;
    for (const product of MP.products) {
      const value = MP.priceForVolume(product, ml);
      if (value > 0 && value < min) min = value;
    }
    return Number.isFinite(min) ? min : 0;
  }

  /* Первый рендер полки. Свойства по умолчанию (без этикетки и пузырьков)
     сохраняются: на мелком размере это шум. */
  const originalShelf = F.shelf;
  F.shelf = function shelfWithVolume(product) {
    return originalShelf(product, {
      ml: current,
      volumes: volumes,
      label: false,
      bubbles: false,
    });
  };

  function paint() {
    document.querySelectorAll("[data-decant-ml]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.decantMl) === current));
    });
    const note = document.querySelector("[data-decant-note]");
    if (note) note.textContent = `от ${MP.money(floorPrice(current))} за ${current} мл`;
  }

  function select(ml) {
    if (!volumes.includes(ml)) return;
    current = ml;
    paint();
    /* Формула уровня живёт в MPFlacon и одна на весь сайт — берём её оттуда,
       а не переписываем здесь вторую копию. */
    const level = F.fillFor(null, ml, volumes).toFixed(3);
    for (const stage of document.querySelectorAll("#shelf .flacon__level")) {
      stage.style.transform = `scaleY(${level})`;
    }
  }

  function mount() {
    const intro = document.querySelector(".shelf__intro");
    const track = document.getElementById("shelf");
    if (!intro || !track || intro.parentElement.querySelector("[data-decant]")) return;

    const wrap = document.createElement("div");
    wrap.className = "decant";
    wrap.dataset.decant = "";

    const label = document.createElement("span");
    label.className = "decant__label";
    label.textContent = "Объём";

    const group = document.createElement("div");
    group.className = "decant__sizes";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Объём флакона");

    for (const ml of volumes) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.decantMl = String(ml);
      button.setAttribute("aria-pressed", String(ml === current));
      button.textContent = `${ml} мл`;
      group.appendChild(button);
    }

    const note = document.createElement("p");
    note.className = "decant__note";
    note.dataset.decantNote = "";
    /* aria-live: цена меняется по действию человека, об этом нужно сказать. */
    note.setAttribute("aria-live", "polite");

    wrap.append(label, group, note);
    track.before(wrap);

    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-decant-ml]");
      if (button) select(Number(button.dataset.decantMl));
    });

    paint();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();