const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');

function load(file, modules = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, { exports, require: id => modules[id] ?? require(id), process, Buffer, console });
  return exports;
}
const generator = load('src/lib/master2-prompts.ts');
const id = '11111111-1111-4111-8111-111111111111';
const record = { id, revision: 2, status: 'pending_diagnosis', profile: {
  name: 'Loja oficial', plan: 'business', group: '', staging: '', production: '',
}};
let resultRow = record;
const db = { from(table) {
  assert.equal(table, 'master2_received_stores');
  return { select: () => ({ eq: (_column, value) => {
    assert.equal(value, id);
    return { maybeSingle: async () => ({ data: resultRow, error: null }) };
  } }) };
}};
const route = load('src/app/api/master2/prompts/route.ts', {
  '@/lib/auth/master2': { MASTER2_COOKIE: 'test_cookie', verifyMaster2Session: async value => value === 'valid' },
  '@/lib/supabase/server': { supabaseAdmin: db },
  '@/lib/master2-prompts': generator,
});
const url = 'https://master2.test/api/master2/prompts';
function request(payload, options = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { origin: 'https://master2.test', cookie: 'test_cookie=valid', 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(payload),
  });
}

test('prompts require authenticated same-origin request and official receipt', async () => {
  assert.equal((await route.POST(request({ id }, { headers: { cookie: '' } }))).status, 401);
  assert.equal((await route.POST(request({ id }, { headers: { origin: 'https://evil.test' } }))).status, 403);
  resultRow = null;
  try { assert.equal((await route.POST(request({ id, name: 'inventada', plan: 'premium' }))).status, 403); }
  finally { resultRow = record; }
});

test('official data replaces browser-supplied name, plan and project references', async () => {
  const response = await route.POST(request({
    id, name: 'Loja falsificada', plan: 'premium', staging: 'outroprojectfake0000', production: 'outroprojectfake0000',
    findings: { 'Pedidos e checkout': 'Não verificado' },
  }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.verifiedReceipt, true);
  assert.equal(data.officialRevision, 2);
  assert.equal(data.prompts.length, 8);
  for (const item of data.prompts) {
    assert.match(item.text, /Loja oficial/);
    assert.doesNotMatch(item.text, /Loja falsificada|outroprojectfake0000/);
    assert.match(item.text, /homologa|Homologa|homologação|HOMOLOGAÇÃO/);
  }
});

test('central app is not re-pointed to a merchant and permissions are never assumed', () => {
  const prompts = generator.generateInstallationPrompts({ id, name: 'Loja oficial', plan: 'business' });
  assert.match(prompts[4].text, /UMA API central/);
  assert.match(prompts[4].text, /não redirecione|nunca redirecione/i);
  assert.match(prompts[5].text, /não consulta diretamente/);
  assert.match(prompts[5].text, /revogação/);
});
