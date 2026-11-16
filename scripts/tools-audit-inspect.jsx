(function () {
  var repo = File($.fileName).parent.parent.fsName, result = {host:app.version,saved:Boolean(app.project.file),items:[],active:null};
  for (var i=1;i<=app.project.numItems;i++) { var item=app.project.item(i); result.items.push({id:item.id,name:item.name,type:item.typeName,children:item instanceof FolderItem ? item.numItems : null}); }
  var comp=app.project.activeItem;
  if(comp instanceof CompItem) { result.active={id:comp.id,name:comp.name,layers:[]}; for(i=1;i<=comp.numLayers;i++) { var layer=comp.layer(i); result.active.layers.push({id:layer.id,name:layer.name,comment:layer.comment,selected:layer.selected}); } }
  var file=new File(repo+'/artifacts/tools-audit/context-native.json');file.encoding='UTF-8';if(file.open('w')){file.write(MotionJson.stringify(result));file.close();}
}());
