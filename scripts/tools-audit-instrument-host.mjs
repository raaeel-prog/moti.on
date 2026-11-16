/** QA-only fault instrumentation of the exact installed first-party host. Never installs it. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve('artifacts/tools-audit/faults-native');await mkdir(root,{recursive:true});
const originalPath=path.join(process.env.APPDATA,'Adobe/CEP/extensions/com.motion.plugin.ae/host/index.jsx');
const original=await readFile(originalPath,'utf8'),prefix=original.match(/^#target[^\r\n]*\r?\n/)?.[0]??'';
const source=original.slice(prefix.length),ast=ts.createSourceFile('host.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(ast.parseDiagnostics.length)throw Error('Installed host cannot be parsed for instrumentation.');
const methods=new Set(['setValue','setValueAtTime','setValueAtKey','setValuesAtTimes','removeKey','setTemporalEaseAtKey','setInterpolationTypeAtKey','setTemporalContinuousAtKey','setTemporalAutoBezierAtKey','setSpatialTangentsAtKey','setSpatialContinuousAtKey','setSpatialAutoBezierAtKey','setRovingAtKey','setSelectedAtKey','setLabelAtKey','addProperty','addSolid','addNull','addCamera','addShape','addText','addBoxText','addComp','addFolder','add','duplicate','remove','moveToBeginning','moveToEnd','moveBefore','moveAfter','setParentWithJump','executeCommand']);
const fields=new Set(['name','comment','parent','parentFolder','expression','expressionEnabled','threeDLayer','locked','startTime','inPoint','outPoint','enabled','shy','timeRemapEnabled','stretch','workAreaStart','workAreaDuration','duration','width','height']);
const sites=[];
function hasThis(node){if(node.kind===ts.SyntaxKind.ThisKeyword||ts.isIdentifier(node)&&node.text==='arguments')return true;return ts.forEachChild(node,hasThis)===true;}
function visit(node){
 let label=null;
 if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&methods.has(node.expression.name.text))label=node.expression.name.text;
 if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&fields.has(node.left.name.text))label='assign '+node.left.name.text;
 if(label&&!hasThis(node))sites.push({start:node.getStart(ast),end:node.end,label,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1});
 ts.forEachChild(node,visit);
}visit(ast);
const events=[];for(const site of sites){events.push({at:site.start,open:true,site});events.push({at:site.end,open:false,site});}
events.sort((a,b)=>a.at-b.at || (a.open===b.open?(a.open?b.site.end-a.site.end:b.site.start-a.site.start):a.open?1:-1));
let output=prefix,cursor=0;
for(const event of events){output+=source.slice(cursor,event.at);cursor=event.at;output+=event.open?'MotionAuditNativeInvoke(function(){return (':');},'+JSON.stringify(event.site.label+'@'+event.site.line)+')';}
output+=source.slice(cursor);
const helper='\nfunction MotionAuditNativeInvoke(fn,label){var f=$.global.MotionAuditNativeFault;if(f&&f.armed){f.calls++;f.last=label;if(f.failLabel&&label.indexOf(f.failLabel)===0)f.labelCalls++;if(f.calls===f.failAt||f.failLabel&&f.labelCalls===f.failLabelAt){f.armed=false;f.injected=true;f.partial=(f.snapshot||MotionAuditState)(f.comp);throw new Error("MOTION_QA_INJECTED: "+label);}}return fn();}\n';
output=prefix+helper+output.slice(prefix.length);
// Preserve first-party asset resolution when the QA copy lives outside host/.
// Only the two known bundle-location initializers are relocated; installed bytes stay intact.
const locationInitializer='var bundleFile = typeof $.fileName === "string" ? $.fileName : "";';
const relocationCount=output.split(locationInitializer).length-1;
if(relocationCount!==2)throw Error('Unexpected bundle-location initializers.');
output=output.replaceAll(locationInitializer,'var bundleFile = '+JSON.stringify(originalPath.replaceAll('\\','/'))+';');
const transformed=ts.createSourceFile('instrumented.js',output.slice(prefix.length),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(transformed.parseDiagnostics.length)throw Error('Instrumentation produced invalid JavaScript.');
const sha=value=>createHash('sha256').update(value).digest('hex');
await writeFile(path.join(root,'host-instrumented.jsx'),output);
await writeFile(path.join(root,'instrumentation.json'),JSON.stringify({status:'PASS',originalPath,originalSha256:sha(original),instrumentedSha256:sha(output),sites:sites.map(({label,line})=>({label,line})),siteCount:sites.length,limits:['QA-only derived artifact, not an installed release.','Each wrapper preserves the original expression and throws before one selected write.','Installed host bytes are never modified. Native normal behavior remains evidenced separately.']},null,2));
console.log(JSON.stringify({status:'PASS',sites:sites.length,originalSha256:sha(original),instrumentedSha256:sha(output)}));
