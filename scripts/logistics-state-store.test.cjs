const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { digest } = require('./migrate-logistics-state.cjs');

function fixture(initial = { revision: 1, state: { drivers: [], offers: [], assignments: [] } }) {
  let row = initial ? structuredClone(initial) : null;
  let fail = false;
  let activeSessionHash = 'current-hash';
  const db = {
    rpc: async (name, args) => {
      assert.equal(name,'driver_logistics_commit');
      if (fail) return {data:null,error:{message:'simulated outage'}};
      if (args.p_account_id && args.p_session_hash !== activeSessionHash) return {data:null,error:{message:'ACCOUNT_SESSION_REPLACED'}};
      if (!row || row.revision !== args.p_revision) return {data:null,error:{message:'LOGISTICS_CONFLICT'}};
      row = {...row,state:structuredClone(args.p_state),revision:row.revision+1};
      return {data:row.revision,error:null};
    },
    from: () => {
    const filters = []; let mutation;
    const query = {
      select: () => query, eq: (key, value) => { filters.push([key, value]); return query; },
      update: value => { mutation = value; return query; },
      maybeSingle: async () => {
        if (fail) return { error: {message:'simulated outage'}, data:null };
        const matches = row && filters.every(([key,value]) => key === 'id' ? value === 'primary' : row[key] === value);
        if (!matches) return { data:null,error:null };
        if (mutation) row = { ...row, ...structuredClone(mutation) };
        return { data: structuredClone(row), error:null };
      },
    }; return query;
  }};
  const filename = path.join(__dirname, '../src/lib/logistics/state-store.ts');
  const source = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020} }).outputText;
  const context = { exports:{}, Date, Number, require:name => name === '@/lib/supabase/server' ? {supabaseAdmin:db} : name === './tracking-realtime' ? { publishTrackingInvalidation: async () => {} } : require(name) };
  vm.runInNewContext(source,context,{filename});
  return { api:context.exports, current:()=>row, outage:value=>{fail=value;}, replaceSession:value=>{activeSessionHash=value;} };
}

test('leitura exige estado protegido existente e mantém todos os campos', async () => {
  const state = {drivers:[{id:'test'}],offers:[],assignments:[],tracking:{},settingsByStore:{},customField:{preserved:true}};
  const f = fixture({state,revision:3}); const read = await f.api.readLogisticsState();
  assert.equal(read.revision,3); assert.deepEqual(read.state,state);
  await assert.rejects(fixture(null).api.readLogisticsState(),e=>e.status===503);
});

test('CAS impede overwrite concorrente e incrementa revisão somente no sucesso', async () => {
  const f = fixture(); const original = await f.api.readLogisticsState();
  assert.equal(await f.api.writeLogisticsState({...original.state,test:'first'},original.revision),2);
  await assert.rejects(f.api.writeLogisticsState({...original.state,test:'second'},original.revision),e=>e.status===409&&e.code==='LOGISTICS_CONFLICT');
  assert.equal(f.current().state.test,'first'); assert.equal(f.current().revision,2);
});

test('indisponibilidade falha sem fallback ou mutação e hash não depende de ordem de chaves', async () => {
  const f = fixture(); f.outage(true);
  await assert.rejects(f.api.readLogisticsState(),e=>e.status===503);
  await assert.rejects(f.api.writeLogisticsState({test:true},1),e=>e.status===503);
  assert.equal(f.current().revision,1);
  assert.equal(digest({a:1,b:{x:2,y:3}}),digest({b:{y:3,x:2},a:1}));
});

test('commit valida sessão junto da gravação e recusa requisição antiga após novo login', async () => {
  const f = fixture();
  assert.equal(await f.api.writeLogisticsState({test:'current'},1,{accountId:'test-account',sessionHash:'current-hash'}),2);
  f.replaceSession('new-device-hash');
  await assert.rejects(f.api.writeLogisticsState({test:'stale'},2,{accountId:'test-account',sessionHash:'current-hash'}),e=>e.status===401&&e.code==='ACCOUNT_SESSION_REPLACED');
  assert.equal(f.current().state.test,'current');
  assert.equal(f.current().revision,2);
});
