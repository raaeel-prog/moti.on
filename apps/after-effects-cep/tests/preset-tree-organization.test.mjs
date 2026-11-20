import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../client/src/preset-gallery.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {GALLERY_PRESETS,galleryCategoryMatches,pruneEmptyFolders,legacyFolderId,familySize,MIN_FAMILY_PRESETS}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

const live=id=>GALLERY_PRESETS.filter(p=>!p.motion?.retired&&galleryCategoryMatches(id,p)).length;

test('pruneEmptyFolders drops folders without live presets and keeps insert folders',()=>{
  const tree=pruneEmptyFolders([
    {id:'all'},{id:'nothing-here',children:[{id:'also-nothing'}]},
    {id:'motion',children:[{id:'motion-2d'},{id:'no-such-family'}]},
    {id:'elements',children:[{id:'elements-shape'}]},{id:'sounds'},{id:'personal',children:[]}
  ]);
  assert.deepEqual(tree.map(n=>n.id),['all','motion','elements','sounds','personal']);
  assert.deepEqual(tree[1].children,[],'a single surviving child folds into its parent');
});

test('the Transitions root lists every cut transition and camera move',()=>{
  assert.equal(live('transitions'),live('camera-transitions')+live('camera-moves'));
  assert.ok(live('transitions')>0);
});

test('legacy collection folders reopen on the equivalent function folder with cards',()=>{
  for(const id of ['emulsion','emulsion-burn','signature','signature-cinema','momentum','momentum-2d','momentum-3d','premium-text','premium-camera','reveal','looks','camera-impact','classics']){
    const target=legacyFolderId(id);
    assert.notEqual(target,'all',`${id} has a real destination`);
    assert.ok(live(target)>0,`${id} → ${target} has presets`);
  }
  assert.equal(legacyFolderId('unknown-folder'),'all');
});

test('browse families shown as subfolders hold enough presets',()=>{
  assert.equal(MIN_FAMILY_PRESETS,3);
  assert.ok(familySize('motion-2d/movement')>=MIN_FAMILY_PRESETS);
  assert.equal(familySize('motion-2d/does-not-exist'),0);
});
