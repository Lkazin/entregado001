const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const helperContext = { exports: {}, Date, Number, Math };
vm.runInNewContext(compile('src/lib/order-delay-alerts.ts'), helperContext);
const componentSource = compile('src/components/OrderDelayAlerts.tsx');
const start = Date.parse('2026-11-02T12:00:00.000Z');

function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(node) { return node == null || node === false ? '' : typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : String(node); }
function harness() {
  const slots = [], effects = [], events = new Map(), storage = new Map(), tones = [], gains = [], contexts = [], opened = [];
  let cursor = 0, view, props = { orders: [{ id: 'o1', orderNumber: 12, status: 'recebido', receivedAt: new Date(start).toISOString() }], now: start, storeId: 'store-A', onOpenOrder: id => opened.push(id) };
  const changed = (previous, deps) => !previous || deps.some((value, i) => value !== previous.deps[i]);
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (changed(previous, deps)) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    useCallback(fn, deps) { const i = cursor++; if (changed(slots[i], deps)) slots[i] = { deps, fn }; return slots[i].fn; },
  };
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumeCount = 0; this.closed = false; contexts.push(this); }
    async resume() { this.resumeCount++; this.state = 'running'; }
    async close() { this.closed = true; this.state = 'closed'; }
    createOscillator() { const tone = { frequency: { setValueAtTime(value) { tone.hz = value; } }, connect() {}, disconnect() {}, start(at) { tone.at = at; tones.push(tone); }, stop(at) { tone.stoppedAt = at; } }; return tone; }
    createGain() { const gain = { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { gain.peak = value; gains.push(value); }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; return gain; }
  }
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, Date, Number, Math, JSON, Event, Promise,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    window: { AudioContext,
      addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
      removeEventListener(name, fn) { events.get(name)?.delete(fn); },
      dispatchEvent(event) { for (const fn of events.get(event.type) || []) fn(event); },
    },
    require(id) { if (id === 'react') return hooks; if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }; if (id === '@/lib/order-delay-alerts') return helperContext.exports; throw Error(`Unexpected import: ${id}`); },
  };
  vm.runInNewContext(componentSource, context);
  const h = { tones, gains, contexts, opened, storage,
    render(update = {}) { props = { ...props, ...update }; cursor = 0; view = context.exports.default(props); while (effects.length) effects.shift()(); return view; },
    async settle() { await new Promise(setImmediate); h.render(); return view; },
    async click(label) { const button = nodes(view).find(n => n.type === 'button' && text(n) === label); assert.ok(button, `Button ${label} exists`); button.props.onClick(); await h.settle(); },
    emit(name) { for (const fn of events.get(name) || []) fn(); },
    listenerCount: name => events.get(name)?.size || 0,
    content: () => text(view),
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  return h;
}

test('explicit gesture unlocks WebAudio, produces tones and cleans the context on unmount', async () => {
  const h = harness(); h.render(); h.render();
  assert.equal(h.contexts.length, 0); assert.equal(h.tones.length, 0);
  await h.click('Ativar e testar som');
  assert.equal(h.contexts.length, 1); assert.equal(h.contexts[0].resumeCount, 1);
  assert.equal(h.tones.length, 2); assert.equal(h.tones[0].hz, 740); assert.ok(h.gains[0] > 0);
  h.unmount(); assert.equal(h.contexts[0].closed, true);
});

test('automatic warning starts at five minutes and escalates tone and label at ten', async t => {
  const h = harness(); t.after(h.unmount); h.render(); h.render(); await h.click('Ativar e testar som'); h.tones.length = 0;
  h.render({ now: start + 4 * 60000 }); assert.equal(h.tones.length, 0);
  h.render({ now: start + 5 * 60000 }); assert.equal(h.tones.length, 2); assert.equal(h.tones[0].hz, 740); assert.match(h.content(), /5 min aguardando aceite/);
  h.tones.length = 0; h.render({ now: start + 10 * 60000 }); assert.equal(h.tones.length, 3); assert.equal(h.tones[0].hz, 1050); assert.match(h.content(), /URGENTE/);
});

test('muting and a five-minute snooze suppress repetitions and snooze expires automatically', async t => {
  const h = harness(); t.after(h.unmount); h.render(); h.render(); await h.click('Ativar e testar som'); h.tones.length = 0;
  h.render({ now: start + 5 * 60000, muted: true }); assert.equal(h.tones.length, 0);
  h.render({ now: start + 5 * 60000, muted: false }); assert.equal(h.tones.length, 2);
  await h.click('Silenciar por 5 min'); h.tones.length = 0;
  h.render({ now: start + 9 * 60000 }); assert.equal(h.tones.length, 0); assert.match(h.content(), /Som pausado/);
  h.render({ now: start + 10 * 60000 }); assert.equal(h.tones.length, 3);
});

