// Bounded native state capture. Never evaluates generated vector paths/expressions.
function MotionAuditState(comp){
 var budget=8000;
 function ease(values){var result=[];for(var i=0;i<values.length;i++)result.push({speed:values[i].speed,influence:values[i].influence});return result;}
 function properties(group,depth){var out=[];if(!group || depth>14)return out;
  for(var i=1;i<=group.numProperties;i++){
   if(--budget<0)throw new Error('Native audit property budget exceeded.');
   var p=group.property(i),row={name:p.name,matchName:p.matchName};
   if(p.propertyType!==PropertyType.PROPERTY)row.children=properties(p,depth+1);
   else{
    row.keys=p.numKeys;row.expression=p.canSetExpression?p.expression:null;row.expressionEnabled=p.canSetExpression?p.expressionEnabled:null;
    var type=p.propertyValueType,numeric=type===PropertyValueType.OneD || type===PropertyValueType.TwoD || type===PropertyValueType.ThreeD || type===PropertyValueType.TwoD_SPATIAL || type===PropertyValueType.ThreeD_SPATIAL || type===PropertyValueType.COLOR;
    if(numeric){row.keyData=[];if(!p.numKeys)row.value=p.valueAtTime(comp.time,true);
     for(var k=1;k<=p.numKeys;k++){
      var key={time:p.keyTime(k),value:p.keyValue(k),inType:Number(p.keyInInterpolationType(k)),outType:Number(p.keyOutInterpolationType(k)),inEase:ease(p.keyInTemporalEase(k)),outEase:ease(p.keyOutTemporalEase(k)),continuous:p.keyTemporalContinuous(k),auto:p.keyTemporalAutoBezier(k),selected:p.keySelected(k)};
      if(p.isSpatial){key.inTangent=p.keyInSpatialTangent(k);key.outTangent=p.keyOutSpatialTangent(k);key.spatialAuto=p.keySpatialAutoBezier(k);key.spatialContinuous=p.keySpatialContinuous(k);key.roving=p.keyRoving(k);}
      row.keyData.push(key);
     }
    }else if(type===PropertyValueType.TEXT_DOCUMENT){var t=p.valueAtTime(comp.time,true);row.text={text:t.text,font:t.font,fontSize:t.fontSize,applyFill:t.applyFill,applyStroke:t.applyStroke,strokeWidth:t.strokeWidth};if(t.applyFill)row.text.fill=t.fillColor;if(t.applyStroke)row.text.stroke=t.strokeColor;}
   }out.push(row);
  }return out;
 }
 var layers=[],items=[];
 for(var i=1;i<=comp.numLayers;i++){var l=comp.layer(i);layers.push({id:l.id,name:l.name,comment:l.comment,selected:l.selected,locked:l.locked,threeD:l.threeDLayer,enabled:l.enabled,parent:l.parent?l.parent.id:null,start:l.startTime,inPoint:l.inPoint,outPoint:l.outPoint,properties:properties(l,0)});}
 for(i=1;i<=app.project.numItems;i++){var item=app.project.item(i);items.push({id:item.id,name:item.name,type:item.typeName,comment:item.comment,parentFolder:item.parentFolder?item.parentFolder.id:null});}
 return MotionJson.stringify({compId:comp.id,time:comp.time,duration:comp.duration,layers:layers,items:items});
}

// Only TextDocument color channels get the precision budget measured by a
// feature-free native read/write control. Key selection and all other data stay exact.
function MotionAuditCompare(before,after,textColorTolerance){
 var differences=[],tolerated=[];
 function walk(a,b,path){
  if(a===b)return;
  if(a!==null && b!==null && typeof a==='object' && typeof b==='object'){
   var seen={},key;for(key in a)if(Object.prototype.hasOwnProperty.call(a,key)){seen[key]=true;walk(a[key],b[key],path+'/'+key);}
   for(key in b)if(Object.prototype.hasOwnProperty.call(b,key)&&!seen[key])walk(a[key],b[key],path+'/'+key);
  }else{
   var row={path:path,before:a,after:b};
   if(typeof a==='number' && typeof b==='number' && /\/text\/(fill|stroke)\/[012]$/.test(path) && Math.abs(a-b)<=textColorTolerance+0.000000000001)tolerated.push(row);
   else differences.push(row);
  }
 }
 walk(MotionJson.parse(before),MotionJson.parse(after),'');return {equal:differences.length===0,differences:differences,tolerated:tolerated,textColorTolerance:textColorTolerance};
}

function MotionAuditPersistenceCompare(before,after){
 var exact=MotionAuditCompare(before,after,0),differences=[],transientSelection=[];
 for(var i=0;i<exact.differences.length;i++){var row=exact.differences[i];if(/^\/layers\/\d+\/selected$/.test(row.path)||/\/keyData\/\d+\/selected$/.test(row.path))transientSelection.push(row);else differences.push(row);}
 return {equal:differences.length===0,differences:differences,nativeTransientSelection:transientSelection,exact:exact};
}
