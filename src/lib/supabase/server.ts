import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ngrkqutqmlhdenrxyaos.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key_for_build';

/**
 * Cliente Supabase de Servidor (Privilegiado)
 * Utilizado exclusivamente em Route Handlers e Server Actions.
 * NUNCA importar ou executar no navegador!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
