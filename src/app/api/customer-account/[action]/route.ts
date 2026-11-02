import crypto from 'crypto';
import { NextRequest,NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/tokens';
import { timelineStoreKey } from '@/lib/logistics/order-timeline';
import { supabaseAdmin } from '@/lib/supabase/server';
import { CustomerError,CUSTOMER_COOKIE,customerAddresses,customerCookie,customerHistory,customerLogin,customerSession,customerStore,ensureSameOrigin,safeProfile,updateCustomerProfile,validateAddress,boundedText } from '@/lib/customer-accounts';
export const dynamic='force-dynamic';
type Context={params:Promise<{action:string}>};
const headers={'Cache-Control':'private, no-store, max-age=0'};
const reply=(body:any,status=200,setCookie?:string)=>NextResponse.json(body,{status,headers:{...headers,...(setCookie?{'Set-Cookie':setCookie}:{})}});
const uuid=(value:any)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function handle(req:NextRequest,ctx:Context){
 try{
  const {action}=await ctx.params;
  if(req.method!=='GET')ensureSameOrigin(req);
  if(Number(req.headers.get('content-length')||0)>16384)throw new CustomerError('Solicitação muito grande.',413);
  const body=req.method==='GET'?{}:await req.json().catch(()=>({}));
  if(action==='login'&&req.method==='POST'){
   const result=await customerLogin(req,body.phone);return reply({success:true,profile:result.profile,addresses:result.addresses},200,result.setCookie);
  }
  if(action.startsWith('admin-')){
   const admin=verifyAdminRequest(req);if(!admin.valid||!admin.storeId)throw new CustomerError('Acesso restrito ao lojista.',401);
   const store=timelineStoreKey(admin.storeId);
   if(action==='admin-list'&&req.method==='GET'){
    const page=Math.floor(Math.max(0,Math.min(10000,Number(req.nextUrl.searchParams.get('page'))||0)));
    const search=boundedText(req.nextUrl.searchParams.get('q'),80);
    let query=supabaseAdmin.from('nw_customer_profiles').select('id,name,phone,created_at,updated_at',{count:'exact'}).eq('store_id',store).is('deleted_at',null);
    if(search){
     const phoneSearch=/^[\d\s()+.-]+$/.test(search);
     const value=phoneSearch?search.replace(/\D/g,''):search;
     if(value)query=query.ilike(phoneSearch?'phone':'name',`%${value.replace(/[\\%_]/g,'\\$&')}%`);
    }
    const {data,error,count}=await query.order('created_at',{ascending:false}).range(page*50,page*50+49);
    if(error)throw new CustomerError('Não foi possível carregar os clientes.',503);
    return reply({success:true,customers:(data||[]).map(safeProfile),total:count||0,page,hasMore:(count||0)>(page+1)*50});
   }
   if(action==='admin-detail'&&req.method==='GET'){
    const customerId=req.nextUrl.searchParams.get('customerId');
    if(!uuid(customerId))throw new CustomerError('Cliente inválido.');
    const {data:customer,error}=await supabaseAdmin.from('nw_customer_profiles').select('id,store_id,name,phone,created_at').eq('id',customerId).eq('store_id',store).is('deleted_at',null).maybeSingle();
    if(error)throw new CustomerError('Não foi possível carregar o cliente.',503);
    if(!customer)throw new CustomerError('Cliente não encontrado.',404);
    return reply({success:true,profile:safeProfile(customer),addresses:await customerAddresses(customer),orders:await customerHistory(customer)});
   }
   if(!uuid(body.customerId))throw new CustomerError('Cliente inválido.');
   if(action==='admin-addresses'&&(req.method==='POST'||req.method==='DELETE')){
    const {data:customer,error}=await supabaseAdmin.from('nw_customer_profiles').select('id,store_id').eq('id',body.customerId).eq('store_id',store).is('deleted_at',null).maybeSingle();
    if(error)throw new CustomerError('Não foi possível carregar o cliente.',503);
    if(!customer)throw new CustomerError('Cliente não encontrado.',404);
    if(req.method==='DELETE'){
     if(!uuid(body.id))throw new CustomerError('Endereço inválido.');
     const {data:removed,error:removeError}=await supabaseAdmin.rpc('nw_customer_remove_address',{p_profile:customer.id,p_store:store,p_id:body.id});
     if(removeError)throw new CustomerError('Não foi possível remover o endereço.',503);
     if(!removed)throw new CustomerError('Endereço não encontrado.',404);
    }else{
     if(body.id&&!uuid(body.id))throw new CustomerError('Endereço inválido.');
     const {error:saveError}=await supabaseAdmin.rpc('nw_customer_save_address',{p_profile:customer.id,p_store:store,p_id:body.id||null,p_label:boundedText(body.label,40,true),p_data:validateAddress(body),p_default:body.isDefault===true});
     if(saveError)throw new CustomerError('Não foi possível salvar o endereço.',saveError.message?.includes('NOT_FOUND')?404:400);
    }
    return reply({success:true,addresses:await customerAddresses(customer)});
   }
   if(action==='admin-update'&&req.method==='PATCH'){
    const profile=await updateCustomerProfile(store,body.customerId,body);
    return reply({success:true,profile:safeProfile(profile)});
   }
   if(action==='admin-delete'&&req.method==='DELETE'){
    const {data,error}=await supabaseAdmin.rpc('nw_customer_delete_profile',{p_profile:body.customerId,p_store:store});
    if(error)throw new CustomerError('Não foi possível excluir o perfil.',503);
    if(!data)throw new CustomerError('Cliente não encontrado.',404);
    return reply({success:true});
   }
   throw new CustomerError('Operação não encontrada.',404);
  }
  const profile=await customerSession(req);
  if(action==='me'&&req.method==='GET')return reply({success:true,profile:safeProfile(profile),addresses:await customerAddresses(profile)});
  if(action==='history'&&req.method==='GET')return reply({success:true,orders:await customerHistory(profile)});
  if(action==='logout'&&req.method==='POST'){
   const raw=req.cookies.get(CUSTOMER_COOKIE)?.value||'';
   const {error}=await supabaseAdmin.from('nw_customer_sessions').update({revoked_at:new Date().toISOString()}).eq('token_hash',crypto.createHash('sha256').update(raw).digest('hex')).eq('store_id',customerStore());
   if(error)throw new CustomerError('Não foi possível sair. Tente novamente.',503);
   return reply({success:true},200,customerCookie('',0));
  }
  if(action==='profile'&&req.method==='PATCH'){
   const updated=await updateCustomerProfile(profile.store_id,profile.id,body);
   return reply({success:true,profile:safeProfile(updated),sessionEnded:Boolean(updated.phone_changed)},200,updated.phone_changed?customerCookie('',0):undefined);
  }
  if(action==='addresses'&&req.method==='POST'){
   if(body.id&&!uuid(body.id))throw new CustomerError('Endereço inválido.');
   const data=validateAddress(body);
   const {error}=await supabaseAdmin.rpc('nw_customer_save_address',{p_profile:profile.id,p_store:profile.store_id,p_id:body.id||null,p_label:boundedText(body.label,40,true),p_data:data,p_default:body.isDefault===true});
   if(error){const message=error.message?.includes('ADDRESS_NOT_FOUND')?'Endereço não encontrado.':error.message?.includes('ADDRESS_LIMIT')?'Você pode salvar até 10 endereços.':'Não foi possível salvar o endereço.';throw new CustomerError(message,error.message?.includes('NOT_FOUND')?404:400);}
   return reply({success:true,addresses:await customerAddresses(profile)});
  }
  if(action==='addresses'&&req.method==='DELETE'){
   if(!uuid(body.id))throw new CustomerError('Endereço inválido.');
   const {data,error}=await supabaseAdmin.rpc('nw_customer_remove_address',{p_profile:profile.id,p_store:profile.store_id,p_id:body.id});
   if(error)throw new CustomerError('Não foi possível remover o endereço.',503);
   if(!data)throw new CustomerError('Endereço não encontrado.',404);
   return reply({success:true,addresses:await customerAddresses(profile)});
  }
  throw new CustomerError('Operação não encontrada.',404);
 }catch(error){return reply({success:false,error:error instanceof CustomerError?error.message:'Não foi possível concluir a solicitação.',code:error instanceof CustomerError?error.code:'CUSTOMER_UNAVAILABLE'},error instanceof CustomerError?error.status:503);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
