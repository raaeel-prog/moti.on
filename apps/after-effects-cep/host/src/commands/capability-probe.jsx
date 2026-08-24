/**
 * `ae.capability.probe` — coleta os fatos crus de capacidade do After Effects.
 *
 * Coleta, e não decide. A derivação da matriz é a função pura
 * `buildCapabilities` em `packages/capability-matrix`, compartilhada com o
 * Premiere. Isso é o que impede os dois hosts de divergirem em silêncio sobre o
 * que "disponível" significa.
 *
 * Cada sonda devolve `true`, `false` ou `"unknown"`. `"unknown"` não é enfeite:
 * ler uma preferência do After Effects pode lançar, e nesse caso a resposta
 * honesta é "não foi possível determinar". Colapsar isso em `false` faria a
 * interface afirmar que um recurso está indisponível quando ninguém verificou.
 */
(function () {
  /**
   * Executa uma sonda, devolvendo `"unknown"` quando ela lança.
   *
   * @param {function(): boolean} probe
   * @returns {boolean|string}
   */
  function safeProbe(probe) {
    try {
      return probe() === true;
    } catch (error) {
      return "unknown";
    }
  }

  MotionRegistry.register("ae.capability.probe", {
    preflight: function () {
      return null;
    },

    run: function () {
      var project = app.project;
      var activeItem = project ? project.activeItem : null;
      var isComp = Boolean(activeItem && activeItem instanceof CompItem);

      var reasons = {};

      // Preferencia "Allow Scripts To Write Files And Access Network".
      //
      // ATENCAO: a secao e a chave abaixo NAO foram verificadas contra
      // documentacao da Adobe. Sao o nome que circula em material comunitario.
      // Por isso a leitura fica dentro de safeProbe: se a chave estiver errada,
      // o resultado e "unknown" e a interface diz que nao conseguiu determinar —
      // em vez de afirmar "false" com base num nome que ninguem confirmou.
      // Registrado em docs/HOST_LIMITATIONS.md.
      var fileNetworkPref = safeProbe(function () {
        return (
          app.preferences.getPrefAsLong(
            "Main Pref Section",
            "Pref_SCRIPTING_FILE_NETWORK_SECURITY"
          ) === 1
        );
      });

      if (fileNetworkPref === "unknown") {
        reasons.canWriteFiles = "capability.reason.couldNotReadHostPreference";
        reasons.canAccessNetwork = "capability.reason.couldNotReadHostPreference";
      } else if (fileNetworkPref === false) {
        reasons.canWriteFiles = "capability.reason.enableScriptFileAccess";
        reasons.canAccessNetwork = "capability.reason.enableScriptFileAccess";
      }

      // false com motivo, e nao "indisponivel" generico: "nao empacotado neste
      // build" e "seu host nao suporta" pedem acoes diferentes do usuario, e a
      // primeira nao e culpa da instalacao dele.
      reasons.canUseNativeAddon = "capability.reason.addonNotPackaged";
      reasons.canReachCompanion = "capability.reason.companionNotImplemented";
      reasons.canInsertMogrt = "capability.reason.premiereOnly";
      reasons.canReadTranscript = "capability.reason.premiereOnly";
      reasons.canImportTranscript = "capability.reason.premiereOnly";
      reasons.canQueryTranscriptLanguages = "capability.reason.premiereOnly";
      reasons.canReadCaptionTracks = "capability.reason.premiereOnly";

      // Lido por funcao para que a leitura e o fallback fiquem juntos: a
      // propriedade pode nao existir em versoes antigas, e ler direto com
      // atribuicao previa deixaria um valor inicial que nunca e usado.
      var expressionEngine = (function () {
        try {
          return project ? project.expressionEngine : null;
        } catch (engineError) {
          return null;
        }
      }());

      return {
        changed: false,
        warnings: [],
        data: {
          host: "after-effects",
          hostVersion: app.version,

          hasProject: Boolean(project),
          hasActiveComp: isComp,

          canWriteFiles: fileNetworkPref,
          canAccessNetwork: fileNetworkPref,

          canUseNativeAddon: false,
          canReachCompanion: false,

          // Recursos que so existem no Premiere. Reportar "unknown" aqui daria a
          // entender que talvez existam no After Effects.
          canInsertMogrt: false,
          canReadTranscript: false,
          canImportTranscript: false,
          canQueryTranscriptLanguages: false,
          canReadCaptionTracks: false,

          expressionEngine: expressionEngine,
          reasons: reasons
        }
      };
    }
  });
}());
