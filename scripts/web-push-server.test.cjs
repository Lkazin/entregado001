const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('src/lib/push/web-push-server.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadModule(env = {}) {
  let vapidDetails = null;
  const webpushMock = {
    setVapidDetails: (subject, pub, priv) => {
      vapidDetails = { subject, pub, priv };
    },
  };

  const context = {
    exports: {},
    console,
    process: {
      env: { ...env },
    },
    require: (name) => {
      if (name === 'web-push') return { ...webpushMock, default: webpushMock };
      if (name === '@/lib/supabase/server') return { supabaseAdmin: {} };
      if (name === '@/lib/logistics/state-store') return { readLogisticsState: async () => ({ state: {}, revision: 1 }), writeLogisticsState: async () => {} };
      return {};
    },
  };

  vm.runInNewContext(source, context);
  return {
    mod: context.exports,
    getVapidDetails: () => vapidDetails,
  };
}

test('1. DEFAULT_VAPID_PUBLIC_KEY é exportada e válida com 87 caracteres base64url', () => {
  const { mod } = loadModule();
  assert.ok(mod.DEFAULT_VAPID_PUBLIC_KEY);
  assert.equal(typeof mod.DEFAULT_VAPID_PUBLIC_KEY, 'string');
  assert.equal(mod.DEFAULT_VAPID_PUBLIC_KEY.length, 87);
});

test('2. getVapidPublicKey retorna DEFAULT_VAPID_PUBLIC_KEY quando variáveis de ambiente estão vazias', () => {
  const { mod } = loadModule({});
  const key = mod.getVapidPublicKey();
  assert.equal(key, mod.DEFAULT_VAPID_PUBLIC_KEY);
});

test('3. getVapidPublicKey respeita NEXT_PUBLIC_VAPID_PUBLIC_KEY quando configurada no ambiente', () => {
  const { mod } = loadModule({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'custom-override-key' });
  const key = mod.getVapidPublicKey();
  assert.equal(key, 'custom-override-key');
});

test('4. isWebPushEnabled inicializa VAPID com as chaves padrão quando env está vazio', () => {
  const { mod, getVapidDetails } = loadModule({});
  const enabled = mod.isWebPushEnabled();
  assert.equal(enabled, true);
  const details = getVapidDetails();
  assert.ok(details);
  assert.equal(details.pub, mod.DEFAULT_VAPID_PUBLIC_KEY);
  assert.equal(details.priv, mod.DEFAULT_VAPID_PRIVATE_KEY);
});

test('5. isWebPushEnabled respeita ENABLE_WEB_PUSH=false', () => {
  const { mod } = loadModule({ ENABLE_WEB_PUSH: 'false' });
  const enabled = mod.isWebPushEnabled();
  assert.equal(enabled, false);
});
