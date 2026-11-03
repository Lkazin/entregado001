const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const fulfillmentContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/order-fulfillment.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, fulfillmentContext);


const componentSource = ts.transpileModule(fs.readFileSync('src/components/CustomerDeliveryTracking.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness() {
  const slots = [], effects = [], intervals = new Map(), events = new Map(), calls = [];
  let cursor = 0, nextInterval = 0, view, token = 'tracking-link-A', fulfillmentType = 'delivery';
  const h = { calls, response: snapshot('locked'), fetchHandler: null };
  const listeners = {
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); },
  };
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => { slots[i].value = typeof update === 'function' ? update(slots[i].value) : update; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, Date, Number, Math, Promise, AbortController, setTimeout, clearTimeout,
    require(id) {
      if (id === '@/lib/order-fulfillment') return fulfillmentContext.exports;
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === 'next/dynamic') return { default: () => 'TrackingMap' };
      if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (id === '@/lib/supabase/client') return { supabaseClient: null };
      throw Error(`Unexpected test import: ${id}`);
    },
    window: { ...listeners, setTimeout, clearTimeout,
      setInterval(fn, ms) { const id = ++nextInterval; intervals.set(id, { fn, ms }); return id; },
      clearInterval(id) { intervals.delete(id); },
    },
    document: { ...listeners, visibilityState: 'visible' },
    async fetch(url, options) {
      calls.push({ url, options });
      if (h.fetchHandler) return h.fetchHandler(url, options);
      if (h.response instanceof Error) throw h.response;
      const data = h.response;
      return { ok: true, json: async () => data };
    },
  };
  vm.runInNewContext(componentSource, context);
  h.render = (nextToken = token, nextFulfillment = fulfillmentType) => {
    fulfillmentType = nextFulfillment;
    token = nextToken; cursor = 0;
    view = context.exports.default({ token, fulfillmentType });
    while (effects.length) effects.shift()();
    return view;
  };
  h.settle = async () => { await new Promise(setImmediate); return h.render(); };
  h.poll = async () => { const poll = [...intervals.values()].find(item => item.ms === 10000); assert.ok(poll); poll.fn(); return h.settle(); };
  h.emit = name => { for (const fn of events.get(name) || []) fn(); };
  h.map = () => nodes(view).find(node => node.type === 'TrackingMap');
  h.unmount = () => { for (const slot of slots) slot?.cleanup?.(); };
  return h;
}

function nodes(node) {
  return !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

function snapshot(stage, latitude = -29.92) {
  return { success: true, stage, message: stage, realtime: null,
    driverLocation: stage === 'active' ? { latitude, longitude: -51.18, updatedAt: new Date().toISOString() } : null,
    destination: stage === 'active' ? { latitude: -29.93, longitude: -51.19 } : null,
    route: stage === 'active' ? { coordinates: [[-51.18, latitude], [-51.19, -29.93]], estimatedMinutes: 10, distanceKm: 2 } : null,
  };
}

test('cliente passa de bloqueado para mapa ativo e encerrado por atualização automática, sem reload', async t => {
  const h = harness(); t.after(h.unmount);
  h.render(); await h.settle();
  assert.equal(h.map(), undefined);
  h.response = snapshot('active'); await h.poll();
  assert.equal(h.map().props.driverLocation.latitude, -29.92);
  assert.equal(h.map().props.routeCoordinates.length, 2);
  h.response = snapshot('ended'); await h.poll();
  assert.equal(h.map(), undefined);
  assert.equal(h.calls.length, 3);
});

test('falha de rede e offline removem o mapa; a volta online obtém snapshot novo', async t => {
  const h = harness(); t.after(h.unmount);
  h.response = snapshot('active'); h.render(); await h.settle();
  assert.ok(h.map());
  h.response = new Error('offline'); await h.poll();
  assert.equal(h.map(), undefined);
  h.response = snapshot('active', -29.94); h.emit('online'); await h.settle();
  assert.equal(h.map().props.driverLocation.latitude, -29.94);
  h.emit('offline'); h.render();
  assert.equal(h.map(), undefined);
});

test('resposta atrasada do token anterior não substitui a entrega do token atual', async t => {
  const h = harness(); t.after(h.unmount);
  let resolveOld;
  h.fetchHandler = url => url.includes('tracking-link-A')
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve({ ok: true, json: async () => snapshot('active', -29.95) });
  h.render('tracking-link-A');
  h.render('tracking-link-B'); await h.settle();
  assert.equal(h.map().props.driverLocation.latitude, -29.95);
  assert.equal(h.calls[0].options.signal.aborted, true);
  resolveOld({ ok: true, json: async () => snapshot('active', -29.91) });
  await h.settle();
  assert.equal(h.map().props.driverLocation.latitude, -29.95);
});

test('polling não sobrepõe solicitações pendentes', async t => {
  const h = harness(); t.after(h.unmount);
  let finish;
  h.fetchHandler = () => new Promise(resolve => { finish = resolve; });
  h.render(); await h.poll(); await h.poll();
  assert.equal(h.calls.length, 1);
  h.fetchHandler = null;
  finish({ ok: true, json: async () => snapshot('active') });
  await h.settle();
  assert.equal(h.calls.length, 2);
});

test('retirada não solicita rastreamento nem monta mapa, inclusive ao trocar modalidade', async t => {
 const h=harness();t.after(h.unmount);h.render('pickup-order','pickup');await h.settle();assert.equal(h.calls.length,0);assert.equal(h.map(),undefined);
 h.response=snapshot('active');h.render('delivery-order','delivery');await h.settle();assert.ok(h.map());const count=h.calls.length;h.render('pickup-order','pickup');await h.settle();assert.equal(h.map(),undefined);assert.equal(h.calls.length,count);
});
