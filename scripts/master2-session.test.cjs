const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {NextRequest}=require('next/server');
const env={MASTER2_INITIAL_PIN:'654321',ADMIN_SESSION_SECRET:'test-secret-not-used-in-production-1234',NOVAESWEB_KIT_LAB_ENABLED:'true',NOVAESWEB_KIT_LAB_STORE_ID:'store_bella_pizza'};
function load(file,modules={}) {
 const exports={};
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(source,{exports,process:{env},Buffer,require:id=>modules[id]??require(id)});
 return exports;
}
const tokens=load('src/lib/auth/tokens.ts');
let attempts = 0;
let row = null;
const db = {
 rpc: async () => { attempts++; return { data: true }; },
 from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
  insert: value => ({ select: async () => { row = value; return { data: [value] }; } }),
 }),
};
const modules = { '@/lib/supabase/server': { supabaseAdmin: db } };
const auth = load('src/lib/auth/master2.ts', modules);
const url = 'https://lab.example/api/master2/session';
const route = load('src/app/api/master2/session/route.ts', { ...modules, '@/lib/auth/master2': auth });
function request(method,options={}) {return new NextRequest(url,{method,headers:{origin:'https://lab.example',...options.headers},body:options.body});}
test('Master 2 refuses missing session, merchant cookie, other store and forged tokens',async()=>{
 assert.equal((await route.GET(request('GET'))).status,401);
 const token=tokens.signAdminToken('store_bella_pizza');
 assert.equal((await route.GET(request('GET',{headers:{cookie:`${tokens.ADMIN_COOKIE_NAME}=${token}`}}))).status,401);
 for(const bad of [tokens.signAdminToken('store_other'),token+'x',tokens.signAdminToken('store_bella_pizza',-100)]) {
  assert.equal((await route.GET(request('GET',{headers:{cookie:`${auth.MASTER2_COOKIE}=${bad}`}}))).status,401);
 }
});
test('login validates the independent PIN and issues a scoped cookie',async()=>{
 assert.equal((await route.POST(request('POST',{body:JSON.stringify({password:'wrong'})}))).status,401);
 const response=await route.POST(request('POST',{body:JSON.stringify({password:'654321'})}));
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

test('PIN rotation persists the new digest and invalidates the old session', async () => {
 const initial = await route.POST(request('POST',{body:JSON.stringify({password:'654321'})}));
 const cookie = initial.headers.get('set-cookie').split(';')[0];
 const body = JSON.stringify({password:'654321',newPin:'001234'});
 assert.equal((await route.PATCH(request('PATCH',{body}))).status,401);
 const changed = await route.PATCH(request('PATCH',{headers:{cookie},body}));
 assert.equal(changed.status,200);
 assert.notEqual(row.pin_digest,'001234');
 assert.equal((await route.GET(request('GET',{headers:{cookie}}))).status,401);
 assert.equal((await route.POST(request('POST',{body:JSON.stringify({password:'654321'})}))).status,401);
 assert.equal((await route.POST(request('POST',{body:JSON.stringify({password:'001234'})}))).status,200);
});
