// First-party QA only. Never bundled in the extension.
function MotionToolsAudit(repo, name) {
  if (!app.project || app.project.file || app.project.numItems!==0) throw new Error('Use an EMPTY UNSAVED project. No user items were changed.');
  var host=new File(repo+'/dist/after-effects-cep/host/index.jsx');
  if(new File(repo+'/artifacts/tools-audit/use-installed-host.flag').exists)host=new File(Folder.userData.fsName+'/Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx');
  $.evalFile(host);
  var out=new Folder(repo+'/artifacts/tools-audit/'+name+'-native'); if(!out.exists) out.create();
  var ids=[], serial=0, qaFile=null;
  var result={host:app.version,build:app.buildName,started:new Date().toString(),tests:[],renders:[],completed:false,status:'RUNNING',notRun:['Separate UI Undo/Redo','Installed panel interaction']};
  result.loadedHost={path:host.fsName,bytes:host.length};
  function assert(value,message){if(!value)throw new Error(message);}
  function save(){var f=new File(out.fsName+'/result.json');f.encoding='UTF-8';if(f.open('w')){f.write(MotionJson.stringify(result));f.close();}}
  function remember(){ids=[];for(var i=1;i<=app.project.numItems;i++)ids.push(app.project.item(i).id);}
  function own(){assert(app.project!==null,'No project is open.');for(var i=1;i<=app.project.numItems;i++){var found=false;for(var j=0;j<ids.length;j++)if(ids[j]===app.project.item(i).id)found=true;assert(found,'Project ownership changed.');}var currentFile=app.project.file;if(currentFile!==null){assert(qaFile!==null,'Unexpected saved project.');assert(currentFile.fsName===qaFile.fsName,'Saved project ownership changed.');}}
  function send(comp,command,args){own();if(app.project.activeItem!==comp)comp.openInViewer();var r=MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion:1,requestId:name+'-'+(++serial),command:command,args:args||{},context:{host:'after-effects',hostVersion:app.version,locale:'pt-BR'},options:{mode:'advanced',preserveSelection:true,allowDestructive:true}})));remember();return r;}
  function ok(response){assert(response.ok,MotionJson.stringify(response.error));return response.data;}
  function test(name,fn){try{var detail=fn();result.tests.push({name:name,status:'PASS',detail:detail||null});}catch(e){result.tests.push({name:name,status:'FAIL',error:String(e),line:e.line||null});}remember();save();}
  function comp(label){own();var c=app.project.items.addComp('Moti.on QA '+name+' '+label,640,360,1,8,30);c.openInViewer();remember();return c;}
  function png(c,label,time){own();var f=new File(out.fsName+'/'+label+'.png');c.saveFrameToPng(time,f);var bytes=0,last=-1,stable=0;for(var i=0;i<100;i++){bytes=new File(f.fsName).length;stable=bytes>0 && bytes===last?stable+1:0;if(stable>=2)break;last=bytes;$.sleep(100);}assert(bytes>8 && stable>=2,'PNG render did not finish: '+label);result.renders.push({file:f.fsName,time:time,bytes:bytes});return f.fsName;}
  function saveProject(){own();qaFile=new File(out.fsName+'/qa.aep');app.project.save(qaFile);remember();return qaFile;}
  function reopen(){saveProject();app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.open(qaFile);remember();return app.project;}
  function finish(){try{own();result.remainingOwnedItems=app.project.numItems;app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.newProject();result.remainingProjectItems=app.project.numItems;}catch(e){result.cleanupError=String(e);}result.failCount=0;for(var i=0;i<result.tests.length;i++)if(result.tests[i].status==='FAIL')result.failCount++;result.completed=true;result.status=result.failCount || result.cleanupError || result.fatal?'FAIL':'PASS';save();}
  return {assert:assert,save:save,saveProject:saveProject,remember:remember,own:own,send:send,ok:ok,test:test,comp:comp,png:png,reopen:reopen,finish:finish,result:result};
}