test('completion removes the delayed order and stops automatic audio without losing other orders', async t => {
  const h = harness(); t.after(h.unmount); h.render(); h.render(); await h.click('Ativar e testar som');
  h.render({ now: start + 6 * 60000 }); h.tones.length = 0;
  h.render({ now: start + 7 * 60000, orders: [{ id:'o1',orderNumber:12,status:'concluido',receivedAt:new Date(start).toISOString(),deliveredAt:new Date(start+7*60000).toISOString() }] });
  assert.equal(h.tones.length, 0); assert.match(h.content(), /Sem pedidos acima/);
  h.render({ now: start + 8 * 60000 }); assert.equal(h.tones.length, 0);
});

test('alarm settings are editable, stored for the current store and disabled alarms stay silent', async t => {
  const h = harness(); t.after(h.unmount); h.render(); h.render(); await h.click('Ativar e testar som'); await h.click('Configurar alarmes deste aparelho');
  let view = h.render(), checkbox = nodes(view).find(n => n.type === 'input' && n.props.type === 'checkbox');
  checkbox.props.onChange({ target: { checked: false } }); h.render(); h.tones.length = 0;
  h.render({ now: start + 6 * 60000 }); assert.equal(h.tones.length, 0);
  assert.equal(JSON.parse(h.storage.get('nw:order-alarm:v1:store-A')).enabled, false);
  assert.equal(h.storage.has('nw:order-alarm:v1:store-B'), false);
});

test('completion stops only its own warning and opening another delayed order uses its id', async t => {
  const h = harness(); t.after(h.unmount); h.render(); h.render(); await h.click('Ativar e testar som');
  const receivedAt = new Date(start).toISOString();
  h.render({ now:start+6*60000, orders:[{id:'o1',orderNumber:12,status:'concluido',receivedAt},{id:'o2',orderNumber:13,status:'recebido',receivedAt}] });
  assert.match(h.content(), /1 pedido\(s\)/); assert.ok(!h.content().includes('#12'));
  await h.click('#13 · 6 min aguardando aceite'); assert.deepEqual(h.opened,['o2']);
  h.tones.length=0; h.render({now:start+6*60000+29000}); assert.equal(h.tones.length,0);
  h.render({now:start+6*60000+30000}); assert.equal(h.tones.length,2);
});

test('testing audio on an already delayed order produces one burst, then respects repeat time', async t => {
  const h=harness();t.after(h.unmount);h.render({now:start+6*60000});h.render();
  await h.click('Ativar e testar som');assert.equal(h.tones.length,2);
  h.render({now:start+6*60000+29000});assert.equal(h.tones.length,2);
  h.render({now:start+6*60000+30000});assert.equal(h.tones.length,4);
});
test('zero volume schedules no oscillators or invalid zero-to-exponential gain ramps', async t => {
  const h=harness();t.after(h.unmount);h.storage.set('nw:order-alarm:v1:store-A',JSON.stringify({volume:0}));h.render();h.render();
  await h.click('Ativar e testar som');h.render({now:start+10*60000});assert.equal(h.tones.length,0);assert.equal(h.gains.length,0);
});

test('a page gesture unlocks automatic delay alarms without requiring the test button', async t => {
  const h=harness();t.after(h.unmount);h.render({now:start+5*60000});h.render();assert.equal(h.tones.length,0);
  h.emit('pointerdown');await h.settle();assert.equal(h.contexts[0].resumeCount,1);assert.equal(h.tones.length,2);
  h.emit('keydown');await h.settle();assert.equal(h.contexts[0].resumeCount,1);assert.equal(h.tones.length,2);
  h.unmount();assert.equal(h.listenerCount('pointerdown'),0);assert.equal(h.listenerCount('keydown'),0);
});
test('page gestures unlock audio but cannot bypass a temporary mute',async t=>{
  const h=harness();t.after(h.unmount);h.render({now:start+6*60000,muted:true});h.render();h.emit('keydown');await h.settle();assert.equal(h.tones.length,0);assert.match(h.content(),/temporariamente silenciado/);assert.ok(!h.content().includes('Sons dos pedidos desativados.'));
  h.render({muted:false});assert.equal(h.tones.length,2);
});

test('page gestures cannot bypass disabled sound preferences',async t=>{const h=harness();t.after(h.unmount);h.storage.set('nw:order-alarm:v1:store-A',JSON.stringify({enabled:false}));h.render({now:start+10*60000});h.render();h.emit('pointerdown');await h.settle();assert.equal(h.tones.length,0);assert.match(h.content(),/Sons dos pedidos desativados/);});
