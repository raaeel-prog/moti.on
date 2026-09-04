import test from "node:test";
import assert from "node:assert/strict";

import { createI18n } from "../dist/i18n.js";
import {
  button,
  syncToolGridRoving,
  toolGrid,
  toolTile,
  createShell,
  logLine,
  notice,
  propertyRow,
  resolveWidthClass,
  COMPACT_MAX,
  DEFAULT_MAX,
  COMFORT_MAX
} from "../dist/shell.js";

import { createFakeDocument, createFakeWindow } from "./fake-dom.mjs";

const VIEWS = [
  { id: "context", labelKey: "nav.context", titleKey: "view.context.title" },
  { id: "system", labelKey: "nav.system", titleKey: "view.system.title" },
  { id: "diagnostics", labelKey: "nav.diagnostics", titleKey: "view.diagnostics.title" }
];

function montar({ document: doc = createFakeDocument(), initialWidth = 360, onRender } = {}) {
  const mount = doc.createElement("div");
  const renderizadas = [];

  const shell = createShell({
    mount,
    document: doc,
    i18n: createI18n({ locale: "pt-BR" }),
    subtitleKey: "app.subtitle.afterEffects",
    views: VIEWS,
    initialWidth,
    onRender:
      onRender ??
      ((viewId, regions) => {
        renderizadas.push(viewId);
        regions.content.appendChild(propertyRow(doc, "Versão", "26.3x87"));
        regions.actions.appendChild(button(doc, { label: "Atualizar", variant: "primary" }));
      })
  });

  const raiz = mount.children[0];
  return {
    shell,
    doc,
    mount,
    renderizadas,
    raiz,
    header: raiz.children[0],
    nav: raiz.children[1],
    viewTitle: raiz.children[2],
    content: raiz.children[3],
    actions: raiz.children[4],
    status: raiz.children[5]
  };
}

test("as quatro faixas de acoplamento do Addendum A caem nas classes certas", () => {
  // As fronteiras sao testadas nos dois lados de cada uma, porque foi
  // exatamente ali que a versao anterior errava: ela punha 340 px em "compact"
  // e 560 px em "wide". Um teste que so amostrasse o meio de cada faixa teria
  // concordado com as fronteiras erradas.
  assert.equal(resolveWidthClass(280), "compact", "minimo suportado");
  assert.equal(resolveWidthClass(339), "compact", "ultimo pixel de Compact");

  assert.equal(resolveWidthClass(340), "default", "primeiro pixel de Default");
  assert.equal(resolveWidthClass(479), "default", "ultimo pixel de Default");

  assert.equal(resolveWidthClass(480), "comfort", "primeiro pixel de Comfort");
  assert.equal(resolveWidthClass(719), "comfort", "ultimo pixel de Comfort");

  assert.equal(resolveWidthClass(720), "wide", "primeiro pixel de Wide");
  assert.equal(resolveWidthClass(1200), "wide");
});

test("as fronteiras das faixas sao as do Addendum A, e nao numeros soltos no codigo", () => {
  // Prende as constantes exportadas a tabela normativa: Compact 280–339,
  // Default 340–479, Comfort 480–719, Wide 720+.
  assert.equal(COMPACT_MAX, 339);
  assert.equal(DEFAULT_MAX, 479);
  assert.equal(COMFORT_MAX, 719);
});

test("a classe de largura vira modificador de CSS e atributo no shell", () => {
  // O CSS estiliza por `.ch-shell--<classe>`; uma classe nova que nao chegasse
  // ao DOM deixaria o painel com o layout da faixa anterior, sem erro nenhum.
  const { shell, raiz } = montar();
  for (const [largura, esperada] of [
    [300, "compact"],
    [400, "default"],
    [600, "comfort"],
    [900, "wide"]
  ]) {
    shell.setWidth(largura);
    assert.equal(shell.widthClass(), esperada, `${largura} px`);
    assert.equal(raiz.className, `ch-shell ch-shell--${esperada}`, `${largura} px`);
    assert.equal(raiz.getAttribute("data-width-class"), esperada, `${largura} px`);
  }
});

test("largura ausente cai no modo compacto, e nao no mais largo", () => {
  // Errar para o lado estreito degrada o espacamento; errar para o largo produz
  // rolagem horizontal, que a §22.3 proibe.
  assert.equal(resolveWidthClass(0), "compact");
  assert.equal(resolveWidthClass(undefined), "compact");
});

