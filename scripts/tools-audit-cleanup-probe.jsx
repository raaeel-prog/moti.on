// The exact empty folder observed after this audit's disposable capability probe.
// Refuses every other project, folder identity or nonempty folder.
(function () {
  // Exact ownership captured after the interrupted Pulse snapshot, 2026-10-25.
  if(app.project && !app.project.file && app.project.numItems===3){
    var expected=[1,16,17],layerIds=[18,20,21,19,13];
    for(var n=1;n<=3;n++)if(app.project.item(n).id!==expected[n-1])throw new Error('Recovery project identity changed.');
    var fixture=app.project.item(1);
    if(!(fixture instanceof CompItem)||fixture.name!=='Moti.on QA catalog verticalPulse'||fixture.numLayers!==5)throw new Error('Recovery fixture changed.');
    for(n=1;n<=5;n++)if(fixture.layer(n).id!==layerIds[n-1])throw new Error('Recovery layers changed.');
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.newProject();return;
  }
  if(!app.project || app.project.file || app.project.numItems!==1) throw new Error('Probe cleanup ownership changed.');
  var folder=app.project.item(1);
  if(!(folder instanceof FolderItem) || folder.id!==13 || folder.name!=='S\u00f3lidos' || folder.numItems!==0) throw new Error('Probe cleanup identity changed.');
  folder.remove();
}());
