/**
 * Navegador de ferramentas: busca, agrupamento por categoria e teclado.
 *
 * ## Por que é um componente, e não um trecho de `main.ts`
 *
 * Ele nasceu dentro do painel do After Effects. Lá, o único jeito de testá-lo
 * era ler o próprio código-fonte com expressão regular, porque `main.ts` monta
 * o shell no import e não pode ser carregado por um teste. Testes assim provam
 * que uma linha existe, e não que ela faz a coisa certa: nenhum deles pegaria
 * "o filtro escondeu o ladrilho errado" ou "a contagem está um a menos".
 *
 * Aqui ele recebe tudo por parâmetro — textos já traduzidos, itens já
 * ordenados, callbacks — e devolve DOM. Isso o torna verificável de verdade e
 * o deixa disponível para o painel do Premiere, que tem o mesmo problema de
 * catálogo grande.
 *
 * ## O filtro não redesenha
 *
 * `aplicarFiltro` mexe apenas na visibilidade dos ladrilhos já montados. Um
 * redesenho a cada tecla recriaria o campo de busca e o foco morreria no meio
 * da digitação — o painel ficaria digitável uma letra por vez.
 */
import {
  createElement,
  notice,
  searchField,
  sectionTitle,
  syncToolGridRoving,
  toolGrid,
  toolTile
} from "./shell.js";

export interface ToolBrowserItem {
  /** Precisa bater com uma chave de ícone do shell. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Precisa ser uma das `categories` declaradas. */
  readonly category: string;
  /**
   * Motivo de o ladrilho estar indisponivel agora, ja traduzido. Ausente
   * significa disponivel.
   */
  readonly disabledReason?: string;
  /**
   * Complemento do tooltip, ja traduzido. Nao entra na busca: `texto` continua
   * sendo montado so com nome e descricao.
   */
  readonly hint?: string;
}

export interface ToolBrowserTexts {
  readonly searchLabel: string;
  readonly searchPlaceholder?: string;
  readonly empty: string;
  /** Rótulo da categoria, já traduzido. */
  categoryName(category: string): string;
  /** Resumo do filtro; só aparece com busca ativa. */
  count(visible: number, total: number): string;
}

export interface ToolBrowserOptions {
  readonly items: readonly ToolBrowserItem[];
  /** Ordem das seções na tela. */
  readonly categories: readonly string[];
  readonly texts: ToolBrowserTexts;
  /**
   * Prefixo dos ids do DOM. Só precisa mudar se dois navegadores coexistirem
   * na mesma tela: o id vira o `for` do rótulo do campo de busca, e dois
   * rótulos apontando para o mesmo id fazem o leitor de tela anunciar o campo
   * errado.
   */
  readonly idPrefix?: string;
  /** Consulta inicial, para o filtro sobreviver a um redesenho da tela. */
  readonly query?: string;
  readonly favorites?: readonly string[];
  favoriteLabel?(id: string, active: boolean): string;
  configureLabel?(id: string): string;
  onToggleFavorite?(id: string): void;
  onQueryChange?(query: string): void;
  onSelect(id: string, intent: { alt: boolean }): void;
}

export interface ToolBrowser {
  /** Nós a acrescentar na região de conteúdo, na ordem. */
  readonly nodes: readonly HTMLElement[];
  /** Reaplica o filtro. Exposto para teste e para redesenhos externos. */
  applyQuery(query: string): void;
  /** Quantos ladrilhos estão visíveis agora. */
  visibleCount(): number;
}

interface Secao {
  titulo: HTMLElement;
  grade: HTMLElement;
  itens: { celula: HTMLElement | undefined; texto: string }[];
}

