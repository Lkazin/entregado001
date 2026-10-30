import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Proxy de armazenamento (Supabase Storage) para os arquivos compartilhados
 * entre o painel do lojista e o app do motoboy.
 *
 * Existe para que NENHUM navegador precise conhecer a chave service_role:
 * a gravacao e feita aqui, no servidor.
 */
const BUCKET = 'novaesweb_store';
const ALLOWED_FILES = new Set(['logistics.json', 'orders.json']);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!ALLOWED_FILES.has(file)) {
    return json({ success: false, error: 'Arquivo nao permitido' }, 404);
  }

  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(file);
    if (error || !data) {
      return json({ success: false, error: 'Arquivo nao encontrado' }, 404);
    }
    const text = await data.text();
    return new NextResponse(text, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return json({ success: false, error: err.message }, 500);
  }
}

async function write(
  req: NextRequest,
  params: Promise<{ file: string }>
) {
  const { file } = await params;
  if (!ALLOWED_FILES.has(file)) {
    return json({ success: false, error: 'Arquivo nao permitido' }, 404);
  }

  try {
    const text = await req.text();

    // Valida o formato antes de gravar para nunca corromper o arquivo compartilhado
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ success: false, error: 'JSON invalido' }, 422);
    }
    const valid =
      file === 'orders.json'
        ? Array.isArray(parsed)
        : parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    if (!valid) {
      return json({ success: false, error: 'Formato invalido para ' + file }, 422);
    }

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(file, text, { upsert: true, contentType: 'application/json' });
    if (error) {
      return json({ success: false, error: error.message }, 500);
    }
    return json({ success: true });
  } catch (err: any) {
    return json({ success: false, error: err.message }, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  return write(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  return write(req, params);
}
