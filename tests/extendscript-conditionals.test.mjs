import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { groupConditionalBranches } from '../scripts/build-extendscript.mjs';

test('ExtendScript groups nested conditionals without altering values or branches',()=>{
 const cases=['true ? 1 : false ? 2 : 3','false ? 1 : true ? 2 : 3','true ? false ? 1 : 2 : 3','false ? 0 : false ? 1 : true ? 2 : 3'];
 for(const source of cases){const result=groupConditionalBranches(source);assert.equal(Function('return '+source)(),Function('return '+result)());assert.equal(groupConditionalBranches(result),result);const tree=ts.createSourceFile('test.js',result,ts.ScriptTarget.ES5,true);function walk(n){if(ts.isConditionalExpression(n))for(const p of[n.condition,n.whenTrue,n.whenFalse])assert.ok(!ts.isConditionalExpression(p));ts.forEachChild(n,walk);}walk(tree);}
 assert.equal(groupConditionalBranches('true ? 1 : false ? 2 : 3'),'true ? 1 : (false ? 2 : 3)');
});
test('ExtendScript conditional grouping leaves expression text, comments and regex unchanged',()=>{
 const source='// a ? b : c ? d : e\nvar expression="a ? b : c ? d : e";var re=/a?b:c?d:e/;';assert.equal(groupConditionalBranches(source),source);
});
test('host bundle contains no ungrouped nested conditional branches',async()=>{
 const source=(await readFile('dist/after-effects-cep/host/index.jsx','utf8')).replace(/^#target.*\n/,'');assert.equal(groupConditionalBranches(source),source);
});
