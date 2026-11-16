/** Browser-only QA. Uses the existing explicit fake host/account fixture.
 * The next build removes these temporary dist files; never install this fixture. */
import { readFile, writeFile } from "node:fs/promises";
import { attachLicensedAccount } from "../apps/after-effects-cep/tests/licensed-account-fixture.mjs";
const test = await readFile("apps/after-effects-cep/tests/preset-library-video.browser.mjs", "utf8");
const body = /const fixture=`([\s\S]*?)`;/m.exec(test)?.[1];
if (!body) throw new Error("Existing browser fixture not found");
const account = attachLicensedAccount.toString().replace("window.localStorage = { getItem: () => null, setItem() {} };", "");
await writeFile("dist/after-effects-cep/client/emulsion-qa-host.js", body.replace("$" + "{account}", account));
await writeFile("dist/after-effects-cep/client/emulsion-qa.html", '<!doctype html><html data-host="after-effects" lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emulsion — browser QA (simulated host)</title><link rel="stylesheet" href="../styles/theme.css"></head><body data-host="after-effects"><div id="root"></div><script src="emulsion-qa-host.js"></script><script src="main.js"></script></body></html>');
console.log("Browser-only fixture: /after-effects-cep/client/emulsion-qa.html");
