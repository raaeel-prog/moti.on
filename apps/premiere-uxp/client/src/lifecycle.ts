/** Lifecycle idempotente do painel, separado do DOM para permitir teste puro. */

export interface ManagedPanelRuntime {
  show(): void;
  dispose(): void;
}

export interface PanelLifecycle<RootNode> {
  create(rootNode?: RootNode): ManagedPanelRuntime | null;
  show(rootNode?: RootNode): ManagedPanelRuntime | null;
  destroy(): void;
  isMounted(): boolean;
}

/**
 * Garante uma unica montagem por ciclo create/show/destroy.
 *
 * Se a fabrica nao encontrar o DOM ainda e devolver `null`, o proximo `show`
 * tenta novamente. Excecoes nao sao capturadas: falha de setup precisa ficar
 * visivel para o host/desenvolvedor, em vez de parecer um painel funcional.
 */
export function createPanelLifecycle<RootNode>(
  createRuntime: (rootNode?: RootNode) => ManagedPanelRuntime | null
): PanelLifecycle<RootNode> {
  let runtime: ManagedPanelRuntime | null = null;

  function create(rootNode?: RootNode): ManagedPanelRuntime | null {
    if (!runtime) {
      runtime = createRuntime(rootNode);
    }
    return runtime;
  }

  return {
    create,

    show(rootNode) {
      const current = create(rootNode);
      current?.show();
      return current;
    },

    destroy() {
      if (!runtime) {
        return;
      }

      const current = runtime;
      runtime = null;
      current.dispose();
    },

    isMounted: () => runtime !== null
  };
}

/**
 * Handlers de um painel registrados via `entrypoints.setup`.
 *
 * A documentação oficial do Premiere UXP lista `create`, `show`, `hide` e
 * `destroy` como hooks de painel. Este painel usa os três hooks que têm
 * semântica própria para a montagem atual; `hide` ainda é documentado pela
 * Adobe como limitado no Premiere. Ver
 * `docs/research/premiere-uxp-entrypoints-lifecycle.md`.
 */
export interface UxpPanelCallbacks<RootNode> {
  create(rootNode?: RootNode): void;
  show(rootNode?: RootNode): void;
  destroy(): void;
}

export interface UxpEntrypointConfig<RootNode> {
  plugin: { create(): void; destroy(): void };
  panels: { mainPanel: UxpPanelCallbacks<RootNode> };
}

/**
 * Monta a configuração que vai para `entrypoints.setup`.
 *
 * Existe separada de `main.ts` porque lá ela roda no topo do módulo, contra o
 * runtime real do host, e não havia como exercitá-la: o painel do Premiere
 * ficou em branco desde o início do projeto e nenhum teste podia ver.
 *
 * `plugin.create` não faz trabalho nenhum e ainda assim é declarado. A
 * documentação oficial define `plugin.create()` e `plugin.destroy()` como os
 * hooks de ciclo de vida do plugin; além disso, o Premiere Pro 26.3.2 medido
 * nesta máquina recusou um objeto `plugin` sem `create` com
 * `create method is not defined for plugin`. Esse comportamento estrito é
 * evidência de host, não uma extrapolação da referência pública.
 *
 * Montar dentro de `plugin.create` seria errado de qualquer forma: ele corre
 * antes de existir painel, e portanto antes de existir nó de raiz onde montar.
 */
export function buildEntrypointConfig<RootNode>(
  lifecycle: PanelLifecycle<RootNode>
): UxpEntrypointConfig<RootNode> {
  return {
    plugin: {
      create: () => {
        // Sem corpo de propósito; ver o comentário acima.
      },
      destroy: () => lifecycle.destroy()
    },
    panels: {
      mainPanel: {
        create: (rootNode) => {
          lifecycle.create(rootNode);
        },
        show: (rootNode) => {
          lifecycle.show(rootNode);
        },
        destroy: () => lifecycle.destroy()
      }
    }
  };
}
