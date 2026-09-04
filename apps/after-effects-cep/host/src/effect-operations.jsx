/**
 * Operacoes comuns sobre efeitos nativos.
 *
 * Echo, Glitch, Wave e Tile fazem a mesma sequencia: achar o efeito gerenciado,
 * recusar quando existe um do usuario, guardar os valores anteriores, escrever
 * os novos e saber voltar. Quatro copias disso divergiriam — foi assim que a
 * conversao de curva do CHMS-018 ficou errada em dois lugares ao mesmo tempo.
 *
 * ## O que "gerenciado" quer dizer
 *
 * Um efeito nao tem onde guardar identidade: nao ha comentario, nao ha expressao
 * com cabecalho, e a §11 e explicita que nome nao e identificador. O que existe
 * e o `RIG_PREFIX` do contrato, usado aqui como **heuristica declarada** que
 * falha fechada:
 *
 *  - efeito com o prefixo: e deste plugin, e pode ser ajustado;
 *  - efeito sem o prefixo: e do usuario, e o comando recusa em vez de
 *    sobrescrever ou empilhar um segundo.
 *
 * Se o usuario renomear, o comando passa a recusar. E o lado seguro do erro.
 *
 * ## Handles de propriedade
 *
 * Vale a regra medida em `text-box.jsx`: acrescentar um irmao invalida os
 * handles ja obtidos. Por isso `add` rele o efeito da lista em vez de devolver o
 * que `addProperty` retornou.
 */
(function (global) {
  var MN_PARADE = "ADBE Effect Parade";

  /**
   * @param {unknown} layer
   * @returns {PropertyGroup|null}
   */
  function parade(layer) {
    var grupo = /** @type {any} */ (layer).property(MN_PARADE);
    return grupo || null;
  }

  /**
   * Efeito deste plugin, se houver.
   *
   * @param {PropertyGroup} lista
   * @param {string} matchName
   * @param {string} nomeGerenciado
   * @returns {PropertyGroup|null}
   */
  function findManaged(lista, matchName, nomeGerenciado) {
    var i;
    for (i = 1; i <= lista.numProperties; i += 1) {
      var efeito = lista.property(i);
      if (efeito && efeito.matchName === matchName && efeito.name === nomeGerenciado) return efeito;
    }
    return null;
  }

  /**
   * Qualquer efeito daquele tipo, gerenciado ou nao. Serve para detectar o do
   * usuario antes de escrever qualquer coisa.
   *
   * @param {PropertyGroup} lista
   * @param {string} matchName
   * @returns {PropertyGroup|null}
   */
  function findAny(lista, matchName) {
    var i;
    for (i = 1; i <= lista.numProperties; i += 1) {
      var efeito = lista.property(i);
      if (efeito && efeito.matchName === matchName) return efeito;
    }
    return null;
  }

  /**
   * Acrescenta o efeito e o marca como gerenciado.
   *
   * @param {PropertyGroup} lista
   * @param {string} matchName
   * @param {string} nomeGerenciado
   * @returns {PropertyGroup}
   */
  function add(lista, matchName, nomeGerenciado) {
    lista.addProperty(matchName);
    // Reler: o handle devolvido por addProperty deixa de valer assim que outro
    // efeito entrar na lista.
    var efeito = lista.property(lista.numProperties);
    if (!efeito || efeito.matchName !== matchName) {
      throw new Error("After Effects nao devolveu o efeito recem-criado.");
    }
    efeito.name = nomeGerenciado;
    return efeito;
  }

  /**
   * Grava um valor fixo.
   *
   * `setValue` levanta erro numa propriedade animada; tirar as keys antes e o
   * unico caminho de volta a um valor fixo.
   *
   * @param {Property} property
   * @param {unknown} valor
   * @returns {void}
   */
  function setStatic(property, valor) {
    var i;
    for (i = property.numKeys; i >= 1; i -= 1) property.removeKey(i);
    property.setValue(valor);
  }

  /**
   * Estado anterior dos parametros informados, para poder voltar.
   *
   * Guarda tambem as keys de cada parametro: um parametro que estava animado
   * precisa voltar animado, e nao com o valor congelado do frame atual.
   *
   * @param {PropertyGroup} efeito
   * @param {ReadonlyArray<string>} parametros
   * @returns {{ efeito: PropertyGroup, nome: string, valores: Array<Record<string, unknown>> }}
   */
  function snapshot(efeito, parametros) {
    var valores = [];
    var i;
    for (i = 0; i < parametros.length; i += 1) {
      var matchName = /** @type {string} */ (parametros[i]);
      var property = /** @type {Property} */ (efeito.property(matchName));
      if (!property) continue;
      valores.push({
        matchName: matchName,
        value: property.value,
        keys: MotionKeyframes.isSupportedProperty(property) ? MotionKeyframes.captureProperty(property) : null
      });
    }
    return { efeito: efeito, nome: efeito.name, valores: valores };
  }

  /**
   * @param {{ efeito: PropertyGroup, nome: string, valores: Array<Record<string, unknown>> }} anterior
   * @returns {void}
   */
  function restore(anterior) {
    var i;
    for (i = 0; i < anterior.valores.length; i += 1) {
      var registro = anterior.valores[i];
      if (!registro) continue;
      var property = /** @type {Property} */ (
        anterior.efeito.property(/** @type {string} */ (registro.matchName))
      );
      if (!property) continue;
      var capturado = /** @type {MotionPropertySnapshot|null} */ (registro.keys);
      if (capturado && capturado.keys.length > 0) {
        MotionKeyframes.restoreProperty(capturado, null);
      } else {
        setStatic(property, registro.value);
      }
    }
    anterior.efeito.name = anterior.nome;
  }

  global.MotionEffects = {
    PARADE: MN_PARADE,
    parade: parade,
    findManaged: findManaged,
    findAny: findAny,
    add: add,
    setStatic: setStatic,
    snapshot: snapshot,
    restore: restore
  };
}($.global));
