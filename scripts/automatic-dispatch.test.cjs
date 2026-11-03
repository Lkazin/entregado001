const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const {fixture,driver,STORE_A,STORE_B}=require('./logistics-account.test.cjs');
const fulfillment={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/order-fulfillment.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:fulfillment});
const context={exports:{},require:name=>{if(name==='../order-fulfillment')return fulfillment;throw Error('Unexpected import '+name);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logistics/automatic-dispatch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);const policy=context.exports;
function setup({enabled=true,available=true,status='pronto',fee=9}={}){
 const d=driver('fixed-a','driver-a',STORE_A,{presence:available?'disponivel':'indisponivel'}),f=fixture({drivers:[d]});
 f.backing.state.settingsByStore[STORE_A]={storeId:STORE_A,storeName:'Loja A',distributionMode:'fixed_driver',fixedDriverId:d.id,automaticDispatchEnabled:enabled,maxConcurrentDeliveries:5,offerTimeoutSeconds:900};
 f.backing.state.orderProjectionsByStore={[STORE_A]:{'order-a':{id:'order-a',storeId:STORE_A,status,orderNumber:'101',deliveryFee:fee,address:'Rua A',orderProjectionUpdatedAt:new Date().toISOString()}}};
 return {f,d};
}
test('automatic policy is disabled by default and only triggers a new ready delivery',async()=>{
 let calls=0;const create=async()=>{calls++;return{ok:true,data:{success:true,offer:{id:'offer-a'}}}};
 for(const settings of [{},null,{automaticDispatchEnabled:false}])assert.equal((await policy.dispatchReadyOrder({status:'pronto',deliveryFee:9},'preparando',settings,create)).status,'disabled');
 for(const order of [{status:'preparando',deliveryFee:9},{status:'pronto',fulfillmentType:'pickup',deliveryFee:9}])assert.equal((await policy.dispatchReadyOrder(order,'preparando',{automaticDispatchEnabled:true},create)).status,'skipped');
 assert.equal((await policy.dispatchReadyOrder({status:'pronto',deliveryFee:9},'pronto',{automaticDispatchEnabled:true},create)).status,'skipped');assert.equal(calls,0);
});
test('automatic policy preserves zero fee, awaits actual creation and reports failure without reverting ready',async()=>{
 let body;const order={id:'order-a',status:'pronto',deliveryFee:0};const result=await policy.dispatchReadyOrder(order,'preparando',{automaticDispatchEnabled:true},async payload=>{body=payload;return {ok:true,data:{success:true,offer:{offerId:'offer-a'}}}});
 assert.equal(result.status,'created');assert.equal(body.feeOffered,0);assert.equal(order.status,'pronto');
 assert.equal((await policy.dispatchReadyOrder(order,'preparando',{automaticDispatchEnabled:true},async()=>{throw Error('network')})).status,'pending');
 assert.equal((await policy.dispatchReadyOrder({...order,deliveryFee:undefined},'preparando',{automaticDispatchEnabled:true},async()=>{throw Error('must not call')})).status,'pending');
});
test('settings default off and automatic mode requires a fixed driver from the same store',async()=>{
 const f=fixture();const defaults=await f.get('settings-get','admin');assert.equal(defaults.body.settings.automaticDispatchEnabled,false);
 assert.equal((await f.post('settings-update',{automaticDispatchEnabled:true},'admin')).status,409);
 const {f:ready,d}=setup();assert.equal((await ready.post('settings-update',{maxConcurrentDeliveries:3},'admin')).status,200);assert.equal(ready.stored().settingsByStore[STORE_A].automaticDispatchEnabled,true);assert.equal(ready.stored().settingsByStore[STORE_A].distributionMode,'fixed_driver');
 assert.equal((await ready.post('settings-update',{distributionMode:'broadcast_enabled'},'admin')).status,409);
 assert.equal((await ready.post('settings-update',{distributionMode:'broadcast_enabled',automaticDispatchEnabled:false},'admin')).status,200);
 assert.equal((await ready.post('settings-update',{automaticDispatchEnabled:true,fixedDriverId:d.id,storeId:STORE_A},'admin',{'x-admin-token':ready.tokens.signAdminToken(STORE_B)})).status,403);
});
test('automatic route reuses real dispatch, fixed target and zero fee; repeated request never duplicates',async()=>{
 const {f,d}=setup({fee:0});const first=await f.post('offer-create',{automatic:true,orderId:'order-a',distributionMode:'broadcast_enabled',driverId:'other',feeOffered:999},'admin');
 assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.offer.distributionMode,'fixed_driver');assert.equal(first.body.offer.targetDriverId,d.driverId);assert.equal(first.body.offer.deliveryFee,0);assert.equal(first.body.offer.storeName,'Loja A');
 const second=await f.post('offer-create',{automatic:true,orderId:'order-a'},'admin');assert.equal(second.status,409);assert.equal(f.stored().offers.length,1);
});
test('automatic route rejects disabled, unavailable, unready and other-store orders without a new offer',async()=>{
 for(const options of [{enabled:false},{available:false},{status:'preparando'}]){
 const {f}=setup(options);const result=await f.post('offer-create',{automatic:true,orderId:'order-a'},'admin');assert.equal(result.status,409,JSON.stringify(result.body));assert.equal(f.stored().offers.length,0);}
 const {f}=setup();const other=await f.post('offer-create',{automatic:true,orderId:'order-a'},'admin',{'x-admin-token':f.tokens.signAdminToken(STORE_B)});assert.notEqual(other.status,200);assert.equal(f.stored().offers.length,0);
});
test('manual broadcast remains available when automatic mode is disabled',async()=>{
 const {f}=setup({enabled:false});const result=await f.post('offer-create',{orderId:'order-a',distributionMode:'broadcast_enabled',feeOffered:13},'admin');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.offer.distributionMode,'broadcast_enabled');assert.equal(result.body.offer.deliveryFee,13);
});

