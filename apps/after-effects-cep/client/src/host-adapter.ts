/**
 * Adapter de host do After Effects.
 *
 * **Único arquivo do repositório autorizado a chamar `evalScript`.**
 *
 * `scripts/validate.mjs` verifica isso no bundle construído: exatamente uma
 * ocorrência de `evalScript(`. Não é regra de estilo. `evalScript` recebe uma
 * string de código que o After Effects avalia com acesso total ao projeto e ao
 * sistema de arquivos do usuário; espalhar chamadas por vários arquivos torna
 * impossível auditar o que atravessa a fronteira. Concentrando aqui, a auditoria
 * é ler um arquivo.
 *
 * A camada de apresentação nunca vê este módulo. Ela fala com o
 * `CommandClient`, que fala com o `Transport` — e o `Transport` é uma interface
 * de duas linhas, o que torna toda a lógica de correlação e timeout testável sem
 * abrir o After Effects.
 */
import { buildDispatchCall, type CommandContext } from "@motion/contracts";
import { createCommandClient, type CommandClient, type Transport } from "@motion/command-registry";

/**
 * Subconjunto do CSInterface que este adapter usa.
 *
 * Declarado aqui em vez de importar tipos do arquivo da Adobe: o
 * `client/lib/CSInterface.js` é código de terceiros distribuído sem tipos, e
 * declarar só o que se usa deixa explícito qual é a superfície de contato.
 */
interface CsInterfaceLike {
  evalScript(script: string, callback: (result: string) => void): void;
  getHostEnvironment(): { appVersion?: string; appUILocale?: string };
}

declare const CSInterface: new () => CsInterfaceLike;

/**
 * Resposta que o CEP devolve quando o próprio `evalScript` falhou — antes de o
 * código chegar a rodar.
 *
 * String mágica, não código de erro. É o que o CEP retorna, e reconhecê-la é a
 * diferença entre "o host não conseguiu executar" e "o host executou e devolveu
 * algo ilegível".
 */
const CEP_EVAL_FAILURE = "EvalScript error.";

export interface AeHostAdapter {
  client: CommandClient;
  /** Locale da interface do After Effects, quando o CEP o expõe. */
  uiLocale(): string | undefined;
}

export function createAeHostAdapter(logger: { warn(message: string, details?: Record<string, unknown>): void }): AeHostAdapter | null {
  if (typeof CSInterface === "undefined") {
    // O painel foi aberto fora do CEP. Devolver null em vez de lançar deixa a
    // interface mostrar um estado honesto — "não estou dentro do After Effects"
    // — em vez de uma tela em branco.
    return null;
  }

  const csInterface = new CSInterface();

  const transport: Transport = {
    send(serialized, onResult) {
      // buildDispatchCall é a única forma de produzir a string; o payload já
      // passou por encodeForEvalScript e é ASCII imprimível.
      csInterface.evalScript(buildDispatchCall(serialized), (raw) => {
        if (raw === CEP_EVAL_FAILURE) {
          logger.warn("O CEP não conseguiu avaliar o script no host.");
          // Sem resposta que o cliente consiga correlacionar: quem fecha o caso é
          // o timeout do pedido, e a mensagem dele já orienta a conferir o Undo.
          return;
        }
        onResult(raw);
      });
    }
  };

  const context = (): CommandContext => {
    const environment = csInterface.getHostEnvironment();
    return {
      host: "after-effects",
      hostVersion: environment.appVersion ?? "unknown",
      ...(environment.appUILocale ? { locale: environment.appUILocale } : {})
    };
  };

  return {
    client: createCommandClient({ transport, context, logger }),
    uiLocale: () => csInterface.getHostEnvironment().appUILocale
  };
}
