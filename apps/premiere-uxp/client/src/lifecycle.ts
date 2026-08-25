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
