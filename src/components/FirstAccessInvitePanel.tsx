'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';

interface IssuedInvite {
  inviteId: string; accessCode: string; name: string; phone: string; expiresAt: string;
}
interface InviteSummary {
  id: string; name: string; phone: string; expiresAt: string; redeemedAt?: string | null;
  revokedAt?: string | null; createdAt?: string;
}

export default function FirstAccessInvitePanel({ getHeaders, onChanged }: {
  getHeaders: () => Record<string, string>; onChanged?: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadInvites = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/driver-first-access/list', { headers: getHeaders(), cache: 'no-store' });
      if (response.status === 401) {
        window.dispatchEvent(new Event('novaesweb:admin-session-expired'));
        throw new Error('Sua sessão expirou. Entre novamente com o PIN da loja.');
      }
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.invites)) setInvites(result.invites);
    } catch { /* A falha da consulta não deve apagar um código que acabou de ser emitido. */ }
  }, [getHeaders]);
  useEffect(() => { void loadInvites(); }, [loadInvites]);

  async function issue(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setIssued(null); setCopied(false);
    try {
      const response = await fetch('/api/v1/driver-first-access/issue', {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ name: name.trim(), phone }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new Event('novaesweb:admin-session-expired'));
        throw new Error('Sua sessão expirou. Entre novamente com o PIN da loja.');
      }
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Não foi possível gerar o primeiro acesso.');
      setIssued(result); await loadInvites(); onChanged?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível gerar o primeiro acesso.'); }
    finally { setBusy(false); }
  }

  async function revoke(inviteId: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/v1/driver-first-access/revoke', {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ inviteId }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new Event('novaesweb:admin-session-expired'));
        throw new Error('Sua sessão expirou. Entre novamente com o PIN da loja.');
      }
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Não foi possível revogar o código.');
      if (issued?.inviteId === inviteId) setIssued(null);
      await loadInvites();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível revogar o código.'); }
    finally { setBusy(false); }
  }

  return <section className="p-5 sm:p-6 rounded-2xl bg-zinc-900/70 border border-amber-500/30 space-y-5" aria-label="Cadastro e primeiro acesso de entregadores">
    <div className="flex gap-3 items-start"><span className="p-2.5 rounded-xl bg-amber-950/50 text-amber-300"><UserPlus className="w-5 h-5" /></span><div>
      <h3 className="font-extrabold text-base text-white">Cadastrar entregador — primeiro acesso</h3>
      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Você cadastra o nome e o WhatsApp. O entregador recebe um código para criar a própria senha e completar endereço e moto no aplicativo.</p>
    </div></div>
    <form onSubmit={issue} className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
      <div><label htmlFor="first-access-name" className="block text-xs font-bold text-zinc-300 mb-2">Nome do entregador</label>
        <input id="first-access-name" required minLength={3} maxLength={100} value={name} disabled={busy} autoComplete="off" placeholder="Nome completo"
          onChange={event => {setName(event.target.value);setIssued(null);setError('');}} className="w-full rounded-xl bg-zinc-950 border border-zinc-700 p-3 text-white text-sm" /></div>
      <div><label htmlFor="first-access-phone" className="block text-xs font-bold text-zinc-300 mb-2">WhatsApp com DDD</label>
        <input id="first-access-phone" type="tel" inputMode="tel" required maxLength={20} value={phone} disabled={busy} autoComplete="off" placeholder="(51) 99999-9999"
          onChange={event => {setPhone(event.target.value);setIssued(null);setError('');}} className="w-full rounded-xl bg-zinc-950 border border-zinc-700 p-3 text-white text-sm" /></div>
      <p className="sm:col-span-2 text-xs text-zinc-400 leading-relaxed">O código só funciona com este telefone, é de uso único e vale por até 7 dias. Gerar outro invalida o anterior para esse entregador. Quem já tem conta entra com telefone e senha e usa somente o código de vínculo/plantão da nova loja, sem novo cadastro.</p>
      <button type="submit" disabled={busy} className="sm:col-span-2 flex items-center justify-center gap-2 min-h-11 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 disabled:opacity-50 font-extrabold text-sm"><KeyRound className="w-4 h-4" />{busy ? 'Preparando...' : 'Cadastrar e gerar código de primeiro acesso'}</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {issued && <div role="status" className="rounded-xl bg-zinc-950 border border-amber-600/50 p-4 space-y-3">
      <div><p className="text-white font-bold">{issued.name}</p><p className="text-xs text-zinc-300 mt-1">Telefone cadastrado: {issued.phone}</p></div>
      <p className="font-mono font-black text-xl sm:text-2xl tracking-wide text-amber-300 break-all select-all">{issued.accessCode}</p>
      <p className="text-xs text-zinc-400">Válido até {new Date(issued.expiresAt).toLocaleString('pt-BR')}. Entregue somente ao motoboy indicado. No aplicativo, ele deve tocar em “Primeiro acesso” e informar o telefone acima e este código.</p>
      <p className="text-xs text-zinc-300">A senha é escolhida pelo próprio entregador. Você não precisa conhecê-la.</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={async () => {try {await navigator.clipboard.writeText(issued.accessCode);setCopied(true);} catch {setError('Selecione o código acima para copiar manualmente.');}}} className="flex items-center gap-2 min-h-11 rounded-lg bg-amber-500 px-3 py-2 text-sm text-zinc-950 font-bold">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copiado!' : 'Copiar código'}</button>
        <button type="button" disabled={busy} onClick={() => revoke(issued.inviteId)} className="min-h-11 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200">Revogar código</button></div>
    </div>}
    {invites.length > 0 && <details className="text-xs text-zinc-300"><summary className="cursor-pointer font-bold py-2">Códigos de primeiro acesso emitidos</summary>
      <ul className="divide-y divide-zinc-800">{invites.slice(0, 20).map(invite => {
        const expired = Date.parse(invite.expiresAt) <= Date.now();
        const status = invite.redeemedAt ? 'Cadastro concluído' : invite.revokedAt ? 'Revogado' : expired ? 'Expirado' : 'Aguardando primeiro acesso';
        return <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-bold text-zinc-100">{invite.name}</p><p>{invite.phone} • {status}</p></div>
          {!invite.redeemedAt && !invite.revokedAt && !expired && <button type="button" disabled={busy} onClick={() => revoke(invite.id)} className="min-h-10 px-3 py-2 rounded-lg border border-zinc-700">Revogar</button>}</li>;
      })}</ul>
    </details>}
  </section>;
}
