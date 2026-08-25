/** Servidor local mínimo para QA visual dos artefatos em dist/. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve("dist");
const port = Number(process.argv[2] ?? 4173);

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("A porta do preview precisa ser um inteiro entre 1024 e 65535.");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsx", "text/plain; charset=utf-8"]
]);

function safePath(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl ?? "/", "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
    ? candidate
    : null;
}

const server = createServer(async (request, response) => {
  const candidate = safePath(request.url);
  if (!candidate) {
    response.writeHead(400).end("Bad request");
    return;
  }

  try {
    const info = await stat(candidate);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes.get(path.extname(candidate)) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Preview em http://127.0.0.1:${port}`);
});
