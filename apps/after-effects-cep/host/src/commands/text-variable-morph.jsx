/** Native variable-font axes driven by a movable proximity controller.
 * No glyph scaling, outlines or Source Text expressions are substituted for
 * font interpolation. Character cells are measured by AE's text composer. */
(function () {
  var TAG = "[Moti.on.variable-morph.v1]";
  var TEXT = "ADBE Text Properties", SOURCE = "ADBE Text Document";
  var ANIMATORS = "ADBE Text Animators", PROPS = "ADBE Text Animator Properties";
  var SELECTORS = "ADBE Text Selectors", EFFECTS = "ADBE Effect Parade";
  var KEYS = /** @type {any} */ (["radius", "strength", "weight", "contrast", "italic"]);
  var LABELS = ["Raio", "Intensidade", "Peso", "Contraste", "Itálico"];
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function fail(code, message) { return {code:code,message:message,recoverable:true,details:null}; }
  /** @param {any} n @returns {boolean} */
  function finite(n) { return typeof n === "number" && isFinite(n); }
  /** @param {any} group @param {string} name @returns {any} */
  function child(group, name) {
    if (!group) return null;
    for (var i=1;i<=group.numProperties;i++) { var p=group.property(i); if (p.name===name || p.matchName===name) return p; }
    return null;
  }
  /** @param {any} layer @returns {any} */
  function read(layer) {
    var comment=String(layer.comment||""), index=comment.indexOf(TAG);
    if(index<0) return null;
    var m=/** @type {any} */ (MotionJson.parse(decodeURIComponent(comment.substring(index+TAG.length).split("\n")[0]||"")));
    if(!m || m.version!==1 || !/^[0-9-]+$/.test(m.instance) || (m.role!=="text" && m.role!=="controller") || !finite(m.textId)) throw new Error("Invalid morph metadata");
    return m;
  }
  /** @param {any} layer @param {any} meta */
  function save(layer, meta) {
    var comment=String(layer.comment||""), start=comment.indexOf(TAG);
    if(start>=0) { var end=comment.indexOf("\n",start); comment=comment.substring(0,start>0&&comment.charAt(start-1)==="\n"?start-1:start)+(end<0?"":comment.substring(end)); }
    layer.comment=comment+(meta?(comment?"\n":"")+TAG+encodeURIComponent(MotionJson.stringify(meta)):"");
  }
  /** @param {any} comp @param {number} id @returns {any} */
  function byId(comp,id) { for(var i=1;i<=comp.numLayers;i++) if(comp.layer(i).id===id) return comp.layer(i); return null; }
  /** @param {any} comp @returns {any} */
  function target(comp) {
    if(!comp || comp.selectedLayers.length!==1) return null;
    var l=comp.selectedLayers[0], m=read(l);
    return m&&m.role==="controller"?byId(comp,m.textId):l;
  }
  /** @param {any} layer @returns {any} */
  function source(layer) { var t=layer.property(TEXT); return t&&t.property(SOURCE); }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    var allowed={action:true,radius:true,strength:true,weight:true,contrast:true,italic:true};
    for(var k in args) if(Object.prototype.hasOwnProperty.call(args,k)&&!Object.prototype.hasOwnProperty.call(allowed,k)) return fail(MotionContracts.ERROR.INVALID_PRESET,"Opção de morph variável desconhecida.");
    if(args.action!=="apply"&&args.action!=="remove") return fail(MotionContracts.ERROR.INVALID_PRESET,"Ação de morph variável inválida.");
    for(var i=0;i<KEYS.length;i++) { var key=KEYS[i],n=args[key]; if(!finite(n)||n<(key==="radius"?1:0)||n>(key==="radius"?5000:100)) return fail(MotionContracts.ERROR.INVALID_PRESET,"Controles de morph variável fora do limite."); }
    if(args.action==="apply"&&args.weight===0&&args.contrast===0&&args.italic===0) return fail(MotionContracts.ERROR.INVALID_PRESET,"Ative ao menos um eixo da fonte variável.");
    return null;
  }
  /** @param {any} doc @returns {any[]} */
  function axes(doc) {
    var font=doc.fontObject, data=font&&font.designAxesData, vector=font&&font.designVector, out=/** @type {any[]} */ ([]);
    if(!data||!vector) return out;
    for(var i=0;i<data.length;i++) {
      var a=data[i], lo=finite(a.min)?a.min:a.minValue, hi=finite(a.max)?a.max:a.maxValue;
      var key=a.tag==="wght"?"weight":a.tag==="ital"||a.tag==="slnt"?"italic":/contrast/i.test(String(a.name))?"contrast":null;
      if(key&&finite(lo)&&finite(hi)&&hi>lo&&finite(vector[i])) out.push({key:key,tag:a.tag,min:lo,max:hi,base:vector[i],target:a.tag==="slnt"&&lo<0?lo:hi});
    }
    // A font can expose both slant and italic. Prefer its real italic axis.
    var hasItalic=false; for(i=0;i<out.length;i++) if(out[i].tag==="ital") hasItalic=true;
    if(hasItalic) { var filtered=[]; for(i=0;i<out.length;i++) if(out[i].tag!=="slnt") filtered.push(out[i]); return filtered; }
    return out;
  }
  /** @param {any} layer @param {any} m @returns {any} */
  function owned(layer,m) {
    var comp=layer.containingComp, c=byId(comp,m.controllerId), cm=c&&read(c);
    var a=child(layer.property(TEXT).property(ANIMATORS),m.animator),link=child(layer.property(EFFECTS),m.link);
    if(!c||!cm||cm.instance!==m.instance||cm.role!=="controller"||cm.textId!==layer.id||c.locked||!a||!link||link.matchName!=="ADBE Layer Control") return null;
    if(!m.controls||!(m.axes instanceof Array)||typeof m.selectorExpression!=="string") return null;
    var selector=child(a.property(SELECTORS),m.selector),amount=selector&&selector.property("ADBE Text Expressible Amount");
    if(!amount||amount.expression!==m.selectorExpression||!amount.expressionEnabled||link.property(1).value!==c.index) return null;
    var ap=a.property(PROPS);
    // AE exposes dormant animator properties, including eight VF slots, in
    // numProperties. Only modified, unowned properties indicate user edits.
    if(a.property(SELECTORS).numProperties!==1) return null;
    for(var pi=1;pi<=ap.numProperties;pi++) {
      var candidate=ap.property(pi),managed=false;
      for(var mi=0;mi<m.axes.length;mi++) if(candidate.matchName===m.axes[mi].matchName) managed=true;
      if(!managed&&(candidate.isModified||candidate.numKeys||candidate.expression)) return null;
    }
    for(var i=0;i<m.axes.length;i++) { var axis=child(ap,m.axes[i].matchName); if(!axis||axis.numKeys||axis.expression!==m.axes[i].expression||!axis.expressionEnabled) return null; }
    for(i=0;i<KEYS.length;i++) { var control=child(c.property(EFFECTS),m.controls[KEYS[i]]); if(!control||control.matchName!=="ADBE Slider Control") return null; }
    return {controller:c,animator:a,link:link,amount:amount};
  }
  /** @param {any} doc @returns {string} */
  function signature(doc) {
    return MotionJson.stringify([doc.text,doc.font,doc.fontSize,doc.tracking,doc.horizontalScale,doc.verticalScale,doc.justification,doc.fontObject.designVector]);
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation=validate(args); if(validation) return validation;
    var comp=/** @type {any} */(app.project&&app.project.activeItem);
    if(!comp||!(comp instanceof CompItem)) return fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição.");
    var l,m,o;
    try { l=target(comp); m=l&&read(l); } catch(e) { return fail(MotionContracts.ERROR.INVALID_PRESET,"Os metadados do morph variável estão incompletos."); }
    if(!l||!source(l)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione um texto ou o controlador do morph variável.");
    if(l.locked) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Desbloqueie o texto e o controlador do morph variável.");
    if(m) { try { o=owned(l,m); } catch(error) { o=null; } if(!o) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"O rig de morph variável foi alterado. Restaure seus controles antes de continuar."); }
    if(args.action==="remove") return m?null:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"O texto selecionado não possui morph variável.");
    if(!l.enabled || finite(l.inPoint)&&comp.time<l.inPoint || finite(l.outPoint)&&comp.time>=l.outPoint) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Ative o texto e posicione o tempo dentro de sua duração.");
    if(parseFloat(app.version)<26) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Morph variável requer After Effects 26 ou posterior.");
    var s=source(l),doc=s.value;
    var baseline=doc.baselineLocs;
    if(s.numKeys||s.expression||doc.boxText||!baseline||baseline.length!==4||baseline[1]!==baseline[3]||/[\r\n]/.test(doc.text)||!doc.text.length||doc.text.length>128) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use texto de ponto horizontal, estático e de uma linha, com até 128 caracteres.");
    if(l.property(TEXT).property(ANIMATORS).numProperties>(m?1:0)) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Use um texto sem outros animadores para medir a proximidade das letras.");
    if(typeof doc.characterRange==="function") {
      var range=doc.characterRange(0,doc.text.length);
      if(typeof range.font!=="string"||!finite(range.fontSize)||!finite(range.tracking)) return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use a mesma fonte, tamanho e espaçamento em todo o texto.");
    }
    if(!doc.fontObject||!axes(doc).length) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Escolha uma fonte variável com os eixos solicitados.");
    var available=axes(doc),have=/** @type {Record<string,boolean>} */ ({weight:false,contrast:false,italic:false});
    for(var i=0;i<available.length;i++) have[available[i].key]=true;
    for(i=2;i<KEYS.length;i++) if(args[KEYS[i]]>0&&!have[KEYS[i]]) return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"A fonte selecionada não possui um dos eixos solicitados. Desative esse eixo ou escolha outra fonte variável.");
    if(m) {
      for(i=0;i<KEYS.length;i++) { var p=child(o.controller.property(EFFECTS),m.controls[KEYS[i]]).property(1); if(p.numKeys||p.expression) return fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"O controle de morph variável possui animação manual. Edite-o na timeline."); }
      if(m.font!==doc.font||m.axes.length!==available.length) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Remova o morph variável antes de trocar a fonte.");
      for(i=0;i<available.length;i++) if(available[i].tag!==m.axes[i].tag) return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Remova o morph variável antes de trocar a fonte.");
    }
    return null;
  }
  /** Native baseline advances include proportional glyph widths and tracking.
   * Only a temporary duplicate is shortened. The original keeps its text,
   * styling, expressions, keys, parenting and transformations unchanged.
   * @param {any} layer @returns {number[][]} */
  function measure(layer) {
    var duplicate=null, points=[],comp=layer.containingComp;
    try {
      duplicate=layer.duplicate(); duplicate.enabled=false;
      var animators=duplicate.property(TEXT).property(ANIMATORS);
      while(animators.numProperties) animators.property(animators.numProperties).remove();
      var s=source(duplicate),original=s.value,full=String(original.text),baseline=original.baselineLocs;
      if(!baseline||baseline.length!==4||!finite(baseline[0])||!finite(baseline[2])) throw new Error("Text composer did not expose a single baseline");
      var rect=duplicate.sourceRectAtTime(comp.time,false),y=rect.top+rect.height/2,start=baseline[0],previous=0;
      for(var i=1;i<=full.length;i++) {
        var doc=s.value; doc.text=full.substring(0,i); s.setValue(doc);
        var b=s.value.baselineLocs;
        if(!b||b.length!==4||!finite(b[2]-b[0])) throw new Error("Text composer failed to measure a character");
        var advance=b[2]-b[0]; points.push([start+(previous+advance)/2,y]); previous=advance;
      }
    } finally { if(duplicate) duplicate.remove(); }
    return points;
  }
  /** @param {any} m @param {number[][]} points @param {string} text @returns {string} */
  function selectorExpression(m,points,text) {
    return "// Moti.on variable morph v1:"+m.instance+"\n"+
      "var points="+MotionJson.stringify(points)+",expected="+MotionJson.stringify(text)+";\n"+
      "var amount=0;\n"+
      "if(text.sourceText.toString()===expected&&textIndex<=points.length){\n"+
      "var control=effect("+MotionJson.stringify(m.link)+")(1);\n"+
      "var radius=Math.max(1,Math.min(5000,control.effect("+MotionJson.stringify(m.controls.radius)+")(1)));\n"+
      "var strength=Math.max(0,Math.min(100,control.effect("+MotionJson.stringify(m.controls.strength)+")(1)));\n"+
      "var p=toComp(points[textIndex-1]),c=control.toComp(control.anchorPoint);\n"+
      "var dx=p[0]-c[0],dy=p[1]-c[1],u=Math.max(0,1-Math.sqrt(dx*dx+dy*dy)/radius);\n"+
      "amount=u*u*(3-2*u)*strength;\n}\n[amount,amount,amount];";
  }
  /** @param {any} m @param {any} axis @returns {string} */
  function axisExpression(m,axis) {
    return "// Moti.on variable morph v1:"+m.instance+"\nvar c=effect("+MotionJson.stringify(m.link)+")(1);\nvar u=Math.max(0,Math.min(100,c.effect("+MotionJson.stringify(m.controls[axis.key])+")(1)))/100;\n"+axis.base+"+("+(axis.target-axis.base)+")*u;";
  }
  /** @param {any} c @param {string} name @param {number} value @returns {any} */
  function addSlider(c,name,value) { var e=c.property(EFFECTS).addProperty("ADBE Slider Control"); e.name=name; e.property(1).setValue(value); return e; }
  /** @param {any} layer @param {any} m @param {any} c @param {any[]} available */
  function populate(layer,m,c,available) {
    var link=layer.property(EFFECTS).addProperty("ADBE Layer Control"); link.name=m.link; link.property(1).setValue(c.index);
    var a=layer.property(TEXT).property(ANIMATORS).addProperty("ADBE Text Animator"); a.name=m.animator;
    if(typeof a.property(PROPS).addVariableFontAxis!=="function") throw new Error("Native variable font animator API is unavailable");
    for(var i=0;i<available.length;i++) {
      a=child(layer.property(TEXT).property(ANIMATORS),m.animator);
      var axis=available[i],p=a.property(PROPS).addVariableFontAxis(axis.tag);
      axis.matchName=p.matchName; axis.expression=axisExpression(m,axis); p.expression=axis.expression; p.expressionEnabled=true; m.axes.push(axis);
    }
    a=child(layer.property(TEXT).property(ANIMATORS),m.animator);
    var selectors=a.property(SELECTORS),sel=selectors.addProperty("ADBE Text Expressible Selector"); sel.name=m.selector;
    sel.property("ADBE Text Range Type2").setValue(1);
    sel.property("ADBE Text Expressible Amount").expression=m.selectorExpression;
    sel.property("ADBE Text Expressible Amount").expressionEnabled=true;
  }
  /** @param {any} args @returns {any} */
  function run(args) {
    var comp=/** @type {any} */ (app.project.activeItem),l=target(comp),m=read(l),selected=[],time=comp.time;
    for(var si=0;si<comp.selectedLayers.length;si++) selected.push(comp.selectedLayers[si]);
    if(args.action==="remove") {
      var o=owned(l,m),c=o.controller,removedAnimator=false,removedLink=false,originalComment=l.comment;
      // A controller with user content remains as an ordinary null.
      var retain=c.property(EFFECTS).numProperties>KEYS.length;
      for(var li=1;li<=comp.numLayers;li++) if(comp.layer(li).parent===c) retain=true;
      // Keep a controller containing unrelated work entirely intact. Removing
      // its owned text rig is still valid; none of that user content is deleted.
      try {
        o.animator.remove();removedAnimator=true;
        child(l.property(EFFECTS),m.link).remove();removedLink=true;
        save(l,null);
        if(retain) save(c,null); else c.remove();
      } catch(removeError) {
        try {
          if(removedAnimator) {
            if(!removedLink) child(l.property(EFFECTS),m.link).remove();
            var axisCopies=[];
            for(var r=0;r<m.axes.length;r++) { var ax=m.axes[r];axisCopies.push({key:ax.key,tag:ax.tag,min:ax.min,max:ax.max,base:ax.base,target:ax.target}); }
            m.axes=[];populate(l,m,c,axisCopies);
          }
          l.comment=originalComment;
        } catch(removeRollbackError) { var removeFailure=/** @type {any} */(new Error("Morph removal rollback failed"));removeFailure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw removeFailure; }
        throw removeError;
      }
      l.selected=true;
      return {changed:true,data:{appliedCount:1,removed:true,controllerRetained:retain},warnings:[]};
    }
    var created=false,succeeded=false,comment=l.comment,old=null,controller=null,originalExpression=null;
    try {
      // Resolve the original center before temporary text composition changes.
      var bounds=l.sourceRectAtTime(time,false),center=[bounds.left+bounds.width/2,bounds.top+bounds.height/2];
      var points=measure(l),doc=source(l).value,available=axes(doc);
      if(m) {
        var existing=owned(l,m);controller=existing.controller;old=[];originalExpression=existing.amount.expression;
        for(var oi=0;oi<KEYS.length;oi++) old.push(child(controller.property(EFFECTS),m.controls[KEYS[oi]]).property(1).value);
      } else {
        created=true;
        var instance=String(new Date().getTime())+"-"+l.id;
        m={version:1,instance:instance,role:"text",textId:l.id,controllerId:0,font:doc.font,animator:"Moti.on "+instance+" Morph",selector:"Moti.on Proximity",link:"Moti.on "+instance+" Control",controls:{},axes:[]};
        controller=comp.layers.addNull();controller.name="Moti.on Morph · "+l.name;
        m.controllerId=controller.id;
        // Evaluate AE's comp-space transform on the new null, then bake the
        // point. sourcePointToComp mutates internal text state in some hosts.
        var position=controller.property("ADBE Transform Group").property("ADBE Position");
        position.expression="var l=thisComp.layer("+l.index+");var p=l.toComp("+MotionJson.stringify(center)+");[p[0],p[1]];";
        var world=position.valueAtTime(time,false);
        if(position.expressionError||!world||!finite(world[0])||!finite(world[1])) throw new Error("Could not resolve text center in composition space");
        position.expression="";position.setValue([world[0],world[1]]);
        save(controller,{version:1,instance:instance,role:"controller",textId:l.id});
        for(var ci=0;ci<KEYS.length;ci++) { var key=KEYS[ci];m.controls[key]="Moti.on "+LABELS[ci];addSlider(controller,m.controls[key],args[key]); }
      }
      m.points=points;m.signature=signature(doc);m.selectorExpression=selectorExpression(m,points,doc.text);
      if(created) populate(l,m,controller,available);
      else {
        for(var ai=0;ai<KEYS.length;ai++) child(controller.property(EFFECTS),m.controls[KEYS[ai]]).property(1).setValue(args[KEYS[ai]]);
        child(child(l.property(TEXT).property(ANIMATORS),m.animator).property(SELECTORS),m.selector).property("ADBE Text Expressible Amount").expression=m.selectorExpression;
      }
      save(l,m);
      succeeded=true;
      return {changed:true,data:{appliedCount:1,controllerLayerId:controller.id,controllerName:controller.name,axes:available,characterCount:points.length},warnings:[]};
    } catch(error) {
      try {
        if(created) {
          var a=child(l.property(TEXT).property(ANIMATORS),m.animator);if(a)a.remove();
          var e=child(l.property(EFFECTS),m.link);if(e)e.remove();if(controller)controller.remove();
        } else if(old) {
          for(var bi=0;bi<KEYS.length;bi++) child(controller.property(EFFECTS),m.controls[KEYS[bi]]).property(1).setValue(old[bi]);
          var amount=child(child(l.property(TEXT).property(ANIMATORS),m.animator).property(SELECTORS),m.selector).property("ADBE Text Expressible Amount");amount.expression=originalExpression;amount.expressionEnabled=true;
        }
        l.comment=comment;
      } catch(rollbackError) { var failure=/** @type {any} */(new Error("Morph rollback failed"));failure.motionCode=MotionContracts.ERROR.ROLLBACK_FAILED;throw failure; }
      throw error;
    } finally {
      for(var fi=1;fi<=comp.numLayers;fi++) comp.layer(fi).selected=false;
      // First Apply deliberately selects the new null so its position handle
      // is immediately visible. Reapply and failures preserve the selection.
      if(created&&succeeded) controller.selected=true;
      else for(fi=0;fi<selected.length;fi++) selected[fi].selected=true;
      comp.time=time;
    }
  }
  // The original renderer remains available to old command envelopes and rigs.
  // v2 migrates only on an explicit Update, retaining the user's controller.
  var host = /** @type {any} */ ($.global);
  host.MotionVariableMorphLegacy = {meta:read,owned:owned,target:target,axes:axes,save:save,preflight:preflight,run:run};
})();

