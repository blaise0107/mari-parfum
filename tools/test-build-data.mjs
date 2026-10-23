/** Проверяет настоящую сборку на временных данных, не меняя магазин. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("исправленная владельцем цена не помечается как предварительная", async () => {
  const root = await mkdtemp(join(tmpdir(), "mari-catalog-test-"));
  try {
    await mkdir(join(root, "web", "tools"), { recursive: true });
    await mkdir(join(root, "web", "assets"), { recursive: true });
    await copyFile(new URL("build-data.mjs", import.meta.url), join(root, "web", "tools", "build-data.mjs"));
    const prototype = {
      name: "Princess", brand: "Kilian", base_ml: 10, price_provisional: true,
      price_reference: { price: 3300, volume_ml: 10 },
    };
    await writeFile(join(root, "catalog.json"), JSON.stringify({
      luxury: [
        { ...prototype, id: "corrected", price: 3500 },
        { ...prototype, id: "initial", price: 3300 },
      ],
    }));
    await writeFile(join(root, "settings.json"), JSON.stringify({
      volumes: [10], segments: { luxury: { name: "Люкс" } },
    }));
    const run = spawnSync(process.execPath, [join(root, "web", "tools", "build-data.mjs")], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const raw = await readFile(join(root, "web", "assets", "catalog.js"), "utf8");
    const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    assert.equal(data.products.find(p => p.id === "corrected").priceProvisional, false);
    assert.equal(data.products.find(p => p.id === "initial").priceProvisional, true);
    assert.equal(data.products.find(p => p.id === "corrected").basePrice, 3500);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