test("o primeiro render ja recebe um shell utilizavel", () => {
  // Regressao encontrada em host real: createShell chama onRender antes de
  // retornar, e um callback que dependesse da variavel de retorno lia null. A
  // excecao derrubava a inicializacao inteira com o shell ja visivel na tela —
  // painel montado, nenhum botao respondendo.
  const observado = [];

  montar({
    onRender: (viewId, regions) => {
      observado.push({
        temShell: Boolean(regions.shell),
        botoesJaMontados: regions.shell.element().getElementsByTagName("button").length
      });
      regions.shell.setStatus("ok", "ok");
    }
  });

  assert.equal(observado.length, 1);
  assert.equal(observado[0].temShell, true);
  assert.equal(observado[0].botoesJaMontados, 3, "a navegacao ja existe no primeiro render");
});

test("monta cabecalho, navegacao, titulo, conteudo, acoes e status nessa ordem", () => {
  const { raiz, mount } = montar();

  assert.equal(mount.children.length, 1);
  assert.deepEqual(
    raiz.children.map((child) => child.className),
    ["ch-header", "ch-nav", "ch-view-title", "ch-content", "ch-actions", "ch-status"]
  );
});

test("a primeira aba comeca ativa, e apenas ela", () => {
  const { shell, nav } = montar();

  assert.equal(shell.activeView(), "context");
  assert.equal(nav.children[0].className, "ch-nav__item is-active");
  assert.equal(nav.children[0].getAttribute("aria-selected"), "true");
  assert.equal(nav.children[0].getAttribute("tabindex"), "0");
  assert.equal(nav.children[1].getAttribute("aria-selected"), "false");
  assert.equal(nav.children[1].getAttribute("tabindex"), "-1");
});

test("abas e painel declaram os relacionamentos ARIA completos", () => {
  const { shell, nav, content } = montar();
  const panelId = content.getAttribute("id");

  assert.ok(panelId);
  nav.children.forEach((item) => {
    assert.ok(item.getAttribute("id"));
    assert.equal(item.getAttribute("aria-controls"), panelId);
  });
  assert.equal(content.getAttribute("role"), "tabpanel");
  assert.equal(content.getAttribute("aria-labelledby"), nav.children[0].getAttribute("id"));

  shell.navigate("system");
  assert.equal(content.getAttribute("aria-labelledby"), nav.children[1].getAttribute("id"));
  assert.equal(nav.children[0].getAttribute("tabindex"), "-1");
  assert.equal(nav.children[1].getAttribute("tabindex"), "0");
});

test("clicar numa aba troca a view e redesenha", () => {
  const { shell, nav, renderizadas, viewTitle } = montar();

  nav.children[2].click();

  assert.equal(shell.activeView(), "diagnostics");
  assert.deepEqual(renderizadas, ["context", "diagnostics"]);
  assert.equal(viewTitle.textContent, "Diagnóstico da sessão");
  assert.equal(nav.children[0].className, "ch-nav__item");
});

test("clicar na aba ja ativa nao redesenha", () => {
  const { nav, renderizadas } = montar();

  nav.children[0].click();

  assert.deepEqual(renderizadas, ["context"]);
});

test("teclado percorre abas, da a volta e move o foco", () => {
  const { shell, doc, nav, renderizadas } = montar();

  const direita = nav.children[0].keydown("ArrowRight");
  assert.equal(direita.defaultPrevented, true);
  assert.equal(shell.activeView(), "system");
  assert.equal(doc.activeElement, nav.children[1]);

  nav.children[1].keydown("End");
  assert.equal(shell.activeView(), "diagnostics");
  assert.equal(doc.activeElement, nav.children[2]);

  nav.children[2].keydown("ArrowRight");
  assert.equal(shell.activeView(), "context", "ArrowRight deve dar a volta");
  assert.equal(doc.activeElement, nav.children[0]);

  nav.children[0].keydown("ArrowLeft");
  assert.equal(shell.activeView(), "diagnostics", "ArrowLeft deve dar a volta");

  nav.children[2].keydown("Home");
  assert.equal(shell.activeView(), "context");
  assert.deepEqual(renderizadas, ["context", "system", "diagnostics", "context", "diagnostics", "context"]);
});

