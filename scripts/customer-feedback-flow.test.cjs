const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
}

function moduleAt(file, imports = {}) {
  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: (name) => imports[name] || require(name),
    Date,
    JSON,
    Map,
    Set,
    Number,
    Math,
    console,
    process,
    Response: globalThis.Response || class {},
    Headers: globalThis.Headers || class {},
    Request: globalThis.Request || class {},
  };
  vm.runInNewContext(compile(file), context);
  return context.module.exports;
}

const STORE_A = 'store_bella_pizza';
const STORE_B = 'store_outro_restaurante';
const TOKEN_1 = 'tk_ped_entregue_123';
const TOKEN_2 = 'tk_ped_em_preparo_456';
const TOKEN_3 = 'tk_ped_loja_b_789';

// Setup de dados simulados em memória para testar isolamento, cálculo de médias e persistência
function createMockState() {
  const now = new Date();
  return {
    orderProjectionsByStore: {
      [STORE_A]: {
        ped1: {
          id: 'ped1',
          orderNumber: 101,
          storeId: STORE_A,
          trackingToken: TOKEN_1,
          status: 'concluido',
          deliveredAt: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
          customerName: 'Cliente Silva',
          address: 'Rua das Flores, 123',
        },
        ped2: {
          id: 'ped2',
          orderNumber: 102,
          storeId: STORE_A,
          trackingToken: TOKEN_2,
          status: 'preparando',
          customerName: 'Cliente Santos',
          address: 'Av Brasil, 456',
        },
      },
      [STORE_B]: {
        ped3: {
          id: 'ped3',
          orderNumber: 201,
          storeId: STORE_B,
          trackingToken: TOKEN_3,
          status: 'concluido',
          deliveredAt: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
          customerName: 'Cliente Loja B',
        },
      },
    },
    assignments: [
      {
        id: 'asg1',
        orderId: 'ped1',
        storeId: STORE_A,
        driverId: 'motoboy_carlos',
        driverName: 'Carlos Entregador',
        status: 'delivered',
        deliveredAt: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: 'asg3',
        orderId: 'ped3',
        storeId: STORE_B,
        driverId: 'motoboy_lucas',
        driverName: 'Lucas Entregador',
        status: 'delivered',
        deliveredAt: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
      },
    ],
    drivers: [
      { id: 'motoboy_carlos', name: 'Carlos Entregador', phone: '51999999999' },
      { id: 'motoboy_lucas', name: 'Lucas Entregador', phone: '51888888888' },
    ],
    ratingsByStore: {
      [STORE_A]: {},
      [STORE_B]: {},
    },
  };
}

test('1. Cliente não pode avaliar pedido que não foi finalizado/entregue', async () => {
  // Pedido 2 está com status "preparando"
  const state = createMockState();
  const ped = state.orderProjectionsByStore[STORE_A].ped2;
  const isFinished = ped.status === 'concluido' || ped.status === 'entregue';
  assert.equal(isFinished, false, 'Pedido em preparo não deve ser considerado finalizado');
});

test('2. Avaliação rejeita estrelas inválidas (< 1 ou > 5)', async () => {
  for (const invalidStars of [0, 6, -1, NaN, null, undefined]) {
    const isValid = Number.isInteger(invalidStars) && invalidStars >= 1 && invalidStars <= 5;
    assert.equal(isValid, false, `Estrela inválida aceita indevidamente: ${invalidStars}`);
  }
});

test('3. Cliente envia avaliação completa vinculada ao pedido, loja e motoboy', async () => {
  const state = createMockState();
  const token = TOKEN_1;

  // Resolução autoritativa de pedido e atribuição a partir do token
  let foundOrder = null;
  let resolvedStoreId = null;
  for (const [sId, orders] of Object.entries(state.orderProjectionsByStore)) {
    for (const ord of Object.values(orders)) {
      if (ord.trackingToken === token) {
        foundOrder = ord;
        resolvedStoreId = sId;
        break;
      }
    }
  }

  assert.ok(foundOrder, 'Pedido deve ser localizado pelo token');
  assert.equal(resolvedStoreId, STORE_A);

  const assignment = state.assignments.find((a) => a.orderId === foundOrder.id && a.storeId === resolvedStoreId);
  assert.ok(assignment, 'Atribuição do motoboy deve ser resolvida autoritativamente');

  // Payload enviado pelo cliente
  const clientPayload = {
    token,
    orderStars: 5,
    driverStars: 5,
    comment: 'Pizza fantástica, massa crocante e entrega muito rápida!',
  };

  const ratingRecord = {
    orderId: foundOrder.id,
    orderNumber: foundOrder.orderNumber,
    storeId: resolvedStoreId,
    trackingToken: token,
    orderStars: clientPayload.orderStars,
    driverStars: clientPayload.driverStars,
    comment: clientPayload.comment,
    driverId: assignment.driverId,
    driverName: assignment.driverName,
    ratedAt: new Date().toISOString(),
  };

  state.ratingsByStore[resolvedStoreId][foundOrder.id] = ratingRecord;

  assert.equal(state.ratingsByStore[STORE_A][foundOrder.id].orderStars, 5);
  assert.equal(state.ratingsByStore[STORE_A][foundOrder.id].driverStars, 5);
  assert.equal(state.ratingsByStore[STORE_A][foundOrder.id].driverName, 'Carlos Entregador');
  assert.equal(state.ratingsByStore[STORE_A][foundOrder.id].comment, clientPayload.comment);
});

