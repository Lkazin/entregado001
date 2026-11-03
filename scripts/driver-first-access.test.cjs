// Contract/unit tests with an atomic RPC double. These do not replace the
// PostgreSQL transaction/RLS integration checks performed before deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto');
const ts = require('typescript');
const hash = value=>crypto.createHash('sha256').update(value).digest('hex');
const secret = 'first-access-test-secret-at-least-32-chars';
const storeKey = value=>['store_bella_pizza','bella-pizza','11111111-1111-1111-1111-111111111111'].includes(value)?'store_bella_pizza':value;
const phoneKey = value=>{let d=String(value||'').replace(/\D/g,'');if([10,11].includes(d.length))d='55'+d;return'+'+d;};
const req = {headers:{get:name=>name==='x-vercel-forwarded-for'?'192.0.2.1':null}};
const finishProfile = {password:'test-password-123',address:'Rua de teste, 100',vehicleModel:'CG 160'};

function fixture() {
  const accounts=[],memberships=[],invites=[],events=[],calls=[];
  const state={drivers:[{id:'legacy-membership',driverId:'legacy-driver',storeId:'store_bella_pizza',phone:'(11) 99999-0001',name:'Nome anterior',status:'aguardando_motoboy',expiresAt:new Date(Date.now()+86400000).toISOString(),inviteCode:'NW-123456'}],
    offers:[],assignments:[{id:'existing-delivery',driverId:'legacy-driver',storeId:'store_bella_pizza',status:'entregue',deliveryFee:10}],settingsByStore:{store_bella_pizza:{storeName:'Loja de teste'}},stateVersion:99};
  let revision=2,admin={valid:true,storeId:'11111111-1111-1111-1111-111111111111'},failure=false,hashing=0;
  const advance=()=>{state.stateVersion=Math.max(state.stateVersion,revision)+1;revision++;};
  const invalid=()=>({data:null,error:{message:'INVALID_FIRST_ACCESS_CODE'}});
  const db={
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(failure&&name!=='driver_auth_consume_limit')return{data:null,error:{message:'simulated DB rejection'}};
      if(name==='driver_auth_consume_limit')return{data:true,error:null};
      if(name==='driver_first_access_issue'){
        if(accounts.some(a=>a.phone===args.p_phone))return{data:null,error:{message:'ACCOUNT_EXISTS'}};
        let matches=state.drivers.filter(d=>storeKey(d.storeId)===args.p_store_id&&phoneKey(d.phone)===args.p_phone);
        if(matches.length>1)return{data:null,error:{message:'DRIVER_LINK_FORBIDDEN'}};
        let d=matches[0];
        if(d&&(['bloqueado','revogado','vinculo_removido'].includes(d.status)||memberships.some(m=>m.membership_id===d.id)))return{data:null,error:{message:'DRIVER_LINK_FORBIDDEN'}};
        if(!d){const id=crypto.randomUUID();d={id,driverId:id,storeId:args.p_store_id,name:args.p_name,driverName:args.p_name,phone:args.p_phone,status:'aguardando_motoboy',shiftStatus:'aguardando_cadastro',presence:'indisponivel',inviteCode:null,expiresAt:new Date(Date.now()+7*86400000).toISOString()};state.drivers.push(d);}
        if(Date.parse(d.expiresAt)<=Date.now()){d.expiresAt=new Date(Date.now()+7*86400000).toISOString();d.status='aguardando_motoboy';}
        Object.assign(d,{name:args.p_name,driverName:args.p_name,phone:args.p_phone,firstAccessPending:true,status:'aguardando_motoboy',shiftStatus:'aguardando_cadastro',presence:'indisponivel',sessionToken:null,tokenHash:null});
        invites.filter(i=>i.phone===args.p_phone&&i.store_id===args.p_store_id&&!i.redeemed_at&&!i.revoked_at).forEach(i=>i.revoked_at=new Date().toISOString());
        const i={id:crypto.randomUUID(),code_hash:args.p_code_hash,name:args.p_name,phone:args.p_phone,store_id:args.p_store_id,membership_id:d.id,expires_at:new Date(Math.min(Date.parse(args.p_expires_at),Date.parse(d.expiresAt))).toISOString(),created_at:new Date().toISOString(),redeemed_at:null,revoked_at:null};invites.push(i);advance();return{data:{...i},error:null};
      }
      if(name==='driver_first_access_start'||name==='driver_first_access_complete'){
        const i=invites.find(i=>i.code_hash===args.p_code_hash&&i.phone===args.p_phone&&(!args.p_invite_id||i.id===args.p_invite_id));
        const d=i&&state.drivers.find(d=>d.id===i.membership_id);
        if(!i||i.redeemed_at||i.revoked_at||Date.parse(i.expires_at)<=Date.now()||!d||storeKey(d.storeId)!==i.store_id||phoneKey(d.phone)!==i.phone||['bloqueado','revogado','vinculo_removido'].includes(d.status)||memberships.some(m=>m.membership_id===i.membership_id))return invalid();
        if(accounts.some(a=>a.phone===i.phone))return{data:null,error:{message:'ACCOUNT_EXISTS'}};
        if(name==='driver_first_access_start')return{data:{invite_id:i.id,name:i.name,phone:i.phone,store_name:'Loja de teste',expires_at:i.expires_at},error:null};
        if(Date.parse(args.p_challenge_expires_at)<=Date.now())return invalid();
        const row={id:crypto.randomUUID(),name:i.name,phone:i.phone,vehicle_plate:args.p_vehicle_plate,vehicle_model:args.p_vehicle_model,home_address:args.p_home_address,password_hash:args.p_password_hash,active_session_hash:args.p_session_hash,session_expires_at:args.p_session_expires_at,created_at:new Date().toISOString()};
        // One atomic commit in the test double. Production uses the SQL RPC.
        accounts.push(row);memberships.push({membership_id:i.membership_id,driver_id:d.driverId,account_id:row.id,store_id:i.store_id});
        Object.assign(d,{name:i.name,driverName:i.name,phone:i.phone,vehiclePlate:row.vehicle_plate,vehicleModel:row.vehicle_model,status:'ativo',shiftStatus:'em_plantao',presence:'disponivel',firstAccessPending:false,sessionToken:null,tokenHash:null});
        i.redeemed_at=new Date().toISOString();i.account_id=row.id;events.push({event:'registered'});advance();return{data:{...row},error:null};
      }
      throw new Error('Unexpected RPC '+name);
    },
    from:table=>{
      const predicates=[];let action='select',change,columns='*',limit=100;
      const q={select:c=>{columns=c;return q;},eq:(k,v)=>{predicates.push(r=>r[k]===v);return q;},is:(k,v)=>{predicates.push(r=>(r[k]??null)===v);return q;},order:()=>q,limit:n=>{limit=n;return q;},update:v=>{action='update';change=v;return q;},insert:v=>{action='insert';change=v;return q;},maybeSingle:()=>run(true),single:()=>run(true),then:(yes,no)=>run(false).then(yes,no)};
      async function run(single){
        if(failure)return{data:null,error:{message:'simulated outage'}};
        if(table==='driver_auth_events'){events.push(change);return{data:null,error:null};}
        const source=table==='driver_accounts'?accounts:invites;
        const rows=source.filter(r=>predicates.every(f=>f(r))).slice(0,limit);
        if(action==='update')rows.forEach(r=>Object.assign(r,change));
        const out=rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>columns==='*'||columns.split(',').includes(k))));
        return{data:single?(out[0]||null):out,error:null};
      }
      return q;
    },
  };
  const modules={};
  function load(file){
    const context={exports:{},Buffer,Date,console,process:{env:{ADMIN_SESSION_SECRET:secret}},require:name=>{
      if(name==='@/lib/supabase/server')return{supabaseAdmin:db};
      if(name==='@/lib/auth/tokens')return{verifyAdminRequest:()=>admin};
      if(name==='@/lib/auth/driver-account')return modules.account;
      if(name==='next/server')return{};
      if(name==='crypto')return{...crypto,scrypt:(...args)=>{hashing++;return crypto.scrypt(...args);}};
      return require(name);
    }};
    const filename=path.join(__dirname,'../',file);vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,context,{filename});return context.exports;
  }
  modules.account=load('src/lib/auth/driver-account.ts');modules.first=load('src/lib/auth/driver-first-access.ts');
  return{...modules,accounts,memberships,invites,state,calls,hashing:()=>hashing,revision:()=>revision,setAdmin:a=>{admin=a;},fail:v=>{failure=v;}};
}
const issue=(f,phone='11999990001')=>f.first.issueFirstAccess(req,{name:'Nome definido pela loja',phone});
const start=(f,i)=>f.first.startFirstAccess(req,{phone:i.phone,code:i.accessCode});
const complete=(f,s,extra={})=>f.first.completeFirstAccess(req,{onboardingToken:s.onboardingToken,...finishProfile,...extra});
function expiredChallenge(token){const [prefix,payload]=token.split('.');const data=JSON.parse(Buffer.from(payload,'base64url'));data.exp=Date.now()-1000;data.iat=data.exp-900000;const encoded=Buffer.from(JSON.stringify(data)).toString('base64url');return`${prefix}.${encoded}.${crypto.createHmac('sha256',secret).update(`${prefix}.${encoded}`).digest('base64url')}`;}

