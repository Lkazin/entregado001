export interface PizzaFlavorMock {
  id: string;
  name: string;
  description: string;
  category: 'tradicional' | 'especial' | 'doce';
  prices: {
    broto: number;
    media: number;
    grande: number;
    familia: number;
  };
  image: string;
  tags: string[];
}

export interface PizzaSizeMock {
  id: string;
  key: 'broto' | 'media' | 'grande' | 'familia';
  name: string;
  slices: number;
  maxFlavors: number;
  description: string;
}

export interface PizzaCrustMock {
  id: string;
  name: string;
  prices: {
    media: number;
    grande: number;
    familia: number;
  };
}

export interface DeliveryRegionMock {
  id: string;
  name: string;
  fee: number;
  minOrder: number;
}

export const PIZZA_SIZES: PizzaSizeMock[] = [
  { id: 'size-1', key: 'broto', name: 'Broto', slices: 4, maxFlavors: 1, description: 'Individual (4 fatias, 1 sabor)' },
  { id: 'size-2', key: 'media', name: 'Média', slices: 6, maxFlavors: 2, description: 'Ideal para 2 pessoas (6 fatias, até 2 sabores)' },
  { id: 'size-3', key: 'grande', name: 'Grande', slices: 8, maxFlavors: 3, description: 'A mais pedida (8 fatias, até 3 sabores)' },
  { id: 'size-4', key: 'familia', name: 'Família', slices: 12, maxFlavors: 4, description: 'Para toda a galera (12 fatias, até 4 sabores)' },
];

export const PIZZA_CRUSTS: PizzaCrustMock[] = [
  { id: 'crust-0', name: 'Tradicional (Sem recheio)', prices: { media: 0, grande: 0, familia: 0 } },
  { id: 'crust-1', name: 'Autêntico Catupiry Original', prices: { media: 10, grande: 14, familia: 18 } },
  { id: 'crust-2', name: 'Cheddar Cremoso Especial', prices: { media: 10, grande: 14, familia: 18 } },
  { id: 'crust-3', name: 'Chocolate ao Leite Nestlé', prices: { media: 12, grande: 16, familia: 20 } },
];

