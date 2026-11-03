const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {NextRequest}=require('next/server');
const env={ADMIN_SESSION_SECRET:'test-secret-not-used-in-production-1234',NOVAESWEB_KIT_LAB_ENABLED:'true',NOVAESWEB_KIT_LAB_STORE_ID:'store_bella_pizza'};
function load(file,modules={}) {
 const exports={};
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(source,{exports,process:{env},Buffer,require:id=>modules[id]??require(id)});
 return exports;
}
const tokens=load('src/lib/auth/tokens.ts');
const auth=load('src/lib/auth/master2.ts',{'./tokens':tokens,'../logistics/order-timeline':load('src/lib/logistics/order-timeline.ts')});
const url='https://lab.example/api/master2/session';
let attempts=0;
const route=load('src/app/api/master2/session/route.ts',{'@/lib/auth/master2':auth,'../../admin/auth/route':{POST:async req=>{
 attempts++;const {pin}=await req.json();
 return pin==='correct' ? Response.json({token:tokens.signAdminToken('store_bella_pizza')}) : Response.json({error:'incorrect'},{status:401});
}}});
function request(method,options={}) {return new NextRequest(url,{method,headers:{origin:'https://lab.example',...options.headers},body:options.body});}
test('Master 2 refuses missing session, merchant cookie, other store and forged tokens',async()=>{
 assert.equal((await route.GET(request('GET'))).status,401);
 const token=tokens.signAdminToken('store_bella_pizza');
 assert.equal((await route.GET(request('GET',{headers:{cookie:`${tokens.ADMIN_COOKIE_NAME}=${token}`}}))).status,401);
 for(const bad of [tokens.signAdminToken('store_other'),token+'x',tokens.signAdminToken('store_bella_pizza',-100)]) {
  assert.equal((await route.GET(request('GET',{headers:{cookie:`${auth.MASTER2_COOKIE}=${bad}`}}))).status,401);
 }
});
test('login reuses credential validation and issues only a scoped cookie',async()=>{
 assert.equal((await route.POST(request('POST',{body:JSON.stringify({password:'wrong'})}))).status,401);
 const response=await route.POST(request('POST',{body:JSON.stringify({password:'correct'})}));
 assert.deepEqual(await response.json(),{authenticated:true});
 assert.match(response.headers.get('set-cookie'),/^novaes_master2_session=.*Path=\/api\/master2;.*HttpOnly; SameSite=strict/i);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal((await route.GET(request('GET',{headers:{cookie}}))).status,200);
 assert.match((await route.DELETE(request('DELETE',{headers:{cookie}}))).headers.get('set-cookie'),/Path=\/api\/master2; Max-Age=0/i);
});
test('cross-origin mutation and disabled laboratory fail before password validation',async()=>{
 const before=attempts;
 assert.equal((await route.POST(request('POST',{headers:{origin:'https://outside.example'},body:'{}'}))).status,403);
 assert.equal((await route.DELETE(request('DELETE',{headers:{origin:'https://outside.example'}}))).status,403);
 env.NOVAESWEB_KIT_LAB_ENABLED='false';
 try {assert.equal((await route.POST(request('POST',{body:'{}'}))).status,404);assert.equal(attempts,before);}
 finally {env.NOVAESWEB_KIT_LAB_ENABLED='true';}
});
