import {buildExtendScript} from './build-extendscript.mjs';
import {fileURLToPath} from 'node:url';
console.log(JSON.stringify(await buildExtendScript(fileURLToPath(new URL('../dist/after-effects-cep/host/index.jsx',import.meta.url)))));