test("tecla alheia ao padrao de abas nao e interceptada", () => {
  const { shell, doc, nav, renderizadas } = montar();

  const evento = nav.children[0].keydown("PageDown");

  assert.equal(evento.defaultPrevented, false);
  assert.equal(shell.activeView(), "context");
  assert.equal(doc.activeElement, null);
  assert.deepEqual(renderizadas, ["context"]);
});

test("navegacao rejeita identificador desconhecido sem apagar a tela", () => {
  const { shell, content, renderizadas, viewTitle } = montar();
  const textoAntes = content.allText;
  const tituloAntes = viewTitle.textContent;

  shell.navigate("view-that-does-not-exist");

  assert.equal(shell.activeView(), "context");
  assert.equal(content.allText, textoAntes);
  assert.equal(viewTitle.textContent, tituloAntes);
  assert.deepEqual(renderizadas, ["context"]);
});

test("cada redesenho limpa conteudo e acoes antes de reconstruir", () => {
  const { shell, content, actions } = montar();

  shell.rerender();
  shell.rerender();

  assert.equal(content.children.length, 1, "conteudo nao pode acumular nos");
  assert.equal(actions.children.length, 1, "acoes nao podem acumular botoes");
});

test("a classe de largura acompanha o redimensionamento do painel", () => {
  const { shell } = montar({ initialWidth: 720 });

  assert.equal(shell.widthClass(), "wide");
  assert.equal(shell.element().className, "ch-shell ch-shell--wide");

  shell.setWidth(300);

  assert.equal(shell.widthClass(), "compact");
  assert.equal(shell.element().getAttribute("data-width-class"), "compact");
});

test("observeWidth aplica a largura e devolve o cancelador do listener", () => {
  // Arrange
  const doc = createFakeDocument({ clientWidth: 280 });
  const janela = createFakeWindow(280);
  const { shell } = montar({ document: doc, initialWidth: 720 });

  // Act
  const cancelar = shell.observeWidth(janela);

  // Assert
  assert.equal(shell.widthClass(), "compact", "aplica na hora, sem esperar um resize");
  assert.equal(janela.listenerCount("resize"), 1);

  doc.documentElement.clientWidth = 600;
  janela.emit("resize");
  // 600 px e Comfort no Addendum A; a versao anterior deste teste esperava
  // "wide" porque o codigo comecava Wide em 560, e nao em 720.
  assert.equal(shell.widthClass(), "comfort");

  cancelar();
  assert.equal(janela.listenerCount("resize"), 0, "o ciclo de vida precisa poder soltar o listener");
});

test("todo item de navegacao tem nome acessivel, mesmo com o rotulo oculto", () => {
  // No modo compacto o CSS esconde .ch-nav__label; o nome nao pode sumir junto.
  const { nav } = montar();

  nav.children.forEach((item) => {
    assert.equal(item.getAttribute("role"), "tab");
    assert.ok(item.getAttribute("title"));
    assert.equal(item.getAttribute("aria-label"), item.getAttribute("title"));
  });
});

test("os icones viram glifos textuais distintos quando o runtime nao expoe createElementNS", () => {
  // O UXP nao garante SVG inline, e tres botoes sem marcador visual em modo
  // compacto seriam indistinguiveis.
  const { nav } = montar({ document: createFakeDocument({ supportsNamespaces: false }) });

  const glifos = nav.children.map((item) => item.children[0]);

  glifos.forEach((glifo) => {
    assert.equal(glifo.className, "ch-nav__glyph");
    assert.ok(glifo.textContent);
    assert.equal(glifo.getAttribute("aria-hidden"), "true");
  });
  assert.equal(new Set(glifos.map((glifo) => glifo.textContent)).size, VIEWS.length);
});

test("o icone usa SVG decorativo quando o runtime suporta", () => {
  const { nav } = montar();
  const icone = nav.children[0].children[0];

  assert.equal(icone.tagName, "svg");
  assert.equal(icone.getAttribute("aria-hidden"), "true", "o nome acessivel vem do botao");
  assert.equal(icone.children[0].getAttribute("stroke"), "currentColor");
});

