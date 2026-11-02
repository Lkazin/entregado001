const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Transpilação CommonJS para execução dos módulos
const pageSource = ts.transpileModule(fs.readFileSync('src/app/pedido/[token]/page.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const ratingRouteSource = ts.transpileModule(fs.readFileSync('src/app/api/customer-tracking/rating/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

const timelineSource = ts.transpileModule(fs.readFileSync('src/lib/logistics/order-timeline.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const timelineContext = { exports: {} };
vm.runInNewContext(timelineSource, timelineContext);
const orderTimelineModule = timelineContext.exports;

function createPageHarness({ initialToken = 'token-123', localStorageData = null, isOnline = true } = {}) {
  const slots = [];
  const effects = [];
  const timeouts = new Map();
  const intervals = new Map();
  const eventListeners = new Map();
  let cursor = 0;
  let nextTimeout = 0;
  let nextInterval = 0;
  let view = null;
  let currentToken = initialToken;
  let simulatedTime = 1700000000000;
  let onlineState = isOnline;

  const mockStorage = new Map();
  if (localStorageData) {
    mockStorage.set('novaesweb_orders', JSON.stringify(localStorageData));
  }

  const localStorageMock = {
    getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };

  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [
        slots[i].value,
        (update) => {
          slots[i].value = typeof update === 'function' ? update(slots[i].value) : update;
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] || (slots[i] = { current: initial });
    },
    useCallback(fn) {
      return fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const previous = slots[i];
      const hasChanged = !previous || !deps || deps.some((v, idx) => v !== previous.deps[idx]);
      if (hasChanged) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };

  const calls = [];
  let fetchHandler = null;

  const customDate = class extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super(simulatedTime);
      } else {
        super(...args);
      }
    }
    static now() {
      return simulatedTime;
    }
  };

  const jsx = (type, props) => ({ type, props });
  const LinkComponent = ({ children, ...props }) => ({ type: 'Link', props: { ...props, children } });
  const TrackingMapComponent = (props) => ({ type: 'CustomerDeliveryTracking', props });

  const windowListeners = {
    addEventListener(evt, fn) {
      if (!eventListeners.has(evt)) eventListeners.set(evt, new Set());
      eventListeners.get(evt).add(fn);
    },
    removeEventListener(evt, fn) {
      eventListeners.get(evt)?.delete(fn);
    },
  };

  const context = {
    exports: {},
    Date: customDate,
    Number,
    Math,
    Promise,
    AbortController,
    setTimeout(fn, ms) {
      const id = ++nextTimeout;
      timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(fn, ms) {
      const id = ++nextInterval;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    require(id) {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === 'next/link') return { __esModule: true, default: LinkComponent };
      if (id === 'next/navigation') return { useParams: () => ({ token: currentToken }) };
      if (id === '@/components/CustomerDeliveryTracking') {
        return { __esModule: true, default: TrackingMapComponent };
      }
      if (id === '@/lib/logistics/order-timeline') {
        return orderTimelineModule;
      }
      if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      throw Error(`Unexpected test import: ${id}`);
    },
    window: {
      ...windowListeners,
      localStorage: localStorageMock,
    },
    document: {
      ...windowListeners,
      visibilityState: 'visible',
    },
    navigator: {
      get onLine() {
        return onlineState;
      },
    },
    localStorage: localStorageMock,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
    async fetch(url, options) {
      calls.push({ url, options });
      if (fetchHandler) {
        return fetchHandler(url, options);
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };

  vm.runInNewContext(pageSource, context);

  const h = {
    calls,
    timeouts,
    intervals,
    storage: localStorageMock,
    setOnline(state) {
      onlineState = state;
      const evt = state ? 'online' : 'offline';
      for (const fn of eventListeners.get(evt) || []) fn();
    },
    emitVisibility(state) {
      context.document.visibilityState = state;
      for (const fn of eventListeners.get('visibilitychange') || []) fn();
    },
    advanceTime(ms) {
      simulatedTime += ms;
      // Dispara timeouts expirados
      for (const [id, item] of [...timeouts.entries()]) {
        if (item.ms <= ms) {
          timeouts.delete(id);
          item.fn();
        }
      }
    },
    setSimulatedTime(timestamp) {
      simulatedTime = timestamp;
    },
    getSimulatedTime() {
      return simulatedTime;
    },
    setFetchHandler(fn) {
      fetchHandler = fn;
    },
    render(token = currentToken) {
      currentToken = token;
      cursor = 0;
      view = context.exports.default();
      while (effects.length) {
        effects.shift()();
      }
      return view;
    },
    async settle() {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setImmediate(r));
        h.render(currentToken);
      }
      return view;
    },
    async triggerNextPoll() {
      const poll = [...timeouts.values()].find((item) => item.ms === 3000);
      if (poll) {
        timeouts.delete([...timeouts.entries()].find(([k, v]) => v === poll)[0]);
        poll.fn();
        await h.settle();
      }
    },
    async triggerClockTimer() {
      const timer = [...intervals.values()].find((item) => item.ms === 500);
      if (timer) {
        timer.fn();
        await h.settle();
      }
    },
    unmount() {
      for (const slot of slots) {
        slot?.cleanup?.();
      }
      timeouts.clear();
      intervals.clear();
    },
    getView() {
      return view;
    },
    isPollingScheduled() {
      return [...timeouts.values()].some((item) => item.ms === 3000);
    },
    TrackingMapComponent,
    LinkComponent,
  };

  return h;
}

function findNodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  const matches = predicate(node) ? [node] : [];
  const children = [node.props?.children].flat(Infinity).filter(Boolean);
  return matches.concat(children.flatMap((child) => findNodes(child, predicate)));
}

function collectText(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object' && node.props) return collectText(node.props.children);
  return '';
}

// -------------------------------------------------------------------------
// SUÍTE DE TESTES: REQUISITO 8 - CASOS OBRIGATÓRIOS E CASOS QUE FALTAVAM
// -------------------------------------------------------------------------

test('1. Entrega confirmada, retirada de "Em andamento" e agradecimento após 10 segundos', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-req-1' });
  t.after(h.unmount);

  const deliveryTimestamp = h.getSimulatedTime();
  let status = 'em_entrega';

  h.setFetchHandler(async (url) => {
    if (url.includes('/api/orders')) {
      return {
        ok: true,
        json: async () => ({
          orders: [
            {
              trackingToken: 'tok-req-1',
              orderNumber: '201',
              status,
              deliveredAt: status === 'concluido' ? new Date(deliveryTimestamp).toISOString() : null,
              total: 60.0,
            },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ success: true }) };
  });

  h.render();
  await h.settle();

  let text = collectText(h.getView());
  assert.match(text, /● Em Andamento/i);
  let maps = findNodes(h.getView(), (n) => n.type === h.TrackingMapComponent || n.type === 'CustomerDeliveryTracking');
  assert.equal(maps.length, 1, 'Mapa ativo durante entrega');

  // Backend confirma entrega sem recarregar a página
  status = 'concluido';
  await h.triggerNextPoll();

  text = collectText(h.getView());
  assert.match(text, /Pedido Entregue/i);
  assert.match(text, /✓ Concluído/i);
  assert.doesNotMatch(text, /● Em Andamento/i, 'Retira "Em andamento"');
  maps = findNodes(h.getView(), (n) => n.type === h.TrackingMapComponent || n.type === 'CustomerDeliveryTracking');
  assert.equal(maps.length, 0, 'Mapa encerrado imediatamente');
  assert.match(text, /Rastreamento em tempo real encerrado/i);

  // Transição após 10 segundos
  h.advanceTime(10500);
  await h.triggerClockTimer();

  text = collectText(h.getView());
  assert.match(text, /Pedido entregue!/i);
  assert.match(text, /Agradecemos pela sua compra e pela preferência\./i);
  assert.match(text, /Voltar ao cardápio/i);
});

test('2. Reabertura de pedido entregue há mais de 10 segundos mostra diretamente o agradecimento', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-req-2' });
  t.after(h.unmount);

  const deliveredAt = new Date(h.getSimulatedTime() - 30000).toISOString();

  h.setFetchHandler(async (url) => ({
    ok: true,
    json: async () => ({
      orders: [
        {
          trackingToken: 'tok-req-2',
          orderNumber: '202',
          status: 'concluido',
          deliveredAt,
          total: 45.0,
        },
      ],
    }),
  }));

  h.render();
  await h.settle();

  const text = collectText(h.getView());
  assert.match(text, /Pedido entregue!/i);
  assert.match(text, /Agradecemos pela sua compra e pela preferência\./i);
  assert.match(text, /Entregue às/i);
  assert.doesNotMatch(text, /Etapas da sua Entrega/i, 'Não exibe etapas intermediárias na reabertura');
});

test('3. deliveredAt ausente ou inválido: usa confirmação do servidor como referência temporária sem inventar horário', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-req-3' });
  t.after(h.unmount);

  h.setFetchHandler(async (url) => ({
    ok: true,
    json: async () => ({
      orders: [
        {
          trackingToken: 'tok-req-3',
          orderNumber: '203',
          status: 'concluido',
          deliveredAt: null,
          total: 80.0,
        },
      ],
    }),
  }));

  h.render();
  await h.settle();

  let text = collectText(h.getView());
  assert.match(text, /Pedido Entregue/i);
  assert.doesNotMatch(text, /Entregue às/i, 'Não deve inventar horário oficial se deliveredAt for nulo');

  h.advanceTime(11000);
  await h.triggerClockTimer();

  text = collectText(h.getView());
  assert.match(text, /Pedido entregue!/i);
  assert.match(text, /Agradecemos pela sua compra e pela preferência\./i);
  assert.doesNotMatch(text, /Entregue às/i, 'Mesmo no agradecimento, não inventa horário se nulo');
});

