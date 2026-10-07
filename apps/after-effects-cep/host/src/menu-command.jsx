/**
 * Disparo de comandos de menu do After Effects, com as quatro protecoes que a
 * secao 872 do MASTER exige.
 *
 * ## Por que existe
 *
 * Algumas capacidades do After Effects so existem como item de menu: nao ha API
 * de scripting para elas. `Convert Audio to Keyframes` e uma;
 * `Create Shapes from Vector Layer` e outra. A unica porta e
 * `app.executeCommand(id)`, e conseguir o `id` e o problema inteiro.
 *
 * ## Os dois modos de errar, e por que nenhum e aceitavel sozinho
 *
 * `app.findMenuCommandId(nome)` recebe, nas palavras da propria referencia da
 * Adobe, "the text of the menu command, exactly as it is shown in the UI" — ou
 * seja, o texto **traduzido**. A mesma pagina avisa que o metodo "is not
 * reliable across different language packages of AE". Num After Effects em
 * portugues, procurar por "Convert Audio to Keyframes" nao acha nada.
 *
 * A saida que circula na internet e cravar o numero. Ela e pior: os ids mudam
 * entre versoes do After Effects, inclusive entre versoes menores. Um id que
 * mudou nao falha — ele executa **outro comando de menu**, seja qual for o que
 * ficou naquele numero. Disparar um numero nao verificado dentro do projeto de
 * alguem e um risco que nenhuma conveniencia paga.
 *
 * ## O que este modulo faz
 *
 * Tenta uma lista de nomes candidatos (o idioma do painel e o ingles), aceita o
 * primeiro que resolver, e **desiste** se nenhum resolver. `findMenuCommandId`
 * devolve `0` quando nao acha, e o zero e o unico sinal confiavel que existe
 * aqui — por isso ele e o guarda, e por isso nao ha fallback numerico.
 *
 * Desistir e uma resposta legitima: quem chama recusa a operacao com uma frase
 * que ensina o caminho manual, sem ter tocado no projeto.
 */
(function (global) {
  /**
   * Resolve um comando de menu por nome.
   *
   * @param {string[]} candidatos Nomes a tentar, na ordem. O primeiro que
   *   resolver vence, entao ponha o idioma mais provavel primeiro.
   * @returns {{id: number, nome: string}|null} `null` quando nenhum resolveu.
   */
  function resolver(candidatos) {
    // `findMenuCommandId` e `executeCommand` existem no After Effects e nao nas
    // declaracoes de tipo que o projeto mantem; o cast e a mesma saida que
    // `ai-to-vector.jsx` ja usa.
    var aplicativo = /** @type {any} */ (typeof app === "undefined" ? null : app);
    if (!aplicativo || typeof aplicativo.findMenuCommandId !== "function") return null;
    if (!candidatos || typeof candidatos.length !== "number") return null;

    var i;
    for (i = 0; i < candidatos.length; i += 1) {
      var nome = candidatos[i];
      if (typeof nome !== "string" || nome === "") continue;
      var id;
      try {
        id = aplicativo.findMenuCommandId(nome);
      } catch (erroDeBusca) {
        // Um nome que faz o proprio AE reclamar nao derruba os outros.
        id = 0;
      }
      // Zero e "nao existe". Qualquer outro numero veio do proprio After
      // Effects nesta versao e neste idioma, entao e o id certo por construcao.
      if (typeof id === "number" && id !== 0) {
        return { id: id, nome: nome };
      }
    }
    return null;
  }

  /**
   * Executa um comando de menu sobre uma camada, devolvendo a selecao ao fim.
   *
   * A restauracao nao e cortesia: comandos de menu operam sobre a selecao, e
   * quem chama quase sempre precisa da selecao ORIGINAL depois — o Beat, por
   * exemplo, vai escrever expressao nas propriedades que o usuario tinha
   * selecionado, e sem devolve-las o comando destruiria a propria entrada. O
   * `finally` garante isso mesmo quando o comando de menu lanca.
   *
   * @param {number} id
   * @param {Layer} alvo Camada que deve estar sozinha na selecao.
   * @param {CompItem} comp
   * @returns {void}
   */
  function executarComSelecao(id, alvo, comp) {
    var anteriores = [];
    var i;

    var brutas = comp.selectedLayers;
    if (brutas && typeof brutas.length === "number") {
      for (i = 0; i < brutas.length; i += 1) {
        if (brutas[i]) anteriores.push(brutas[i]);
      }
    }

    try {
      for (i = 1; i <= comp.numLayers; i += 1) {
        var camada = comp.layer(i);
        if (camada) camada.selected = false;
      }
      alvo.selected = true;
      /** @type {any} */ (app).executeCommand(id);
    } finally {
      // A selecao volta mesmo que o comando tenha lancado. Restaurar de forma
      // best-effort: uma camada que o proprio comando de menu apagou nao pode
      // ser reselecionada, e isso nao e motivo para derrubar o comando inteiro.
      try {
        for (i = 1; i <= comp.numLayers; i += 1) {
          var atual = comp.layer(i);
          if (atual) atual.selected = false;
        }
        for (i = 0; i < anteriores.length; i += 1) {
          try {
            var anterior = anteriores[i];
            if (anterior) anterior.selected = true;
          } catch (erroDeCamada) {
            /* camada sumiu; as outras continuam */
          }
        }
      } catch (erroDeRestauro) {
        /* sem selecao restaurada; o projeto continua intacto */
      }
    }
  }

  global.MotionMenuCommand = {
    resolver: resolver,
    executarComSelecao: executarComSelecao
  };
})($.global);
