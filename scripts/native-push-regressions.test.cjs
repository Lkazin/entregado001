const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture() {
  let state = { pushSubscriptions: [] }; const sent = []; const removals = [];
  let session = { active_session_hash: 'a'.repeat(64), session_expires_at: new Date(Date.now()+60000).toISOString() };
  const memberships = [{ account_id: 'account-a', membership_id: 'member-a' }];
  function query(table) {
    const q = { upsert: () => q, select: () => q, delete: () => q, eq: (key, val) => { if (table === 'driver_push_subscriptions') removals.push([key,val]); return q; }, in: () => q, maybeSingle: async()=>({data:session}),
      then: (resolve, reject) => Promise.resolve(table === 'driver_account_memberships' ? {data:memberships} : {error:{code:'42P01'}}).then(resolve,reject) };
    return q;
  }
  const context = { exports: {}, console, process: {env:{ENABLE_WEB_PUSH:'false'}}, require: name => {
    if (name === 'web-push') return {default:{setVapidDetails(){}}};
    if (name === '@/lib/supabase/server') return {supabaseAdmin:{from:query}};
    if (name === '@/lib/logistics/state-store') return {readLogisticsState:async()=>({state:structuredClone(state),revision:1}),writeLogisticsState:async(next)=>{state=next;}};
    if (name === './firebase-admin-server') return {sendFcmNotification:async(token,payload)=>{sent.push({token,payload}); return {success:true};}};
    return {};
  }};
  vm.runInNewContext(transpile('src/lib/push/web-push-server.ts'),context);
  return {mod:context.exports,sent,removals,state:()=>state,setSession:value=>{session=value;}};
}
test('FCM is delivered with web push disabled, using authoritative store membership',async()=>{
  const f=fixture();
  assert.equal(await f.mod.saveDriverSubscription('account-a',{endpoint:'fcm:device-a',fcmToken:'device-a'}, {}, 'a'.repeat(64)),true);
  const result=await f.mod.notifyDriversOfNewOffer({storeId:'store-a',storeName:'Teste',offerId:'offer-a',distributionMode:'fixed_driver',targetDriverId:'member-a',liveDrivers:[{id:'member-a',driverId:'legacy-driver',storeId:'store-a'}]});
  assert.equal(result.totalNotified,1); assert.equal(f.sent[0].token,'device-a');
});
test('unsubscribe removes only the endpoint owned by the authenticated account',async()=>{
  const f=fixture();
  await f.mod.saveDriverSubscription('account-a',{endpoint:'fcm:device-a'}, {}, 'a'.repeat(64));
  await f.mod.saveDriverSubscription('account-b',{endpoint:'fcm:device-b'}, {}, 'b'.repeat(64));
  await f.mod.removeDriverSubscription('account-a','fcm:device-a');
  assert.equal(f.state().pushSubscriptions.length,1);
  assert.equal(f.state().pushSubscriptions[0].accountId,'account-b');
  assert.ok(f.removals.some(([key,value])=>key==='account_id'&&value==='account-a'));
});
test('native notification is denied after session replacement, logout, expiry, or without session binding',async()=>{
  const f=fixture();
  assert.equal(await f.mod.saveDriverSubscription('account-a',{endpoint:'fcm:unbound'}),false);
  await f.mod.saveDriverSubscription('account-a',{endpoint:'fcm:device-a'}, {}, 'a'.repeat(64));
  const payload={title:'Teste',body:'Teste'};
  for(const session of [
    {active_session_hash:'b'.repeat(64),session_expires_at:new Date(Date.now()+60000).toISOString()},
    {active_session_hash:null,session_expires_at:null},
    {active_session_hash:'a'.repeat(64),session_expires_at:new Date(Date.now()-60000).toISOString()},
  ]) {
    f.setSession(session);
    assert.equal((await f.mod.sendPushToDriverAccount('account-a',payload)).sent,0);
  }
  assert.equal((await f.mod.sendWebPush({accountId:'account-a',endpoint:'fcm:legacy',keys:{p256dh:'fcm',auth:'fcm'}},payload)).success,false);
  assert.equal(f.sent.length,0);
});
test('logistics CAS keeps subscription fallback and unrelated extension data',async()=>{
 const text=fs.readFileSync('src/app/api/v1/logistics/[action]/route.ts','utf8');
 const start=text.indexOf('async function persistLogisticsState('),end=text.indexOf('\nfunction getStoreOrdersPath',start);
 let saved;
 const context={crypto:{randomUUID:()=> 'mutation'},recomputeDriverCounters(){},liveOffers:[],liveAssignments:[],liveOrderProjectionsByStore:{},liveStateVersion:1,persistedStateExtras:{pushSubscriptions:[{endpoint:'fcm:test'}],extension:{enabled:true}},liveSettingsByStore:{},liveDrivers:[],liveTracking:{},databaseRevision:3,writeLogisticsState:async(payload,revision)=>{assert.equal(revision,3);saved=payload;return 4;},mutationRequest:{getStore:()=>undefined},lastLocalLogisticsPersistAt:0,lastMutationId:'',normalizeStoreId:x=>x};
 vm.runInNewContext(ts.transpileModule(text.slice(start,end)+'\nglobalThis.run=persistLogisticsState;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 await context.run(); assert.equal(saved.pushSubscriptions[0].endpoint,'fcm:test'); assert.equal(saved.extension.enabled,true);assert.equal(saved.stateVersion,2);
 assert.match(text,/after\(\(\) => notifyDriversOfNewOffer/);
});
