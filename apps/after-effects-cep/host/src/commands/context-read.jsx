/**
 * `ae.context.read` — lê o contexto atual do After Effects.
 *
 * Não muta nada. Substitui o antigo `MotionAE.getContext()`, que era exposto
 * direto no global e chamado por concatenação de string no `evalScript`.
 */
(function () {
  MotionRegistry.register("ae.context.read", {
    /**
     * Não há nada a validar: ler o contexto funciona mesmo sem projeto salvo,
     * sem composição ativa e sem seleção. `null` explícito é a forma de declarar
     * isso — o registry recusa um comando sem `preflight`, justamente para que
     * "não valida nada" seja uma decisão escrita e não um esquecimento.
     */
    preflight: function () {
      return null;
    },

    run: function () {
      var project = app.project;
      var activeItem = project ? project.activeItem : null;
      var comp = activeItem && activeItem instanceof CompItem ? activeItem : null;

      return {
        changed: false,
        warnings: [],
        data: {
          host: "After Effects",
          hostVersion: app.version,
          projectName: project && project.file ? project.file.name : null,
          projectPath: project && project.file ? project.file.fsName : null,
          activeItemName: activeItem ? activeItem.name : null,
          isComposition: Boolean(comp),
          compWidth: comp ? comp.width : null,
          compHeight: comp ? comp.height : null,
          compDuration: comp ? Math.round(comp.duration * 1000) / 1000 : null,
          compFrameRate: comp ? Math.round(comp.frameRate * 1000) / 1000 : null
        }
      };
    }
  });
}());
