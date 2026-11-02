const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const jsx=(type,props)=>({type,props:props||{}});
const regions=[{id:'centro',name:'Centro',fee:6,minOrder:20}];
const defaultItems=[{id:'drink',type:'drink',name:'Bebida',quantity:1,unitPrice:30,totalPrice:30}];

function harness(options={}) {
  let cursor=0,needsRender=false,tree;
  const slots=[],effects=[],calls=[],success=[],timeouts=new Map(),events={};let timer=0;
  const react={
    useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value;needsRender=true;}];},
    useRef(value){const index=cursor++;if(!slots[index])slots[index]={current:value};return slots[index];},
    useMemo(factory){cursor++;return factory();},
    useEffect(fn,deps){const index=cursor++;const old=slots[index];if(!old||!deps||deps.some((d,i)=>!Object.is(d,old.deps[i]))){effects.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:fn()};});}},
  };
  const storage=new Map();
  const customerRequest=options.customerRequest||((action)=>action==='me'?Promise.reject(new Error('no session')):Promise.resolve({success:true}));
  const exports={};
  const fetch=async(url,init={})=>{calls.push({url,init});if(options.fetch)return options.fetch(url,init);return {ok:true,json:async()=>({success:true,orderId:'confirmed-id',orderNumber:4321,trackingToken:'server-private-token',deliveryPin:'0987',customerProfileSaved:true})};};
  vm.runInNewContext(compile('src/components/CartCheckoutDrawer.tsx'),{exports,require:name=>{
    if(name==='react')return {__esModule:true,default:react,...react};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(name==='next/link')return {__esModule:true,default:'a'};
    if(name==='lucide-react')return new Proxy({}, {get:(_,key)=>String(key)});
    if(name==='@/lib/constants')return {DELIVERY_REGIONS:regions};
    if(name==='@/lib/customer-client')return {customerRequest,formatCustomerMoney:value=>'R$ '+Number(value).toFixed(2)};
    throw Error(name);
  },fetch,AbortController,Event,Number,Array,Date,Math,JSON,console,setTimeout:(fn,ms)=>{timeouts.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timeouts.delete(id),window:{addEventListener:(n,fn)=>{events[n]=fn;},removeEventListener:(n,fn)=>{if(events[n]===fn)delete events[n];},dispatchEvent(){}},document:{activeElement:{focus(){}},body:{style:{overflow:''}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  const props={isOpen:true,onClose(){},items:defaultItems,onRemoveItem(){},onUpdateQty(){},onOrderSuccess:value=>success.push(value)};
  function render(){for(let iteration=0;iteration<15;iteration++){needsRender=false;cursor=0;tree=exports.default(props);for(const effect of effects.splice(0))effect();if(!needsRender)break;}return tree;}
  function nodes(node,result=[]){if(node==null||typeof node==='boolean')return result;if(Array.isArray(node)){for(const child of node)nodes(child,result);return result;}if(typeof node==='object'){result.push(node);nodes(node.props?.children,result);}return result;}
  function text(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join(' ');if(typeof node==='object')return text(node.props?.children);return String(node);}
  function find(predicate){const found=nodes(tree).find(predicate);assert.ok(found,'Expected element exists');return found;}
  function input(label,value){find(n=>n.type==='input'&&n.props['aria-label']===label).props.onChange({target:{value}});find(n=>n.type==='form').props.onChange();render();}
  function click(label){const button=find(n=>n.type==='button'&&text(n).includes(label));button.props.onClick?.({});render();}
  async function flush(){await new Promise(resolve=>setImmediate(resolve));render();}
  async function submit(){const result=find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();await result;await flush();}
  render();return {props,render,nodes,text:()=>text(tree),find,input,click,flush,submit,calls,success,timeouts};
}

function fillDelivery(h){h.input('Nome completo','Cliente de teste');h.input('WhatsApp com DDD','51999990000');h.input('Rua ou avenida','Rua pública');h.input('Número do imóvel','10');}

test('checkout requires delivery/payment review before posting and trusts only server confirmation',async()=>{
  const h=harness();await h.flush();fillDelivery(h);h.click('Escolher pagamento');assert.match(h.text(),/Como prefere pagar/);assert.equal(h.calls.length,0);h.click('Revisar pedido');assert.match(h.text(),/Revise antes/);assert.equal(h.calls.length,0);
  await h.submit();assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/orders');assert.equal(h.success.length,1);assert.equal(h.success[0].trackingToken,'server-private-token');assert.equal(h.success[0].deliveryPin,'0987');assert.equal(h.success[0].orderNumber,4321);
});

test('failed order retains cart and retry uses the same draft number instead of making another order',async()=>{
  let attempt=0;const h=harness({fetch:async()=>++attempt===1?{ok:false,json:async()=>({success:false})}:{ok:true,json:async()=>({success:true,orderId:'ok',orderNumber:2222,trackingToken:'confirmed-token',deliveryPin:'1234'})}});await h.flush();fillDelivery(h);h.click('Escolher pagamento');h.click('Revisar pedido');await h.submit();assert.equal(h.success.length,0);assert.match(h.text(),/Não foi possível confirmar/);assert.equal(h.props.items.length,1);await h.submit();assert.equal(h.success.length,1);assert.equal(JSON.parse(h.calls[0].init.body).orderNumber,JSON.parse(h.calls[1].init.body).orderNumber);
});

test('late profile response cannot replace a name already typed into the checkout',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const h=harness({customerRequest:()=>pending});h.input('Nome completo','Nome digitado');resolve({success:true,profile:{id:'profile',name:'Nome salvo',phone:'51999990000'},addresses:[]});await h.flush();assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']==='Nome completo').props.value,'Nome digitado');
});

test('unknown saved neighborhood does not silently use a different delivery fee',async()=>{
  const h=harness({customerRequest:async()=>({success:true,profile:{id:'profile',name:'Cliente',phone:'51999990000'},addresses:[{id:'address',label:'Casa',street:'Rua',number:'10',neighborhood:'Bairro não atendido',city:'Canoas',state:'RS',isDefault:true}]})});await h.flush();h.click('Escolher pagamento');assert.match(h.text(),/Selecione um bairro atendido/);assert.equal(h.calls.length,0);
});

test('order result stays successful when optional address saving fails',async()=>{
  const h=harness({customerRequest:async()=>{throw Error('profile unavailable');}});await h.flush();fillDelivery(h);h.click('Escolher pagamento');h.click('Revisar pedido');await h.submit();assert.equal(h.success.length,1);assert.match(h.success[0].profileSaveWarning,/endereço não pôde ser salvo/);
});

test('unchecking save address uses delivery details only in this order',async()=>{
  const actions=[];const h=harness({customerRequest:async action=>{actions.push(action);throw Error('no session');}});await h.flush();fillDelivery(h);h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:false}});h.render();h.click('Escolher pagamento');h.click('Revisar pedido');await h.submit();assert.equal(h.success.length,1);assert.equal(JSON.parse(h.calls[0].init.body).saveCustomerAddress,false);assert.equal(actions.filter(a=>a==='addresses').length,0);
});

test('double submit cannot send two order requests while the first confirmation is pending',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const h=harness({fetch:()=>pending});await h.flush();fillDelivery(h);h.click('Escolher pagamento');h.click('Revisar pedido');const first=h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,1);resolve({ok:true,json:async()=>({success:true,orderId:'one',orderNumber:2222,trackingToken:'one-confirmed-token',deliveryPin:'1234'})});await first;await h.flush();assert.equal(h.success.length,1);
});
