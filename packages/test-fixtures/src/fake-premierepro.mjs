/**
 * Duplo do modulo `premierepro`.
 *
 * O adapter recebe o modulo por injecao justamente para que isto seja possivel:
 * sem injecao, testar qualquer caminho exigiria abrir o Premiere Pro, e na
 * pratica significaria nao testar.
 *
 * O duplo registra a ORDEM das chamadas, nao so o fato de terem acontecido. A
 * garantia que importa na fronteira de transacao e que `executeTransaction`
 * acontece DENTRO do callback de `lockedAccess` — um teste que so contasse
 * chamadas passaria com as duas invertidas.
 *
 * Este package nao entra em nenhum build distribuivel.
 */

/**
 * @param {object} [options]
 * @param {boolean} [options.hasProject] Existe projeto aberto?
 * @param {boolean} [options.hasActiveSequence] Existe sequencia ativa?
 * @param {number} [options.sequenceCount]
 * @param {boolean} [options.transactionSucceeds] O que executeTransaction devolve.
 * @param {boolean} [options.omitTransactionApi] Simula Premiere abaixo de 25.6.
 */
export function createFakePremiere(options = {}) {
  const {
    hasProject = true,
    hasActiveSequence = true,
    sequenceCount = 3,
    transactionSucceeds = true,
    omitTransactionApi = false
  } = options;

  /** @type {string[]} */
  const calls = [];
  /** @type {string[]} */
  const undoLabels = [];

  const activeSequence = hasActiveSequence
    ? {
        name: "Sequência 01",
        async getVideoTrackCount() {
          calls.push("getVideoTrackCount");
          return 4;
        },
        async getAudioTrackCount() {
          calls.push("getAudioTrackCount");
          return 2;
        }
      }
    : null;

  const project = hasProject
    ? {
        name: "MeuProjeto.prproj",
        path: "C:/Users/rael/Videos/MeuProjeto.prproj",

        async getActiveSequence() {
          calls.push("getActiveSequence");
          return activeSequence;
        },

        async getSequences() {
          calls.push("getSequences");
          return Array.from({ length: sequenceCount }, (_unused, index) => ({
            name: `Sequência ${index + 1}`,
            async getVideoTrackCount() {
              return 1;
            },
            async getAudioTrackCount() {
              return 1;
            }
          }));
        }
      }
    : null;

  if (project && !omitTransactionApi) {
    let insideLockedAccess = false;

    project.lockedAccess = (callback) => {
      calls.push("lockedAccess:enter");
      insideLockedAccess = true;
      try {
        callback();
      } finally {
        insideLockedAccess = false;
        calls.push("lockedAccess:exit");
      }
    };

    project.executeTransaction = (callback, undoString) => {
      // A Adobe documenta lockedAccess envolvendo executeTransaction, e tem uma
      // regra de lint dedicada a isso. O duplo torna a violacao um erro visivel
      // no teste, em vez de algo que so apareceria dentro do Premiere.
      if (!insideLockedAccess) {
        throw new Error(
          "executeTransaction foi chamado fora de lockedAccess. " +
            "Sem a trava, o estado do projeto pode mudar entre a leitura e a escrita."
        );
      }

      calls.push("executeTransaction:enter");
      undoLabels.push(undoString ?? "");

      /** @type {object[]} */
      const actions = [];
      const compound = {
        addAction(action) {
          calls.push("addAction");
          actions.push(action);
          return true;
        },
        get empty() {
          return actions.length === 0;
        }
      };

      callback(compound);
      calls.push("executeTransaction:exit");
      return transactionSucceeds;
    };
  }

  return {
    Project: {
      async getActiveProject() {
        calls.push("getActiveProject");
        return project;
      }
    },
    /** Ordem completa das chamadas observadas. */
    calls,
    /** Rótulos passados como `undoString`. */
    undoLabels,
    project
  };
}
