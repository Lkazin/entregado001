import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nrdbporbyujwtgnpiejz.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ynzw0icpmaxAhkCJWDYDGg_nTQCPUeY';

/**
 * Cliente Supabase Público (Navegador)
 * Utilizado para consultas de leitura anônima e autenticação de funcionários.
 */
export const supabaseClient = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
