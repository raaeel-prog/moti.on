import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient } from '../dist/index.js';
function fixture({ config = true, validSignature = true, offline = false, time = 1000000 } = {}) {
  let now = time;
  const lease = {payload:JSON.stringify({version:1,audience:'motion-plugin',accountId:'user-a',deviceId:'device-a',licenseId:'license-a',issuedAt:time,expiresAt:time+604800000}),signature:'a'.repeat(86)};
  const store = new Map();
  const client = createAccountClient({ ...(config ? {config:{url:'https://example.supabase.co',publishableKey:'public-fixture-key',leasePublicKey:'x'.repeat(40)}} : {}),
    now:()=>now,
    vault:{async read(key){return key.includes('.device.')?'device-a':JSON.stringify({version:1,user:{id:'user-a',name:'A',email:''},refreshToken:'r'.repeat(32),lease,lastSeen:time});},async write(key,value){store.set(key,value);},async remove(key){store.delete(key);}},
    crypto:{randomId:()=> 'device-a',randomVerifier:()=> 'v'.repeat(43),async sha256Base64Url(){return 'c'.repeat(43);},async verifyEd25519(){return validSignature;}},
    login:{async begin(){throw new Error('unused');}},
    storage:{async read(key){return store.get(key)??null;},async write(key,value){store.set(key,value);}},
    transport:{async request({url}){if(offline)throw new Error('offline');return {status:200,body:url.includes('/auth/')?{access_token:'a'.repeat(32),refresh_token:'r'.repeat(32),expires_in:3600,user:{id:'user-a'}}:{state:'active',devices:[],lease}};}}
  });
  return {client,advance(ms){now+=ms;}};
}
test('missing service configuration never authorizes creative mutations',async()=>{const {client}=fixture({config:false});await client.initialize();assert.equal(client.snapshot().status,'setup_required');assert.equal(client.canMutate(),false);});
test('signed offline grant stops precisely at seven days with no grace',async()=>{const f=fixture({offline:true});await f.client.initialize();assert.equal(f.client.canMutate(),true);f.advance(604799999);assert.equal(f.client.canMutate(),true);f.advance(1);assert.equal(f.client.canMutate(),false);});
test('invalid signature cannot enable offline access',async()=>{const {client}=fixture({validSignature:false,offline:true});await client.initialize();assert.equal(client.canMutate(),false);});
test('logout immediately clears local authorization even with unavailable network',async()=>{const {client}=fixture({offline:true});await client.initialize();assert.equal(client.canMutate(),true);await client.signOut();assert.equal(client.canMutate(),false);assert.equal(client.snapshot().user,null);});
test('clock rollback fails closed',async()=>{const f=fixture({offline:true});await f.client.initialize();f.advance(-60001);assert.equal(f.client.canMutate(),false);});