export const PIZZA_FLAVORS: PizzaFlavorMock[] = [
  {
    id: 'flv-1',
    name: 'Calabresa Artesanal',
    description: 'Molho de tomate pelado italiano, calabresa fatiada crocante, rodelas de cebola roxa e orégano.',
    category: 'tradicional',
    prices: { broto: 38, media: 54, grande: 69, familia: 86 },
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&auto=format&fit=crop&q=80',
    tags: ['Mais Vendida', 'Clássica']
  },
  {
    id: 'flv-2',
    name: 'Mussarela Especial',
    description: 'Molho artesanal, farta camada de queijo mussarela de cura média, rodelas de tomate e azeitonas pretas.',
    category: 'tradicional',
    prices: { broto: 38, media: 54, grande: 69, familia: 86 },
    image: 'https://images.unsplash.com/photo-1548369937-47519962c11a?w=800&auto=format&fit=crop&q=80',
    tags: ['Tradicional']
  },
  {
    id: 'flv-3',
    name: 'Margherita di Napoli',
    description: 'Molho rústico de tomates, mussarela de búfala, rodelas de tomate fresco, queijo parmesão e folhas de manjericão.',
    category: 'tradicional',
    prices: { broto: 42, media: 58, grande: 74, familia: 92 },
    image: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=800&auto=format&fit=crop&q=80',
    tags: ['Vegetariana', 'Italiana']
  },
  {
    id: 'flv-4',
    name: 'Frango com Catupiry Original',
    description: 'Peito de frango temperado e desfiado com ervas finas, coberto com o autêntico Catupiry cremoso.',
    category: 'tradicional',
    prices: { broto: 44, media: 60, grande: 78, familia: 96 },
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&auto=format&fit=crop&q=80',
    tags: ['Favorita']
  },
  {
    id: 'flv-5',
    name: 'Portuguesa Suprema',
    description: 'Presunto artesanal cozido, ovos de granja fatiados, ervilhas frescas, cebola, mussarela e azeitonas pretas.',
    category: 'tradicional',
    prices: { broto: 44, media: 62, grande: 79, familia: 98 },
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&auto=format&fit=crop&q=80',
    tags: ['Completa']
  },
  {
    id: 'flv-6',
    name: 'Quatro Queijos Selecionados',
    description: 'Mussarela suave, provolone defumado, parmesão uruguaio ralado e o toque marcante de gorgonzola dolce.',
    category: 'especial',
    prices: { broto: 46, media: 64, grande: 82, familia: 102 },
    image: 'https://images.unsplash.com/photo-1573821663912-569905455b1c?w=800&auto=format&fit=crop&q=80',
    tags: ['Queijos Nobres']
  },
  {
    id: 'flv-7',
    name: 'Pepperoni com Cream Cheese',
    description: 'Molho de tomate, mussarela, generosa camada de pepperoni artesanal levemente picante e gotas de cream cheese.',
    category: 'especial',
    prices: { broto: 48, media: 66, grande: 86, familia: 108 },
    image: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=800&auto=format&fit=crop&q=80',
    tags: ['Picante', 'Especial']
  },
  {
    id: 'flv-8',
    name: 'Costela ao Barbecue Defumado',
    description: 'Costela desfiada cozida lentamente na cerveja preta por 8h, mussarela, barbecue defumado e cebola crispy.',
    category: 'especial',
    prices: { broto: 52, media: 72, grande: 92, familia: 115 },
    image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=800&auto=format&fit=crop&q=80',
    tags: ['Chef Especial']
  },
  {
    id: 'flv-9',
    name: 'Parma com Rúcula & Grana Padano',
    description: 'Mussarela de búfala, presunto cru tipo Parma, folhas frescas de rúcula silvestre e raspas de queijo Grana Padano.',
    category: 'especial',
    prices: { broto: 54, media: 76, grande: 96, familia: 120 },
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&auto=format&fit=crop&q=80',
    tags: ['Gourmet', 'Premium']
  },
  {
    id: 'flv-10',
    name: 'Chocolate com Morango Fresco',
    description: 'Massa fina crocante, farto creme de chocolate ao leite nobre, morangos frescos fatiados e raspas de chocolate branco.',
    category: 'doce',
    prices: { broto: 42, media: 58, grande: 76, familia: 95 },
    image: 'https://images.unsplash.com/photo-1588315029754-2dd089d39a1a?w=800&auto=format&fit=crop&q=80',
    tags: ['Sobremesa', 'Doce']
  }
];

export const DRINKS = [
  { id: 'drk-1', name: 'Coca-Cola Original 2L', price: 15.00, desc: 'Garrafa PET 2 Litros bem gelada' },
  { id: 'drk-2', name: 'Coca-Cola Zero 2L', price: 15.00, desc: 'Garrafa PET 2 Litros zero açúcar' },
  { id: 'drk-3', name: 'Guaraná Antarctica 2L', price: 14.00, desc: 'Garrafa PET 2 Litros gelada' },
  { id: 'drk-4', name: 'Cerveja Heineken Long Neck 330ml', price: 12.00, desc: 'Cerveja Puro Malte geladíssima' },
  { id: 'drk-5', name: 'Suco Natural de Laranja 500ml', price: 10.00, desc: 'Suco natural sem conservantes' }
];

export const DELIVERY_REGIONS: DeliveryRegionMock[] = [
  { id: 'reg-1', name: 'Centro', fee: 5.00, minOrder: 30.00 },
  { id: 'reg-2', name: 'Jardins / Cerqueira César', fee: 7.00, minOrder: 35.00 },
  { id: 'reg-3', name: 'Bela Vista', fee: 6.00, minOrder: 35.00 },
  { id: 'reg-4', name: 'Vila Mariana', fee: 8.50, minOrder: 40.00 },
  { id: 'reg-5', name: 'Pinheiros', fee: 9.00, minOrder: 40.00 },
  { id: 'reg-6', name: 'Perdizes', fee: 10.00, minOrder: 45.00 }
];
