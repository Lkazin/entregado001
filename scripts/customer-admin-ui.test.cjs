const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = (type, props) => ({type, props: props || {}});
const source = ts.transpileModule(fs.readFileSync('src/components/CustomerAdminPanel.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const address = (id, street = 'Rua salva') => ({id,label:'Casa '+id,street,number:'10',neighborhood:'Centro',city:'Canoas',state:'RS',isDefault:id==='a'});
function harness(options={}) {
  let cursor=0, dirty=false, tree;
  const slots=[], effects=[], timers=new Map(), calls=[], confirmations=[];
  let timer=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true}];},
    useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn,deps};return slots[i].value},
    useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||!same(old.deps,deps))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}
  };
  const profile={id:'customer-1',name:'Nome salvo',phone:'5551999990000'};
  const saved=options.addresses||[address('a'),address('b')];
  const customerRequest=async(action,init={})=>{
    const body=init.body?JSON.parse(init.body):undefined;
    calls.push({action,method:init.method||'GET',body,headers:init.headers});
    if(action.startsWith('admin-list'))return {customers:[profile],hasMore:false};
    if(action.startsWith('admin-detail'))return {profile:structuredClone(profile),addresses:structuredClone(saved),orders:[{id:'order-1',orderNumber:87,total:39.9,status:'concluido',itemsSummary:'Pizza de teste',createdAt:'2026-11-02T10:00:00Z'}]};
    if(options.request)return options.request(action,init,body);
    return {success:true,addresses:structuredClone(saved)};
  };
  const exports={};
  vm.runInNewContext(source,{exports,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='@/lib/customer-client')return {customerRequest,emptyCustomerAddress:()=>({label:'',street:'',number:'',neighborhood:'',city:'',state:'',cep:'',isDefault:false}),formatCustomerMoney:v=>'R$ '+Number(v).toFixed(2)};throw Error(name)},AbortController,console,Date,setTimeout(fn){timers.set(++timer,fn);return timer},clearTimeout(id){timers.delete(id)},window:{confirm(message){confirmations.push(message);return options.confirm!==false}}});
  const headers=()=>({'x-admin-token':'test-token'});
  function render(){for(let n=0;n<10;n++){dirty=false;cursor=0;tree=exports.default({getHeaders:headers});effects.splice(0).forEach(fn=>fn());if(!dirty)break}}
  function nodes(node=tree,result=[]){if(!node||typeof node==='boolean')return result;if(Array.isArray(node)){node.forEach(child=>nodes(child,result));return result}if(typeof node==='object'){result.push(node);nodes(node.props?.children ?? null,result)}return result}
  function text(node=tree){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join(' ');return typeof node==='object'?text(node.props?.children ?? null):String(node)}
  function find(predicate,root=tree){const found=nodes(root).find(predicate);assert.ok(found,'expected UI element');return found}
  function button(label,root){return find(n=>n.type==='button'&&text(n).includes(label),root)}
  async function flush(){await new Promise(setImmediate);render()}
  async function click(label,root){button(label,root).props.onClick?.();render();await flush()}
  async function submit(form){form.props.onSubmit({preventDefault(){}});render();await flush()}
  function forms(){return nodes().filter(n=>n.type==='form')}
  function edit(form,label,value){const wrapper=find(n=>n.type==='label'&&text(n).trim().startsWith(label),form);find(n=>n.type==='input',wrapper).props.onChange({target:{value}});render()}
  render();
  return {calls,confirmations,render,flush,click,submit,forms,edit,find,text,nodes,async open(){for(const [id,fn] of [...timers]){timers.delete(id);fn()}await flush();await click('Nome salvo')}};
}

test('saving an address preserves edited profile name and another address draft',async()=>{
  const h=harness({request:async()=>({addresses:[address('a','Rua salva no servidor'),address('b')]})});await h.open();
  h.edit(h.forms()[0],'Nome','Nome ainda não salvo');
  h.edit(h.forms()[2],'Rua','Rascunho de outra rua');
  await h.submit(h.forms()[1]);
  const name=h.find(n=>n.type==='input'&&n.props.value==='Nome ainda não salvo');assert.ok(name);
  assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Rascunho de outra rua'));
  assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Rua salva no servidor'));
  assert.equal(h.calls.filter(c=>c.action==='admin-update').length,0);
});

test('new address sends all entered fields and isDefault, then replaces the unsaved draft',async()=>{
  let sent;const h=harness({addresses:[],request:async(action,init,body)=>{sent=body;return {addresses:[{...body,id:'new-id'}]}}});await h.open();await h.click('Adicionar endereço');
  for(const [field,value] of [['Apelido','Trabalho'],['Rua','Rua nova'],['Número','22'],['Bairro','Centro'],['Cidade','Canoas'],['UF','RS']])h.edit(h.forms()[1],field,value);
  h.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();await h.submit(h.forms()[1]);
  assert.equal(sent.customerId,'customer-1');assert.equal(sent.street,'Rua nova');assert.equal(sent.number,'22');assert.equal(sent.isDefault,true);
  assert.equal(h.forms().length,2);assert.match(h.text(),/Excluir endereço/);assert.doesNotMatch(h.text(),/Descartar novo endereço/);
});

test('deleting an address confirms and sends customerId plus address id, preserving other drafts',async()=>{
  const h=harness({request:async()=>({addresses:[address('b')]})});await h.open();h.edit(h.forms()[2],'Rua','Outra edição');await h.click('Adicionar endereço');h.edit(h.forms()[3],'Rua','Novo rascunho');await h.click('Excluir endereço',h.forms()[1]);
  const call=h.calls.find(c=>c.action==='admin-addresses');assert.equal(call.method,'DELETE');assert.deepEqual(call.body,{customerId:'customer-1',id:'a'});assert.equal(call.headers['x-admin-token'],'test-token');assert.match(h.confirmations[0],/pedidos anteriores serão preservados/);
  assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Outra edição'));assert.ok(h.find(n=>n.type==='input'&&n.props.value==='Novo rascunho'));
});

test('refusing confirmation never deletes saved address or profile',async()=>{
  const h=harness({confirm:false});await h.open();await h.click('Excluir endereço',h.forms()[1]);await h.click('Excluir perfil');assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);assert.equal(h.confirmations.length,2);assert.match(h.text(),/Histórico de pedidos/);
});

test('customer history displays confirmed order number, amount, status and items',async()=>{
  const h=harness();await h.open();assert.match(h.text(),/Pedido # 87/);assert.match(h.text(),/R\$ 39.90/);assert.match(h.text(),/concluido/);assert.match(h.text(),/Pizza de teste/);assert.ok(h.calls.some(c=>c.action==='admin-detail?customerId=customer-1'));
});
