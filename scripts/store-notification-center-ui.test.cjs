const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('src/components/StoreNotificationCenter.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function nodes(n){return !n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
function text(n){return n==null||n===false?'':typeof n==='object'?Array.isArray(n)?n.map(text).join(''):[n.props?.children].flat(Infinity).map(text).join(''):String(n);}
function harness(){
  const slots=[],effects=[],timers=new Map(),intervals=new Map(),calls=[],storage=new Map(),opened=[];let cursor=0,view,next=0,ratingsOpened=0;
  const now=new Date().toISOString(),rating={id:'rating:o1:1',kind:'rating',orderId:'o1',orderNumber:'12',message:'Nova avaliação do pedido #12: 5 de 5 estrelas.',at:now,read:false};
  const h={calls,storage,opened,rating,response:{success:true,storeId:'a',serverNow:now,notifications:[rating],limits:{preparing:25,pickup:10,transit:45}},failure:false};
  const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++,previous=slots[i];if(!previous||deps.some((v,j)=>v!==previous.deps[j]))effects.push(()=>{previous?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
  const jsx=(type,props)=>({type,props});const props={getHeaders:()=>({'Content-Type':'application/json'}),onOpenOrder:id=>opened.push(id),onOpenRatings:()=>{ratingsOpened++;}};
  const context={exports:{},Date,JSON,Set,AbortController,document:{body:{}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(fn,ms){const id=++next;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),
    async fetch(url,options){calls.push({url,options});if(h.failure)throw Error('offline');return{ok:true,json:async()=>options?.method==='POST'?{success:true}:h.response};},
    require(id){if(id==='react')return hooks;if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};if(id==='react-dom')return{createPortal:node=>node};if(id==='lucide-react')return{Bell:'Bell',X:'X'};throw Error(id);}};
  vm.runInNewContext(source,context);
  h.render=()=>{cursor=0;view=context.exports.default(props);while(effects.length)effects.shift()();return view;};
  h.settle=async()=>{await new Promise(setImmediate);h.render();};
  h.click=async predicate=>{const button=nodes(view).find(n=>n.type==='button'&&predicate(n,text(n)));assert.ok(button);button.props.onClick();await h.settle();};
  h.poll=async()=>{[...intervals.values()].find(t=>t.ms===5000).fn();await h.settle();};
  h.content=()=>text(view);h.ratingsOpened=()=>ratingsOpened;h.toasts=()=>nodes(view).filter(n=>n.type==='aside');
  h.dismissTimer=()=>{for(const [id,timer]of timers)if(timer.ms===8000){timers.delete(id);timer.fn();}h.render();};
  h.unmount=()=>{for(const slot of slots)slot?.cleanup?.();};return h;
}
test('new evaluation toast opens the ratings page and acknowledges exactly that notice',async t=>{const h=harness();t.after(h.unmount);h.render();await h.settle();assert.equal(h.toasts().length,1);await h.click((n,label)=>label.startsWith(h.rating.message));assert.equal(h.ratingsOpened(),1);assert.deepEqual(h.opened,[]);const post=h.calls.find(c=>c.options?.method==='POST');assert.deepEqual(JSON.parse(post.options.body),{action:'read',ids:[h.rating.id]});});
test('polling the same evaluation does not recreate a dismissed toast',async t=>{const h=harness();t.after(h.unmount);h.render();await h.settle();assert.equal(h.toasts().length,1);h.dismissTimer();assert.equal(h.toasts().length,0);await h.poll();await h.poll();assert.equal(h.toasts().length,0);assert.deepEqual(JSON.parse(h.storage.get('nw:store-notice-seen:a')),[h.rating.id]);});
test('failed polling preserves the center and recovery retrieves a new delivered notice',async t=>{const h=harness();t.after(h.unmount);h.render();await h.settle();h.dismissTimer();h.failure=true;await h.poll();await h.click(n=>String(n.props['aria-label']||'').startsWith('Central de avisos'));assert.match(h.content(),/Tentando reconectar/);h.failure=false;h.response={...h.response,notifications:[{...h.rating,id:'delivered:o2:2',kind:'delivered',orderId:'o2',message:'João entregou o pedido #13.'}]};await h.poll();assert.ok(!h.content().includes('Tentando reconectar'));await h.click((n,label)=>label.startsWith('João entregou'));assert.deepEqual(h.opened,['o2']);assert.equal(h.ratingsOpened(),0);});
