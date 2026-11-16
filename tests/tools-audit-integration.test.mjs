import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationDecision} from '../scripts/tools-audit-integration-policy.mjs';
test('audit integration preserves later work when its own source is unchanged',()=>{
 assert.equal(integrationDecision({baseline:'base',source:'audit-v1',integrated:'audit-v1',target:'claude-v2',accepted:['audit-v1']}),'preserve-concurrent');
 assert.equal(integrationDecision({baseline:'base',source:'audit-v1',integrated:'audit-v1',target:'base',accepted:['audit-v1']}),'preserve-concurrent','an intentional later rollback is still newer work');
});
test('a new audit delta conflicts with an independently changed target',()=>{
 assert.equal(integrationDecision({baseline:'base',source:'audit-v2',integrated:'audit-v1',target:'claude-v2',accepted:['audit-v1']}),'conflict');
});
test('only unchanged or previously accepted targets receive a new audit delta',()=>{
 assert.equal(integrationDecision({baseline:'base',source:'audit-v2',target:'base'}),'write');
 assert.equal(integrationDecision({baseline:'base',source:'audit-v2',target:'audit-v1',integrated:'audit-v1',accepted:['audit-v1']}),'write');
 assert.equal(integrationDecision({baseline:null,source:'new',target:null}),'write');
 assert.equal(integrationDecision({baseline:null,source:'new',target:'unrelated'}),'conflict');
});
test('already integrated and original baseline files need no rewrite',()=>{
 assert.equal(integrationDecision({baseline:'base',source:'new',target:'new'}),'already-integrated');
 assert.equal(integrationDecision({baseline:'base',source:'base',target:'claude-v2'}),'baseline');
});

test('guarded imported principal snapshots preserve subsequent concurrent edits',()=>{
 assert.equal(integrationDecision({baseline:null,source:'import-v1',imported:'import-v1',target:'newer-main'}),'preserve-concurrent');
 assert.equal(integrationDecision({baseline:null,source:'own-v2',imported:'import-v1',target:'import-v1'}),'write');
 assert.equal(integrationDecision({baseline:null,source:'own-v2',imported:'import-v1',target:'newer-main'}),'conflict');
});
