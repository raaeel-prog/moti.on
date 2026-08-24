/**
 * Fronteira de transação do Premiere Pro.
 *
 * Equivalente ao `withUndoGroup` do After Effects, e com a mesma finalidade: um
 * comando é uma entrada no histórico de Desfazer do usuário. A forma é diferente
 * porque as APIs são diferentes — e as diferenças foram verificadas contra a
 * referência oficial, não deduzidas do lado do After Effects.
 *
 * O padrão exigido pela Adobe é `lockedAccess` **envolvendo**
 * `executeTransaction`. A trava garante que o estado do projeto não muda entre a
 * leitura que decide o que fazer e a escrita que faz; sem ela existe uma janela
 * em que o usuário pode ter mexido na timeline no intervalo.
 *
 * As duas APIs são **síncronas**. Isso não é detalhe: o plugin oficial
 * `@adobe/eslint-plugin-premierepro` tem duas regras dedicadas a impedir
 * trabalho assíncrono dentro desses callbacks, e `tests/premiere-eslint-rules.test.mjs`
 * prova que elas estão de fato ativas nesta instalação.
 */
import type { CompoundAction, PremiereProject } from "./premiere-api.js";

export interface TransactionOutcome {
  /** `executeTransaction` reportou que a transação executou? */
  executed: boolean;
  /**
   * A transação terminou sem nenhuma ação acumulada?
   *
   * Este é o sinal que alimenta a regra do `ok` da §8 — e do lado do Premiere ele
   * é mais forte do que do lado do After Effects. No AE, saber se algo mudou
   * depende de o comando reportar `changed` honestamente. Aqui o próprio host
   * responde, por `compound.empty`, e a palavra do comando não entra na conta.
   */
  empty: boolean;
}

/**
 * Executa uma transação desfazível.
 *
 * @param project Projeto ativo.
 * @param undoLabel Texto que aparece no histórico de Desfazer, já traduzido.
 * @param build Acumula as ações. **Deve ser síncrono** e é onde as chamadas
 *   `create*Action()` precisam acontecer — fora daqui elas são inválidas.
 */
export function withTransaction(
  project: PremiereProject,
  undoLabel: string,
  build: (compound: CompoundAction) => void
): TransactionOutcome {
  let empty = true;
  let executed = false;

  project.lockedAccess(() => {
    executed = project.executeTransaction((compound) => {
      build(compound);
      // Lido DENTRO do callback. Depois que executeTransaction retorna, o
      // CompoundAction saiu do escopo da trava e nada garante que continue
      // válido — é justamente o que a regra no-action-scope-escape impede.
      empty = compound.empty;
    }, undoLabel);
  });

  // Nenhuma referência a Action ou a CompoundAction sobrevive a este retorno. A
  // §10 do master spec exige isso, e a Adobe tem regra própria para o mesmo.
  return { executed, empty };
}
