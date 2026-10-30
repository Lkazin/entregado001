import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase de Servidor (Privilegiado)
 * Utilizado exclusivamente em Route Handlers e Server Actions.
 * NUNCA importar ou executar no navegador!
 *
 * A chave service_role vem SOMENTE de variavel de ambiente (SUPABASE_SERVICE_ROLE_KEY).
 * O cliente e criado na primeira utilizacao para nao quebrar o `next build`
 * quando as variaveis ainda nao estao disponiveis.
 */
let cachedClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Supabase nao configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variaveis de ambiente.'
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