test("status atualiza texto e estado do indicador", () => {
  const { shell, status } = montar();

  shell.setStatus("Conectado", "ok");

  assert.equal(status.children[0].className, "ch-status__dot is-ok");
  assert.equal(status.children[1].textContent, "Conectado");
  assert.equal(status.getAttribute("title"), "Conectado");
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(shell.element().getAttribute("aria-busy"), "false");

  shell.setStatus("Atualizando contexto e capacidades", "busy");
  assert.equal(status.getAttribute("title"), "Atualizando contexto e capacidades");
  assert.equal(shell.element().getAttribute("aria-busy"), "true");
});

test("linha de propriedade expoe o valor inteiro no tooltip", () => {
  // A coluna trunca com reticencias em painel estreito; sem o title, o resto do
  // caminho seria informacao perdida.
  const doc = createFakeDocument();
  const row = propertyRow(doc, "Caminho", "C:/projetos/campanha.aep");

  assert.equal(row.children[0].textContent, "Caminho");
  assert.equal(row.children[1].getAttribute("title"), "C:/projetos/campanha.aep");
});

test("linha de propriedade marca o estado por classe, e nao so por cor", () => {
  const doc = createFakeDocument();

  assert.equal(propertyRow(doc, "a", "b", "ok").className, "ch-row ch-row--ok");
  assert.equal(propertyRow(doc, "a", "b", "unknown").className, "ch-row ch-row--unknown");
  assert.equal(propertyRow(doc, "a", "b").className, "ch-row");
});

test("botao desabilitado carrega o motivo no tooltip", () => {
  const doc = createFakeDocument();
  const node = button(doc, {
    label: "Criar composição de teste",
    disabled: true,
    disabledReason: "Requer um projeto aberto."
  });

  assert.equal(node.disabled, true);
  assert.equal(node.title, "Requer um projeto aberto.");
  assert.equal(node.getAttribute("aria-disabled"), "true");
});

test("botao sem title explicito cai no proprio rotulo", () => {
  const doc = createFakeDocument();

  assert.equal(button(doc, { label: "Atualizar" }).title, "Atualizar");
});

test("aviso de erro interrompe o leitor de tela; os demais esperam", () => {
  const doc = createFakeDocument();

  assert.equal(notice(doc, "Falhou.", "error").getAttribute("role"), "alert");
  assert.equal(notice(doc, "Pronto.").getAttribute("role"), "status");
  assert.equal(notice(doc, "Atenção.", "warning").className, "ch-notice ch-notice--warning");
});

test("linha de log marca nivel por classe", () => {
  const doc = createFakeDocument();

  assert.equal(logLine(doc, "x").className, "ch-log");
  assert.equal(logLine(doc, "x", "error").className, "ch-log ch-log--error");
  assert.equal(logLine(doc, "x", "warn").className, "ch-log ch-log--warn");
});

test("o shell nao usa innerHTML em lugar nenhum", async () => {
  // O UXP nao implementa innerHTML por completo, e usa-lo abriria uma via de
  // injecao de markup onde hoje nao existe nenhuma.
  //
  // A varredura roda sobre o codigo SEM comentarios: o proprio shell documenta
  // esta regra em prosa, e uma busca crua acusaria a documentacao dela.
  const { readFile } = await import("node:fs/promises");
  const { stripCommentsAndStrings } = await import("../../../scripts/check-extendscript.mjs");
  const source = await readFile(new URL("../src/shell.ts", import.meta.url), "utf8");
  const code = stripCommentsAndStrings(source);

  assert.ok(!code.includes("innerHTML"));
  assert.ok(!code.includes("insertAdjacentHTML"));
});

test("o ladrilho de ferramenta mantem rotulo textual, e nao so icone", () => {
  // Icone sozinho exigiria que a pessoa decorasse a iconografia para achar a
  // ferramenta. O rotulo nao some em nenhuma largura.
  const doc = createFakeDocument();
  const tile = toolTile(doc, {
    id: "wiggle",
    label: "Wiggle",
    description: "Oscila a propriedade com semente reproduzível.",
    onSelect: () => {}
  });

  assert.equal(tile.className, "ch-tool");
  assert.equal(tile.getAttribute("type"), "button");
  assert.equal(tile.getAttribute("data-motion"), "tile-hover tile-press");
  assert.equal(tile.title, "Oscila a propriedade com semente reproduzível.");

  const rotulo = tile.children.find((filho) => filho.className === "ch-tool__label");
  assert.ok(rotulo, "o ladrilho precisa de rótulo textual");
  assert.equal(rotulo.textContent, "Wiggle");
});

