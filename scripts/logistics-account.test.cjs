const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOKEN_A = 'a'.repeat(64), TOKEN_B = 'b'.repeat(64);
const STORE_A = 'store_bella_pizza', STORE_B = 'store-other';
const expiresAt = () => new Date(Date.now() + 86400000).toISOString();
function driver(id, driverId, storeId = STORE_A, extra = {}) {
  return {id, driverId, storeId, status:'ativo', shiftStatus:'em_plantao', presence:'disponivel',
    driverName:'Entregador de teste', phone:'+5511999990001', createdAt:new Date().toISOString(), expiresAt:expiresAt(), ...extra};
}
function assignment(id, driverId, storeId = STORE_A, extra = {}) {
  return {id,assignmentId:id,orderId:'order-'+id,orderNumber:id,driverId,storeId,status:'waiting_pickup',deliveryFee:9,...extra};
}
function fixture(options = {}) {
  const backing = options.backing || {
    state: {stateVersion:1,drivers:options.drivers || [],assignments:options.assignments || [],offers:[],settingsByStore:{},tracking:{}},
    revision:1, reads:0,writes:0,attempts:0,storageWrites:0,failRead:Boolean(options.unavailable),failWrite:Boolean(options.failUpload),rejectCommit:false,
    accounts:[{id:ACCOUNT_A,name:options.name || 'Rodrigo Silva',phone:'+5511999990001',vehicle_plate:'ABC1D23',vehicle_model:'Moto',created_at:new Date().toISOString(),active_session_hash:hash(TOKEN_A),session_expires_at:expiresAt()},
      {id:ACCOUNT_B,name:'Outra conta',phone:'+5511999990002',vehicle_plate:'DEF4G56',vehicle_model:'Moto',created_at:new Date().toISOString(),active_session_hash:hash(TOKEN_B),session_expires_at:expiresAt()}],
    memberships:clone(options.memberships || []), limits:new Map(), limitKeys:[], failLimit:false,
  };
  const db = {
    from: table => {
      let action='select',values;const filters=[];
      const query={select:()=>query,eq:(k,v)=>{filters.push([k,v]);return query;},insert:v=>{action='insert';values=v;return query;},
        maybeSingle:()=>run(true),single:()=>run(true),then:(resolve,reject)=>run(false).then(resolve,reject)};
      async function run(single) {
        if(table==='driver_logistics_state') {backing.reads++; if(backing.failRead)return {data:null,error:{message:'isolated read outage'}};return {data:{state:clone(backing.state),revision:backing.revision},error:null};}
        const rows=table==='driver_accounts'?backing.accounts:table==='driver_account_memberships'?backing.memberships:[];
        if(action==='insert') {
          if(rows.some(r=>r.membership_id===values.membership_id))return {data:null,error:{code:'23505'}};
          rows.push(clone(values));return {data:single?clone(values):[clone(values)],error:null};
        }
        const matched=rows.filter(r=>filters.every(([k,v])=>r[k]===v));return {data:single?(matched[0]?clone(matched[0]):null):clone(matched),error:null};
      }
      return query;
    },
    rpc:async (name,p) => {
      if(name==='driver_auth_consume_limit'){
        backing.limitKeys.push(p.p_key);
        if(backing.failLimit)return {data:null,error:{message:'isolated limiter outage'}};
        const count=(backing.limits.get(p.p_key)||0)+1;backing.limits.set(p.p_key,count);
        return {data:count<=p.p_limit,error:null};
      }
      assert.equal(name,'driver_logistics_commit');backing.attempts++;
      if(backing.failWrite)return {data:null,error:{message:'isolated rejected commit'}};
      if(backing.rejectCommit || (p.p_account_id && !backing.accounts.some(a=>a.id===p.p_account_id && a.active_session_hash===p.p_session_hash))) return {data:null,error:{message:'ACCOUNT_SESSION_REPLACED'}};
      if(p.p_revision!==backing.revision)return {data:null,error:{message:'LOGISTICS_CONFLICT'}};
      backing.state=clone(p.p_state);backing.revision++;backing.writes++;return {data:backing.revision,error:null};
    },
    storage:{from:()=>({download:async()=>({data:{text:async()=>JSON.stringify([])},error:null}),upload:async()=>{backing.storageWrites++;return {error:null};}})},
  };
  const modules=new Map();
  const response={json:(body,init={})=>({body:clone(body),status:init.status || 200,headers:init.headers})};
  const env={ADMIN_SESSION_SECRET:'isolated-logistics-test-secret-with-at-least-32-characters',ADMIN_ACCESS_PIN:'isolated-admin-pin'};
  const contexts=new Map();
  function load(file) {
    const filename=path.join(root,file);if(modules.has(filename))return modules.get(filename);
    const module={exports:{}};modules.set(filename,module.exports);
    const context={exports:module.exports,module,console,Buffer,Date,JSON,Math,URL,process:{env},require:name=>{
      if(name==='next/server')return {NextResponse:response};
      if(name==='@/lib/supabase/server')return {supabaseAdmin:db};
      if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');
      if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts')));
      return require(name);
    }};
    vm.createContext(context);contexts.set(filename,context);
    const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    vm.runInContext(compiled,context,{filename});return module.exports;
  }
  const tokens=load('src/lib/auth/tokens.ts');
  const api=load('src/app/api/v1/logistics/[action]/route.ts');
  const adminToken=tokens.signAdminToken(STORE_A);
  function request(action,body={},actor='a',headers={}) {
    const defaults=actor==='admin'?{'x-admin-token':adminToken}:actor==='b'?{'x-account-session':TOKEN_B}:actor==='a'?{'x-account-session':TOKEN_A}:{};
    const all={...defaults,...headers};return {headers:{get:name=>all[name.toLowerCase()] || null},cookies:{get:()=>null},nextUrl:new URL('https://isolated.test/api/v1/logistics/'+action),json:async()=>clone(body)};
  }
  return {backing,api,tokens,context:contexts.get(path.join(root,'src/app/api/v1/logistics/[action]/route.ts')),
    stored:()=>clone(backing.state),downloads:()=>backing.reads,
    post:(action,body={},actor=options.defaultActor || 'a',headers={})=>api.POST(request(action,body,actor,headers),{params:Promise.resolve({action})}),
    get:(action,actor='a',headers={})=>api.GET(request(action,{},actor,headers),{params:Promise.resolve({action})}),
    driverHeaders:d=>({authorization:'Bearer '+tokens.signDriverToken({driverId:d.driverId || d.id,membershipId:d.id,storeId:d.storeId})}),
    restart:()=>fixture({backing}),
  };
}
module.exports={fixture,driver,assignment,ACCOUNT_A,ACCOUNT_B,TOKEN_A,TOKEN_B,STORE_A,STORE_B};

  test('bootstrap só retorna vínculos e ganhos autorizados da conta em qualquer aparelho',async()=>{
    const da=driver('membership-a','driver-a'),db=driver('membership-b','driver-b',STORE_B);
    const f=fixture({drivers:[da,db],memberships:[{membership_id:da.id,account_id:ACCOUNT_A,driver_id:da.driverId,store_id:da.storeId},{membership_id:db.id,account_id:ACCOUNT_B,driver_id:db.driverId,store_id:db.storeId}],
      assignments:[assignment('delivered-a',da.driverId,STORE_A,{status:'delivered',deliveryFee:11}),assignment('delivered-b',db.driverId,STORE_B,{status:'delivered',deliveryFee:99})]});
    const result=await f.get('account-bootstrap');assert.equal(result.status,200);assert.equal(result.body.account.id,ACCOUNT_A);
    assert.equal(result.body.session.driverId,da.driverId);assert.equal(result.body.ledger.length,1);assert.equal(result.body.ledger[0].totalToReceive,11);
    const reloaded=await f.restart().get('account-bootstrap');assert.equal(reloaded.body.session.membershipId,da.id);assert.deepEqual(reloaded.body.ledger,result.body.ledger);
  });
  test('claim legado automático é negado; somente lojista associa conta a vínculo antigo da própria loja',async()=>{
    const da=driver('legacy-a','legacy-driver'),db=driver('legacy-b','legacy-other',STORE_B);
    const f=fixture({drivers:[da,db]});
    const legacy=await f.post('account-claim',{},'a',f.driverHeaders(da));assert.equal(legacy.status,409);assert.equal(legacy.body.code,'LEGACY_MIGRATION_REQUIRES_STORE');
    const denied=await f.post('account-link-existing',{membershipId:da.id,phone:'11999990001'},'a');assert.equal(denied.status,401);
    const wrongStore=await f.post('account-link-existing',{membershipId:db.id,phone:'11999990001'},'admin');assert.equal(wrongStore.status,404);
    const preview=await f.post('account-link-existing',{membershipId:da.id,phone:'11999990001'},'admin');assert.equal(preview.status,200);assert.match(preview.body.preview.phone,/^\*+/);assert.equal(f.backing.memberships.length,0);
    const linked=await f.post('account-link-existing',{membershipId:da.id,phone:'11999990001',confirmed:true},'admin');assert.equal(linked.status,200);
    assert.equal(f.backing.memberships[0].account_id,ACCOUNT_A);assert.equal((await f.get('account-bootstrap')).body.session.driverId,da.driverId);
  });
  test('ativação rejeita convite antigo não associado e aceita convite privado versão 1',async()=>{
    const f=fixture({drivers:[driver('old','old-driver',STORE_A,{inviteCode:'NW-123456',status:'aguardando_motoboy'}),driver('new','new-driver',STORE_A,{inviteCode:'NW-654321',status:'aguardando_motoboy',accountInviteVersion:1})]});
    const old=await f.post('invite-activate',{inviteCode:'NW-123456'});assert.equal(old.status,409);
    const activated=await f.post('invite-activate',{inviteCode:'NW-654321',driverId:'forged-driver',driverName:'Forged Name'});assert.equal(activated.status,200);assert.equal(activated.body.driver.driverName,'Rodrigo Silva');
    assert.equal(f.backing.memberships[0].account_id,ACCOUNT_A);
    const secondAccount=await f.post('invite-activate',{inviteCode:'NW-654321'},'b');assert.equal(secondAccount.status,403);assert.equal(f.backing.memberships[0].account_id,ACCOUNT_A);
  });
  test('conta revogada é bloqueada para leitura, mutação e GPS sem persistência',async()=>{
    const da=driver('membership-a','driver-a');const f=fixture({drivers:[da],memberships:[{membership_id:da.id,account_id:ACCOUNT_A,driver_id:da.driverId,store_id:STORE_A}],assignments:[assignment('assignment-a',da.driverId)]});
    f.backing.accounts[0].active_session_hash=hash('replacement-token');
    for(const [method,action,body] of [['get','account-bootstrap',{}],['get','assignments',{}],['post','driver-presence',{manualEnabled:true}],['post','tracking-location-push',{assignmentId:'assignment-a',latitude:1,longitude:1}],['post','tracking-session-end',{}]]){
      const result=method==='get'?await f.get(action,'a',f.driverHeaders(da)):await f.post(action,body,'a',f.driverHeaders(da));assert.equal(result.status,401,action);assert.equal(result.body.code,'ACCOUNT_SESSION_REPLACED',action);
    }
    assert.equal(f.backing.writes,0);assert.equal(f.backing.storageWrites,0);
  });
  test('retirada, rota, desistência e conclusão recusam atribuições de outra conta ou loja',async()=>{
    const da=driver('membership-a','driver-a'),db=driver('membership-b','driver-b');
    const f=fixture({drivers:[da,db],memberships:[{membership_id:da.id,account_id:ACCOUNT_A,driver_id:da.driverId,store_id:STORE_A}],assignments:[assignment('other-driver',db.driverId),assignment('other-store',da.driverId,STORE_B)]});
    const before=f.stored();
    for(const id of ['other-driver','other-store'])for(const [action,body] of [['pickup-confirm',{assignmentIds:[id]}],['route-reorder',{stops:[{assignmentId:id,sequence:9}]}],['assignment-withdraw',{assignmentId:id}],['delivery-confirm',{assignmentId:id,isForced:true,forcedReason:'test'}],['tracking-session-start',{assignmentId:id,initialLocation:{latitude:1,longitude:1}}]]){
      const result=await f.post(action,body,'a',f.driverHeaders(da));assert.equal(result.status,403,action+' '+id);assert.equal(result.body.code,'ASSIGNMENT_FORBIDDEN');
    }
    assert.equal(f.backing.writes,0);assert.equal(f.backing.storageWrites,0);assert.deepEqual(f.stored(),before);
  });
  test('token logístico de outra conta não autoriza leitura mesmo com conta atual válida',async()=>{
    const da=driver('membership-a','driver-a'),db=driver('membership-b','driver-b');const f=fixture({drivers:[da,db],memberships:[{membership_id:da.id,account_id:ACCOUNT_A,driver_id:da.driverId,store_id:STORE_A}]});
    const result=await f.get('assignments','a',f.driverHeaders(db));assert.equal(result.status,403);assert.equal(f.backing.writes,0);
  });
  test('sessão trocada durante a requisição falha no commit e restaura estado confirmado',async()=>{
    const da=driver('membership-a','driver-a');const f=fixture({drivers:[da],memberships:[{membership_id:da.id,account_id:ACCOUNT_A,driver_id:da.driverId,store_id:STORE_A}]});
    f.backing.rejectCommit=true;const before=f.stored();
    const result=await f.post('driver-presence',{manualEnabled:false},'a',f.driverHeaders(da));assert.equal(result.status,401);assert.equal(result.body.code,'ACCOUNT_SESSION_REPLACED');
    assert.equal(f.backing.attempts,1);assert.equal(f.backing.writes,0);assert.deepEqual(f.stored(),before);assert.equal(vm.runInContext('liveDrivers[0].presence',f.context),'disponivel');
  });

  test('limite de códigos persiste entre instâncias, bloqueia 11ª tentativa e separa contas',async()=>{
    const f=fixture();
    for(let i=0;i<10;i++){const result=await f.restart().post('invite-activate',{inviteCode:'NW-NOT-ISSUED'});assert.equal(result.status,404);}
    const limited=await f.restart().post('invite-activate',{inviteCode:'NW-NOT-ISSUED'});assert.equal(limited.status,429);assert.equal(limited.body.code,'RATE_LIMITED');
    const another=await f.post('invite-activate',{inviteCode:'NW-NOT-ISSUED'},'b');assert.equal(another.status,404);
    assert.equal(f.backing.limitKeys.every(k=>/^[a-f0-9]{64}$/.test(k)),true);assert.equal(f.backing.writes,0);assert.equal(f.backing.storageWrites,0);
    const outage=fixture();outage.backing.failLimit=true;const unavailable=await outage.post('invite-activate',{inviteCode:'NW-NOT-ISSUED'});assert.equal(unavailable.status,503);assert.equal(outage.backing.writes,0);
  });
