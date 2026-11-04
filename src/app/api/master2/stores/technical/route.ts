import { NextRequest, NextResponse } from 'next/server';
import { MASTER2_COOKIE, verifyMaster2Session } from '@/lib/auth/master2';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ref = /^(?:[a-z0-9]{20})?$/;
const repo = /^(?:https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?)?$/;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function session(req: NextRequest) { return verifyMaster2Session(req.cookies.get(MASTER2_COOKIE)?.value); }
async function official(id: string) {
  return supabaseAdmin.from('master2_received_stores').select('id,status,profile').eq('id', id).maybeSingle();
}
export async function GET(req: NextRequest) {
  if (!await session(req)) return reply({error:'Sessão inválida.'},401);
  const id = req.nextUrl.searchParams.get('storeId') || '';
  if (!uuid.test(id)) return reply({error:'UUID oficial inválido.'},400);
  const found = await official(id.toLowerCase());
  if (found.error) return reply({error:'Falha ao verificar loja oficial.'},503);
  if (!found.data) return reply({error:'Loja não recebida oficialmente.'},404);
  const {data,error} = await supabaseAdmin.from('master2_store_technical_profiles')
    .select('repository_url,staging_project_ref,production_project_ref,updated_at').eq('store_id',id.toLowerCase()).maybeSingle();
  if(error) return reply({error:'Cadastro técnico indisponível. Confira a migration.'},503);
  return reply({success:true,storeId:id.toLowerCase(),profile:data || {repository_url:'',staging_project_ref:'',production_project_ref:'',updated_at:null}});
}
export async function PUT(req: NextRequest) {
  if (!await session(req)) return reply({error:'Sessão inválida.'},401);
  if(req.headers.get('origin') !== req.nextUrl.origin || req.headers.get('sec-fetch-site') === 'cross-site') return reply({error:'Origem não autorizada.'},403);
  let body: Record<string,unknown>;
  try { const raw=await req.text(); if(raw.length>1500) return reply({error:'Dados muito longos.'},413); body=JSON.parse(raw); }
  catch {return reply({error:'JSON inválido.'},400);}
  if(!body || typeof body!=='object' || Array.isArray(body)) return reply({error:'Dados inválidos.'},400);
  const id=body.storeId;
  if(typeof id!=='string'||!uuid.test(id))return reply({error:'UUID oficial inválido.'},400);
  const fields=['repositoryUrl','stagingProjectRef','productionProjectRef'] as const;
  if(fields.some(k=>typeof body[k]!=='string'))return reply({error:'Campos técnicos inválidos.'},400);
  const repository=String(body.repositoryUrl).trim();
  const staging=String(body.stagingProjectRef).trim();
  const production=String(body.productionProjectRef).trim();
  if(!repo.test(repository)||repository.length>200||!ref.test(staging)||!ref.test(production)||(staging&&production&&staging===production))return reply({error:'Repositório ou projetos Supabase inválidos. Homologação e produção devem ser distintos.'},400);
  const found=await official(id.toLowerCase());
  if(found.error)return reply({error:'Falha ao verificar loja oficial.'},503);
  if(!found.data)return reply({error:'Loja não recebida do Master 1.'},403);
  if(found.data.status==='suspended'||found.data.profile?.kitAuthorized===false) return reply({error:'Kit suspenso. Cadastro bloqueado.'},403);
  const {error}=await supabaseAdmin.from('master2_store_technical_profiles').upsert({
    store_id:id.toLowerCase(),repository_url:repository,staging_project_ref:staging,production_project_ref:production,updated_at:new Date().toISOString()
  },{onConflict:'store_id'});
  if(error)return reply({error:'Não foi possível salvar. Verifique a migration e as permissões.'},503);
  return reply({success:true,storeId:id.toLowerCase()});
}