test("o ladrilho sem descricao cai no proprio rotulo como tooltip", () => {
  const doc = createFakeDocument();
  const tile = toolTile(doc, { id: "smooth", label: "Smooth", onSelect: () => {} });

  assert.equal(tile.title, "Smooth");
});

test("selecionar um ladrilho dispara a escolha uma unica vez", () => {
  const doc = createFakeDocument();
  const escolhas = [];
  const tile = toolTile(doc, {
    id: "flicker",
    label: "Flicker",
    onSelect: () => escolhas.push("flicker")
  });

  tile.click();

  assert.deepEqual(escolhas, ["flicker"]);
});

test("a grade expoe lista e itens para leitor de tela", () => {
  const doc = createFakeDocument();
  const ids = ["loopOut", "smooth", "wiggle", "flicker"];
  const grade = toolGrid(
    doc,
    ids.map((id) => toolTile(doc, { id, label: id, onSelect: () => {} }))
  );

  assert.equal(grade.className, "ch-tool-grid");
  assert.equal(grade.getAttribute("role"), "list");
  assert.equal(grade.children.length, ids.length);

  grade.children.forEach((item) => {
    assert.equal(item.className, "ch-tool-grid__item");
    assert.equal(item.getAttribute("role"), "listitem");
    assert.equal(item.children[0].className, "ch-tool");
  });
});

test("a grade vazia continua sendo uma lista valida", () => {
  // Um registro de ferramentas filtrado por capacidade pode chegar vazio; a
  // grade nao pode quebrar por isso.
  const grade = toolGrid(createFakeDocument(), []);

  assert.equal(grade.children.length, 0);
  assert.equal(grade.getAttribute("role"), "list");
});

test("setViewTitle troca o titulo da view, e o redesenho o devolve", () => {
  // Com uma ferramenta aberta, o titulo precisa ser o nome dela: deixa-lo em
  // "Ferramentas" obrigaria a pessoa a voltar a grade para lembrar onde esta.
  const { shell, viewTitle } = montar();

  assert.equal(viewTitle.textContent, "Contexto do projeto");

  shell.setViewTitle("Wiggle");
  assert.equal(viewTitle.textContent, "Wiggle");

  shell.rerender();
  assert.equal(
    viewTitle.textContent,
    "Contexto do projeto",
    "o titulo declarado pela view volta no proximo redesenho"
  );
});

test("toda view e ferramenta do painel tem icone proprio", () => {
  // O marcador "?" e o fallback de id sem icone. Ele chegou a aparecer na aba
  // Ferramentas em host real: o gate nao pegava porque nada testava cobertura
  // de icone. Os ids abaixo sao os que os paineis realmente usam.
  const doc = createFakeDocument({ supportsNamespaces: false });
  const ids = ["context", "tools", "system", "diagnostics", "settings", "loopOut", "smooth", "wiggle", "flicker"];

  const semIcone = ids.filter((id) => {
    const tile = toolTile(doc, { id, label: id, onSelect: () => {} });
    const glifo = tile.children[0].children[0];
    return glifo.textContent === "?";
  });

  assert.deepEqual(semIcone, [], "id sem icone cai no marcador de interrogacao");
});

/**
 * `rerender` descarta a subarvore de conteudo inteira e a reconstroi. O nodo
 * focado vai junto, e sem restauracao o foco cai fora do painel a cada
 * confirmacao de campo — o que torna a grade 3x3 inutilizavel pelas setas,
 * porque cada tecla exigiria um Tab de volta.
 */
test("o foco sobrevive ao redesenho, no controle equivalente do nodo novo", () => {
  const doc = createFakeDocument();
  const construidos = [];
  const { shell } = montar({
    document: doc,
    onRender: (_viewId, regions) => {
      const celula = doc.createElement("button");
      celula.setAttribute("data-focus-key", "anchor-cell-center");
      construidos.push(celula);
      regions.content.appendChild(celula);
    }
  });

  construidos[0].focus();
  assert.equal(construidos.length, 1);

  shell.rerender();

  assert.equal(construidos.length, 2, "o redesenho constroi um nodo novo");
  assert.equal(doc.activeElement, construidos[1], "o foco migra para o nodo novo");
  assert.notEqual(doc.activeElement, construidos[0], "o nodo velho foi descartado");
});