test('lojista emite código sem criar conta; start não cria sessão e preserva IDs/histórico',async()=>{
  const f=fixture(),assignments=structuredClone(f.state.assignments),i=await issue(f),s=await start(f,i);
  assert.match(i.accessCode,/^AC-[A-F0-9]{12}$/);assert.equal(f.invites[0].code_hash,hash(i.accessCode));
  assert.equal(f.accounts.length,0);assert.equal(f.memberships.length,0);assert.equal(f.invites[0].redeemed_at,null);
  assert.equal('accountToken'in s,false);assert.equal(f.state.drivers[0].id,'legacy-membership');assert.equal(f.state.drivers[0].driverId,'legacy-driver');assert.deepEqual(f.state.assignments,assignments);
  assert.equal(i.expiresAt,f.state.drivers[0].expiresAt);assert.match(s.onboardingToken,/^onboard_v1\./);
  await assert.rejects(f.account.requireAccountSession({headers:{get:()=>s.onboardingToken}}),e=>e.status===401);
  assert.equal(f.state.stateVersion,100);
});

test('cadastro novo cria apenas pre-driver até concluir, com nome autoritativo e endereço privado',async()=>{
  const f=fixture(),i=await issue(f,'21999990002'),s=await start(f,i);
  assert.equal(f.accounts.length,0);assert.equal(f.state.drivers[1].inviteCode,null);assert.equal(f.state.drivers[1].status,'aguardando_motoboy');
  const done=await complete(f,s,{name:'Nome injetado',phone:'31999990003'});
  assert.equal(done.account.name,'Nome definido pela loja');assert.equal(done.account.phone,'+5521999990002');assert.equal(done.account.address,finishProfile.address);assert.equal(done.account.vehiclePlate,'');
  assert.equal(f.accounts[0].home_address,finishProfile.address);assert.equal(JSON.stringify(f.state).includes(finishProfile.address),false);
  assert.equal(f.state.drivers[1].status,'ativo');assert.equal(f.state.drivers[1].shiftStatus,'em_plantao');assert.equal(f.state.drivers[1].presence,'disponivel');
  const login=await f.account.loginDriverAccount({identifier:'21999990002',password:finishProfile.password});assert.equal(login.account.id,done.account.id);assert.equal(login.account.address,finishProfile.address);
});