/** Proximity morph v2: native compound outlines or native variable-font axes. */
/** @param {any} global */
(function (global) {
  /* global Shape, KeyframeInterpolationType */
  var host = /** @type {any} */ (global), legacy = host.MotionVariableMorphLegacy;
  var TAG = "[Moti.on.proximity-morph.v2]", PREFIX = "// Moti.on proximity morph v2\n";
  var TEXT = "ADBE Text Properties", SOURCE = "ADBE Text Document", ANIMATORS = "ADBE Text Animators", PROPS = "ADBE Text Animator Properties", SELECTORS = "ADBE Text Selectors", EFFECTS = "ADBE Effect Parade", TRANSFORM = "ADBE Transform Group", ROOT = "ADBE Root Vectors Group", CONTENTS = "ADBE Vectors Group", VECTOR_TRANSFORM = "ADBE Vector Transform Group";
  var MAX_GLYPHS = 128, MAX_SAMPLES = 120000, MAX_FRAMES = 3600;
  var CONTROLS = /** @type {any[]} */ ([
    ["radius", "Moti.on Raio", 1, 5000, 250], ["strength", "Moti.on Intensidade", 0, 100, 100],
    ["weight", "Moti.on Peso", -100, 100, 35], ["contrast", "Moti.on Contraste", 0, 100, 0], ["italic", "Moti.on Itálico", 0, 100, 0],
    ["smoothness", "Moti.on Suavidade", 0, 100, 75], ["scaleX", "Moti.on Largura", 25, 300, 100], ["scaleY", "Moti.on Altura", 25, 300, 100],
    ["skew", "Moti.on Inclinação", -60, 60, 0], ["lift", "Moti.on Elevação", -200, 200, 0]
  ]);
  var DIRECTIONS = {"left-to-right":true,"right-to-left":true,"top-to-bottom":true,"bottom-to-top":true};
  /** @param {string} code @param {string} message @param {any} [details] @returns {any} */
  function fail(code,message,details) { return {code:code,message:message,recoverable:true,details:details||null}; }
  /** @param {string} message @param {string} [code] @returns {any} */
  function error(message,code) { var e=/** @type {any} */(new Error(message));e.motionCode=code||MotionContracts.ERROR.HOST_OPERATION_FAILED;return e; }
  /** @param {any} v @returns {boolean} */
  function finite(v) { return typeof v==="number"&&isFinite(v); }
  /** @param {any} a @param {any} b @returns {boolean} */
  function same(a,b) { if(finite(a)&&finite(b))return Math.abs(a-b)<=.000001*Math.max(1,Math.abs(a),Math.abs(b));if(a&&b&&typeof a.length==="number"&&typeof b.length==="number"){if(a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(!same(a[i],b[i]))return false;return true;}return a===b; }
  /** @param {any} group @param {string} name @returns {any} */
  function child(group,name) { if(!group)return null;for(var i=1;i<=group.numProperties;i++){var p=group.property(i);if(p.name===name||p.matchName===name)return p;}return group.property(name); }
  /** @param {any} layer @returns {any} */
  function source(layer) { var g=layer&&layer.property(TEXT);return g&&g.property(SOURCE); }
  /** @param {any} comp @param {number} id @returns {any} */
  function byId(comp,id) { for(var i=1;i<=comp.numLayers;i++)if(comp.layer(i).id===id)return comp.layer(i);return null; }
  /** @param {any} layer @returns {any} */
  function meta(layer) { var s=String(layer.comment||""),at=s.indexOf(TAG);if(at<0)return null;var m=/** @type {any} */(MotionJson.parse(decodeURIComponent(s.substring(at+TAG.length).split("\n")[0]||"")));if(!m||m.schemaVersion!==2||typeof m.rigId!=="string"||!finite(m.sourceId)||!finite(m.controllerId)||(m.role!=="source"&&m.role!=="controller"&&m.role!=="outline"))throw error("Metadados do morph incompletos.",MotionContracts.ERROR.INVALID_PRESET);return m; }
  /** @param {any} layer @param {any} m */
  function save(layer,m) { var s=String(layer.comment||""),at=s.indexOf(TAG);if(at>=0){var end=s.indexOf("\n",at);s=s.substring(0,at>0&&s.charAt(at-1)==="\n"?at-1:at)+(end<0?"":s.substring(end));}layer.comment=s+(m?(s?"\n":"")+TAG+encodeURIComponent(MotionJson.stringify(m)):""); }
  /** @param {string} s @returns {string} */
  function hash(s) { var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return String(h>>>0); }
  /** @param {any} layer @returns {string} */
  function fingerprint(layer) { var d=source(layer).value;return hash(MotionJson.stringify([String(d.text),d.font,d.fontSize,d.lineOrientation,d.boxText,d.boxText?d.boxTextSize:null,d.boxText?d.boxTextPos:null,d.tracking,d.justification,d.leading,d.autoLeading,d.horizontalScale,d.verticalScale,d.baselineShift,d.fauxBold,d.fauxItalic,d.allCaps,d.smallCaps,d.applyFill,d.applyFill?d.fillColor:null,d.applyStroke,d.applyStroke?d.strokeColor:null,d.applyStroke?d.strokeWidth:null,d.fontObject&&d.fontObject.designVector])); }
  /** @param {any} group @returns {string} */
  function signature(group) {
    var values=/** @type {any[]} */([]);
    /** @param {any} p */
    function visit(p) { values.push(p.matchName,p.name);if(p.numProperties){for(var i=1;i<=p.numProperties;i++)visit(p.property(i));}else if(p.expression){values.push(p.expression,p.expressionEnabled,p.numKeys);}else if(p.numKeys){for(var k=1;k<=p.numKeys;k++){values.push(p.keyTime(k),p.keyValue(k));if(typeof p.keyInInterpolationType==="function")values.push(String(p.keyInInterpolationType(k)),String(p.keyOutInterpolationType(k)));}}else if(p.matchName==="ADBE Vector Shape"){var v=p.value;values.push(v.vertices,v.inTangents,v.outTangents,v.closed);}else values.push(p.value);}
    visit(group);return hash(MotionJson.stringify(values));
  }
  /** @param {any} controller @param {string} name @returns {any} */
  function control(controller,name) { var e=child(controller.property(EFFECTS),name);return e&&e.property(1); }
  /** @param {any} layer @param {string} name @param {string} type @param {any} value */
  function addControl(layer,name,type,value) { var effects=layer.property(EFFECTS),e=effects.addProperty(type),index=e.propertyIndex||effects.numProperties;e=effects.property(index);e.name=name;e.property(1).setValue(value); }
  /** @param {any} p @param {string} expression */
  function express(p,expression) { if(!p||p.canSetExpression===false)throw error("A propriedade não aceita expressões.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);p.expression=expression;p.expressionEnabled=true;if(p.expressionError||p.expressionEnabled!==true)throw error("O After Effects recusou a expressão do morph."); }
  /** @param {any} args @returns {any} */
  function normalized(args) { var out=/** @type {any} */({action:args.action,renderer:args.renderer||"auto",preset:args.preset||"soft-weight",sweepFrames:typeof args.sweepFrames==="undefined"?48:args.sweepFrames,sweepDirection:args.sweepDirection||"left-to-right"});for(var i=0;i<CONTROLS.length;i++){var c=CONTROLS[i];out[c[0]]=typeof args[c[0]]==="undefined"?c[4]:args[c[0]];}return out; }
  /** @param {any} args @returns {any} */
  function validate(args) { var allowed=/** @type {any} */({action:true,renderer:true,preset:true,sweepFrames:true,sweepDirection:true});var i,k;for(i=0;i<CONTROLS.length;i++)allowed[CONTROLS[i][0]]=true;for(k in args)if(Object.prototype.hasOwnProperty.call(args,k)&&!allowed[k])return fail(MotionContracts.ERROR.INVALID_PRESET,"Controle de morph desconhecido.",{field:k});if(args.action!=="apply"&&args.action!=="update"&&args.action!=="bake"&&args.action!=="remove"&&args.action!=="sweep")return fail(MotionContracts.ERROR.INVALID_PRESET,"Operação de morph inválida.");var a=normalized(args);if(a.renderer!=="auto"&&a.renderer!=="outline"&&a.renderer!=="variable")return fail(MotionContracts.ERROR.INVALID_PRESET,"Motor de morph inválido.");for(i=0;i<CONTROLS.length;i++){var c=CONTROLS[i],n=a[c[0]];if(!finite(n)||n<c[2]||n>c[3])return fail(MotionContracts.ERROR.INVALID_PRESET,"Controle de morph fora do limite.",{field:c[0]});}if(!finite(a.sweepFrames)||a.sweepFrames<1||a.sweepFrames>3600||Math.floor(a.sweepFrames)!==a.sweepFrames||!Object.prototype.hasOwnProperty.call(DIRECTIONS,a.sweepDirection))return fail(MotionContracts.ERROR.INVALID_PRESET,"Varredura inválida.");if(typeof a.preset!=="string"||!/^[a-z][a-z0-9-]{0,63}$/.test(a.preset))return fail(MotionContracts.ERROR.INVALID_PRESET,"Preset inválido.");return null; }
  /** @param {any} layer @returns {any} */
  function capabilities(layer) { var data=source(layer)?legacy.axes(source(layer).value):[],c=/** @type {any} */({weight:false,contrast:false,italic:false,variable:false,outline:!!(host.MotionTextGlyphOutlines&&typeof host.MotionTextGlyphOutlines.extract==="function")});for(var i=0;i<data.length;i++)c[data[i].key]=true;c.variable=parseFloat(app.version)>=26&&data.length>0;return c; }
  /** @param {any} layer @param {any} a @returns {string} */
  function renderer(layer,a) { if(a.renderer!=="auto")return a.renderer;var c=capabilities(layer);return c.variable&&c.weight?"variable":"outline"; }
  /** @param {any} c @param {any} m @returns {any} */
  function readControls(c,m) { var a=/** @type {any} */({action:"apply",renderer:m.requestedRenderer||m.renderer,preset:m.preset||"soft-weight",sweepFrames:m.sweepFrames||48,sweepDirection:m.sweepDirection||"left-to-right"});for(var i=0;i<CONTROLS.length;i++){var p=control(c,m.controls[CONTROLS[i][0]]);if(!p)throw error("Controle do morph ausente.",MotionContracts.ERROR.TRACK_CONFLICT);a[CONTROLS[i][0]]=p.value;}return a; }
  /** @param {any} c @param {any} m @returns {string[]} */
  function lockedControls(c,m) { var out=[];for(var i=0;i<CONTROLS.length;i++){var key=CONTROLS[i][0],p=control(c,m.controls[key]);if(p&&(p.numKeys||p.expression))out.push(key);}return out; }
  /** @param {any} comp @returns {any} */
  function resolve(comp) { if(comp.selectedLayers.length!==1)return null;var selected=comp.selectedLayers[0],m=meta(selected),l=m?byId(comp,m.sourceId):legacy.target(comp);if(!l||!source(l))return null;return {source:l,meta:meta(l),legacy:legacy.meta(l),selected:selected}; }
  /** @param {any} p @returns {any} */
  function inspect(p) {
    var m=p.meta;if(!m)return null;var l=p.source,comp=l.containingComp,c=byId(comp,m.controllerId),cm=c&&meta(c);
    if(!c||!cm||cm.role!=="controller"||cm.rigId!==m.rigId||cm.sourceId!==l.id||m.sourceId!==l.id)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"O controlador do morph não está conectado.");
    var controllerAncestor=c;while(controllerAncestor){if(controllerAncestor.threeDLayer)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use controlador e hierarquia em 2D.");controllerAncestor=controllerAncestor.parent;}
    if(l.locked||c.locked)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Desbloqueie o texto e o controlador.");
    for(var i=0;i<CONTROLS.length;i++){var e=child(c.property(EFFECTS),m.controls&&m.controls[CONTROLS[i][0]]);if(!e||e.matchName!=="ADBE Slider Control")return fail(MotionContracts.ERROR.TRACK_CONFLICT,"Um controle do morph foi removido ou renomeado.");}
    if(m.renderer==="outline"){
      var r=byId(comp,m.resultId),rm=r&&meta(r);if(!r||!rm||rm.role!=="outline"||rm.rigId!==m.rigId||r.parent!==l||r.locked||signature(r.property(ROOT))!==m.resultSignature||signature(r.property(TRANSFORM))!==m.transformSignature||r.property(EFFECTS).numProperties!==2||r.property("ADBE Mask Parade").numProperties)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"A geometria ou as expressões do morph foram personalizadas.");
      var cl=control(r,m.link),sl=control(r,m.sourceLink);if(!cl||!sl||cl.value!==c.index||sl.value!==l.index)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"Os vínculos do morph foram alterados.");
      for(i=1;i<=comp.numLayers;i++)if(comp.layer(i).parent===r)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"A camada do morph possui conteúdo externo.");p.result=r;
    }else{
      var animators=l.property(TEXT).property(ANIMATORS);if(animators.numProperties!==m.animators.length)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"O texto possui animadores externos.");
      for(i=0;i<m.animators.length;i++){var a=child(animators,m.animators[i].name);if(!a||signature(a)!==m.animators[i].signature)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"Um animador do morph foi personalizado.");}
      var link=control(l,m.link);if(!link||link.value!==c.index)return fail(MotionContracts.ERROR.TRACK_CONFLICT,"O vínculo do morph foi alterado.");
    }
    p.controller=c;return null;
  }
  /** @param {string} text @returns {number} */
  function characterCount(text) { var count=0;for(var i=0;i<text.length;i++){var code=text.charCodeAt(i);if(code===13||code===10)continue;if(code>=0xd800&&code<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff)i++;count++;}return count; }
  /** @param {any} p @returns {any} */
  function bakeInterval(p) { var comp=p.comp,start=Math.max(p.source.inPoint,finite(comp.workAreaStart)?comp.workAreaStart:p.source.inPoint),end=Math.min(p.source.outPoint,finite(comp.workAreaStart)&&finite(comp.workAreaDuration)?comp.workAreaStart+comp.workAreaDuration:p.source.outPoint);if(end<=start)throw error("A área de trabalho não cruza a duração do texto.",MotionContracts.ERROR.INVALID_SELECTION_TYPE);return {start:start,end:end}; }
  /** @param {any} l @param {any} p @returns {any} */
  function validateSource(l,p) {
    var s=source(l),d=s.value,text=String(d.text),baselines=d.baselineLocs,current=l;
    while(current){if(current.threeDLayer)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use texto e hierarquia em 2D.");current=current.parent;}
    if(s.numKeys||s.expression||d.boxText||!text.length||characterCount(text)>MAX_GLYPHS||/[\u0590-\u08ff\u200f\u202a-\u202e\t]/.test(text)||!baselines||!baselines.length)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use texto de ponto horizontal, estático e da esquerda para a direita.");
    if(host.LineOrientation&&typeof d.lineOrientation!=="undefined"&&d.lineOrientation!==host.LineOrientation.HORIZONTAL)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use linhas horizontais com quebras manuais.");
    for(var i=0;!(p.meta&&p.meta.renderer==="variable")&&i<baselines.length;i+=4)if(finite(baselines[i])&&Math.abs(baselines[i+1]-baselines[i+3])>.01)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use linhas horizontais com quebras manuais.");
    if(d.applyFill!==true||d.applyStroke===true)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use preenchimento sólido, sem contorno no texto original.");
    if(typeof d.characterRange!=="function")return fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"O host não expõe o estilo uniforme do texto.");
    var style=d.characterRange(0,text.length),attrs=/** @type {any} */(["font","fontSize","tracking","horizontalScale","verticalScale","baselineShift","fauxBold","fauxItalic","applyFill","applyStroke","fillColor"]);
    for(i=0;i<attrs.length;i++)if(typeof style[attrs[i]]==="undefined")return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use um estilo uniforme em toda a camada.");
    if(l.property("ADBE Mask Parade").numProperties||l.hasTrackMatte||l.isTrackMatte||l.solo||l.guideLayer)return fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Use texto sem máscaras, matte, solo ou camada guia.");
    var managed=p.meta&&p.meta.renderer==="variable"?p.meta.animators.length:p.legacy?1:0;
    if(l.property(TEXT).property(ANIMATORS).numProperties!==managed||l.property(EFFECTS).numProperties>(p.meta&&p.meta.renderer==="variable"||p.legacy?1:0))return fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Use texto sem outros animadores ou efeitos.");
    return null;
  }
  /** @param {any} c @param {any} m @param {any} a @param {boolean} write @returns {any[]} */
  function changes(c,m,a,write) { var out=/** @type {any} */([]);for(var i=0;i<CONTROLS.length;i++){var key=CONTROLS[i][0],p=control(c,m.controls[key]);if(same(p.value,a[key]))continue;if(p.numKeys||p.expression)throw error("Um controle animado seria substituído. Ajuste-o na timeline.",MotionContracts.ERROR.KEYFRAME_CONFLICT);out.push({name:m.controls[key],value:p.value,expression:p.expression,enabled:p.expressionEnabled,next:a[key]});}if(write)for(i=0;i<out.length;i++)control(c,out[i].name).setValue(out[i].next);return out; }
  /** @param {any} args @returns {any} */
  function prepare(args) {
    var e=validate(args);if(e)return {error:e};var comp=/** @type {any} */(app.project&&app.project.activeItem);if(!comp||!(comp instanceof CompItem))return {error:fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição.")};var p;
    try{p=resolve(comp);if(!p)return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione um texto, seu nulo ou o resultado do morph.")};e=inspect(p);if(e)return {error:e};}catch(invalid){var invalidError=/** @type {any} */(invalid);return {error:fail(invalidError.motionCode||MotionContracts.ERROR.INVALID_PRESET,String(invalidError.message||invalidError))};}
    p.comp=comp;p.args=normalized(args);p.time=comp.time;p.selectedIds=[];for(var si=0;si<comp.selectedLayers.length;si++)p.selectedIds.push((/** @type {any} */(comp.selectedLayers[si])).id);
    if(p.source.locked)return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Desbloqueie o texto.")};
    if(p.legacy&&!p.meta){var old=legacy.owned(p.source,p.legacy);if(!old)return {error:fail(MotionContracts.ERROR.EXPRESSION_CONFLICT,"O rig antigo foi personalizado.")};p.controller=old.controller;if(args.action!=="update")return {error:fail(MotionContracts.ERROR.TRACK_CONFLICT,"Use Atualizar para migrar o morph antigo.")};}
    if(args.action==="remove"||args.action==="bake"||args.action==="sweep"){
      if(!p.meta)return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"A camada não possui morph v2.")};
      if(args.action!=="remove"&&p.meta.fingerprint!==fingerprint(p.source))return {error:fail(MotionContracts.ERROR.TRACK_CONFLICT,"O texto mudou. Use Atualizar.")};
      if(args.action==="bake"){try{var interval=bakeInterval(p);if((interval.end-interval.start)/comp.frameDuration>MAX_FRAMES||!p.meta.baked&&estimate(p)>MAX_SAMPLES)return {error:fail(MotionContracts.ERROR.INVALID_PRESET,"Bake excede 3.600 quadros ou 120.000 amostras. Reduza o trecho.")};}catch(noInterval){var intervalError=/** @type {any} */(noInterval);return {error:fail(intervalError.motionCode||MotionContracts.ERROR.INVALID_PRESET,String(intervalError.message))};}}
      if(args.action==="sweep"){
        if(p.meta.baked)return {error:fail(MotionContracts.ERROR.TRACK_CONFLICT,"Use Atualizar antes de animar um morph convertido.")};var pos=p.controller.property(TRANSFORM).property("ADBE Position");if(pos.numKeys||pos.expression||pos.dimensionsSeparated)return {error:fail(MotionContracts.ERROR.KEYFRAME_CONFLICT,"Position do nulo já possui animação. Preserve-a antes de criar uma varredura.")};
        if(comp.time<p.source.inPoint||comp.time+p.args.sweepFrames*comp.frameDuration>p.source.outPoint+comp.frameDuration*.001)return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Não há tempo suficiente para a varredura.")};
      }return p;
    }
    e=validateSource(p.source,p);if(e)return {error:e};if(!p.meta&&!p.legacy&&!p.source.enabled)return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Ative o texto antes de aplicar.")};
    if(comp.time<p.source.inPoint||comp.time>=p.source.outPoint)return {error:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Posicione o tempo dentro da duração do texto.")};
    if(p.meta&&args.action==="apply"&&(p.meta.baked||p.meta.fingerprint!==fingerprint(p.source)))return {error:fail(MotionContracts.ERROR.TRACK_CONFLICT,"O texto mudou ou foi convertido. Use Atualizar.")};
    if(args.action==="update"&&p.meta){p.args=readControls(p.controller,p.meta);p.args.action="update";if(typeof args.renderer!=="undefined")p.args.renderer=args.renderer;}
    else if(p.legacy){for(si=0;si<5;si++)p.args[CONTROLS[si][0]]=control(p.controller,p.legacy.controls[CONTROLS[si][0]]).value;}
    p.renderer=renderer(p.source,p.args);var caps=capabilities(p.source);
    if(!host.MotionTextGlyphOutlines||!caps.outline)return {error:fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"O host não permite extrair os contornos das letras.")};
    if(p.renderer==="variable"&&(!caps.variable||p.args.weight!==0&&!caps.weight||p.args.contrast>0&&!caps.contrast||p.args.italic>0&&!caps.italic))return {error:fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"A fonte não possui os eixos solicitados. Escolha Espessura por aproximação.")};
    if(p.renderer==="outline"&&(p.args.contrast||p.args.italic))return {error:fail(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,"Contraste e Itálico por eixo exigem fonte variável. Use Inclinação para a aproximação.")};
    if(p.meta&&args.action==="apply"){if(p.renderer!==p.meta.renderer)return {error:fail(MotionContracts.ERROR.TRACK_CONFLICT,"Use Atualizar para trocar o motor do morph.")};try{changes(p.controller,p.meta,p.args,false);}catch(conflict){var conflictError=/** @type {any} */(conflict);return {error:fail(conflictError.motionCode,String(conflictError.message))};}}
    return p;
  }
  /** @param {number} distance @param {number} radius @param {number} strength @param {number} smoothness @returns {number} */
  function influence(distance,radius,strength,smoothness) { var u=Math.max(0,Math.min(1,1-distance/Math.max(1,radius))),s=Math.max(0,Math.min(100,smoothness))/100;return (u*(1-s)+u*u*(3-2*u)*s)*Math.max(0,Math.min(100,strength))/100; }
  /** @param {any} m @param {any} center @param {boolean} useNative @returns {string} */
  function kernel(m,center,useNative) { var ref=useNative?"thisLayer":"effect("+MotionJson.stringify(m.sourceLink)+")(1)";return PREFIX+"var src="+ref+",c=effect("+MotionJson.stringify(m.link)+")(1);function clamp(x,l,h){return Math.max(l,Math.min(h,x));}var f=0;\n"+(center?"var point="+MotionJson.stringify(center)+";":"var points="+MotionJson.stringify(m.points)+";var point=points[textIndex-1];")+"\nif(point&&src.text.sourceText.toString()==="+MotionJson.stringify(m.text)+"){var p=src.toComp(point),q=c.toComp(c.anchorPoint),dx=p[0]-q[0],dy=p[1]-q[1];var r=clamp(c.effect("+MotionJson.stringify(m.controls.radius)+")(1),1,5000),u=clamp(1-Math.sqrt(dx*dx+dy*dy)/r,0,1),s=clamp(c.effect("+MotionJson.stringify(m.controls.smoothness)+")(1),0,100)/100;f=(u*(1-s)+u*u*(3-2*u)*s)*clamp(c.effect("+MotionJson.stringify(m.controls.strength)+")(1),0,100)/100;}\n"; }
  /** @param {any} m @param {any} axis @returns {string} */
  function axisExpression(m,axis) { return PREFIX+"var c=effect("+MotionJson.stringify(m.link)+")(1),u=Math.max("+(axis.key==="weight"?-100:0)+",Math.min(100,c.effect("+MotionJson.stringify(m.controls[axis.key])+")(1)))/100;\n"+(axis.key==="weight"?axis.base+"+(u>=0?"+(axis.max-axis.base)+":"+(axis.base-axis.min)+")*u;":axis.base+"+"+(axis.target-axis.base)+"*u;"); }
  /** @param {any} m @param {string} name @param {boolean} useNative @returns {string} */
  function targetExpression(m,name,useNative) { var start=PREFIX+"var c=effect("+MotionJson.stringify(m.link)+")(1);\n";if(name==="scale")return start+"[Math.max(25,Math.min(300,c.effect("+MotionJson.stringify(m.controls.scaleX)+")(1))),Math.max(25,Math.min(300,c.effect("+MotionJson.stringify(m.controls.scaleY)+")(1))),100];";if(name==="skew")return start+"Math.max(-60,Math.min(60,c.effect("+MotionJson.stringify(m.controls.skew)+")(1)));";return start+"[0,"+m.fontSize+"*Math.max(-200,Math.min(200,c.effect("+MotionJson.stringify(m.controls.lift)+")(1)))/100"+(useNative?",0":"")+"];"; }
  /** @param {any} comp @param {any} l @param {any[]} points @param {number} time @param {boolean} [reverse] @returns {any[]} */
  function worldPoints(comp,l,points,time,reverse) { var scratch=null,out=[];try{scratch=comp.layers.addNull();scratch.enabled=false;var pos=scratch.property(TRANSFORM).property("ADBE Position");for(var i=0;i<points.length;i++){express(pos,"var p=thisComp.layer("+l.index+")."+(reverse?"fromComp":"toComp")+"("+MotionJson.stringify(points[i])+");[p[0],p[1]];");var v=pos.valueAtTime(time,false);if(pos.expressionError||!v||!finite(v[0])||!finite(v[1]))throw error("Não foi possível transformar o ponto da letra.");out.push([v[0],v[1]]);}}finally{if(scratch)scratch.remove();}return out; }
  /** @param {any} layer @param {any} parent */
  function attach(layer,parent) { layer.parent=parent;var t=layer.property(TRANSFORM);t.property("ADBE Anchor Point").setValue([0,0]);t.property("ADBE Position").setValue([0,0]);t.property("ADBE Scale").setValue([100,100]);t.property("ADBE Rotate Z").setValue(0); }
  /** @param {any} shape @param {string} name @returns {any} */
  function glyphGroup(shape,name) { return child(shape.property(ROOT),name); }
  /** @param {any} path @returns {any} */
  function nativeShape(path) { var s=new Shape();s.vertices=path.vertices;s.inTangents=path.inTangents;s.outTangents=path.outTangents;s.closed=path.closed;return s; }
  /** @param {any} p @param {any} m @param {any[]} glyphs @returns {any} */
  function createOutline(p,m,glyphs) {
    var l=p.comp.layers.addShape();p.created.push(l);l.name=p.source.name+" · Morph";l.enabled=false;attach(l,p.source);l.inPoint=p.source.inPoint;l.outPoint=p.source.outPoint;l.motionBlur=p.source.motionBlur;l.blendingMode=p.source.blendingMode;
    addControl(l,m.link,"ADBE Layer Control",p.controller.index);addControl(l,m.sourceLink,"ADBE Layer Control",p.source.index);
    for(var i=0;i<glyphs.length;i++){
      var glyph=glyphs[i],name="Glyph "+glyph.textIndex,g=l.property(ROOT).addProperty("ADBE Vector Group");g.name=name;
      for(var j=0;j<glyph.contours.length;j++){var cg=glyphGroup(l,name).property(CONTENTS).addProperty("ADBE Vector Shape - Group");cg.name="Contour "+(j+1);cg.property("ADBE Vector Shape").setValue(nativeShape(glyph.contours[j]));}
      var contents=glyphGroup(l,name).property(CONTENTS),merge=contents.addProperty("ADBE Vector Filter - Merge");merge.property("ADBE Vector Merge Type").setValue(1);
      contents=glyphGroup(l,name).property(CONTENTS);if(typeof contents.canAddProperty==="function"&&!contents.canAddProperty("ADBE Vector Filter - Offset"))throw error("Offset Paths não está disponível.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);var offset=contents.addProperty("ADBE Vector Filter - Offset");offset.name="Moti.on Offset";var lineJoin=offset.property("ADBE Vector Offset Line Join"),miter=offset.property("ADBE Vector Offset Miter Limit");if(lineJoin)lineJoin.setValue(1);if(miter)miter.setValue(4);
      contents=glyphGroup(l,name).property(CONTENTS);var fill=contents.addProperty("ADBE Vector Graphic - Fill");fill.property("ADBE Vector Fill Color").setValue(source(p.source).value.fillColor);fill.property("ADBE Vector Fill Opacity").setValue(100);
      var base=kernel(m,glyph.center,false),weight=base+"var w=clamp(c.effect("+MotionJson.stringify(m.controls.weight)+")(1),-100,100);\n"+m.fontSize+"*(w >= 0 ? .025 : .01)*w/100*f;";
      express(child(glyphGroup(l,name).property(CONTENTS),"Moti.on Offset").property("ADBE Vector Offset Amount"),weight);
      var t=glyphGroup(l,name).property(VECTOR_TRANSFORM);t.property("ADBE Vector Anchor").setValue(glyph.center);t.property("ADBE Vector Position").setValue(glyph.center);
      express(t.property("ADBE Vector Scale"),base+"[100+(clamp(c.effect("+MotionJson.stringify(m.controls.scaleX)+")(1),25,300)-100)*f,100+(clamp(c.effect("+MotionJson.stringify(m.controls.scaleY)+")(1),25,300)-100)*f];");
      express(t.property("ADBE Vector Skew"),base+"clamp(c.effect("+MotionJson.stringify(m.controls.skew)+")(1),-60,60)*f;");
      t.property("ADBE Vector Skew Axis").setValue(0);express(t.property("ADBE Vector Position"),base+"["+glyph.center[0]+","+glyph.center[1]+"+"+m.fontSize+"*clamp(c.effect("+MotionJson.stringify(m.controls.lift)+")(1),-200,200)/100*f];");
    }
    express(l.property(TRANSFORM).property("ADBE Opacity"),PREFIX+"effect("+MotionJson.stringify(m.sourceLink)+")(1).transform.opacity;");l.enabled=true;m.resultId=l.id;m.resultSignature=signature(l.property(ROOT));m.transformSignature=signature(l.property(TRANSFORM));return l;
  }
  /** @param {any} l @param {any} m @param {string} name @returns {any} */
  function animator(l,m,name) { var a=l.property(TEXT).property(ANIMATORS).addProperty("ADBE Text Animator");a.name=name;var selectors=a.property(SELECTORS);while(selectors.numProperties)selectors.property(selectors.numProperties).remove();return child(l.property(TEXT).property(ANIMATORS),name); }
  /** @param {any} l @param {string} name @param {string} matchName @param {any} value @param {string} [expression] */
  function animatorProperty(l,name,matchName,value,expression) { var a=child(l.property(TEXT).property(ANIMATORS),name),p=a.property(PROPS).addProperty(matchName);p.setValue(value);if(expression)express(p,expression); }
  /** @param {any} p @param {any} m @returns {void} */
  function createVariable(p,m) {
    addControl(p.source,m.link,"ADBE Layer Control",p.controller.index);p.sourceCreatedEffects.push(m.link);
    var name="Moti.on "+m.rigId+" Native "+m.generation,a;animator(p.source,m,name);p.sourceCreatedAnimators.push(name);
    for(var i=0;i<m.axes.length;i++){a=child(p.source.property(TEXT).property(ANIMATORS),name);if(typeof a.property(PROPS).addVariableFontAxis!=="function")throw error("A API de eixos variáveis não está disponível.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);var axis=m.axes[i],prop=a.property(PROPS).addVariableFontAxis(axis.tag);axis.matchName=prop.matchName;express(prop,axisExpression(m,axis));}
    animatorProperty(p.source,name,"ADBE Text Scale 3D",[100,100,100],targetExpression(m,"scale",true));animatorProperty(p.source,name,"ADBE Text Skew",0,targetExpression(m,"skew",true));animatorProperty(p.source,name,"ADBE Text Position 3D",[0,0,0],targetExpression(m,"position",true));
    a=child(p.source.property(TEXT).property(ANIMATORS),name);var sel=a.property(SELECTORS).addProperty("ADBE Text Expressible Selector");sel.name="Moti.on Proximity";sel.property("ADBE Text Range Type2").setValue(1);express(sel.property("ADBE Text Expressible Amount"),kernel(m,null,true)+"[f*100,f*100,f*100];");m.animators=[{name:name,signature:signature(child(p.source.property(TEXT).property(ANIMATORS),name))}];
  }
  /** @param {any} value @returns {any} */
  function copy(value) { return MotionJson.parse(MotionJson.stringify(value)); }
  /** @param {any} property @returns {any} */
  function snapshotProperty(property) {
    var out=/** @type {any} */({name:property.name,matchName:property.matchName,group:!!property.numProperties||typeof property.addProperty==="function",children:[],keys:[]});
    if(out.group){for(var i=1;i<=property.numProperties;i++)out.children.push(snapshotProperty(property.property(i)));}
    else{out.value=property.valueAtTime?property.valueAtTime(0,true):property.value;out.expression=property.expression||"";out.enabled=!!property.expressionEnabled;for(var k=1;k<=property.numKeys;k++){var key=/** @type {any} */({time:property.keyTime(k),value:property.keyValue(k)});if(typeof property.keyInInterpolationType==="function"){key.inType=property.keyInInterpolationType(k);key.outType=property.keyOutInterpolationType(k);}if(typeof property.keyInTemporalEase==="function"){key.inEase=property.keyInTemporalEase(k);key.outEase=property.keyOutTemporalEase(k);}out.keys.push(key);}}
    return out;
  }
  /** @param {any} parent @param {any} data @param {any[]} axes @returns {any} */
  function restoreProperty(parent,data,axes) {
    var property=child(parent,data.name);if(!property||property.matchName!==data.matchName){property=null;if(data.matchName.indexOf("ADBE Text VF Axis ")===0){for(var ai=0;ai<axes.length;ai++)if(axes[ai].matchName===data.matchName){property=parent.addVariableFontAxis(axes[ai].tag);break;}}else property=parent.addProperty(data.matchName);if(property&&data.matchName==="ADBE Text Animator"){var initialSelectors=property.property(SELECTORS);while(initialSelectors.numProperties)initialSelectors.property(initialSelectors.numProperties).remove();}if(!property)throw error("Não foi possível restaurar a propriedade do morph.",MotionContracts.ERROR.ROLLBACK_FAILED);property.name=data.name;}
    if(data.group){for(var i=0;i<data.children.length;i++){property=child(parent,data.name);restoreProperty(property,data.children[i],axes);}}
    else{if(!data.expression&&!data.keys.length&&!property.expression&&!property.numKeys&&same(property.value,data.value))return property;property.expression="";for(var k=property.numKeys;k>=1;k--)property.removeKey(k);if(data.keys.length){for(k=0;k<data.keys.length;k++){var key=data.keys[k];property.setValueAtTime(key.time,key.value);if(key.inType)property.setInterpolationTypeAtKey(k+1,key.inType,key.outType);if(key.inEase&&typeof property.setTemporalEaseAtKey==="function")property.setTemporalEaseAtKey(k+1,key.inEase,key.outEase);}}else property.setValue(data.value);if(data.expression){property.expression=data.expression;property.expressionEnabled=data.enabled;}}
    return child(parent,data.name);
  }
  /** @param {any} layer @returns {any} */
  function snapshotLayer(layer) { var groups=/** @type {any[]} */([EFFECTS,TRANSFORM]);if(layer.property(ROOT))groups.push(ROOT);return {id:layer.id,name:layer.name,comment:layer.comment,enabled:layer.enabled,inPoint:layer.inPoint,outPoint:layer.outPoint,parent:layer.parent,motionBlur:layer.motionBlur,blendingMode:layer.blendingMode,shape:!!layer.property(ROOT),groups:(function(){var out=[];for(var i=0;i<groups.length;i++)out.push(snapshotProperty(layer.property(groups[i])));return out;})()}; }
  /** @param {any} p @returns {any} */
  function snapshotRig(p) { var m=p.meta||p.legacy,out=/** @type {any} */({sourceComment:p.source.comment,sourceEnabled:p.source.enabled,controllerComment:p.controller&&p.controller.comment,meta:p.meta?copy(p.meta):null,legacy:p.legacy,groups:[],result:p.result?snapshotLayer(p.result):null,controller:p.controller?snapshotLayer(p.controller):null});if(m&&(!p.meta||p.meta.renderer==="variable")){var names=p.meta?p.meta.animators:[{name:p.legacy.animator}];for(var i=0;i<names.length;i++)out.groups.push({parent:ANIMATORS,data:snapshotProperty(child(p.source.property(TEXT).property(ANIMATORS),names[i].name))});out.groups.push({parent:EFFECTS,data:snapshotProperty(child(p.source.property(EFFECTS),m.link))});}return out; }
  /** @param {any} comp @param {any} data @returns {any} */
  function restoreLayer(comp,data) { var l=byId(comp,data.id);if(l)return l;l=data.shape?comp.layers.addShape():comp.layers.addNull();l.name=data.name;l.comment=data.comment;l.enabled=data.enabled;l.inPoint=data.inPoint;l.outPoint=data.outPoint;l.parent=data.parent;l.motionBlur=data.motionBlur;l.blendingMode=data.blendingMode;for(var i=0;i<data.groups.length;i++){var d=data.groups[i],g=l.property(d.matchName);for(var j=0;j<d.children.length;j++)restoreProperty(g,d.children[j],[]);}return l; }
  /** @param {any} p @param {any} backup */
  function restoreRig(p,backup) { var m=backup.meta,c=backup.controller?restoreLayer(p.comp,backup.controller):p.controller,r=backup.result?restoreLayer(p.comp,backup.result):null;for(var i=0;i<backup.groups.length;i++){var g=backup.groups[i],parent=g.parent===ANIMATORS?p.source.property(TEXT).property(ANIMATORS):p.source.property(EFFECTS);if(!child(parent,g.data.name))restoreProperty(parent,g.data,m?m.axes:backup.legacy.axes||[]);}if(backup.controller&&c){for(var cg=0;cg<backup.controller.groups.length;cg++){var savedGroup=backup.controller.groups[cg];if(savedGroup.matchName===EFFECTS)for(var ce=0;ce<savedGroup.children.length;ce++)if(!child(c.property(EFFECTS),savedGroup.children[ce].name))restoreProperty(c.property(EFFECTS),savedGroup.children[ce],[]);}}p.source.comment=backup.sourceComment;p.source.enabled=backup.sourceEnabled;if(c)c.comment=backup.controllerComment;if(m){if(r){m.resultId=r.id;control(r,m.link).setValue(c.index);control(r,m.sourceLink).setValue(p.source.index);}else control(p.source,m.link).setValue(c.index);m.controllerId=c.id;save(p.source,m);if(c.id!==backup.controller.id)save(c,{schemaVersion:2,role:"controller",rigId:m.rigId,sourceId:p.source.id,controllerId:c.id});p.meta=m;}p.controller=c;p.result=r;p.selectionRemap={};if(backup.controller&&c.id!==backup.controller.id)p.selectionRemap[backup.controller.id]=c.id;if(backup.result&&r.id!==backup.result.id)p.selectionRemap[backup.result.id]=r.id; }
  /** @param {any} p @param {any} m */
  function discardOld(p,m) { save(p.source,m);if(p.meta){if(p.meta.renderer==="outline")p.result.remove();else{for(var i=p.meta.animators.length-1;i>=0;i--)child(p.source.property(TEXT).property(ANIMATORS),p.meta.animators[i].name).remove();child(p.source.property(EFFECTS),p.meta.link).remove();}}else if(p.legacy){var o=legacy.owned(p.source,p.legacy);legacy.save(p.source,null);legacy.save(p.controller,null);o.animator.remove();o.link.remove();} }
  /** @param {any} p @returns {any} */
  function apply(p) {
    var l=p.source,oldComment=l.comment,oldEnabled=l.enabled,controller=p.controller,controllerComment=controller&&controller.comment,changed=[],newControls=[],createdController=false,oldMeta=p.meta,newResult=null,m,backup=p.meta||p.legacy?snapshotRig(p):null;
    p.created=[];p.sourceCreatedEffects=[];p.sourceCreatedAnimators=[];
    try{
      if(p.meta&&p.args.action==="apply"){
        changed=changes(controller,p.meta,p.args,true);m=p.meta;m.preset=p.args.preset;m.requestedRenderer=p.args.renderer;m.sweepFrames=p.args.sweepFrames;m.sweepDirection=p.args.sweepDirection;save(l,m);save(controller,{schemaVersion:2,role:"controller",rigId:m.rigId,sourceId:l.id,controllerId:controller.id});return {changed:true,warnings:[],data:{appliedCount:1,renderer:m.renderer,controllerLayerId:controller.id,glyphCount:m.glyphCount}};
      }
      var extracted=host.MotionTextGlyphOutlines.extract(p.comp,l,p.created),glyphs=extracted.glyphs;if(!glyphs.length||glyphs.length>MAX_GLYPHS||extracted.vertexCount>12000)throw error("Use até 128 glifos e 12.000 vértices.",MotionContracts.ERROR.INVALID_SELECTION_TYPE);
      if(!controller){createdController=true;controller=p.comp.layers.addNull();p.created.push(controller);controller.name="Moti.on Morph · "+l.name;controller.inPoint=l.inPoint;controller.outPoint=l.outPoint;var combined=host.MotionTextGlyphOutlines.bounds?host.MotionTextGlyphOutlines.bounds((function(){var paths=[];for(var gi=0;gi<glyphs.length;gi++)for(var ci=0;ci<glyphs[gi].contours.length;ci++)paths.push(glyphs[gi].contours[ci]);return paths;})()):l.sourceRectAtTime(p.time,false);var center=[combined.left+combined.width/2,combined.top+combined.height/2],world=worldPoints(p.comp,l,[center],p.time)[0];controller.property(TRANSFORM).property("ADBE Position").setValue(world);}
      p.controller=controller;m=/** @type {any} */({schemaVersion:2,role:"source",rigId:p.meta?p.meta.rigId:"pm-"+new Date().getTime()+"-"+l.id,generation:p.meta?(p.meta.generation||0)+1:1,sourceId:l.id,controllerId:controller.id,renderer:p.renderer,requestedRenderer:p.args.renderer,preset:p.args.preset,sweepFrames:p.args.sweepFrames,sweepDirection:p.args.sweepDirection,originalEnabled:p.meta?p.meta.originalEnabled:oldEnabled,fontSize:source(l).value.fontSize,text:String(source(l).value.text),fingerprint:fingerprint(l),controls:{},glyphCount:glyphs.length,glyphs:[],points:[],axes:legacy.axes(source(l).value),animators:[],baked:false,resultId:0});
      m.link="Moti.on "+m.rigId+" Control "+m.generation;m.sourceLink="Moti.on "+m.rigId+" Source";
      for(var i=0;i<CONTROLS.length;i++){var key=CONTROLS[i][0],controlName=p.meta?p.meta.controls[key]:p.legacy&&p.legacy.controls[key]?p.legacy.controls[key]:CONTROLS[i][1];m.controls[key]=controlName;if(!control(controller,controlName)){addControl(controller,controlName,"ADBE Slider Control",p.args[key]);newControls.push(controlName);}}
      for(i=0;i<glyphs.length;i++){var glyph=glyphs[i];m.glyphs.push({textIndex:glyph.textIndex,sourceIndex:glyph.sourceIndex,character:glyph.character,center:glyph.center,bounds:glyph.bounds});while(m.points.length<glyph.textIndex)m.points.push(null);if(m.points[glyph.textIndex-1])throw error("Índices de glifo ambíguos.");m.points[glyph.textIndex-1]=glyph.center;}
      if(p.renderer==="outline")newResult=createOutline(p,m,glyphs);else createVariable(p,m);
      save(controller,{schemaVersion:2,role:"controller",rigId:m.rigId,sourceId:l.id,controllerId:controller.id});if(newResult)save(newResult,{schemaVersion:2,role:"outline",rigId:m.rigId,sourceId:l.id,controllerId:controller.id});l.enabled=p.renderer==="outline"?false:m.originalEnabled;
      discardOld(p,m);p.meta=m;p.result=newResult;p.createdController=createdController;
      return {changed:true,warnings:[],data:{appliedCount:1,renderer:m.renderer,controllerLayerId:controller.id,controllerName:controller.name,glyphCount:m.glyphCount}};
    }catch(e){var bad=false;for(var ai=p.sourceCreatedAnimators.length-1;ai>=0;ai--)try{var a=child(l.property(TEXT).property(ANIMATORS),p.sourceCreatedAnimators[ai]);if(a)a.remove();}catch(ra){bad=true;}for(var ei=p.sourceCreatedEffects.length-1;ei>=0;ei--)try{var effect=child(l.property(EFFECTS),p.sourceCreatedEffects[ei]);if(effect)effect.remove();}catch(re){bad=true;}for(var li=p.created.length-1;li>=0;li--)try{p.created[li].remove();}catch(rl){bad=true;}if(!createdController&&controller)for(var ni=newControls.length-1;ni>=0;ni--)try{child(controller.property(EFFECTS),newControls[ni]).remove();}catch(rc){bad=true;}try{for(var ch=0;ch<changed.length;ch++){var cp=control(controller,changed[ch].name);cp.setValue(changed[ch].value);cp.expression=changed[ch].expression;cp.expressionEnabled=changed[ch].enabled;}l.comment=oldComment;l.enabled=oldEnabled;if(!createdController&&controller)controller.comment=controllerComment;p.meta=oldMeta;if(backup)restoreRig(p,backup);}catch(rs){bad=true;}if(bad)throw error("O rollback do morph falhou.",MotionContracts.ERROR.ROLLBACK_FAILED);throw e;}
  }
  /** @param {any} p @returns {any[]} */
  function managedProperties(p) { var out=[],m=p.meta;if(m.renderer==="outline"){for(var i=0;i<m.glyphs.length;i++){var g=glyphGroup(p.result,"Glyph "+m.glyphs[i].textIndex),t=g.property(VECTOR_TRANSFORM);out.push(child(g.property(CONTENTS),"Moti.on Offset").property("ADBE Vector Offset Amount"),t.property("ADBE Vector Scale"),t.property("ADBE Vector Skew"),t.property("ADBE Vector Position"));}out.push(p.result.property(TRANSFORM).property("ADBE Opacity"));}return out; }
  /** @param {any} p @returns {number} */
  function estimate(p) { var interval=bakeInterval(p),count=p.meta.renderer==="outline"?p.meta.glyphCount*4+1:p.meta.glyphCount*(p.meta.axes.length+3);return (Math.ceil((interval.end-interval.start)/p.comp.frameDuration*4)+1)*count*3; }
  /** @param {any} p @param {number} step @returns {number[]} */
  function sampleTimes(p,step) { var interval=bakeInterval(p),out=[],start=interval.start,end=interval.end-p.comp.frameDuration*.001;for(var i=0;start+i*p.comp.frameDuration*step<end;i++)out.push(start+i*p.comp.frameDuration*step);out.push(end);return out; }
  /** @param {any} p @param {number[]} times @param {any[]} values */
  function writeKeys(p,times,values) { p.expression="";p.expressionEnabled=false;if(typeof p.setValuesAtTimes==="function")p.setValuesAtTimes(times,values);else for(var i=0;i<times.length;i++)p.setValueAtTime(times[i],values[i]);for(var k=1;k<=p.numKeys;k++)p.setInterpolationTypeAtKey(k,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR); }
  /** @param {any[]} times @param {any[]} values @returns {any} */
  function compact(times,values) { var t=[],v=[];for(var i=0;i<times.length;i++)if(i===0||i===times.length-1||!same(values[i-1],values[i])||!same(values[i],values[i+1])){t.push(times[i]);v.push(values[i]);}return {times:t,values:v}; }
  /** @param {any} a @param {any} b @param {number} tolerance @returns {boolean} */
  function closeSample(a,b,tolerance) { if(finite(a)&&finite(b))return Math.abs(a-b)<=tolerance;if(a&&b&&typeof a.length==="number"&&a.length===b.length){for(var i=0;i<a.length;i++)if(!closeSample(a[i],b[i],tolerance))return false;return true;}return false; }
  /** @param {any} a @param {any} b @returns {any} */
  function midpointValue(a,b) { if(finite(a)&&finite(b))return (a+b)/2;var out=[];for(var i=0;i<a.length;i++)out.push(midpointValue(a[i],b[i]));return out; }
  /** @param {string} matchName @returns {number} */
  function sampleTolerance(matchName) { return matchName.indexOf("VF Axis") >= 0 ? .05 : matchName.indexOf("Scale") >= 0 || matchName.indexOf("Skew") >= 0 ? .02 : .025; }
  /** @param {number[]} initialTimes @param {any[]} initialValues @param {any} read @param {any[]} tolerances @returns {any} */
  function fitSamples(initialTimes,initialValues,read,tolerances) {
    var times=/** @type {any} */(initialTimes),values=initialValues,count=times.length*values.length,cache=/** @type {any} */({});
    for(var initial=0;initial<times.length;initial++){var initialRow=[];for(var track=0;track<values.length;track++)initialRow.push(values[track][initial]);cache[String(times[initial])]=initialRow;}
    for(var round=0;round<12;round++){
      var mids=[],i,j;for(i=0;i<times.length-1;i++)mids.push((times[i]+times[i+1])/2);
      var unread=[];for(i=0;i<mids.length;i++)if(!Object.prototype.hasOwnProperty.call(cache,String(mids[i])))unread.push(mids[i]);
      count+=unread.length*values.length;if(count>MAX_SAMPLES)throw error("Bake excedeu 120.000 amostras durante a validação. Reduza o trecho.",MotionContracts.ERROR.INVALID_PRESET);
      if(unread.length){var sampled=read(unread);for(i=0;i<unread.length;i++){var row=[];for(j=0;j<values.length;j++)row.push(sampled[j][i]);cache[String(unread[i])]=row;}}
      var checks=/** @type {any[]} */([]);for(j=0;j<values.length;j++){var checked=[];for(i=0;i<mids.length;i++)checked.push(cache[String(mids[i])][j]);checks.push(checked);}var bad=[],hasBad=false;for(i=0;i<mids.length;i++){bad[i]=false;for(j=0;j<values.length;j++)if(!closeSample(checks[j][i],midpointValue(values[j][i],values[j][i+1]),tolerances[j])){bad[i]=true;hasBad=true;break;}}
      if(!hasBad){count+=mids.length*values.length;if(count>MAX_SAMPLES)throw error("Bake excedeu o limite de amostras antes da conversão.",MotionContracts.ERROR.INVALID_PRESET);return {times:times,values:values,checkTimes:mids,checkValues:checks,samples:count};}
      if(round===11)throw error("A animação varia rápido demais para um Bake fiel. Reduza a velocidade ou divida o trecho.",MotionContracts.ERROR.HOST_OPERATION_FAILED);
      var nextTimes=/** @type {any[]} */([]),nextValues=/** @type {any[]} */([]);for(j=0;j<values.length;j++)nextValues.push([]);
      for(i=0;i<times.length;i++){nextTimes.push(times[i]);for(j=0;j<values.length;j++)nextValues[j].push(values[j][i]);if(bad[i]){nextTimes.push(mids[i]);for(j=0;j<values.length;j++)nextValues[j].push(checks[j][i]);}}
      times=nextTimes;values=nextValues;
    }throw error("Não foi possível validar o Bake.");
  }
  /** @param {any[]} properties @param {number[]} times @returns {any[]} */
  function readProperties(properties,times) { var out=/** @type {any[]} */([]);for(var i=0;i<properties.length;i++){var values=[];for(var j=0;j<times.length;j++){values.push(properties[i].valueAtTime(times[j],false));if(properties[i].expressionError)throw error("Uma expressão do morph falhou durante o Bake.");}out.push(values);}return out; }
  /** @param {any[]} properties @param {any} fit @param {any[]} tolerances */
  function verifyBaked(properties,fit,tolerances) { var actual=readProperties(properties,fit.checkTimes);for(var i=0;i<properties.length;i++)for(var j=0;j<fit.checkTimes.length;j++)if(!closeSample(actual[i][j],fit.checkValues[i][j],tolerances[i]))throw error("O Bake não preservou os valores entre os quadros."); }
  /** @param {any} p @returns {any} */
  function bakeOutline(p) {
    if(p.meta.baked)return {changed:false,warnings:[],data:{bakedCount:0,renderer:"outline"}};var props=managedProperties(p),times=sampleTimes(p,.25),snapshots=/** @type {any} */([]),oldSourceComment=p.source.comment,m=p.meta,oldMeta=copy(m),i,k,tolerances=[];
    for(i=0;i<props.length;i++){var prop=props[i];if(prop.numKeys)throw error("Uma propriedade gerenciada contém keyframes manuais.",MotionContracts.ERROR.KEYFRAME_CONFLICT);snapshots.push({property:prop,value:prop.valueAtTime(p.time,true),expression:prop.expression,enabled:prop.expressionEnabled});tolerances.push(sampleTolerance(prop.matchName));}
    var fit=fitSamples(times,readProperties(props,times),/** @param {number[]} checkTimes */function(checkTimes){return readProperties(props,checkTimes);},tolerances);
    try{for(i=0;i<props.length;i++){var data=compact(fit.times,fit.values[i]);writeKeys(props[i],data.times,data.values);}verifyBaked(props,fit,tolerances);m.baked=true;m.resultSignature=signature(p.result.property(ROOT));m.transformSignature=signature(p.result.property(TRANSFORM));save(p.source,m);return {changed:true,warnings:[],data:{bakedCount:1,renderer:"outline",samples:fit.samples}};}
    catch(e){var bad=false;for(i=snapshots.length-1;i>=0;i--)try{var snapshot=snapshots[i];for(k=snapshot.property.numKeys;k>=1;k--)snapshot.property.removeKey(k);snapshot.property.setValue(snapshot.value);snapshot.property.expression=snapshot.expression;snapshot.property.expressionEnabled=snapshot.enabled;}catch(restore){bad=true;}try{p.source.comment=oldSourceComment;p.meta=oldMeta;}catch(comment){bad=true;}if(bad)throw error("O rollback do Bake falhou.",MotionContracts.ERROR.ROLLBACK_FAILED);throw e;}
  }
  /** @param {any} layer @param {string} name @param {number} textIndex */
  function rangeSelector(layer,name,textIndex) {
    var a=child(layer.property(TEXT).property(ANIMATORS),name),sel=a.property(SELECTORS).addProperty("ADBE Text Selector"),advanced=sel.property("ADBE Text Range Advanced");if(!advanced)throw error("Range Selector indexado indisponível.",MotionContracts.ERROR.CAPABILITY_UNAVAILABLE);
    advanced.property("ADBE Text Range Units").setValue(2);advanced.property("ADBE Text Range Type2").setValue(1);advanced.property("ADBE Text Range Shape").setValue(1);advanced.property("ADBE Text Selector Smoothness").setValue(0);advanced.property("ADBE Text Selector Max Amount").setValue(100);advanced.property("ADBE Text Levels Max Ease").setValue(0);advanced.property("ADBE Text Levels Min Ease").setValue(0);advanced.property("ADBE Text Randomize Order").setValue(0);
    sel.property("ADBE Text Index Start").setValue(textIndex-1);sel.property("ADBE Text Index End").setValue(textIndex);sel.property("ADBE Text Index Offset").setValue(0);
  }
  /** @param {any} p @param {number[]} times @returns {any} */
  function nativeSamples(p,times) {
    var m=p.meta,tracks=/** @type {any} */([]),a=child(p.source.property(TEXT).property(ANIMATORS),m.animators[0].name),ap=a.property(PROPS),scratch=null,frames=/** @type {any} */([]),i,j;
    for(i=0;i<m.axes.length;i++)tracks.push({matchName:m.axes[i].matchName,axis:m.axes[i],neutral:m.axes[i].base,property:ap.property(m.axes[i].matchName)});tracks.push({matchName:"ADBE Text Scale 3D",neutral:[100,100,100],property:ap.property("ADBE Text Scale 3D")},{matchName:"ADBE Text Skew",neutral:0,property:ap.property("ADBE Text Skew")},{matchName:"ADBE Text Position 3D",neutral:[0,0,0],property:ap.property("ADBE Text Position 3D")});
    try{scratch=p.comp.layers.addNull();scratch.enabled=false;var pos=scratch.property(TRANSFORM).property("ADBE Position"),basis=/** @type {any} */([]),probePoints=/** @type {any} */([[0,0],[1,0],[0,1]]);
      for(i=0;i<4;i++){var layer=i<3?p.source:p.controller,point=i<3?MotionJson.stringify(probePoints[i]):"l.anchorPoint";express(pos,"var l=thisComp.layer("+layer.index+"),p=l.toComp("+point+");[p[0],p[1]];");var data=[];for(j=0;j<times.length;j++){var q=pos.valueAtTime(times[j],false);if(pos.expressionError||!q||!finite(q[0])||!finite(q[1]))throw error("A transformação do texto não pôde ser amostrada.");data.push([q[0],q[1]]);}basis.push(data);}
      for(i=0;i<times.length;i++){var frame=/** @type {any} */({basis:[basis[0][i],basis[1][i],basis[2][i]],controller:basis[3][i],radius:control(p.controller,m.controls.radius).valueAtTime(times[i],false),strength:control(p.controller,m.controls.strength).valueAtTime(times[i],false),smoothness:control(p.controller,m.controls.smoothness).valueAtTime(times[i],false),targets:[]});for(j=0;j<tracks.length;j++){var v=tracks[j].property.valueAtTime(times[i],false);if(tracks[j].property.expressionError)throw error("Um eixo variável falhou ao amostrar.");frame.targets.push(v);}frames.push(frame);}
    }finally{if(scratch)scratch.remove();}
    var outputs=/** @type {any} */([]);for(i=0;i<m.glyphs.length;i++){var values=/** @type {any} */([]);for(j=0;j<tracks.length;j++)values.push([]);for(var k=0;k<times.length;k++){var f=frames[k],center=m.glyphs[i].center,b=f.basis,px=b[0][0]+center[0]*(b[1][0]-b[0][0])+center[1]*(b[2][0]-b[0][0]),py=b[0][1]+center[0]*(b[1][1]-b[0][1])+center[1]*(b[2][1]-b[0][1]),dx=px-f.controller[0],dy=py-f.controller[1],amount=influence(Math.sqrt(dx*dx+dy*dy),f.radius,f.strength,f.smoothness);for(j=0;j<tracks.length;j++){var target=f.targets[j],neutral=tracks[j].neutral,vv;if(typeof neutral==="number")vv=neutral+(target-neutral)*amount;else{vv=[];for(var dim=0;dim<neutral.length;dim++)vv.push(neutral[dim]+(target[dim]-neutral[dim])*amount);}values[j].push(vv);}}outputs.push(values);}return {tracks:tracks,values:outputs};
  }
  /** @param {any} p @returns {any} */
  function bakeVariable(p) {
    if(p.meta.baked)return {changed:false,warnings:[],data:{bakedCount:0,renderer:"variable"}};var m=p.meta,times=sampleTimes(p,.25),data=nativeSamples(p,times),names=/** @type {any} */([]),oldComment=p.source.comment,oldNames=m.animators,newRecords=[],backup=snapshotRig(p),i,j,flat,tolerances=[],properties=[];
    /** @param {any} sampled @returns {any[]} */
    function flatten(sampled) { var out=[];for(var gi=0;gi<m.glyphs.length;gi++)for(var ti=0;ti<sampled.tracks.length;ti++)out.push(sampled.values[gi][ti]);return out; }
    flat=flatten(data);for(i=0;i<m.glyphs.length;i++)for(j=0;j<data.tracks.length;j++)tolerances.push(sampleTolerance(data.tracks[j].matchName));
    var fit=fitSamples(times,flat,/** @param {number[]} checkTimes */function(checkTimes){return flatten(nativeSamples(p,checkTimes));},tolerances);
    try{for(i=0;i<m.glyphs.length;i++){var name="Moti.on "+m.rigId+" Baked "+m.glyphs[i].textIndex;animator(p.source,m,name);names.push(name);for(j=0;j<data.tracks.length;j++){var track=data.tracks[j],a=child(p.source.property(TEXT).property(ANIMATORS),name),prop=track.axis?a.property(PROPS).addVariableFontAxis(track.axis.tag):a.property(PROPS).addProperty(track.matchName),values=compact(fit.times,fit.values[i*data.tracks.length+j]);writeKeys(prop,values.times,values.values);}rangeSelector(p.source,name,m.glyphs[i].textIndex);newRecords.push({name:name,signature:signature(child(p.source.property(TEXT).property(ANIMATORS),name))});}
      for(i=0;i<names.length;i++)for(j=0;j<data.tracks.length;j++)properties.push(child(p.source.property(TEXT).property(ANIMATORS),names[i]).property(PROPS).property(data.tracks[j].matchName));verifyBaked(properties,fit,tolerances);
      // All samples and indexed animators are verified before removing the contextual selector.
      m.animators=newRecords;m.baked=true;save(p.source,m);for(i=oldNames.length-1;i>=0;i--)child(p.source.property(TEXT).property(ANIMATORS),oldNames[i].name).remove();return {changed:true,warnings:[],data:{bakedCount:1,renderer:"variable",samples:fit.samples}};
    }catch(e){var bad=false;for(i=names.length-1;i>=0;i--)try{var created=child(p.source.property(TEXT).property(ANIMATORS),names[i]);if(created)created.remove();}catch(remove){bad=true;}m.animators=oldNames;m.baked=false;try{p.source.comment=oldComment;restoreRig(p,backup);}catch(restore){bad=true;}if(bad)throw error("O rollback do Bake variável falhou.",MotionContracts.ERROR.ROLLBACK_FAILED);throw e;}
  }
  /** @param {any} p @returns {boolean} */
  function externalControllerReferences(p) {
    var c=p.controller,index=c.index,name=String(c.name),escaped=MotionJson.stringify(name).slice(1,-1),numeric=new RegExp("(?:thisComp\\s*\\.\\s*)?layer\\s*\\(\\s*"+index+"\\s*\\)");
    /** @param {any} property @returns {boolean} */
    function references(property) { if(property.numProperties){for(var i=1;i<=property.numProperties;i++)if(references(property.property(i)))return true;}else{if(property.matchName==="ADBE Layer Control-0001"){if(property.value===index)return true;for(var k=1;k<=property.numKeys;k++)if(property.keyValue(k)===index)return true;}var expression=String(property.expression||"");if(expression&&(expression.indexOf(name)>=0||expression.indexOf(escaped)>=0||numeric.test(expression)))return true;}return false; }
    for(var li=1;li<=p.comp.numLayers;li++){var l=p.comp.layer(li);if(l!==p.source&&l!==p.result&&l!==c&&references(l))return true;}return false;
  }
  /** @param {any} p @returns {any} */
  function remove(p) {
    var l=p.source,m=p.meta,c=p.controller,retain=c.property(EFFECTS).numProperties>CONTROLS.length||externalControllerReferences(p),backup=snapshotRig(p),i;
    for(i=1;i<=p.comp.numLayers;i++)if(p.comp.layer(i).parent===c)retain=true;
    try{l.enabled=m.originalEnabled;save(l,null);if(retain){save(c,null);for(i=CONTROLS.length-1;i>=0;i--)child(c.property(EFFECTS),m.controls[CONTROLS[i][0]]).remove();}if(m.renderer==="outline")p.result.remove();else{for(i=m.animators.length-1;i>=0;i--)child(l.property(TEXT).property(ANIMATORS),m.animators[i].name).remove();child(l.property(EFFECTS),m.link).remove();}if(!retain)c.remove();p.removed=true;return {changed:true,warnings:[],data:{removed:true,controllerRetained:retain,appliedCount:1}};}
    catch(e){try{restoreRig(p,backup);}catch(restore){throw error("O rollback da remoção falhou.",MotionContracts.ERROR.ROLLBACK_FAILED);}throw e;}
  }
  /** @param {any} p @returns {any} */
  function sweep(p) { var points=[];for(var i=0;i<p.meta.glyphs.length;i++)points.push(p.meta.glyphs[i].center);var world=worldPoints(p.comp,p.source,points,p.time),left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(i=0;i<world.length;i++){left=Math.min(left,world[i][0]);right=Math.max(right,world[i][0]);top=Math.min(top,world[i][1]);bottom=Math.max(bottom,world[i][1]);}var radius=Math.max(1,control(p.controller,p.meta.controls.radius).value),direction=p.args.sweepDirection,x=(left+right)/2,y=(top+bottom)/2,start=direction==="left-to-right"?[left-radius,y]:direction==="right-to-left"?[right+radius,y]:direction==="top-to-bottom"?[x,top-radius]:[x,bottom+radius],end=direction==="left-to-right"?[right+radius,y]:direction==="right-to-left"?[left-radius,y]:direction==="top-to-bottom"?[x,bottom+radius]:[x,top-radius],pos=p.controller.property(TRANSFORM).property("ADBE Position"),old=pos.valueAtTime(p.time,true),oldComment=p.source.comment,oldMeta=copy(p.meta);if(p.controller.parent){start=worldPoints(p.comp,p.controller.parent,[start],p.time,true)[0];end=worldPoints(p.comp,p.controller.parent,[end],p.time+p.args.sweepFrames*p.comp.frameDuration,true)[0];}try{pos.setValueAtTime(p.time,start);pos.setValueAtTime(p.time+p.args.sweepFrames*p.comp.frameDuration,end);for(i=1;i<=pos.numKeys;i++)pos.setInterpolationTypeAtKey(i,KeyframeInterpolationType.LINEAR,KeyframeInterpolationType.LINEAR);p.meta.sweepFrames=p.args.sweepFrames;p.meta.sweepDirection=direction;save(p.source,p.meta);return {changed:true,warnings:[],data:{sweep:true,controllerLayerId:p.controller.id}};}catch(e){for(i=pos.numKeys;i>=1;i--)pos.removeKey(i);pos.setValue(old);p.source.comment=oldComment;p.meta=oldMeta;throw e;} }
  /** @param {any} args @returns {boolean} */
  function handles(args) { if(typeof args.renderer!=="undefined"||args.action==="update"||args.action==="bake"||args.action==="sweep")return true;try{var comp=/** @type {any} */(app.project&&app.project.activeItem);if(comp instanceof CompItem&&comp.selectedLayers.length===1){var selected=comp.selectedLayers[0];return !!meta(selected);}}catch(ignored){return true;}return false; }
  /** @param {any} args @returns {any} */
  function legacyArgs(args) { return {action:args.action,radius:args.radius,strength:args.strength,weight:args.weight,contrast:args.contrast,italic:args.italic}; }
  /** @param {any} args @returns {boolean} */
  function useLegacy(args) { if(!handles(args))return true;if(args.action!=="apply"&&args.action!=="remove"||validate(args))return false;try{var comp=/** @type {any} */(app.project&&app.project.activeItem),p=comp instanceof CompItem?resolve(comp):null;return !!(p&&p.legacy&&!p.meta&&(args.action==="remove"||args.renderer==="variable"&&(!args.scaleX||args.scaleX===100)&&(!args.scaleY||args.scaleY===100)&&!args.skew&&!args.lift));}catch(ignored){return false;} }
  /** @param {any} p @param {any} options */
  function restoreSelection(p,options) { for(var i=1;i<=p.comp.numLayers;i++)p.comp.layer(i).selected=false;if(p.createdController&&options&&options.preserveSelection===false&&p.controller)p.controller.selected=true;else for(i=0;i<p.selectedIds.length;i++){var selectedId=p.selectionRemap&&p.selectionRemap[p.selectedIds[i]]||p.selectedIds[i],l=byId(p.comp,selectedId)||(p.removed?p.source:null);if(l)l.selected=true;}p.comp.time=p.time; }
  MotionRegistry.register("ae.text.variable-morph",{
    /** @param {any} args @returns {any} */
    preflight:function(args){return useLegacy(args)?legacy.preflight(handles(args)?legacyArgs(args):args):prepare(args).error||null;},
    /** @param {any} args @param {any} context @param {any} options @returns {any} */
    run:function(args,context,options){if(useLegacy(args))return legacy.run(handles(args)?legacyArgs(args):args);var p=prepare(args);if(p.error)throw error(p.error.message,p.error.code);try{return args.action==="remove"?remove(p):args.action==="sweep"?sweep(p):args.action==="bake"?(p.meta.renderer==="outline"?bakeOutline(p):bakeVariable(p)):apply(p);}finally{restoreSelection(p,options);}}
  });
  MotionRegistry.register("ae.text.variable-morph.read",{
    /** @param {any} args @returns {any} */
    preflight:function(args){for(var key in args)if(Object.prototype.hasOwnProperty.call(args,key))return fail(MotionContracts.ERROR.INVALID_PRESET,"A leitura não aceita controles.");var comp=/** @type {any} */(app.project&&app.project.activeItem);if(!comp||!(comp instanceof CompItem))return fail(MotionContracts.ERROR.NO_ACTIVE_COMP,"Abra uma composição.");try{return resolve(comp)?null:fail(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione somente um texto ou seu morph.");}catch(e){return fail(MotionContracts.ERROR.INVALID_PRESET,"Metadados de morph incompletos.");}},
    /** @returns {any} */
    run:function(){var comp=app.project.activeItem,p=resolve(comp),m=p.meta,data=/** @type {any} */({rigVersion:0,renderer:null,controls:null,glyphCount:0,baked:false,stale:false,capabilities:capabilities(p.source),lockedControls:[]});if(m){var e=inspect(p);if(e)throw error(e.message,e.code);data.rigVersion=2;data.renderer=m.renderer;data.controls=readControls(p.controller,m);data.glyphCount=m.glyphCount;data.baked=!!m.baked;data.stale=m.fingerprint!==fingerprint(p.source);data.lockedControls=lockedControls(p.controller,m);}else if(p.legacy){var o=legacy.owned(p.source,p.legacy);if(!o)throw error("O rig antigo foi personalizado.",MotionContracts.ERROR.EXPRESSION_CONFLICT);var a=normalized({action:"apply",renderer:"variable"});for(var i=0;i<5;i++){var key=CONTROLS[i][0],c=control(o.controller,p.legacy.controls[key]);a[key]=c.value;if(c.numKeys||c.expression)data.lockedControls.push(key);}data.rigVersion=1;data.renderer="variable";data.controls=a;data.glyphCount=p.legacy.points?p.legacy.points.length:0;data.stale=p.legacy.signature!==MotionJson.stringify([source(p.source).value.text,source(p.source).value.font,source(p.source).value.fontSize,source(p.source).value.tracking,source(p.source).value.horizontalScale,source(p.source).value.verticalScale,source(p.source).value.justification,source(p.source).value.fontObject.designVector]);}return {changed:false,warnings:[],data:data};}
  });
  host.MotionProximityMorph={influence:influence,fingerprint:fingerprint,meta:meta,prepare:prepare};
})($.global);
