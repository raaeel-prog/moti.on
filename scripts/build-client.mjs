/**
 * Empacota o cliente do painel.
 *
 * O painel precisa do codigo de packages/ — o encoder de evalScript, os
 * descriptors, o cliente de comandos. Nenhum dos dois runtimes carrega modulos
 * ESM de node_modules por conta propria, entao os imports precisam ser
 * resolvidos antes de chegar la.
 *
 * Isto NAO e "adicionar um bundler porque projetos tem bundler". A alternativa
 * seria reimplementar o escape do evalScript dentro do painel, e uma segunda
 * copia da unica funcao que impede injecao de codigo no host e exatamente o tipo
 * de duplicacao que este projeto nao pode ter.
 */
import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

/**
 * Alvo do Chromium embutido do CEP 12.
 *
 * O CEP 12 nao usa o Chromium do sistema: ele embute uma versao propria, mais
 * antiga que a do navegador da maquina. Compilar para um alvo moderno demais
 * produz um painel que abre em branco dentro do After Effects sem nenhuma
 * mensagem util.
 *
 * ATENCAO: a versao exata do Chromium embutido no CEP 12 NAO foi verificada
 * contra documentacao da Adobe. `chrome88` e um limite conservador escolhido por
 * seguranca. Confirmar antes do release esta em docs/HOST_LIMITATIONS.md.
 */
const CEP_CHROMIUM_TARGET = "chrome88";

export async function buildAeClient(outputPath) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, "apps", "after-effects-cep", "client", "src", "main.ts")],
    outfile: outputPath,
    bundle: true,
    // IIFE, nao ESM: o painel carrega por <script src>, e o CEP nao serve
    // modulos com o MIME type que o navegador exige.
    format: "iife",
    target: [CEP_CHROMIUM_TARGET],
    platform: "browser",
    // CSInterface e carregado por <script> antes do bundle e vive no global. Ele
    // e codigo de terceiros distribuido pela Adobe e nao entra no bundle: manter
    // separado permite comparar com o arquivo oficial.
    external: [],
    legalComments: "none",
    // Sem minificacao: o bundle vai dentro de uma extensao instalada, nao
    // trafega pela rede, e minificar so dificultaria diagnosticar um problema
    // relatado por um usuario.
    minify: false,
    sourcemap: false,
    logLevel: "warning",
    metafile: true
  });

  const outputs = Object.values(result.metafile.outputs);
  return { bytes: outputs[0]?.bytes ?? 0 };
}

/**
 * Empacota o painel do Premiere.
 *
 * Formato CommonJS, e nao IIFE: o UXP carrega o entry point do painel por
 * `require`, e o proprio codigo usa `require("premierepro")` e `require("uxp")`.
 * Esses dois sao fornecidos pelo runtime do Premiere e precisam ficar EXTERNOS —
 * empacota-los faria o esbuild tentar resolve-los em node_modules e o build
 * falharia, ou pior, embutiria um stub vazio.
 */
export async function buildPremiereClient(outputPath) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, "apps", "premiere-uxp", "client", "src", "main.ts")],
    outfile: outputPath,
    bundle: true,
    format: "cjs",
    platform: "neutral",
    target: ["es2020"],
    external: ["premierepro", "uxp", "fs", "os", "path"],
    legalComments: "none",
    minify: false,
    sourcemap: false,
    logLevel: "warning",
    metafile: true
  });

  const outputs = Object.values(result.metafile.outputs);
  return { bytes: outputs[0]?.bytes ?? 0 };
}
