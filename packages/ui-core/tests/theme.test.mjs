import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/theme.css", import.meta.url), "utf8");

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex) {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function colorToken(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `token --${name} precisa existir`);
  return match[1];
}

test("root e shell permitem que somente o conteudo role em painel baixo", () => {
  assert.match(css, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(css, /\.ch-shell\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(css, /\.ch-content\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.ch-header,[^}]*\.ch-status\s*\{[^}]*flex:\s*0 0 auto;/s);
});

test("foco tem fallback seguro e respeita focus-visible", () => {
  assert.match(css, /\.ch-nav__item:focus\s*\{/);
  assert.match(css, /\.ch-nav__item:focus-visible\s*\{/);
  assert.match(css, /\.ch-nav__item:focus:not\(:focus-visible\)\s*\{/);
  assert.match(css, /\.ch-button:focus\s*\{/);
  assert.match(css, /\.ch-button:focus-visible\s*\{/);
});

test("movimento reduzido encurta a duracao na raiz, cobrindo toda transicao", () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{[^}]*--ch-motion-fast:\s*1ms;/s);
  assert.match(css, /\[data-reduced-motion="true"\]\s*\{[^}]*--ch-motion-fast:\s*1ms;/s);

  // A regra so vale se ninguem cronometrar transicao fora do token: um
  // "transition: ... 90ms" literal escaparia do bloco acima sem barulho.
  const declaracoes = css.match(/transition:[^;]+;/g) ?? [];
  assert.ok(declaracoes.length > 0, "o painel tem transicoes a governar");
  for (const declaracao of declaracoes) {
    assert.ok(
      declaracao.includes("var(--ch-motion-fast)"),
      `transicao fora do token escapa do movimento reduzido: ${declaracao}`
    );
  }
});

test("texto muted mantem contraste AA nas duas superficies base", () => {
  const muted = colorToken("ch-text-muted");
  const canvas = colorToken("ch-surface-canvas");
  const panel = colorToken("ch-surface-panel");

  assert.ok(contrast(muted, canvas) >= 4.5, "muted precisa atingir 4.5:1 no canvas");
  assert.ok(contrast(muted, panel) >= 4.5, "muted precisa atingir 4.5:1 no painel");
});

/**
 * Contraste da paleta inteira, e nao so do texto secundario.
 *
 * A §22.4 pede contraste e pede que a cor nao carregue sozinha o significado.
 * As cores semanticas sao justamente as que carregam estado, entao sao as que
 * mais precisam ser legiveis — e nunca tinham sido medidas.
 */
const SUPERFICIES = [
  "ch-surface-canvas",
  "ch-surface-panel",
  "ch-surface-raised",
  "ch-surface-control"
];

test("todo texto do painel atinge AA sobre qualquer superficie em que pousa", () => {
  for (const texto of ["ch-text-primary", "ch-text-secondary", "ch-text-muted"]) {
    for (const superficie of SUPERFICIES) {
      const medido = contrast(colorToken(texto), colorToken(superficie));
      assert.ok(
        medido >= 4.5,
        `--${texto} sobre --${superficie} deu ${medido.toFixed(2)}:1, abaixo de 4.5:1`
      );
    }
  }
});

test("as cores de estado sao legiveis, porque o estado nao pode viver so na cor", () => {
  for (const estado of ["ch-danger", "ch-warning", "ch-info", "ch-success"]) {
    for (const superficie of SUPERFICIES) {
      const medido = contrast(colorToken(estado), colorToken(superficie));
      assert.ok(
        medido >= 4.5,
        `--${estado} sobre --${superficie} deu ${medido.toFixed(2)}:1, abaixo de 4.5:1`
      );
    }
  }
});

test("o rotulo do botao primario e legivel sobre o proprio acento", () => {
  for (const fundo of ["ch-accent", "ch-accent-hover", "ch-accent-pressed"]) {
    const medido = contrast(colorToken("ch-accent-contrast"), colorToken(fundo));
    assert.ok(medido >= 4.5, `texto do botao sobre --${fundo} deu ${medido.toFixed(2)}:1`);
  }
});

test("o anel de foco se destaca da superficie que ele contorna", () => {
  // 1.4.11: componente nao textual pede 3:1. Um anel de foco invisivel e a
  // navegacao por teclado funcionando as cegas.
  for (const superficie of SUPERFICIES) {
    const medido = contrast(colorToken("ch-border-focus"), colorToken(superficie));
    assert.ok(
      medido >= 3,
      `anel de foco sobre --${superficie} deu ${medido.toFixed(2)}:1, abaixo de 3:1`
    );
  }
});
