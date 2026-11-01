import { createClient, SupabaseClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error(
    '[Segurança] src/lib/supabase/server.ts não pode ser importado no navegador (client bundle).'
  );
}

let cachedAdminClient: SupabaseClient | null = null;

function getSupabaseAdminClient(): SupabaseClient {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Configuração ausente no servidor: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente privadas do servidor.'
    );
  }

  cachedAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdminClient;
}

/**
 * Cliente Supabase de Servidor (Privilegiado)
 * Utilizado exclusivamente em Route Handlers e Server Actions.
 * A chave SUPABASE_SERVICE_ROLE_KEY vem exclusivamente do ambiente privado do servidor.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdminClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
