export interface CustomerProfile { id: string; name: string; phone: string; phoneVerified?: boolean }
export interface CustomerAddress {
  id: string; label: string; street: string; number: string; complement: string; reference: string;
  neighborhood: string; city: string; state: string; cep: string; isDefault: boolean;
}
export interface CustomerHistoryOrder { id: string; orderNumber: string | number; status: string; total: number; createdAt?: string; trackingToken?: string; itemsSummary?: string }
export const emptyCustomerAddress = (): CustomerAddress => ({ id: '', label: 'Casa', street: '', number: '', complement: '', reference: '', neighborhood: '', city: 'Canoas', state: 'RS', cep: '', isDefault: false });

export async function customerRequest<T = any>(action: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const response = await fetch(`/api/customer-account/${action}`, {
      ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const data = await response.json();
    if (!response.ok || !data?.success) throw new Error(data?.error || 'Não foi possível atualizar sua conta.');
    return data;
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}

export function formatCustomerMoney(value: number): string {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function validCustomerPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return /^\d{10,11}$/.test(digits);
}
