import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { timelineStoreKey, projectStoreOrders } from '@/lib/logistics/order-timeline';
import { readLogisticsState } from '@/lib/logistics/state-store';

export const CUSTOMER_COOKIE = 'nw_customer_session';
const PROFILE_COLUMNS = 'id,store_id,name,phone,created_at,updated_at,deleted_at';
export class CustomerError extends Error {
 constructor(message: string, public status=400, public code='CUSTOMER_INVALID') { super(message); }
}
const unavailable = () => new CustomerError('Não foi possível acessar sua conta. Tente novamente.',503,'CUSTOMER_UNAVAILABLE');
export function customerStore() { return timelineStoreKey(process.env.NEXT_PUBLIC_STORE_ID || process.env.NEXT_PUBLIC_DEFAULT_STORE_ID); }
export function normalizeCustomerPhone(value: unknown) {
 let digits=typeof value==='string'?value.replace(/\D/g,''):'';
 if(digits.length===10||digits.length===11) digits='55'+digits;
 if(!/^55[1-9][0-9]{9,10}$/.test(digits)) throw new CustomerError('Informe um WhatsApp válido com DDD.');
 return digits;
}
export function boundedText(value: unknown,max: number,required=false) {
 const text=typeof value==='string'?value.trim():'';
 if(text.length>max || (required&&!text)) throw new CustomerError('Confira os campos informados.');
 return text;
}
export function safeProfile(profile:any) {
 return {id:profile.id,name:profile.name,phone:profile.phone,phoneVerified:false,createdAt:profile.created_at};
}
export function customerCookie(token:string,maxAge=30*86400) {
 return `${CUSTOMER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
export function ensureSameOrigin(req:NextRequest) {
 const origin=req.headers.get('origin');
 if(origin && origin!==req.nextUrl.origin) throw new CustomerError('Origem não autorizada.',403,'CUSTOMER_ORIGIN');
 if(req.headers.get('sec-fetch-site')==='cross-site') throw new CustomerError('Origem não autorizada.',403,'CUSTOMER_ORIGIN');
}
export async function customerRateLimit(req:NextRequest,identifier:string) {
 const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
 for(const [key,limit] of [[`customer-ip:${customerStore()}:${ip}`,30],[`customer-phone:${customerStore()}:${identifier}`,10]] as const){
  const {data,error}=await supabaseAdmin.rpc('driver_auth_consume_limit',{p_key:crypto.createHash('sha256').update(key).digest('hex'),p_limit:limit,p_window_seconds:900});
  if(error)throw unavailable();
  if(data!==true)throw new CustomerError('Muitas tentativas. Aguarde alguns minutos.',429,'CUSTOMER_RATE_LIMITED');
 }
}
export async function customerSession(req:NextRequest) {
 const raw=req.cookies.get(CUSTOMER_COOKIE)?.value;
 if(!raw||!/^cs_[a-f0-9]{64}$/.test(raw)) throw new CustomerError('Entre com seu WhatsApp para continuar.',401,'CUSTOMER_LOGIN_REQUIRED');
 const store=customerStore();
 const {data:session,error}=await supabaseAdmin.from('nw_customer_sessions').select('profile_id,expires_at,revoked_at').eq('token_hash',crypto.createHash('sha256').update(raw).digest('hex')).eq('store_id',store).maybeSingle();
 if(error)throw unavailable();
 if(!session||session.revoked_at||Date.parse(session.expires_at)<=Date.now())throw new CustomerError('Sua sessão terminou. Entre novamente.',401,'CUSTOMER_LOGIN_REQUIRED');
 const {data:profile,error:profileError}=await supabaseAdmin.from('nw_customer_profiles').select(PROFILE_COLUMNS).eq('id',session.profile_id).eq('store_id',store).is('deleted_at',null).maybeSingle();
 if(profileError)throw unavailable();
 if(!profile)throw new CustomerError('Perfil indisponível.',401,'CUSTOMER_LOGIN_REQUIRED');
 return profile;
}
export async function createCustomerSession(profile:any) {
 const token='cs_'+crypto.randomBytes(32).toString('hex');
 const {error}=await supabaseAdmin.from('nw_customer_sessions').insert({token_hash:crypto.createHash('sha256').update(token).digest('hex'),profile_id:profile.id,store_id:profile.store_id,expires_at:new Date(Date.now()+30*86400000).toISOString()});
 if(error)throw unavailable();
 return customerCookie(token);
}
export async function customerAddresses(profile:any) {
 const {data,error}=await supabaseAdmin.from('nw_customer_addresses').select('id,label,data,is_default').eq('profile_id',profile.id).eq('store_id',profile.store_id).order('is_default',{ascending:false}).order('updated_at',{ascending:false});
 if(error)throw unavailable();
 return (data||[]).map(row=>({...row.data,id:row.id,label:row.label,isDefault:row.is_default}));
}
export async function customerLogin(req:NextRequest,phoneInput:unknown) {
 ensureSameOrigin(req);
 const phone=normalizeCustomerPhone(phoneInput);await customerRateLimit(req,phone);
 const {data:profile,error}=await supabaseAdmin.from('nw_customer_profiles').select(PROFILE_COLUMNS).eq('store_id',customerStore()).eq('phone',phone).is('deleted_at',null).maybeSingle();
 if(error)throw unavailable();
 if(!profile)throw new CustomerError('Faça seu primeiro pedido para criar o perfil automaticamente.',404,'CUSTOMER_NOT_FOUND');
 return {profile:safeProfile(profile),addresses:await customerAddresses(profile),setCookie:await createCustomerSession(profile)};
}
/** Requested phone-only mode: recognition is NOT verified ownership. Never claim otherwise. */
export async function ensureCustomerForOrder(req:NextRequest,order:any):Promise<{customerId?:string;setCookie?:string}> {
 const store=customerStore();
 if(!order?.id||!order.trackingToken||timelineStoreKey(order.storeId)!==store) return {};
 const phone=normalizeCustomerPhone(order.phone||order.customer?.phone);
 const name=boundedText(order.customerName||order.customer?.name,120,true);
 const lookup=()=>supabaseAdmin.from('nw_customer_profiles').select(PROFILE_COLUMNS).eq('store_id',store).eq('phone',phone).is('deleted_at',null).maybeSingle();
 let {data:profile,error}=await lookup();if(error)throw unavailable();
 if(!profile){
  const inserted=await supabaseAdmin.from('nw_customer_profiles').insert({store_id:store,phone,name}).select(PROFILE_COLUMNS).single();
  if(inserted.error?.code==='23505'){const retry=await lookup();profile=retry.data;error=retry.error;}
  else {profile=inserted.data;error=inserted.error;}
  if(error||!profile)throw unavailable();
 }
 const snapshot={id:String(order.id),orderNumber:order.orderNumber,status:order.status,total:order.total,createdAt:order.createdAtISO||new Date().toISOString(),itemsSummary:order.itemsSummary||'',trackingToken:order.trackingToken};
 const relation=await supabaseAdmin.from('nw_customer_orders').upsert({store_id:store,order_id:String(order.id),profile_id:profile.id,tracking_token:order.trackingToken,snapshot},{onConflict:'store_id,order_id',ignoreDuplicates:true});
 if(relation.error)throw unavailable();
 let existing:any=null;try{existing=await customerSession(req);}catch(error){if(!(error instanceof CustomerError)||error.status!==401)throw error;}
 return {customerId:profile.id,...(existing?.id===profile.id?{}:{setCookie:await createCustomerSession(profile)})};
}
export async function customerHistory(profile:any) {
 const {data:links,error}=await supabaseAdmin.from('nw_customer_orders').select('order_id,tracking_token,snapshot,created_at').eq('profile_id',profile.id).eq('store_id',profile.store_id).order('created_at',{ascending:false}).limit(50);
 if(error)throw unavailable();
 if(!links?.length)return [];
 const {state}=await readLogisticsState();
 // Stored snapshots contain only this profile's confirmed orders; projections update status.
 const projected=projectStoreOrders(links.map(link=>({...link.snapshot,id:link.order_id,storeId:profile.store_id})),state,profile.store_id);
 const map=new Map(projected.map((o:any)=>[String(o.id),o]));
 return links.filter(link=>map.has(link.order_id)).map(link=>{const o:any=map.get(link.order_id);return {id:link.order_id,orderNumber:o.orderNumber,status:o.status,total:o.total,createdAt:o.createdAtISO||link.snapshot.createdAt||link.created_at,trackingToken:link.tracking_token,itemsSummary:o.itemsSummary||link.snapshot.itemsSummary||''};});
}
export function validateAddress(body:any) {
 const data={street:boundedText(body.street,180,true),number:boundedText(body.number,20,true),complement:boundedText(body.complement,120),reference:boundedText(body.reference,180),neighborhood:boundedText(body.neighborhood,100,true),city:boundedText(body.city,100,true),state:boundedText(body.state,2,true).toUpperCase(),cep:boundedText(body.cep,10).replace(/\D/g,'')};
 if(!/^[A-Z]{2}$/.test(data.state)||(data.cep&&!/^\d{8}$/.test(data.cep)))throw new CustomerError('Confira o CEP e o estado.');
 return data;
}
export async function updateCustomerProfile(store:string,id:string,body:any) {
 const name=body.name!==undefined?boundedText(body.name,120,true):null;
 const phone=body.phone!==undefined?normalizeCustomerPhone(body.phone):null;
 const {data,error}=await supabaseAdmin.rpc('nw_customer_update_profile',{p_profile:id,p_store:store,p_name:name,p_phone:phone});
 if(error?.code==='23505')throw new CustomerError('Este WhatsApp já está associado a outro perfil.',409,'CUSTOMER_PHONE_EXISTS');
 if(error)throw unavailable();
 if(!data)throw new CustomerError('Perfil não encontrado.',404,'CUSTOMER_NOT_FOUND');
 return data;
}
