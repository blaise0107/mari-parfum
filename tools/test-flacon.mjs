/** Проверяет контракт SVG и наполнения; реальную геометрию проверяем в браузере. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(fileURLToPath(new URL("../assets/flacon.js", import.meta.url)), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const F = context.window.MPFlacon;
const perfume = { name: "Princess", brand: "Kilian", notes: { base: "ваниль" } };
const volumes = [10, 20, 30, 50, 80, 100];

test("SVG сохраняет пропорции и безопасно выводит название", () => {
  const svg = F.render({ ...perfume, name: '\"><script>alert(1)</script>' }, { ml: 10, volumes });
  assert.ok(svg.includes('viewBox="0 0 120 176"'));
  assert.ok(!svg.includes("<script>"));
  assert.ok(!/NaN|Infinity|undefined/.test(svg));
});

test("повторный рендер не пересекает id и ссылки на градиенты", () => {
  const a = F.render(perfume, { ml: 10, volumes });
  const b = F.render(perfume, { ml: 100, volumes });
  const ids = [...(a + b).matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of (a + b).matchAll(/url\(#([^)]+)\)/g)) {
    assert.ok(ids.includes(id), `Нет определения ${id}`);
  }
});

test("натуральный корпус содержит отдельные неподвижные стекло и трубку", () => {
  const svg = F.render(perfume, { ml: 10, volumes });
  assert.ok(svg.includes('class="flacon__glass"'), "Нет отдельного стеклянного слоя");
  assert.ok(svg.includes('class="flacon__tube"'), "Нет трубки распылителя");
  assert.ok(svg.includes('class="flacon__meniscus"'), "Нет отдельного мениска");
});

test("fillFor ограничивает уровень и терпим к мусорному списку объёмов", () => {
  assert.equal(F.fillFor(null, -100, volumes), 0.3);
  assert.ok(Math.abs(F.fillFor(null, 999, volumes) - 0.92) <= Number.EPSILON);
  assert.equal(F.fillFor(null, 10, ["ошибка", 0, null]), 0.3);
  assert.ok(Number.isFinite(F.fillFor(null, 10, [10])));
});

test("setFill меняет жидкость и мениск, не масштабируя стекло", () => {
  assert.equal(typeof F.setFill, "function", "Нет общей функции установки наполнения");
  // Узкие двойники DOM-узлов: проверяем значения, записываемые реальным setFill.
  const liquid = { style: {} };
  const surface = { style: {} };
  const glass = { style: {} };
  const svg = { querySelector: selector => ({
    ".flacon__level": liquid,
    ".flacon__meniscus": surface,
    ".flacon__glass": glass,
  })[selector] || null };
  F.setFill(svg, 10, volumes);
  assert.equal(liquid.style.transform, "scaleY(0.300)");
  const low = surface.style.transform;
  F.setFill(svg, 100, volumes);
  assert.equal(liquid.style.transform, "scaleY(0.920)");
  assert.notEqual(surface.style.transform, low);
  F.setFill(svg, 10, volumes);
  assert.equal(surface.style.transform, low);
  assert.equal(glass.style.transform, undefined);
  assert.doesNotThrow(() => F.setFill(null, 10, volumes));
});