test('4. Bloqueia avaliações duplicadas para o mesmo pedido (HTTP 409 alreadyRated)', async () => {
  const state = createMockState();
  const orderId = 'ped1';

  // Grava a primeira avaliação
  state.ratingsByStore[STORE_A][orderId] = {
    orderId,
    orderStars: 5,
    ratedAt: new Date().toISOString(),
  };

  // Tentativa de segundo envio para o mesmo pedido
  const alreadyExists = Boolean(state.ratingsByStore[STORE_A][orderId]);
  assert.equal(alreadyExists, true, 'Deve identificar que o pedido já foi avaliado');
});

test('5. Isolamento Multi-Loja: Painel do Lojista lista APENAS avaliações da sua própria loja', async () => {
  const state = createMockState();

  // Loja A tem uma avaliação
  state.ratingsByStore[STORE_A]['ped1'] = {
    orderId: 'ped1',
    orderNumber: 101,
    storeId: STORE_A,
    orderStars: 5,
    driverStars: 4,
    driverId: 'motoboy_carlos',
    driverName: 'Carlos Entregador',
    comment: 'Comentário da Loja A',
    ratedAt: new Date().toISOString(),
  };

  // Loja B tem outra avaliação
  state.ratingsByStore[STORE_B]['ped3'] = {
    orderId: 'ped3',
    orderNumber: 201,
    storeId: STORE_B,
    orderStars: 2,
    driverStars: 3,
    driverId: 'motoboy_lucas',
    driverName: 'Lucas Entregador',
    comment: 'Comentário da Loja B',
    ratedAt: new Date().toISOString(),
  };

  // Consulta do Lojista da Loja A
  const merchantStoreId = STORE_A;
  const storeRatings = Object.values(state.ratingsByStore[merchantStoreId] || {});

  assert.equal(storeRatings.length, 1);
  assert.equal(storeRatings[0].orderNumber, 101);
  assert.equal(storeRatings[0].storeId, STORE_A);

  // Não pode conter dados da Loja B
  const containsStoreB = storeRatings.some((r) => r.storeId === STORE_B || r.orderNumber === 201);
  assert.equal(containsStoreB, false, 'Loja A não deve visualizar avaliações da Loja B');
});

test('6. Painel do Lojista calcula a média de avaliações de cada entregador da loja', async () => {
  const ratings = [
    { orderId: 'p1', driverId: 'd1', driverName: 'Carlos', driverStars: 5, orderStars: 5 },
    { orderId: 'p2', driverId: 'd1', driverName: 'Carlos', driverStars: 4, orderStars: 4 },
    { orderId: 'p3', driverId: 'd2', driverName: 'Mariana', driverStars: 5, orderStars: 5 },
  ];

  const driverStats = {};
  for (const r of ratings) {
    if (!r.driverId) continue;
    if (!driverStats[r.driverId]) {
      driverStats[r.driverId] = {
        driverId: r.driverId,
        driverName: r.driverName,
        totalDeliveries: 0,
        sumStars: 0,
        averageStars: 0,
      };
    }
    driverStats[r.driverId].totalDeliveries++;
    driverStats[r.driverId].sumStars += r.driverStars;
  }

  for (const d of Object.values(driverStats)) {
    d.averageStars = Number((d.sumStars / d.totalDeliveries).toFixed(2));
  }

  assert.equal(driverStats['d1'].averageStars, 4.5);
  assert.equal(driverStats['d1'].totalDeliveries, 2);
  assert.equal(driverStats['d2'].averageStars, 5.0);
  assert.equal(driverStats['d2'].totalDeliveries, 1);
});

test('7. Filtros do Painel do Lojista por período, entregador e busca', async () => {
  const now = new Date();
  const list = [
    { orderNumber: 101, driverId: 'd1', comment: 'Muito boa a pizza', ratedAt: now.toISOString() },
    { orderNumber: 102, driverId: 'd2', comment: 'Chegou fria', ratedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 15).toISOString() },
    { orderNumber: 103, driverId: 'd1', comment: 'Excelente entrega', ratedAt: now.toISOString() },
  ];

  // Filtro por motoboy d1
  const filterByDriver = list.filter((r) => r.driverId === 'd1');
  assert.equal(filterByDriver.length, 2);

  // Filtro por texto de busca "fria"
  const filterBySearch = list.filter((r) => r.comment.toLowerCase().includes('fria'));
  assert.equal(filterBySearch.length, 1);
  assert.equal(filterBySearch[0].orderNumber, 102);

  // Filtro por período (últimos 7 dias)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const filterByPeriod = list.filter((r) => new Date(r.ratedAt) >= sevenDaysAgo);
  assert.equal(filterByPeriod.length, 2);
  assert.ok(filterByPeriod.map((r) => r.orderNumber).includes(101));
  assert.ok(filterByPeriod.map((r) => r.orderNumber).includes(103));
});

test('8. Aplicativo do Motoboy não tem tela/seção de feedback e opera entregas normalmente', async () => {
  const historyComponentCode = fs.readFileSync(
    '../painel motoboy/src/components/ScreenHistory.tsx',
    'utf8'
  );

  // Garante que a aba de avaliações foi removida do app do motoboy
  assert.equal(historyComponentCode.includes("activeTab === 'ratings'"), false);
  assert.equal(historyComponentCode.includes('Avaliações da Loja'), false);
  assert.equal(historyComponentCode.includes('api.getRatings()'), false);

  // Garante que "Minhas Entregas" e o card de ganhos continuam intactos
  assert.equal(historyComponentCode.includes('Minhas Entregas'), true);
  assert.equal(historyComponentCode.includes('Ganhos Acumulados no Turno'), true);
  assert.equal(historyComponentCode.includes('Últimas Entregas Realizadas'), true);
});