test("o redesenho nao rouba o foco de quem esta fora do conteudo", () => {
  const doc = createFakeDocument();
  const { raiz, shell } = montar({ document: doc });

  const aba = raiz.getElementsByTagName("button").find((n) => n.getAttribute("role") === "tab");
  aba.focus();

  shell.rerender();

  assert.equal(doc.activeElement, aba, "o foco na navegacao nao pertence ao conteudo");
});

/** Grade com N ladrilhos rotulados A, B, C... */
function gradeDeFerramentas(doc, quantidade) {
  const rotulos = Array.from({ length: quantidade }, (_, i) => String.fromCharCode(65 + i));
  const grade = toolGrid(
    doc,
    rotulos.map((rotulo) => toolTile(doc, { id: "ease", label: rotulo, onSelect: () => {} }))
  );
  const tiles = Array.from(grade.children).map((celula) => celula.children[0]);
  return { grade, tiles, rotulos };
}

const tabIndices = (tiles) => tiles.map((t) => t.getAttribute("tabindex"));

test("a grade e uma unica parada de Tab, e nao uma por ferramenta", () => {
  // Com 49 ferramentas, uma parada por ladrilho custaria 49 tabuladas para
  // alcancar o que vem depois da grade.
  const doc = createFakeDocument();
  const { tiles } = gradeDeFerramentas(doc, 4);

  assert.deepEqual(tabIndices(tiles), ["0", "-1", "-1", "-1"]);
});

test("setas andam na ordem de leitura e Home/End vao as pontas", () => {
  const doc = createFakeDocument();
  const { tiles } = gradeDeFerramentas(doc, 4);

  tiles[0].keydown("ArrowRight");
  assert.equal(doc.activeElement, tiles[1]);
  assert.deepEqual(tabIndices(tiles), ["-1", "0", "-1", "-1"], "a ancora acompanha o foco");

  tiles[1].keydown("ArrowLeft");
  assert.equal(doc.activeElement, tiles[0]);

  tiles[0].keydown("End");
  assert.equal(doc.activeElement, tiles[3]);

  tiles[3].keydown("Home");
  assert.equal(doc.activeElement, tiles[0]);
});

test("as pontas nao dao a volta: a grade nao e um carrossel", () => {
  const doc = createFakeDocument();
  const { tiles } = gradeDeFerramentas(doc, 3);

  tiles[0].keydown("ArrowLeft");
  assert.equal(doc.activeElement, tiles[0], "esquerda no primeiro fica no primeiro");

  tiles[2].focus();
  tiles[2].keydown("ArrowRight");
  assert.equal(doc.activeElement, tiles[2], "direita no ultimo fica no ultimo");
});

test("tecla alheia ao contrato nao e interceptada pela grade", () => {
  const doc = createFakeDocument();
  const { tiles } = gradeDeFerramentas(doc, 3);

  const evento = tiles[0].keydown("ArrowDown");
  // ArrowDown fica com o navegador de proposito: o numero de colunas e decidido
  // pelo refluxo do CSS, e o DOM nao o conhece.
  assert.notEqual(evento.defaultPrevented, true);
  assert.equal(doc.activeElement, null);
});

test("o filtro nao pode tirar a grade da ordem de Tab", () => {
  // O caso que so existe por causa da busca: esconder o ladrilho que carrega
  // `tabindex="0"` deixaria todos os visiveis em `-1`, e o unico alcancavel
  // escondido — a grade inteira sairia do Tab.
  const doc = createFakeDocument();
  const { grade, tiles } = gradeDeFerramentas(doc, 4);

  grade.children[0].hidden = true;
  grade.children[1].hidden = true;
  syncToolGridRoving(grade);

  assert.equal(tiles[2].getAttribute("tabindex"), "0", "a ancora foi para o primeiro visivel");
  assert.equal(tiles[3].getAttribute("tabindex"), "-1");
});

test("as setas pulam o que o filtro escondeu", () => {
  const doc = createFakeDocument();
  const { grade, tiles } = gradeDeFerramentas(doc, 4);

  grade.children[1].hidden = true;
  syncToolGridRoving(grade);

  tiles[0].keydown("ArrowRight");
  assert.equal(doc.activeElement, tiles[2], "o ladrilho escondido nao pode receber foco");
});