test('4. Cache antigo e conclusão offline ainda pendente não encerram nem causam regressão', async (t) => {
  const cachedOrders = [
    {
      trackingToken: 'tok-req-4',
      orderNumber: '204',
      status: 'concluido',
    },
  ];

  const h = createPageHarness({ initialToken: 'tok-req-4', localStorageData: cachedOrders });
  t.after(h.unmount);

  h.setFetchHandler(async (url) => ({
    ok: true,
    json: async () => ({
      orders: [
        {
          trackingToken: 'tok-req-4',
          orderNumber: '204',
          status: 'em_entrega',
        },
      ],
    }),
  }));

  h.render();
  await h.settle();

  const text = collectText(h.getView());
  assert.match(text, /Saiu para Entrega/i);
  assert.match(text, /● Em Andamento/i);
  assert.doesNotMatch(text, /Agradecemos pela sua compra/i);
});

test('5. Trocar o token enquanto o fetch antigo está pendente: limpa dados e não bloqueia nova consulta', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-A' });
  t.after(h.unmount);

  let finishQueryA;
  h.setFetchHandler(async (url) => {
    if (url.includes('tok-A')) {
      return new Promise((resolve) => {
        finishQueryA = resolve;
      });
    }
    if (url.includes('tok-B')) {
      return {
        ok: true,
        json: async () => ({
          orders: [
            {
              trackingToken: 'tok-B',
              orderNumber: '502',
              status: 'preparando',
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  });

  // Inicia com tok-A pendente
  h.render('tok-A');
  assert.equal(h.calls.length, 1);

  // Troca para tok-B antes de A terminar
  h.render('tok-B');
  await h.settle();

  // A consulta B rodou com sucesso sem ser bloqueada por A
  let text = collectText(h.getView());
  assert.match(text, /Pedido #\s*502/i);
  assert.match(text, /Em Preparo/i);
  assert.doesNotMatch(text, /tok-A/);

  // Resposta antiga de A chega depois
  if (finishQueryA) {
    finishQueryA({
      ok: true,
      json: async () => ({
        orders: [
          {
            trackingToken: 'tok-A',
            orderNumber: '501',
            status: 'concluido',
            deliveredAt: new Date().toISOString(),
          },
        ],
      }),
    });
    await h.settle();
  }

  // Permanece com os dados de B, sem vazar A
  text = collectText(h.getView());
  assert.match(text, /Pedido #\s*502/i);
  assert.doesNotMatch(text, /501/);
  assert.doesNotMatch(text, /Pedido entregue!/i);
});

test('6. Cabeçalhos recebidos, mas corpo JSON pendente até o timeout: aborta e não trava indefinidamente', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-hang' });
  t.after(h.unmount);

  let hangAbortSignal;
  h.setFetchHandler(async (url, opts) => {
    hangAbortSignal = opts.signal;
    return {
      ok: true,
      status: 200,
      json: () =>
        new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('AbortError')));
        }),
    };
  });

  h.render('tok-hang');
  assert.equal(h.calls.length, 1);

  // Simula passagem de 8500ms (tempo superior ao timeout de 8s)
  h.advanceTime(8500);
  await h.settle();

  assert.equal(hangAbortSignal.aborted, true, 'O timeout deve abortar a leitura do corpo JSON');
  const text = collectText(h.getView());
  // Não travou em loop infinito e exibe aviso de servidor/reconexão
  assert.match(text, /Servidor temporariamente indisponível|Sem conexão/i);
});

test('7. Troca de token durante envio de avaliação descarta resposta atrasada e não afeta novo pedido', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-eval-A' });
  t.after(h.unmount);

  let finishRatingPost;
  h.setFetchHandler(async (url, opts) => {
    if (url.includes('/api/orders') && url.includes('tok-eval-A')) {
      return {
        ok: true,
        json: async () => ({
          orders: [
            {
              trackingToken: 'tok-eval-A',
              orderNumber: '701',
              status: 'concluido',
              deliveredAt: new Date(h.getSimulatedTime() - 15000).toISOString(),
            },
          ],
        }),
      };
    }
    if (url.includes('/api/orders') && url.includes('tok-eval-B')) {
      return {
        ok: true,
        json: async () => ({
          orders: [
            {
              trackingToken: 'tok-eval-B',
              orderNumber: '702',
              status: 'preparando',
            },
          ],
        }),
      };
    }
    if (url.includes('/api/customer-tracking/rating')) {
      return new Promise((resolve) => {
        finishRatingPost = resolve;
      });
    }
    return { ok: false, status: 404 };
  });

  h.render('tok-eval-A');
  await h.settle();

  // Agradecimento visível com estrelas
  let text = collectText(h.getView());
  assert.match(text, /Pedido entregue!/i);

  // Dispara avaliação clicando na estrela 5
  const buttons = findNodes(h.getView(), (n) => n.type === 'button');
  const star5Btn = buttons.find((b) => b.props?.['aria-label'] === 'Avaliar com 5 estrelas');
  assert.ok(star5Btn, 'Botão de estrela deve existir');
  star5Btn.props.onClick();

  // Durante a requisição de avaliação pendente, o usuário navega para outro pedido tok-eval-B
  h.render('tok-eval-B');
  await h.settle();

  text = collectText(h.getView());
  assert.match(text, /Pedido #\s*702/i);
  assert.match(text, /Em Preparo/i);

  // A avaliação pendente de A responde agora com sucesso
  if (finishRatingPost) {
    finishRatingPost({
      ok: true,
      json: async () => ({
        success: true,
        rating: { stars: 5, driverName: 'Marcos' },
      }),
    });
    await h.settle();
  }

  // O pedido B não deve ser contaminado com a mensagem de avaliação de A
  text = collectText(h.getView());
  assert.match(text, /Pedido #\s*702/i);
  assert.match(text, /Em Preparo/i);
  assert.doesNotMatch(text, /Avaliação registrada/i);
  assert.doesNotMatch(text, /Pedido entregue!/i);
});

test('8. Cancelamento: exibe "Pedido cancelado" sem agradecimento de entrega', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-canceled' });
  t.after(h.unmount);

  h.setFetchHandler(async (url) => ({
    ok: true,
    json: async () => ({
      orders: [
        {
          trackingToken: 'tok-canceled',
          orderNumber: '801',
          status: 'cancelado',
        },
      ],
    }),
  }));

  h.render();
  await h.settle();

  const text = collectText(h.getView());
  assert.match(text, /Pedido Cancelado/i);
  assert.match(text, /Este pedido foi cancelado pelo lojista/i);
  assert.doesNotMatch(text, /Agradecemos pela sua compra/i);
  assert.doesNotMatch(text, /Pedido entregue!/i);
});

test('9. Dois pedidos na mesma rota: finalização do pedido A não encerra pedido B', async (t) => {
  const orderA = {
    trackingToken: 'tok-rota-A',
    orderNumber: '901',
    status: 'concluido',
    deliveredAt: new Date().toISOString(),
  };

  const orderB = {
    trackingToken: 'tok-rota-B',
    orderNumber: '902',
    status: 'em_entrega',
  };

  const h = createPageHarness({ initialToken: 'tok-rota-B' });
  t.after(h.unmount);

  h.setFetchHandler(async (url) => ({
    ok: true,
    json: async () => ({
      orders: [orderA, orderB],
    }),
  }));

  h.render('tok-rota-B');
  await h.settle();

  const text = collectText(h.getView());
  assert.match(text, /Pedido #\s*902/i);
  assert.match(text, /Saiu para Entrega/i);
  assert.match(text, /● Em Andamento/i);
  assert.doesNotMatch(text, /Pedido #\s*901/i);
  assert.doesNotMatch(text, /Agradecemos pela sua compra/i);
});

test('10. "Pedir novamente" e "Voltar ao cardápio" levam ao cardápio com segurança sem duplicar checkout', async (t) => {
  const h = createPageHarness({ initialToken: 'tok-repeat' });
  t.after(h.unmount);

  h.setFetchHandler(async (url) => ({
    ok: true,
    json: async () => ({
      orders: [
        {
          trackingToken: 'tok-repeat',
          orderNumber: '1001',
          status: 'concluido',
          deliveredAt: new Date(h.getSimulatedTime() - 15000).toISOString(),
        },
      ],
    }),
  }));

  h.render();
  await h.settle();

  const links = findNodes(h.getView(), (n) => n.type === h.LinkComponent || n.type === 'Link');
  const repeatBtn = links.find((l) => collectText(l.props?.children).includes('Pedir novamente'));
  const menuBtn = links.find((l) => collectText(l.props?.children).includes('Voltar ao cardápio'));

  assert.ok(repeatBtn, 'Botão "Pedir novamente" deve existir');
  assert.ok(menuBtn, 'Botão "Voltar ao cardápio" deve existir');
  assert.equal(repeatBtn.props.href, '/', 'Pedir novamente leva ao cardápio inicial de forma segura');
  assert.equal(menuBtn.props.href, '/', 'Voltar ao cardápio leva ao cardápio');
});

test('11. Avaliação Backend: falha real de persistência em error, concorrência, reatribuição e validação de loja/entrega', async () => {
  let dbRatingsStore = new Map();
  let simulateDbError = false;

  let storedRevision = 1;
  let currentState = {
    orderProjectionsByStore: {
      store_bella_pizza: {
        'ord-1101': {
          id: 'ord-1101',
          orderNumber: '1101',
          trackingToken: 'token-valid-deliv',
          storeId: 'store_bella_pizza',
          status: 'concluido',
        },
        'ord-1102': {
          id: 'ord-1102',
          orderNumber: '1102',
          trackingToken: 'token-valid-pending',
          storeId: 'store_bella_pizza',
          status: 'em_entrega',
        },
        'ord-1103': {
          id: 'ord-1103',
          orderNumber: '1103',
          trackingToken: 'token-no-asg',
          storeId: 'store_bella_pizza',
          status: 'concluido',
        },
      },
      store_outra_pizzaria: {
        'ord-2001': {
          id: 'ord-2001',
          orderNumber: '2001',
          trackingToken: 'token-store-other',
          storeId: 'store_outra_pizzaria',
          status: 'concluido',
        },
      },
    },
    assignments: [
      {
        id: 'asg-1101',
        orderId: 'ord-1101',
        storeId: 'store_bella_pizza',
        driverId: 'drv-initial',
        driverName: 'Entregador Um',
        status: 'delivered',
      },
      {
        id: 'asg-1102',
        orderId: 'ord-1102',
        storeId: 'store_bella_pizza',
        driverId: 'drv-initial',
        driverName: 'Entregador Um',
        status: 'picked_up',
      },
      {
        id: 'asg-2001',
        orderId: 'ord-2001',
        storeId: 'store_outra_pizzaria',
        driverId: 'drv-other',
        driverName: 'Entregador Loja B',
        status: 'delivered',
      },
    ],
  };

  const context = {
    exports: {},
    Date,
    Number,
    NextResponse: {
      json: (data, opts = {}) => ({ status: opts.status || 200, json: async () => data, body: data }),
    },
    console: { error: () => {}, log: () => {} },
    require(id) {
      if (id === 'next/server') return { NextResponse: context.NextResponse };
      if (id === '@/lib/supabase/server') {
        return {
          supabaseAdmin: {
            from: (tableName) => ({
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => {
                    if (simulateDbError) return { data: null, error: { message: 'DB connection error', code: '08001' } };
                    const found = dbRatingsStore.get(val);
                    return { data: found ? { stars: found.stars, created_at: found.created_at, driver_name: found.driver_name } : null, error: null };
                  },
                }),
              }),
              insert: (row) => ({
                select: () => ({
                  single: async () => {
                    if (simulateDbError) return { data: null, error: { message: 'Database disk full', code: '53100' } };
                    if (dbRatingsStore.has(row.order_id)) {
                      return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
                    }
                    dbRatingsStore.set(row.order_id, row);
                    return { data: { stars: row.stars, created_at: row.created_at, driver_name: row.driver_name }, error: null };
                  },
                }),
              }),
            }),
          },
        };
      }
      if (id === '@/lib/logistics/state-store') {
        return {
          readLogisticsState: async () => ({ state: currentState, revision: storedRevision }),
          writeLogisticsState: async (newState, rev) => {
            if (rev !== storedRevision) throw { code: 'LOGISTICS_CONFLICT' };
            currentState = newState;
            storedRevision++;
            return storedRevision;
          },
        };
      }
      if (id === '@/lib/logistics/customer-tracking-policy') {
        return {
          trackingContext: (state, token) => {
            for (const [storeId, storeProjs] of Object.entries(state.orderProjectionsByStore || {})) {
              for (const order of Object.values(storeProjs || {})) {
                if (order.trackingToken === token) {
                  const assignment = (state.assignments || []).find((a) => a.orderId === order.id);
                  return { order, storeId, assignment, driver: { name: assignment?.driverName, id: assignment?.driverId } };
                }
              }
            }
            return null;
          },
        };
      }
      if (id === '@/lib/logistics/order-timeline') {
        return { timelineStoreKey: (s) => s || 'store_bella_pizza' };
      }
      throw new Error(`Unexpected import: ${id}`);
    },
  };

  vm.runInNewContext(ratingRouteSource, context);
  const { POST: handlePost, GET: handleGet } = context.exports;

  // A. Token inválido (<8 caracteres)
  const resShortToken = await handlePost({ json: async () => ({ token: 'abc', stars: 5 }) });
  assert.equal(resShortToken.status, 400);

  // B. Nota inválida (<1 ou >5)
  const resInvalidStars = await handlePost({ json: async () => ({ token: 'token-valid-deliv', stars: 0 }) });
  assert.equal(resInvalidStars.status, 400);

  // C. Pedido não entregue (em_entrega)
  const resNotDeliv = await handlePost({ json: async () => ({ token: 'token-valid-pending', stars: 5 }) });
  assert.equal(resNotDeliv.status, 400);
  assert.match(resNotDeliv.body.error, /confirmado como entregue/i);

  // D. Pedido entregue sem atribuição válida
  const resNoAsg = await handlePost({ json: async () => ({ token: 'token-no-asg', stars: 5 }) });
  assert.equal(resNoAsg.status, 400);
  assert.match(resNoAsg.body.error, /Entrega não localizada/i);

  // E. Falha real de persistência no banco: NÃO retorna falso sucesso
  simulateDbError = true;
  const resDbError = await handlePost({ json: async () => ({ token: 'token-valid-deliv', stars: 5 }) });
  assert.equal(resDbError.status, 500);
  assert.equal(resDbError.body.success, false);
  assert.doesNotMatch(resDbError.body.error, /disk full/i, 'Mensagem pública segura sem detalhes internos');
  simulateDbError = false;

  // F. Primeira avaliação válida com 5 estrelas
  const resValid = await handlePost({ json: async () => ({ token: 'token-valid-deliv', stars: 5 }) });
  assert.equal(resValid.status, 200);
  assert.equal(resValid.body.success, true);
  assert.equal(resValid.body.rating.stars, 5);
  assert.equal(resValid.body.rating.driverName, 'Entregador Um');

  // G. Duas avaliações concorrentes: a segunda falha com 23505 e preserva a primeira
  const resConcurrent = await handlePost({ json: async () => ({ token: 'token-valid-deliv', stars: 4 }) });
  assert.equal(resConcurrent.status, 409);
  assert.equal(resConcurrent.body.alreadyRated, true);
  assert.equal(resConcurrent.body.rating.stars, 5, 'Preserva a nota de 5 estrelas já confirmada');

  // H. Repetição da avaliação após reatribuição do entregador: bloqueada pela unicidade de order_id
  const asgDeliv = currentState.assignments.find((a) => a.id === 'asg-1101');
  asgDeliv.driverId = 'drv-reassigned';
  asgDeliv.driverName = 'Entregador Dois Reatribuído';

  const resReassigned = await handlePost({ json: async () => ({ token: 'token-valid-deliv', stars: 3 }) });
  assert.equal(resReassigned.status, 409);
  assert.equal(resReassigned.body.alreadyRated, true);
  assert.equal(resReassigned.body.rating.stars, 5);

  // I. Avaliação de pedido de outra loja
  const resOtherStore = await handlePost({ json: async () => ({ token: 'token-store-other', stars: 4 }) });
  assert.equal(resOtherStore.status, 200);
  assert.equal(resOtherStore.body.rating.stars, 4);
  assert.equal(resOtherStore.body.rating.driverName, 'Entregador Loja B');

  // J. Consulta GET autoritativa utiliza a mesma fonte
  const reqGet = { nextUrl: { searchParams: new URLSearchParams({ token: 'token-valid-deliv' }) } };
  const resGet = await handleGet(reqGet);
  assert.equal(resGet.status, 200);
  assert.equal(resGet.body.rated, true);
  assert.equal(resGet.body.rating.stars, 5);
});