test('PATCH ready runs automatic dispatch on the server once and exposes the real result',async()=>{
 const {f}=setup({status:'preparando'});const orders=f.load('src/app/api/orders/route.ts');
 const patch=()=>orders.PATCH(new f.Request('https://isolated.test/api/orders',{method:'PATCH',headers:{'x-admin-token':f.tokens.signAdminToken(STORE_A),'content-type':'application/json'},body:JSON.stringify({orderId:'order-a',status:'pronto'})}));
 const first=await patch();assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.automaticDispatch.status,'created',JSON.stringify(first.body));assert.equal(f.stored().offers.length,1);assert.equal(f.stored().offers[0].distributionMode,'fixed_driver');
 const again=await patch();assert.equal(again.status,200);assert.equal(again.body.automaticDispatch.status,'skipped');assert.equal(f.stored().offers.length,1);
});
test('PATCH ready keeps confirmed kitchen status when fixed driver is unavailable',async()=>{
 const {f}=setup({status:'preparando',available:false});const orders=f.load('src/app/api/orders/route.ts');const result=await orders.PATCH(new f.Request('https://isolated.test/api/orders',{method:'PATCH',headers:{'x-admin-token':f.tokens.signAdminToken(STORE_A)},body:JSON.stringify({orderId:'order-a',status:'pronto'})}));
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.automaticDispatch.status,'pending');assert.equal(f.stored().offers.length,0);assert.equal(f.stored().orderProjectionsByStore[STORE_A]['order-a'].status,'pronto');
});
test('concurrent manual/automatic attempts in separate instances cannot commit duplicate offers',async()=>{
 const {f}=setup();const second=f.restart();const results=await Promise.all([f.post('offer-create',{automatic:true,orderId:'order-a'},'admin'),second.post('offer-create',{orderId:'order-a',distributionMode:'fixed_driver',feeOffered:9},'admin')]);
 assert.equal(results.filter(result=>result.status===200).length,1,JSON.stringify(results.map(r=>r.body)));assert.equal(f.stored().offers.length,1);
});
test('PATCH cannot change or auto-dispatch an order belonging to another store',async()=>{
 const {f}=setup({status:'preparando'});const orders=f.load('src/app/api/orders/route.ts');const before=JSON.stringify(f.stored());
 const result=await orders.PATCH(new f.Request('https://isolated.test/api/orders',{method:'PATCH',headers:{'x-admin-token':f.tokens.signAdminToken(STORE_B)},body:JSON.stringify({orderId:'order-a',status:'pronto',storeId:STORE_A})}));
 assert.equal(result.status,404);assert.equal(JSON.stringify(f.stored()),before);
});
