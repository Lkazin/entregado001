import { NextRequest, NextResponse } from 'next/server';
import { POST as authenticateAdmin } from '../../admin/auth/route';
import { MASTER2_COOKIE, master2Configured, verifyMaster2Session } from '@/lib/auth/master2';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
function sameOrigin(req: NextRequest) { return req.headers.get('origin') === req.nextUrl.origin && req.headers.get('sec-fetch-site') !== 'cross-site'; }
export async function GET(req: NextRequest) {
 const authenticated = verifyMaster2Session(req.cookies.get(MASTER2_COOKIE)?.value);
 return NextResponse.json({authenticated},{status:authenticated?200:401,headers});
}
export async function POST(req: NextRequest) {
 if (!sameOrigin(req)) return NextResponse.json({error:'Origem não autorizada.'},{status:403,headers});
 if (!master2Configured()) return NextResponse.json({error:'Master 2 disponível somente no laboratório autorizado.'},{status:404,headers});
 try {
  const body=await req.json().catch(()=>({}));
  if(typeof body.password !== 'string' || body.password.length > 512) return NextResponse.json({error:'Acesso não autorizado.'},{status:401,headers});
  const validated=await authenticateAdmin(new NextRequest(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({pin:body.password})}));
  const result=await validated.json();
  if(!validated.ok || !verifyMaster2Session(result.token)) return NextResponse.json({error:validated.status===429?'Muitas tentativas. Aguarde 15 minutos.':'Não foi possível autorizar o acesso.'},{status:validated.ok?403:validated.status,headers});
  const response=NextResponse.json({authenticated:true},{headers});
  response.cookies.set(MASTER2_COOKIE,result.token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/api/master2',maxAge:86400});
  return response;
 } catch {return NextResponse.json({error:'Não foi possível validar o acesso.'},{status:503,headers});}
}
export async function DELETE(req: NextRequest) {
 if(!sameOrigin(req)) return NextResponse.json({error:'Origem não autorizada.'},{status:403,headers});
 const response=NextResponse.json({authenticated:false},{headers});
 response.cookies.set(MASTER2_COOKIE,'',{path:'/api/master2',maxAge:0});return response;
}