export function createToolBrowser(doc: Document, options: ToolBrowserOptions): ToolBrowser {
  const secoes: Secao[] = options.categories.map((categoria) => {
    const daCategoria = options.items.filter((item) => item.category === categoria);

    const grade = toolGrid(
      doc,
      daCategoria.map((item) =>
        toolTile(doc, {
          id: item.id,
          label: item.name,
          description: item.description,
          ...(item.disabledReason ? { disabledReason: item.disabledReason } : {}),
          ...(item.hint ? { hint: item.hint } : {}),
          onSelect: (intent) => options.onSelect(item.id, intent)
        })
      )
    );

    // As células vêm da própria `toolGrid`, e não de uma montagem paralela: a
    // classe e o `role=listitem` pertencem à primitiva, e uma segunda cópia
    // sairia de sincronia na primeira mudança.
    const celulas = Array.from(grade.children) as HTMLElement[];
    daCategoria.forEach((item, index) => {
      const cell = celulas[index];
      if (!cell || !options.onToggleFavorite || !options.favoriteLabel) return;
      cell.className += " ch-tool-grid__item--actions";
      const actions = createElement(doc, "div", "ch-tool-actions");
      const favorite = createElement(doc, "button", "ch-tool-action") as HTMLButtonElement;
      const active = options.favorites?.includes(item.id) ?? false;
      favorite.id = `${options.idPrefix ?? "tools"}-favorite-${item.id}`;
      favorite.setAttribute("type", "button");
      favorite.setAttribute("aria-pressed", String(active));
      favorite.setAttribute("aria-label", options.favoriteLabel(item.id, active));
      favorite.title = options.favoriteLabel(item.id, active);
      favorite.textContent = active ? "★" : "☆";
      favorite.addEventListener("click", () => options.onToggleFavorite?.(item.id));
      actions.appendChild(favorite);
      if (options.configureLabel) {
        const configure = createElement(doc, "button", "ch-tool-action") as HTMLButtonElement;
        configure.setAttribute("type", "button");
        configure.setAttribute("aria-label", options.configureLabel(item.id));
        configure.title = options.configureLabel(item.id);
        configure.textContent = "⋯";
        configure.addEventListener("click", () => options.onSelect(item.id, { alt: true }));
        actions.appendChild(configure);
      }
      cell.appendChild(actions);
    });
    const itens = daCategoria.map((item, indice) => ({
      celula: celulas[indice],
      // Busca por nome e por descrição: quem procura "brilho" precisa achar o
      // Neon mesmo sem saber que a ferramenta se chama Neon. O separador nulo
      // impede que o fim de um nome e o começo da descrição formem um
      // casamento que nenhum dos dois textos contém.
      texto: `${item.name}\u0000${item.description}`.toLowerCase()
    }));

    return { titulo: sectionTitle(doc, options.texts.categoryName(categoria)), grade, itens };
  });

  const contagem = createElement(doc, "div", "ch-field__description");
  // `status` e não `alert`: a contagem muda a cada tecla, e interromper o leitor
  // de tela a cada letra tornaria o campo inutilizável.
  contagem.setAttribute("role", "status");
  contagem.setAttribute("aria-live", "polite");

  const vazio = notice(doc, options.texts.empty);
  vazio.hidden = true;

  const total = secoes.reduce((soma, secao) => soma + secao.itens.length, 0);
  let visiveisAgora = total;

  function applyQuery(bruto: string): void {
    const consulta = bruto.trim().toLowerCase();
    let visiveis = 0;

    for (const secao of secoes) {
      let visiveisNaSecao = 0;
      for (const { celula, texto } of secao.itens) {
        if (!celula) continue;
        const casa = consulta === "" || texto.indexOf(consulta) >= 0;
        celula.hidden = !casa;
        if (casa) visiveisNaSecao += 1;
      }
      // Uma seção sem nenhum resultado desaparece inteira, título junto: deixar
      // o título sozinho anunciaria uma categoria que não tem nada a mostrar.
      const vaziaAgora = visiveisNaSecao === 0;
      secao.titulo.hidden = vaziaAgora;
      secao.grade.hidden = vaziaAgora;
      // Cada grade tem a própria âncora de teclado, e ela precisa voltar para o
      // primeiro ladrilho que ainda aparece: sem isto, filtrar até esconder o
      // ladrilho que carrega `tabindex="0"` tira aquela grade da ordem de Tab.
      syncToolGridRoving(secao.grade);
      visiveis += visiveisNaSecao;
    }

    visiveisAgora = visiveis;
    vazio.hidden = visiveis > 0;
    contagem.textContent = consulta === "" ? "" : options.texts.count(visiveis, total);
  }

  const busca = searchField(doc, {
    id: `${options.idPrefix ?? "tools"}-search`,
    label: options.texts.searchLabel,
    value: options.query ?? "",
    ...(options.texts.searchPlaceholder ? { placeholder: options.texts.searchPlaceholder } : {}),
    onInput: (value) => {
      options.onQueryChange?.(value);
      applyQuery(value);
    }
  });

  const nodes: HTMLElement[] = [busca, contagem, vazio];
  for (const secao of secoes) {
    nodes.push(secao.titulo, secao.grade);
  }

  applyQuery(options.query ?? "");

  return {
    nodes,
    applyQuery,
    visibleCount: () => visiveisAgora
  };
}
