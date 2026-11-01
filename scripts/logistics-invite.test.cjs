const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const {fixture,driver,STORE_A} = require('./logistics-account.test.cjs');

test('emissão não devolve código quando banco rejeita gravação', async () => {
  const f=fixture({failUpload:true,defaultActor:'admin'});
  const result=await f.post('invite-issue',{validityDays:7});
  assert.equal(result.status,503);assert.equal(result.body.success,false);assert.equal(result.body.inviteCode,undefined);
  assert.equal(f.stored().drivers.length,0);assert.equal(vm.runInContext('liveDrivers.length',f.context),0);assert.ok(f.downloads()>=2,'recarrega após falha');
  assert.equal(f.backing.storageWrites,0,'nenhuma gravação logística pública');
});

test('falha de leitura impede emissão e não cria convite fantasma em memória', async () => {
  const f=fixture({failUpload:true,unavailable:true,defaultActor:'admin'});
  const result=await f.post('invite-issue',{});
  assert.equal(result.status,503);assert.equal(result.body.inviteCode,undefined);
  assert.equal(vm.runInContext('liveDrivers.length',f.context),0);assert.equal(vm.runInContext('lastLocalLogisticsPersistAt',f.context),0);assert.equal(f.backing.attempts,0);
});

test('código privado emitido persiste e pode ser ativado e recuperado por outra instância', async () => {
  const issuer=fixture({defaultActor:'admin'});const issued=await issuer.post('invite-issue',{validityDays:7});
  assert.equal(issued.status,200);assert.match(issued.body.inviteCode,/^NW-\d{6}$/);assert.equal(issuer.stored().drivers[0].accountInviteVersion,1);
  const receiver=issuer.restart();const activated=await receiver.post('invite-activate',{inviteCode:issued.body.inviteCode});
  assert.equal(activated.status,200);assert.match(activated.body.sessionToken,/^drv_v1\./);
  const restarted=receiver.restart();const bootstrap=await restarted.get('account-bootstrap');
  assert.equal(bootstrap.status,200);assert.equal(bootstrap.body.session.driverName,'Rodrigo Silva');assert.equal(bootstrap.body.session.membershipId,activated.body.membershipId);
  assert.equal(restarted.stored().drivers.length,1);assert.equal(restarted.backing.storageWrites,0);
});

test('ativação não entrega sessão quando commit falha e restaura convite pendente', async () => {
  const f=fixture({failUpload:true,drivers:[driver('membership-test','driver-test',STORE_A,{inviteCode:'NW-123456',status:'aguardando_motoboy',accountInviteVersion:1})]});
  const result=await f.post('invite-activate',{inviteCode:'NW-123456'});
  assert.equal(result.status,503);assert.equal(result.body.sessionToken,undefined);
  assert.equal(vm.runInContext('liveDrivers[0].status',f.context),'aguardando_motoboy');assert.equal(f.backing.writes,0);
});
