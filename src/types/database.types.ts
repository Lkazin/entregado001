export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Store {
  id: string
  name: string
  slug: string
  phone: string | null
  address: string | null
  active: boolean
  logo_asset_id: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface StoreSettings {
  store_id: string
  ordering_enabled: boolean
  pickup_enabled: boolean
  delivery_enabled: boolean
  currency: string
  business_hours_json: any
  max_orders_per_hour: number
  updated_at: string
}

export interface PizzaSize {
  id: string
  store_id: string
  name: string
  slices: number
  max_flavors: number
  base_price: number
  sort_order: number
  active: boolean
  created_at: string
}

export interface PizzaFlavor {
  id: string
  store_id: string
  name: string
  description: string | null
  active: boolean
  created_at: string
}

export interface PizzaFlavorPrice {
  id: string
  store_id: string
  flavor_id: string
  size_id: string
  price: number
  created_at: string
}

export interface PizzaCrust {
  id: string
  store_id: string
  name: string
  active: boolean
  created_at: string
}

export interface PizzaCrustPrice {
  id: string
  store_id: string
  crust_id: string
  size_id: string
  price: number
  created_at: string
}

export interface DeliveryRegion {
  id: string
  store_id: string
  name: string
  normalized_name: string
  fee: number
  min_order: number
  active: boolean
  created_at: string
}

export interface Order {
  id: string
  store_id: string
  order_number: number
  customer_id: string
  tracking_token: string
  status: 'recebido' | 'preparando' | 'pronto' | 'em_entrega' | 'concluido' | 'cancelado' | 'recusado'
  fulfillment_type: 'delivery' | 'pickup'
  address_snapshot_json: any
  subtotal: number
  delivery_fee: number
  total: number
  customer_notes?: string | null
  cancellation_reason?: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  store_id: string
  order_id: string
  product_id_nullable?: string | null
  name_snapshot: string
  qty: number
  unit_price: number
  total_price: number
  notes?: string | null
}

export interface OrderItemComponent {
  id: string
  store_id: string
  order_item_id: string
  component_type: 'flavor' | 'crust' | 'option'
  ref_id_nullable?: string | null
  label_snapshot: string
  price_snapshot: number
  quantity: number
  fraction?: number | null
}

export interface Payment {
  id: string
  store_id: string
  order_id: string
  method: 'pix_manual' | 'cash_delivery' | 'card_terminal'
  status: 'pendente' | 'aguardando_conferencia' | 'confirmado_manual' | 'recebido_entrega' | 'cancelado'
  amount: number
  change_for?: number | null
  confirmed_by_staff_id?: string | null
  confirmed_at?: string | null
  created_at: string
}

export interface PixPaymentSettings {
  store_id: string
  pix_key_type: 'cnpj' | 'cpf' | 'email' | 'telefone' | 'aleatoria'
  pix_key_value: string
  beneficiary_name: string
  beneficiary_city: string
  qr_asset_id_nullable?: string | null
  instructions?: string | null
  active: boolean
  updated_at: string
}

export interface DeliveryDriver {
  id: string
  identity_subject: string
  display_name: string
  optional_phone?: string | null
  created_at: string
}

export interface DeliveryStoreMembership {
  id: string
  driver_id: string
  store_id: string
  status: 'pendente' | 'ativo' | 'expirado' | 'bloqueado' | 'encerrado'
  valid_from: string
  expires_at: string
  blocked_at?: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryInvite {
  id: string
  membership_id: string
  token_hash: string
  code_display_hint: string
  issued_at: string
  expires_at: string
  redeemed_at?: string | null
  invalidated_at?: string | null
}

export interface DeliveryOffer {
  id: string
  store_id: string
  order_id: string
  driver_id: string
  fee_offered?: number | null
  status: 'pendente' | 'aceita' | 'recusada' | 'expirada' | 'cancelada'
  expires_at: string
  responded_at?: string | null
  created_at: string
}

export interface DeliveryAssignment {
  id: string
  store_id: string
  order_id: string
  driver_id: string
  offer_id?: string | null
  status: 'aceita' | 'aguardando_retirada' | 'retirada' | 'em_rota' | 'entregue' | 'cancelada'
  fee_offered?: number | null
  accepted_at: string
  picked_up_at?: string | null
  delivered_at?: string | null
  created_at: string
  updated_at: string
}
