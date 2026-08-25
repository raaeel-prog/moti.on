import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(testDirectory, "../client/src/main.ts");

test("painel AE nunca renderiza message bruto vindo do host", async () => {
  const source = await readFile(mainPath, "utf8");

  assert.doesNotMatch(source, /error\.message/);
  assert.match(
    source,
    /i18n\.t\(error\.recoverable \? "status\.notCompleted" : "status\.failed"\)/
  );
  assert.match(source, /error\.action/);
});

test("view Sistema não finge uma verificação antes do usuário iniciá-la", async () => {
  const source = await readFile(mainPath, "utf8");
  const renderSystem = source.slice(
    source.indexOf("function renderSystem("),
    source.indexOf("function renderDiagnostics(")
  );

  assert.match(renderSystem, /i18n\.t\("message\.systemCheckIdle"\)/);
  assert.doesNotMatch(renderSystem, /i18n\.t\("status\.checkingSystem"\)/);
  assert.match(source, /shell\.setStatus\(i18n\.t\("status\.checkingSystem"\), "busy"\)/);
});
