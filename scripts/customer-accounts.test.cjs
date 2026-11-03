const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
function fixture(){
 const db={nw_customer_profiles:[],nw_customer_sessions:[],nw_customer_addresses:[],nw_customer_orders:[]};let deniedLimit=false;const rpcs=[];
 const state={assignments:[],drivers:[],offers:[],orderProjectionsByStore:{}};
 class Query{
  constructor(table){this.table=table;this.filters=[];this.mode='select';this.payload=null;this.singleRow=false;this.start=0;this.end=Infinity;}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}is(k,v){this.filters.push(r=>v===null?r[k]==null:r[k]===v);return this;}
  ilike(k,v){const needle=v.slice(1,-1).replace(/\\([\\%_])/g,'$1').toLowerCase();this.filters.push(r=>String(r[k]||'').toLowerCase().includes(needle));return this;}
  order(){return this;}limit(n){this.end=n-1;return this;}range(start,end){this.start=start;this.end=end;return this;}maybeSingle(){this.singleRow=true;return this;}single(){this.singleRow=true;return this;}
  insert(value){this.mode='insert';this.payload=value;return this;}upsert(value){this.mode='upsert';this.payload=value;return this;}
  update(value){this.mode='update';this.payload=value;return this;}delete(){this.mode='delete';return this;}
  then(resolve,reject){try{
   let rows=db[this.table].filter(r=>this.filters.every(f=>f(r))),error=null;
   if(this.mode==='insert'||this.mode==='upsert'){
    const p=this.payload;
    const existing=db[this.table].find(r=>this.table==='nw_customer_profiles'?r.store_id===p.store_id&&r.phone===p.phone&&!r.deleted_at:this.table==='nw_customer_orders'?r.store_id===p.store_id&&r.order_id===p.order_id:false);
    if(existing){if(this.mode==='insert')error={code:'23505'};rows=[existing];}
    else{const item={id:crypto.randomUUID(),created_at:new Date().toISOString(),...p};db[this.table].push(item);rows=[item];}
   }else if(this.mode==='update'){for(const r of rows)Object.assign(r,this.payload);}
   else if(this.mode==='delete'){db[this.table]=db[this.table].filter(r=>!rows.includes(r));}
   return Promise.resolve({data:this.singleRow?rows[0]||null:rows.slice(this.start,this.end+1),error,count:rows.length}).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject);}}
 }
 const supabaseAdmin={from:table=>new Query(table),rpc:async(name,args)=>{rpcs.push({name,args});if(name==='driver_auth_consume_limit')return {data:!deniedLimit,error:null};const profile=db.nw_customer_profiles.find(p=>p.id===args.p_profile&&p.store_id===args.p_store&&!p.deleted_at);if(name==='nw_customer_update_profile'){
  if(!profile)return {data:null,error:null};
  if(args.p_phone&&db.nw_customer_profiles.some(p=>p!==profile&&p.store_id===args.p_store&&p.phone===args.p_phone&&!p.deleted_at))return {data:null,error:{code:'23505'}};
  const changed=Boolean(args.p_phone&&args.p_phone!==profile.phone);
  if(args.p_name!==null)profile.name=args.p_name;if(args.p_phone!==null)profile.phone=args.p_phone;
  if(changed)for(const session of db.nw_customer_sessions.filter(s=>s.profile_id===profile.id&&s.store_id===profile.store_id))session.revoked_at=new Date().toISOString();
  return {data:{...profile,phone_changed:changed},error:null};
 }return {data:Boolean(profile),error:null};}};
 const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 function mod(path,imports){const exports={};vm.runInNewContext(compile(path),{exports,require:name=>imports?.[name]||require(name),process:{env:{NODE_ENV:'test',NEXT_PUBLIC_STORE_ID:'store_bella_pizza',ADMIN_SESSION_SECRET:'test-secret-never-production-'.repeat(3)}},Date,Map,Set,Number,Math,JSON,console,Buffer});return exports;}
 const timeline=mod('src/lib/logistics/order-timeline.ts');
 const api=mod('src/lib/customer-accounts.ts',{'@/lib/supabase/server':{supabaseAdmin},'@/lib/logistics/order-timeline':timeline,'@/lib/logistics/state-store':{readLogisticsState:async()=>({state,revision:1})}});
 const request=token=>({cookies:{get:()=>token?{value:token}:null},headers:{get:key=>key==='origin'?'https://shop.test':key==='x-forwarded-for'?'127.0.0.1':null},nextUrl:new URL('https://shop.test/api/customer-account/me')});
 const order={id:'order-a',storeId:'store_bella_pizza',phone:'51999990001',customerName:'Cliente teste',trackingToken:'tk-own',status:'recebido',total:30,itemsSummary:'Item de teste'};
 const tokens=mod('src/lib/auth/tokens.ts');
 const route=mod('src/app/api/customer-account/[action]/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200,headers:options?.headers})}},'@/lib/customer-accounts':api,'@/lib/auth/tokens':tokens,'@/lib/logistics/order-timeline':timeline,'@/lib/supabase/server':{supabaseAdmin}});
 const adminRequest=(method,body={},store='store_bella_pizza',query='')=>({method,json:async()=>body,cookies:{get:()=>null},headers:{get:name=>name==='authorization'?'Bearer '+tokens.signAdminToken(store):name==='origin'?'https://shop.test':null},nextUrl:new URL('https://shop.test/api/customer-account/admin'+query)});
 return {api,route,db,state,request,order,rpcs,adminRequest,limit:()=>{deniedLimit=true;}};
}
test('phone-only recognition normalizes Brazilian numbers but does not claim verified ownership',async()=>{
 const f=fixture();assert.equal(f.api.normalizeCustomerPhone('(51) 99999-0001'),'5551999990001');
 assert.throws(()=>f.api.normalizeCustomerPhone('123'));
 const result=await f.api.ensureCustomerForOrder(f.request(),f.order);assert.ok(result.customerId);assert.match(result.setCookie,/HttpOnly/);assert.match(result.setCookie,/SameSite=Lax/);
 const logged=await f.api.customerLogin(f.request(),'51999990001');assert.equal(logged.profile.phoneVerified,false);assert.equal(logged.profile.name,'Cliente teste');
 assert.ok(!JSON.stringify(logged.profile).includes('token_hash'));
});
test('account creation is idempotent after a confirmed order and store is derived on the server',async()=>{
 const f=fixture();await f.api.ensureCustomerForOrder(f.request(),f.order);await f.api.ensureCustomerForOrder(f.request(),f.order);
 assert.equal(f.db.nw_customer_profiles.length,1);assert.equal(f.db.nw_customer_orders.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(await f.api.ensureCustomerForOrder(f.request(),{...f.order,id:'other-order',storeId:'other-store'}))),{});
 assert.equal(f.db.nw_customer_profiles.length,1);
});
test('sessions are hashed and scoped; expired, revoked and foreign-store tokens are rejected',async()=>{
 const f=fixture();const result=await f.api.ensureCustomerForOrder(f.request(),f.order);const token=result.setCookie.match(/nw_customer_session=([^;]+)/)[1];
 assert.equal(f.db.nw_customer_sessions[0].token_hash,crypto.createHash('sha256').update(token).digest('hex'));
 assert.equal((await f.api.customerSession(f.request(token))).id,result.customerId);
 f.db.nw_customer_sessions[0].store_id='other-store';await assert.rejects(f.api.customerSession(f.request(token)),e=>e.status===401);
 f.db.nw_customer_sessions[0].store_id='store_bella_pizza';f.db.nw_customer_sessions[0].expires_at='2020-01-01';await assert.rejects(f.api.customerSession(f.request(token)),e=>e.status===401);
 f.db.nw_customer_sessions[0].expires_at='2099-01-01';f.db.nw_customer_sessions[0].revoked_at=new Date().toISOString();await assert.rejects(f.api.customerSession(f.request(token)),e=>e.status===401);
});
test('phone lookup does not create accounts and rate limits fail closed',async()=>{
 const f=fixture();await assert.rejects(f.api.customerLogin(f.request(),'51999990001'),e=>e.status===404);assert.equal(f.db.nw_customer_profiles.length,0);
 f.limit();await assert.rejects(f.api.customerLogin(f.request(),'51999990001'),e=>e.status===429);
});
test('addresses and history include only the current profile and store',async()=>{
 const f=fixture();const result=await f.api.ensureCustomerForOrder(f.request(),f.order);const profile=f.db.nw_customer_profiles[0];
 f.db.nw_customer_addresses.push({id:'own-address',profile_id:profile.id,store_id:profile.store_id,label:'Casa',data:{street:'Rua teste'},is_default:true},{id:'foreign-address',profile_id:profile.id,store_id:'other-store',label:'Outra loja',data:{street:'Privado'},is_default:true});
 assert.equal((await f.api.customerAddresses(profile)).length,1);
 f.state.orderProjectionsByStore[profile.store_id]={[f.order.id]:{...f.order,status:'concluido'},foreign:{id:'foreign',storeId:profile.store_id,trackingToken:'private-token',status:'recebido'}};
 const history=await f.api.customerHistory(profile);assert.equal(history.length,1);assert.equal(history[0].id,f.order.id);assert.equal(history[0].status,'concluido');assert.ok(!JSON.stringify(history).includes('private-token'));
 assert.equal(result.customerId,profile.id);
});
test('address validation bounds all saved fields and refuses malformed CEP/state',()=>{
 const f=fixture();const valid={street:'Rua teste',number:'10',neighborhood:'Centro',city:'Canoas',state:'rs',cep:'92000-000'};
 assert.equal(f.api.validateAddress(valid).cep,'92000000');assert.equal(f.api.validateAddress(valid).state,'RS');
 assert.throws(()=>f.api.validateAddress({...valid,state:'Brasil'}));assert.throws(()=>f.api.validateAddress({...valid,cep:'123'}));assert.throws(()=>f.api.validateAddress({...valid,street:'x'.repeat(181)}));
});
test('merchant reads and edits only own-store profiles using actual signed admin tokens',async()=>{
 const f=fixture();await f.api.ensureCustomerForOrder(f.request(),f.order);const own=f.db.nw_customer_profiles[0];
 const foreign={id:crypto.randomUUID(),store_id:'store-other',name:'Private customer',phone:'5551999990002',created_at:new Date().toISOString()};f.db.nw_customer_profiles.push(foreign);
 const ctx=action=>({params:Promise.resolve({action})});
 const list=await f.route.GET(f.adminRequest('GET'),ctx('admin-list'));assert.equal(list.status,200);assert.equal(list.body.customers.length,1);assert.equal(list.body.customers[0].id,own.id);
 const detail=await f.route.GET(f.adminRequest('GET',{},'store_bella_pizza','?customerId='+foreign.id),ctx('admin-detail'));assert.equal(detail.status,404);
 const edit=await f.route.PATCH(f.adminRequest('PATCH',{customerId:foreign.id,name:'Forged',storeId:'store-other'}),ctx('admin-update'));assert.equal(edit.status,404);assert.equal(foreign.name,'Private customer');
 const removed=await f.route.DELETE(f.adminRequest('DELETE',{customerId:foreign.id}),ctx('admin-delete'));
 // RPC is responsible for the same ownership check in its atomic UPDATE.
 assert.equal(removed.status,404);const call=f.rpcs.find(c=>c.name==='nw_customer_delete_profile');assert.equal(call.args.p_store,'store_bella_pizza');assert.equal(call.args.p_profile,foreign.id);
 const noAuth=f.adminRequest('GET');noAuth.headers={get:()=>null};assert.equal((await f.route.GET(noAuth,ctx('admin-list'))).status,401);
});
test('merchant address editor refuses foreign profiles before RPC and derives store on writes',async()=>{
 const f=fixture();await f.api.ensureCustomerForOrder(f.request(),f.order);const own=f.db.nw_customer_profiles[0];
 const foreign={id:crypto.randomUUID(),store_id:'store-other',name:'Other',phone:'5551999990002'};f.db.nw_customer_profiles.push(foreign);
 const body={customerId:foreign.id,label:'Casa',street:'Rua teste',number:'10',neighborhood:'Centro',city:'Canoas',state:'RS',isDefault:true};
 const ctx={params:Promise.resolve({action:'admin-addresses'})};
 const rejected=await f.route.POST(f.adminRequest('POST',body),ctx);assert.equal(rejected.status,404);assert.ok(!f.rpcs.some(c=>c.name==='nw_customer_save_address'));
 const saved=await f.route.POST(f.adminRequest('POST',{...body,customerId:own.id,storeId:'store-other'}),ctx);assert.equal(saved.status,200);
 const call=f.rpcs.find(c=>c.name==='nw_customer_save_address');assert.equal(call.args.p_store,'store_bella_pizza');assert.equal(call.args.p_profile,own.id);
});
test('merchant search is tenant-scoped, literal and paginated with hasMore',async()=>{
 const f=fixture();for(let i=0;i<60;i++)f.db.nw_customer_profiles.push({id:crypto.randomUUID(),store_id:'store_bella_pizza',name:i===0?'Ana_100%':'Pessoa '+i,phone:'555199999'+String(i).padStart(4,'0')});
 f.db.nw_customer_profiles.push({id:crypto.randomUUID(),store_id:'other',name:'Ana_100%',phone:'5551999990000'});
 const ctx={params:Promise.resolve({action:'admin-list'})};
 const page=await f.route.GET(f.adminRequest('GET'),ctx);assert.equal(page.body.customers.length,50);assert.equal(page.body.hasMore,true);
 const filtered=await f.route.GET(f.adminRequest('GET',{},'store_bella_pizza','?q='+encodeURIComponent('Ana_100%')),ctx);assert.equal(filtered.body.customers.length,1);assert.equal(filtered.body.customers[0].name,'Ana_100%');assert.equal(filtered.body.hasMore,false);
 const second=await f.route.GET(f.adminRequest('GET',{},'store_bella_pizza','?page=1'),ctx);assert.equal(second.body.customers.length,10);assert.equal(second.body.hasMore,false);
});
test('phone update and session revocation use one RPC; uniqueness failure changes neither',async()=>{
 const f=fixture();const created=await f.api.ensureCustomerForOrder(f.request(),f.order),profile=f.db.nw_customer_profiles[0];
 const changed=await f.api.updateCustomerProfile(profile.store_id,profile.id,{phone:'51999990009'});assert.equal(changed.phone_changed,true);assert.ok(f.db.nw_customer_sessions[0].revoked_at);
 const sessionsBefore=JSON.stringify(f.db.nw_customer_sessions);f.db.nw_customer_profiles.push({id:crypto.randomUUID(),store_id:profile.store_id,name:'Other',phone:'5551999990010'});
 await assert.rejects(f.api.updateCustomerProfile(profile.store_id,created.customerId,{name:'Must not apply',phone:'51999990010'}),e=>e.status===409);
 assert.equal(profile.name,'Cliente teste');assert.equal(profile.phone,'5551999990009');assert.equal(JSON.stringify(f.db.nw_customer_sessions),sessionsBefore);
 assert.equal(f.rpcs.filter(c=>c.name==='nw_customer_update_profile').length,2);
});
