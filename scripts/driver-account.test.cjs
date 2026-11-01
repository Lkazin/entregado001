const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/lib/auth/driver-account.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function fixture() {
  const accounts = [];
  const events = [];
  const limits = new Map();
  let fail = false;
  const db = {
    rpc: async (_name, {p_key, p_limit}) => {
      if (fail) return {error: {message: 'test outage'}};
      limits.set(p_key, (limits.get(p_key) || 0) + 1);
      return {data: limits.get(p_key) <= p_limit, error: null};
    },
    from: (table) => {
      const filters = [];
      let action = 'select', values;
      const query = {
        select: () => query,
        eq: (key, value) => {filters.push([key,value]); return query;},
        insert: value => { action = 'insert'; values = value; return query; },
        update: value => { action = 'update'; values = value; return query; },
        maybeSingle: () => run(true), single: () => run(true),
        then: (resolve, reject) => run(false).then(resolve, reject),
      };
      async function run(single) {
        if (fail) return {data:null, error:{message:'test outage'}};
        if (table === 'driver_auth_events') {events.push(values); return {data:null,error:null};}
        if (action === 'insert') {
          if (accounts.some(a => a.phone === values.phone)) return {data:null,error:{code:'23505'}};
          const row = {id:crypto.randomUUID(),created_at:new Date().toISOString(),...values};
          accounts.push(row);
          return {data: single ? {...row} : [{...row}], error:null};
        }
        const rows = accounts.filter(a => filters.every(([k,v]) => a[k] === v));
        if (action === 'update') rows.forEach(a => Object.assign(a, values));
        return {data:single ? (rows[0] ? {...rows[0]} : null) : rows.map(a=>({...a})),error:null};
      }
      return query;
    },
  };
  const context = {exports:{}, Buffer, Date, console, require:name => name === '@/lib/supabase/server' ? {supabaseAdmin:db} : require(name)};
  vm.createContext(context); vm.runInContext(compiled,context,{filename});
  return {api:context.exports,accounts,events,limits,outage:value=>{fail=value;}};
}

const profile = {name:'Entregador de teste',phone:'11999990001',vehiclePlate:'ABC1D23',vehicleModel:'Moto',password:'test-password-123'};
const request = token => ({headers:{get:name=>name === 'x-account-session' ? token : name === 'x-vercel-forwarded-for' ? '192.0.2.1' : null}});

test('cadastro central usa identidade estável e hash; telefone duplicado não cria outra conta', async () => {
  const f = fixture(); const session = await f.api.registerDriverAccount(profile);
  assert.equal(f.accounts.length,1);
  assert.equal(session.account.phone,'+5511999990001');
  assert.notEqual(f.accounts[0].password_hash, profile.password);
  assert.match(f.accounts[0].password_hash,/^scrypt\$/);
  assert.notEqual(f.accounts[0].active_session_hash,session.accountToken);
  assert.equal((await f.api.requireAccountSession(request(session.accountToken))).id,session.account.id);
  await assert.rejects(f.api.registerDriverAccount({...profile,phone:'+55 (11) 99999-0001'}),e=>e.status===409);
});

test('senha errada não entra nem revoga a sessão corrente', async () => {
  const f = fixture(); const a = await f.api.registerDriverAccount(profile);
  await assert.rejects(f.api.loginDriverAccount({identifier:profile.phone,password:'wrong-pass'}),e=>e.status===401);
  assert.equal((await f.api.requireAccountSession(request(a.accountToken))).id,a.account.id);
  assert.equal(f.events.at(-1).event,'login_failed');
});

test('último login revoga aparelho anterior e logout atrasado não revoga novo aparelho', async () => {
  const f = fixture(); const a = await f.api.registerDriverAccount(profile);
  const b = await f.api.loginDriverAccount({identifier:profile.phone,password:profile.password});
  assert.equal(a.account.id,b.account.id);
  await assert.rejects(f.api.requireAccountSession(request(a.accountToken)),e=>e.status===401&&e.code==='ACCOUNT_SESSION_REPLACED');
  await f.api.logoutDriverAccount(request(a.accountToken));
  assert.equal((await f.api.requireAccountSession(request(b.accountToken))).id,b.account.id);
  await f.api.logoutDriverAccount(request(b.accountToken));
  await assert.rejects(f.api.requireAccountSession(request(b.accountToken)),e=>e.status===401);
});

test('dois logins concorrentes deixam somente um token autorizado', async () => {
  const f = fixture(); await f.api.registerDriverAccount(profile);
  const sessions = await Promise.all([1,2].map(()=>f.api.loginDriverAccount({identifier:profile.phone,password:profile.password})));
  const checks = await Promise.allSettled(sessions.map(s=>f.api.requireAccountSession(request(s.accountToken))));
  assert.equal(checks.filter(c=>c.status==='fulfilled').length,1);
});

test('contas isoladas, expiração e indisponibilidade não autorizam sessão', async () => {
  const f = fixture(); const a = await f.api.registerDriverAccount(profile);
  const b = await f.api.registerDriverAccount({...profile,phone:'21999990002'});
  assert.notEqual(a.account.id,b.account.id);
  assert.equal((await f.api.requireAccountSession(request(a.accountToken))).id,a.account.id);
  assert.equal((await f.api.requireAccountSession(request(b.accountToken))).id,b.account.id);
  f.outage(true);
  await assert.rejects(f.api.requireAccountSession(request(a.accountToken)),e=>e.status===503&&e.code==='ACCOUNT_UNAVAILABLE');
  f.outage(false);
  assert.equal((await f.api.requireAccountSession(request(a.accountToken))).id,a.account.id);
  f.accounts[0].session_expires_at = new Date(Date.now()-1000).toISOString();
  await assert.rejects(f.api.requireAccountSession(request(a.accountToken)),e=>e.status===401);
});

test('limite persistente bloqueia sexta tentativa por identidade e não armazena telefone/IP', async () => {
  const f = fixture();
  for(let i=0;i<5;i++) await f.api.checkAccountRateLimit(request(''),profile.phone);
  await assert.rejects(f.api.checkAccountRateLimit(request(''),profile.phone),e=>e.status===429);
  for(const key of f.limits.keys()) assert.match(key,/^[a-f0-9]{64}$/);
  assert.equal(f.events.at(-1).event,'rate_limited');
});
