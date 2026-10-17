/**
 * Локальный просмотр витрины: node tools/serve.mjs [порт]
 *
 * Нужен потому, что файлы собираются скриптом и страница читает каталог
 * из assets/catalog.js — открыть index.html двойным щелчком тоже можно,
 * но http-сервер проверяет ссылки так же, как их проверит хостинг.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2]) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // normalize + префиксная проверка не дают выйти за пределы каталога через ../.
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (rel.endsWith("/")) rel += "index.html";

  const file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(file);
    const target = info.isDirectory() ? join(file, "index.html") : file;
    await stat(target);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(target).pipe(res);
  } catch {
    // Так же, как на GitHub Pages: неизвестный путь уходит в 404.html.
    try {
      const fallback = join(root, "404.html");
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      createReadStream(fallback).pipe(res);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }
});

server.listen(port, () => {
  console.log(`MARI PARFUM: http://localhost:${port}/`);
});