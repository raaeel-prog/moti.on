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
test('every && inside || is grouped, as AE evaluates them left to right with equal precedence',()=>{
 // Measured in AE 26.5: 1 || 1 && 0 gave 0; a || f() && (c || d) gave false for a = -160.
 const cases=['-160 || false && 0','1 || 1 && 0','0 || 1 && 2','1 && 0 || 5','1 && 0 || 1 && 1','0 || 0 || 1 && 0','true || (false && false) && false'];
 for(const source of cases){const result=groupConditionalBranches(source);assert.equal(Function('return '+result)(),Function('return '+source)(),source);assert.equal(groupConditionalBranches(result),result,'stable');
  // Left-to-right evaluation of the grouped text must match ECMAScript too.
  const tree=ts.createSourceFile('t.js',result,ts.ScriptTarget.ES5,true);function walk(n){if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.BarBarToken)for(const o of[n.left,n.right])assert.ok(!(ts.isBinaryExpression(o)&&o.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken),result);ts.forEachChild(n,walk);}walk(tree);}
 assert.equal(groupConditionalBranches('if(p.rotation[2]||three(p)&&(p.rotation[0]||p.rotation[1]))x();'),'if(p.rotation[2]||(three(p)&&(p.rotation[0]||p.rotation[1])))x();');
});
test('ExtendScript conditional grouping leaves expression text, comments and regex unchanged',()=>{
 const source='// a ? b : c ? d : e\nvar expression="a ? b : c ? d : e";var re=/a?b:c?d:e/;';assert.equal(groupConditionalBranches(source),source);
});
test('host bundle contains no ungrouped nested conditional branches',async()=>{
 const source=(await readFile('dist/after-effects-cep/host/index.jsx','utf8')).replace(/^#target.*\n/,'');assert.equal(groupConditionalBranches(source),source);
});
