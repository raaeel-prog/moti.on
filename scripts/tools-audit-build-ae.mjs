import {buildExtendScript} from './build-extendscript.mjs';
import {buildAeClient} from './build-client.mjs';
import {fileURLToPath} from 'node:url';
console.log(JSON.stringify({host:await buildExtendScript(fileURLToPath(new URL('../dist/after-effects-cep/host/index.jsx',import.meta.url))),client:await buildAeClient(fileURLToPath(new URL('../dist/after-effects-cep/client/main.js',import.meta.url)))}));
