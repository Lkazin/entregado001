const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,driver,STORE_A,STORE_B}=require('./logistics-account.test.cjs');
function body(extra={}){return{storeId:STORE_A,fulfillmentType:'pickup',customer:{name:'Cliente teste',phone:'51999998888'},items:[{name:'Item',quantity:1,unitPrice:25,totalPrice:25}],subtotal:25,deliveryFee:12,total:37,orderNumber:654321,...extra};}
function request(f,payload,admin=false,store=STORE_A){return new f.Request('https://isolated.test/api/orders',{method:admin?'PATCH':'POST',headers:admin?{'x-admin-token':f.tokens.signAdminToken(store)}:{},body:JSON.stringify(payload)});}
test('pickup POST persists without address, canonical totals and no driver PIN or confirmation secret',async()=>{
 const f=fixture(),orders=f.load('src/app/api/orders/route.ts');const result=await orders.POST(request(f,body({deliveryPin:'1234'})));
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.fulfillmentType,'pickup');assert.equal(result.body.total,25);assert.equal(result.body.deliveryFee,0);assert.equal(result.body.deliveryPin,null);
 const saved=f.stored().orderProjectionsByStore[STORE_A][result.body.orderId];assert.equal(saved.fulfillmentType,'pickup');assert.equal(saved.address,'');assert.equal(saved.addressDetail,null);assert.equal(saved.city,'');assert.equal(saved.deliveryFee,0);assert.equal(saved.total,saved.subtotal);assert.equal(saved.deliveryPin,null);
 const relational=f.backing.inserts.find(x=>x.table==='orders').values;assert.equal(relational.fulfillment_type,'pickup');assert.deepEqual(relational.address_snapshot_json,{});assert.equal(relational.delivery_fee,0);assert.equal(relational.total,25);assert(!f.backing.inserts.some(x=>x.table==='delivery_confirmation_secrets'));
 const duplicate=await orders.POST(request(f,body({fulfillmentType:'delivery',address:{street:'Rua A',number:'1'}})));assert.equal(duplicate.body.duplicate,true);assert.equal(duplicate.body.fulfillmentType,'pickup');assert.equal(duplicate.body.total,25);assert.equal(duplicate.body.deliveryFee,0);assert.equal(duplicate.body.deliveryPin,null);
});
test('pickup rejects invalid numeric amounts and legacy delivery still requires address',async()=>{
 for(const extra of [{subtotal:-1},{subtotal:null},{subtotal:'NaN'},{total:-1}]){const f=fixture(),orders=f.load('src/app/api/orders/route.ts');assert.equal((await orders.POST(request(f,body(extra)))).status,400);assert.equal(f.backing.writes,0);}
 const f=fixture(),orders=f.load('src/app/api/orders/route.ts');assert.equal((await orders.POST(request(f,body({fulfillmentType:undefined})))).status,400);
 const delivery=await orders.POST(request(f,body({fulfillmentType:undefined,address:{street:'Rua A',number:'10',city:'Canoas',state:'RS'}})));assert.equal(delivery.status,200,JSON.stringify(delivery.body));assert.equal(delivery.body.fulfillmentType,'delivery');assert.equal(delivery.body.deliveryFee,12);assert.equal(delivery.body.total,37);assert.match(delivery.body.deliveryPin,/^\d{4}$/);
});
function readyPickup(status='pronto'){
 const d=driver('fixed','driver'),f=fixture({drivers:[d]});f.backing.state.settingsByStore[STORE_A]={storeId:STORE_A,distributionMode:'fixed_driver',fixedDriverId:d.id,automaticDispatchEnabled:true};f.backing.state.orderProjectionsByStore={[STORE_A]:{p1:{id:'p1',storeId:STORE_A,fulfillmentType:'pickup',status,orderNumber:1234,deliveryFee:0,subtotal:25,total:25,orderProjectionUpdatedAt:new Date().toISOString()}}};return f;
}
test('manual and automatic driver dispatch both reject pickup without creating offers',async()=>{
 for(const automatic of [false,true]){const f=readyPickup();const result=await f.post('offer-create',{orderId:'p1',automatic},'admin');assert.equal(result.status,409);assert.equal(result.body.code,'PICKUP_ORDER_NOT_DISPATCHABLE');assert.equal(f.stored().offers.length,0);}
});
test('pickup completes at counter only after ready, never enters driver transit and preserves tenant boundary',async()=>{
 const f=readyPickup(),orders=f.load('src/app/api/orders/route.ts');const transit=await orders.PATCH(request(f,{orderId:'p1',status:'em_entrega'},true));assert.equal(transit.status,409);
 const foreign=await orders.PATCH(request(f,{orderId:'p1',status:'concluido'},true,STORE_B));assert.equal(foreign.status,404);
 const done=await orders.PATCH(request(f,{orderId:'p1',status:'concluido'},true));assert.equal(done.status,200);const saved=f.stored().orderProjectionsByStore[STORE_A].p1;assert.equal(saved.status,'concluido');assert(saved.collectedAt);assert.equal(saved.driverId,null);assert.equal(saved.deliveredAt,undefined);assert.equal(f.stored().offers.length,0);
 const early=readyPickup('preparando');const rejected=await early.load('src/app/api/orders/route.ts').PATCH(request(early,{orderId:'p1',status:'concluido'},true));assert.equal(rejected.status,409);
});
