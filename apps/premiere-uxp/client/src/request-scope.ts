declare const panelRequestTicketBrand: unique symbol;

/** Identidade opaca, valida apenas para o escopo que a criou. */
export interface PanelRequestTicket {
  readonly [panelRequestTicketBrand]: true;
}

export interface PanelRequestScope {
  begin(): PanelRequestTicket | null;
  isCurrent(ticket: PanelRequestTicket): boolean;
  finish(ticket: PanelRequestTicket): boolean;
  invalidate(): void;
  dispose(): void;
}

/**
 * Autoriza atualizacoes de uma requisicao por vez durante a vida do painel.
 * Invalidar/descartar so impede o consumo de respostas antigas: nao cancela
 * promises nem desfaz efeitos de operacoes que ja chegaram ao host.
 */
export function createPanelRequestScope(): PanelRequestScope {
  let current: PanelRequestTicket | null = null;
  let disposed = false;

  function isCurrent(ticket: PanelRequestTicket): boolean {
    return !disposed && current !== null && current === ticket;
  }

  return {
    begin() {
      if (disposed || current !== null) {
        return null;
      }
      current = Object.freeze({}) as PanelRequestTicket;
      return current;
    },

    isCurrent,

    finish(ticket) {
      if (!isCurrent(ticket)) {
        return false;
      }
      current = null;
      return true;
    },

    invalidate() {
      current = null;
    },

    dispose() {
      disposed = true;
      current = null;
    }
  };
}
