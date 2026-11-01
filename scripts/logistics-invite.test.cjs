const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/api/v1/logistics/[action]/route.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function fixture({ failUpload = false, unavailable = false, drivers = [] } = {}) {
  let stored = { stateVersion: 1, drivers, offers: [], assignments: [], settingsByStore: {}, tracking: {} };
  let downloads = 0;
  const storage = {
    from: () => ({
      download: async () => {
        downloads += 1;
        return unavailable
          ? { data: null, error: { message: 'simulated read outage' } }
          : { data: { text: async () => JSON.stringify(stored) }, error: null };
      },
      upload: async (_name, payload) => {
        if (failUpload) return { data: null, error: { message: 'simulated write rejection' } };
        stored = JSON.parse(payload);
        return { data: {}, error: null };
      },
    }),
  };
  const response = { json: (body, init = {}) => ({ body, status: init.status || 200 }) };
  const context = {
    exports: {}, console, Date, JSON, Math, process: { env: {} },
    require: (name) => {
      if (name === 'next/server') return { NextResponse: response };
      if (name === '@/lib/supabase/server') return { supabaseAdmin: { storage } };
      if (name === '@/lib/auth/tokens') return {
        verifyAdminRequest: () => ({ valid: true, storeId: 'store_bella_pizza' }),
        signDriverToken: () => 'test-signed-session',
      };
      if (name === 'crypto') return require('node:crypto');
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled, context, { filename });
  return {
    context,
    stored: () => stored,
    downloads: () => downloads,
    post: (action, body) => context.exports.POST({ headers: { get: () => null }, json: async () => body }, { params: Promise.resolve({ action }) }),
  };
}

test('emissão não devolve código quando o armazenamento rejeita a gravação', async () => {
  const f = fixture({ failUpload: true });
  const result = await f.post('invite-issue', { validityDays: 7 });
  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
  assert.match(result.body.error, /Não foi possível salvar os dados de logística/);
  assert.equal(result.body.inviteCode, undefined);
  assert.equal(f.stored().drivers.length, 0);
  assert.equal(vm.runInContext('liveDrivers.length', f.context), 0);
  assert.ok(f.downloads() >= 2, 'recarrega após a falha');
});

test('falha de leitura e gravação não mantém convite fantasma em memória', async () => {
  const f = fixture({ failUpload: true, unavailable: true });
  const result = await f.post('invite-issue', {});
  assert.equal(result.status, 500);
  assert.match(result.body.error, /Não foi possível salvar os dados de logística/);
  assert.equal(vm.runInContext('liveDrivers.length', f.context), 0);
  assert.equal(vm.runInContext('lastLocalLogisticsPersistAt', f.context), 0);
});

test('código emitido persiste e pode ser ativado por outra instância', async () => {
  const issuer = fixture();
  const issued = await issuer.post('invite-issue', { validityDays: 7 });
  assert.equal(issued.status, 200);
  assert.match(issued.body.inviteCode, /^NW-\d{6}$/);
  const receiver = fixture({ drivers: issuer.stored().drivers });
  const activated = await receiver.post('invite-activate', {
    inviteCode: issued.body.inviteCode, driverId: 'test-driver', driverName: 'Rodrigo Silva', phone: '11900000000',
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.sessionToken, 'test-signed-session');
  const restarted = fixture({ drivers: receiver.stored().drivers });
  await vm.runInContext('loadLogisticsState(true)', restarted.context);
  assert.equal(vm.runInContext('liveDrivers.length', restarted.context), 1);
  assert.equal(vm.runInContext('liveDrivers[0].driverName', restarted.context), 'Rodrigo Silva');
});

test('ativação não entrega sessão quando a gravação falha e restaura convite pendente', async () => {
  const f = fixture({ failUpload: true, drivers: [{ id: 'membership-test', inviteCode: 'NW-123456', status: 'aguardando_motoboy', validityDays: 7 }] });
  const result = await f.post('invite-activate', { inviteCode: 'NW-123456', driverId: 'test-driver', driverName: 'Entregador de Teste' });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /Não foi possível salvar os dados de logística/);
  assert.equal(result.body.sessionToken, undefined);
  assert.equal(vm.runInContext('liveDrivers[0].status', f.context), 'aguardando_motoboy');
});
