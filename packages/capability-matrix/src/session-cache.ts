/**
 * Cache de capacidades — **só de sessão**.
 *
 * A §9 do master spec é explícita: *"cache por sessão apenas"*. O motivo é
 * concreto. Capacidade não é propriedade do plugin, é do ambiente: o usuário
 * abre outro projeto, liga a preferência de acesso a arquivos do After Effects,
 * instala uma atualização, conecta a rede. Uma matriz persistida em disco
 * continuaria afirmando o estado de ontem, e o pior caso é o silencioso — um
 * botão desabilitado com a explicação "seu host não suporta" para um recurso
 * que passou a estar disponível, e o usuário não tem como descobrir que a
 * afirmação está velha.
 *
 * Este módulo, portanto, **não tem caminho de persistência**, e não é um
 * esquecimento: há um teste que falha se um aparecer.
 */
import type { HostCapabilities } from "@motion/contracts";

export interface CapabilityStore {
  /** Devolve a matriz, sondando na primeira chamada e reaproveitando depois. */
  get(): Promise<HostCapabilities>;
  /**
   * Descarta o valor em cache. `reason` é registrado, para que um diagnóstico
   * mostre *por que* a matriz foi recalculada.
   */
  invalidate(reason: string): void;
  /** Notifica quando a matriz é recalculada. */
  subscribe(listener: (capabilities: HostCapabilities) => void): () => void;
  /** Último motivo de invalidação, para diagnóstico. */
  lastInvalidationReason(): string | null;
}

export interface CapabilityStoreOptions {
  probe: () => Promise<HostCapabilities>;
}

export function createCapabilityStore(options: CapabilityStoreOptions): CapabilityStore {
  const { probe } = options;

  let cached: HostCapabilities | null = null;
  let inFlight: Promise<HostCapabilities> | null = null;
  let lastReason: string | null = null;
  const listeners = new Set<(capabilities: HostCapabilities) => void>();

  async function get(): Promise<HostCapabilities> {
    if (cached) return cached;

    // Sem isto, dois botões clicados em sequência disparariam duas sondagens
    // simultâneas — no After Effects, duas travessias completas do evalScript
    // para descobrir a mesma coisa.
    if (inFlight) return inFlight;

    inFlight = probe()
      .then((capabilities) => {
        cached = capabilities;
        inFlight = null;
        for (const listener of listeners) listener(capabilities);
        return capabilities;
      })
      .catch((error: unknown) => {
        // Falha não é cacheada: a próxima chamada tenta de novo. Guardar o erro
        // deixaria a sessão inteira presa a uma indisponibilidade momentânea.
        inFlight = null;
        throw error;
      });

    return inFlight;
  }

  return {
    get,
    invalidate(reason: string) {
      cached = null;
      lastReason = reason;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastInvalidationReason: () => lastReason
  };
}

/**
 * Eventos que tornam a matriz obsoleta.
 *
 * Documentado como dado, e não como comentário, porque a lista é diferente entre
 * os hosts e é uma limitação real do produto — não uma escolha.
 *
 * O After Effects, pelo CEP, **não expõe um evento confiável de troca de
 * projeto**. A atualização é, na prática, por foco na aplicação e por ação
 * explícita do usuário. Isso precisa estar dito em `docs/HOST_LIMITATIONS.md`, e
 * a interface não pode dar a entender que acompanha o estado ao vivo.
 */
export const INVALIDATION_TRIGGERS = {
  "after-effects": [
    "com.adobe.csxs.events.ApplicationActivate",
    "panel.visibilityChange",
    "user.explicitRefresh"
  ],
  "premiere-pro": ["panel.show", "user.explicitRefresh"]
} as const;