test('reuso de legado ativo interrompe novos despachos até concluir sem perder IDs ou entregas',async()=>{
  const f=fixture(),before=structuredClone(f.state.assignments),expiry=f.state.drivers[0].expiresAt;
  Object.assign(f.state.drivers[0],{status:'ativo',shiftStatus:'em_plantao',presence:'disponivel',sessionToken:'legacy-token'});
  const i=await issue(f),driver=f.state.drivers[0];
  assert.equal(driver.status,'aguardando_motoboy');assert.equal(driver.shiftStatus,'aguardando_cadastro');assert.equal(driver.presence,'indisponivel');assert.equal(driver.firstAccessPending,true);assert.equal(driver.sessionToken,null);
  assert.equal(driver.id,'legacy-membership');assert.equal(driver.driverId,'legacy-driver');assert.equal(driver.expiresAt,expiry);assert.deepEqual(f.state.assignments,before);
  await complete(f,await start(f,i));assert.equal(driver.status,'ativo');assert.equal(driver.presence,'disponivel');
});

test('sem código, telefone errado ou convite expirado/revogado não inicia cadastro',async()=>{
  const f=fixture(),i=await issue(f);
  for(const body of [{phone:i.phone},{phone:'21999990002',code:i.accessCode}])await assert.rejects(f.first.startFirstAccess(req,body),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
  f.invites[0].expires_at=new Date(Date.now()-1000).toISOString();await assert.rejects(start(f,i),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
  f.invites[0].expires_at=new Date(Date.now()+86400000).toISOString();f.invites[0].revoked_at=new Date().toISOString();await assert.rejects(start(f,i),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
  assert.equal(f.accounts.length,0);assert.equal(f.hashing(),0);
});

test('desafio adulterado, expirado ou formulário incompleto nunca dão sessão',async()=>{
  const f=fixture(),i=await issue(f),s=await start(f,i);
  await assert.rejects(complete(f,{onboardingToken:s.onboardingToken+'x'}),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
  await assert.rejects(complete(f,{onboardingToken:expiredChallenge(s.onboardingToken)}),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
  await assert.rejects(complete(f,s,{address:'curto'}),e=>e.code==='INVALID_PROFILE');
  await assert.rejects(complete(f,s,{vehicleModel:''}),e=>e.code==='INVALID_PROFILE');
  assert.equal(f.hashing(),0);assert.equal(f.accounts.length,0);assert.equal(f.invites[0].redeemed_at,null);
});

test('duas conclusões concorrentes deixam uma conta e preservam driverId e assignments',async()=>{
  const f=fixture(),before=structuredClone(f.state.assignments),i=await issue(f),s=await start(f,i);
  const results=await Promise.allSettled([complete(f,s),complete(f,s)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.accounts.length,1);assert.equal(f.memberships.length,1);
  assert.equal(f.memberships[0].membership_id,'legacy-membership');assert.equal(f.memberships[0].driver_id,'legacy-driver');assert.deepEqual(f.state.assignments,before);
  await assert.rejects(start(f,i),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
});

test('falha no commit não cria conta nem vínculo, não consome código ou altera logística',async()=>{
  const f=fixture(),i=await issue(f),s=await start(f,i),before=structuredClone(f.state);f.fail(true);
  await assert.rejects(complete(f,s),e=>e.status===503);assert.equal(f.calls.some(c=>c.name==='driver_first_access_complete'),true);assert.equal(f.hashing(),1);assert.equal(f.accounts.length,0);assert.equal(f.memberships.length,0);assert.equal(f.invites[0].redeemed_at,null);assert.deepEqual(f.state,before);
});

test('reemissão invalida desafio anterior e conta existente não ganha reset de senha',async()=>{
  const f=fixture(),i=await issue(f),s=await start(f,i),fresh=await issue(f);
  assert.notEqual(fresh.accessCode,i.accessCode);await assert.rejects(complete(f,s),e=>e.code==='INVALID_FIRST_ACCESS_CODE');
  await complete(f,await start(f,fresh));await assert.rejects(issue(f),e=>e.status===409&&e.code==='ACCOUNT_EXISTS');
  const login=await f.account.loginDriverAccount({identifier:i.phone,password:finishProfile.password});assert.equal(login.account.phone,i.phone);
});

test('emissão/listagem/revogação respeitam loja do admin e bloqueios não são reativados',async()=>{
  const f=fixture();f.setAdmin({valid:false});await assert.rejects(issue(f),e=>e.status===401);assert.equal(f.calls.length,0);
  f.setAdmin({valid:true,storeId:'store_bella_pizza'});const i=await issue(f);f.setAdmin({valid:true,storeId:'other-store'});
  assert.equal((await f.first.listFirstAccess(req)).length,0);await assert.rejects(f.first.revokeFirstAccess(req,{inviteId:i.inviteId}),e=>e.status===404);assert.equal(f.invites[0].revoked_at,null);
  f.setAdmin({valid:true,storeId:'store_bella_pizza'});f.state.drivers[0].status='bloqueado';await assert.rejects(issue(f),e=>e.status===403);assert.equal(f.accounts.length,0);
});

test('SQL exige transação/RLS e versão monotônica; código/endereço nunca vão para logística',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/driver_first_access_setup.sql'),'utf8');
  assert.equal((sql.match(/greatest\(coalesce\(\(logistics->>'stateVersion'\)::bigint,0\),revision_now\)\+1/g)||[]).length,2);
  assert.match(sql,/alter table public\.driver_first_access_invites enable row level security/i);assert.match(sql,/revoke all on public\.driver_first_access_invites from public, anon, authenticated/i);
  assert.match(sql,/p_challenge_expires_at <= clock_timestamp\(\)/);assert.equal(sql.includes("'home_address',account.home_address"),true);
  assert.equal(sql.includes("'accessCode'"),false);
});
