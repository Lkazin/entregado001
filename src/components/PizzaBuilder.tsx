'use client';

import React, { useState, useMemo } from 'react';
import { PIZZA_SIZES, PIZZA_FLAVORS, PIZZA_CRUSTS, PizzaSizeMock, PizzaFlavorMock, PizzaCrustMock } from '@/lib/constants';
import { Check, Plus, AlertCircle, ShoppingBag, Sparkles } from 'lucide-react';

interface CartItem {
  id: string;
  type: 'pizza';
  size: PizzaSizeMock;
  flavors: PizzaFlavorMock[];
  crust: PizzaCrustMock;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface PizzaBuilderProps {
  onAddToCart: (item: CartItem) => void;
}

export default function PizzaBuilder({ onAddToCart }: PizzaBuilderProps) {
  const [selectedSize, setSelectedSize] = useState<PizzaSizeMock>(PIZZA_SIZES[2]); // Default: Grande (até 3 sabores)
  const [selectedFlavors, setSelectedFlavors] = useState<PizzaFlavorMock[]>([PIZZA_FLAVORS[0]]); // Default: Calabresa
  const [selectedCrust, setSelectedCrust] = useState<PizzaCrustMock>(PIZZA_CRUSTS[0]); // Default: Tradicional
  const [quantity, setQuantity] = useState<number>(1);
  const [flavorWarning, setFlavorWarning] = useState<string | null>(null);

  // Manipular mudança de tamanho
  const handleSizeChange = (size: PizzaSizeMock) => {
    setSelectedSize(size);
    // Se a quantidade de sabores atuais exceder o novo limite, ajusta automaticamente
    if (selectedFlavors.length > size.maxFlavors) {
      setSelectedFlavors(selectedFlavors.slice(0, size.maxFlavors));
      setFlavorWarning(`O tamanho ${size.name} permite no máximo ${size.maxFlavors} ${size.maxFlavors === 1 ? 'sabor' : 'sabores'}.`);
    } else {
      setFlavorWarning(null);
    }
  };

  // Alternar seleção de sabor
  const handleToggleFlavor = (flavor: PizzaFlavorMock) => {
    const isSelected = selectedFlavors.some(f => f.id === flavor.id);

    if (isSelected) {
      if (selectedFlavors.length === 1) {
        setFlavorWarning('A pizza precisa ter pelo menos 1 sabor.');
        return;
      }
      setSelectedFlavors(selectedFlavors.filter(f => f.id !== flavor.id));
      setFlavorWarning(null);
    } else {
      if (selectedFlavors.length >= selectedSize.maxFlavors) {
        setFlavorWarning(`Limite atingido! O tamanho ${selectedSize.name} permite até ${selectedSize.maxFlavors} sabores.`);
        return;
      }
      setSelectedFlavors([...selectedFlavors, flavor]);
      setFlavorWarning(null);
    }
  };

  // Cálculo de Preço transparente (Regra: Maior Preço entre os sabores escolhidos + Borda)
  const calculatedPrice = useMemo(() => {
    const sizeKey = selectedSize.key;
    const flavorPrices = selectedFlavors.map(f => f.prices[sizeKey]);
    const maxFlavorPrice = flavorPrices.length > 0 ? Math.max(...flavorPrices) : 0;
    
    // Preço da borda
    const crustPrice = sizeKey === 'broto' ? 0 : selectedCrust.prices[sizeKey as 'media' | 'grande' | 'familia'] || 0;

    return maxFlavorPrice + crustPrice;
  }, [selectedSize, selectedFlavors, selectedCrust]);

  const handleAdd = () => {
    const newItem: CartItem = {
      id: `pizza-${Date.now()}`,
      type: 'pizza',
      size: selectedSize,
      flavors: selectedFlavors,
      crust: selectedCrust,
      quantity,
      unitPrice: calculatedPrice,
      totalPrice: calculatedPrice * quantity,
    };
    onAddToCart(newItem);
    setFlavorWarning(null);
  };

  return (
    <section id="montar-pizza" className="py-12 bg-zinc-950 border-t border-zinc-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Cabeçalho da Seção */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/40 text-red-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Personalização Exclusiva
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Monte sua Pizza do Seu Jeito
          </h2>
          <p className="mt-2 text-zinc-400 text-sm sm:text-base">
            Escolha o tamanho, combine até 4 sabores na mesma massa e acrescente bordas artesanais recheadas.
          </p>
        </div>

        {/* Alerta de validação */}
        {flavorWarning && (
          <div className="max-w-2xl mx-auto mb-6 p-4 rounded-xl bg-amber-950/50 border border-amber-800/50 flex items-center gap-3 text-amber-300 text-sm animate-pulse">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{flavorWarning}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Coluna da Esquerda: Passos de Escolha */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* PASSO 1: TAMANHO */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Passo 1</span>
                <span className="text-xs text-zinc-400">Selecione as fatias</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-4">Escolha o Tamanho da Pizza</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {PIZZA_SIZES.map((size) => {
                  const isSelected = selectedSize.id === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => handleSizeChange(size)}
                      className={`text-left p-4 rounded-xl border transition-all duration-200 relative ${
                        isSelected
                          ? 'bg-red-950/40 border-red-600 ring-2 ring-red-600/30'
                          : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-white">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      <p className="font-bold text-white text-base">{size.name}</p>
                      <p className="text-xs text-zinc-400 mt-1">{size.slices} fatias</p>
                      <div className="mt-3 inline-block px-2 py-0.5 rounded bg-zinc-800 text-xs font-semibold text-zinc-300">
                        Até {size.maxFlavors} {size.maxFlavors === 1 ? 'sabor' : 'sabores'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PASSO 2: SABORES (ATÉ 4) */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Passo 2</span>
                <span className="text-xs font-semibold text-zinc-300 bg-zinc-800 px-2.5 py-1 rounded-full">
                  {selectedFlavors.length} de {selectedSize.maxFlavors} selecionados
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                Escolha os Sabores (Até {selectedSize.maxFlavors})
              </h3>
              <p className="text-xs text-zinc-400 mb-6">
                Regra da casa: A pizza será cobrada pelo sabor de maior valor entre os selecionados.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PIZZA_FLAVORS.map((flavor) => {
                  const isSelected = selectedFlavors.some(f => f.id === flavor.id);
                  const priceForSize = flavor.prices[selectedSize.key];

                  return (
                    <div
                      key={flavor.id}
                      onClick={() => handleToggleFlavor(flavor)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 flex gap-4 items-start ${
                        isSelected
                          ? 'bg-red-950/30 border-red-500/70 shadow-lg shadow-red-950/30'
                          : 'bg-zinc-900/30 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-800/30'
                      }`}
                    >
                      <img
                        src={flavor.image}
                        alt={flavor.name}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-zinc-800"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-white text-sm truncate">{flavor.name}</h4>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ml-2 ${
                            isSelected ? 'bg-red-600 text-white' : 'border border-zinc-700 bg-zinc-800/80'
                          }`}>
                            {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Plus className="w-3 h-3 text-zinc-400" />}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{flavor.description}</p>
                        <p className="text-xs font-bold text-red-400 mt-2">
                          R$ {priceForSize.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PASSO 3: BORDA RECHEADA */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Passo 3</span>
                <span className="text-xs text-zinc-400">Opcional</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-4">Adicione uma Borda Especial</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {PIZZA_CRUSTS.map((crust) => {
                  const isSelected = selectedCrust.id === crust.id;
                  const crustPrice = selectedSize.key === 'broto' ? 0 : crust.prices[selectedSize.key as 'media' | 'grande' | 'familia'] || 0;

                  return (
                    <button
                      key={crust.id}
                      type="button"
                      onClick={() => setSelectedCrust(crust)}
                      className={`text-left p-3.5 rounded-xl border transition-all duration-200 relative ${
                        isSelected
                          ? 'bg-red-950/40 border-red-600 ring-2 ring-red-600/30'
                          : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                    >
                      <p className="font-semibold text-white text-xs sm:text-sm">{crust.name}</p>
                      <p className="text-xs text-red-400 font-bold mt-2">
                        {crustPrice === 0 ? 'Incluso' : `+ R$ ${crustPrice.toFixed(2).replace('.', ',')}`}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Coluna da Direita: Resumo Fixo do Pedido */}
          <div className="lg:col-span-4 sticky top-24">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-lg font-extrabold text-white pb-4 border-b border-zinc-800 flex items-center justify-between">
                <span>Resumo da Pizza</span>
                <span className="text-xs font-normal text-zinc-400">Tamanho {selectedSize.name}</span>
              </h3>

              {/* Detalhes da Composição */}
              <div className="py-4 space-y-3 text-sm border-b border-zinc-800">
                <div>
                  <span className="text-zinc-400 block text-xs">Sabores selecionados ({selectedFlavors.length}):</span>
                  <ul className="mt-1 space-y-1">
                    {selectedFlavors.map((f, idx) => (
                      <li key={f.id} className="text-zinc-200 flex items-center justify-between text-xs">
                        <span>• 1/{selectedFlavors.length} {f.name}</span>
                        <span className="text-zinc-500">R$ {f.prices[selectedSize.key].toFixed(2).replace('.', ',')}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Borda:</span>
                  <span className="text-zinc-200 font-medium">{selectedCrust.name}</span>
                </div>
              </div>

              {/* Informação da Regra de Preço */}
              <div className="my-4 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-xs text-zinc-400">
                <span className="font-semibold text-zinc-300 block mb-1">Cálculo transparente:</span>
                Cobrado pelo maior sabor (R$ {Math.max(...selectedFlavors.map(f => f.prices[selectedSize.key])).toFixed(2).replace('.', ',')}) 
                {selectedSize.key !== 'broto' && selectedCrust.prices[selectedSize.key as 'media' | 'grande' | 'familia'] > 0 && (
                  <span> + Borda (R$ {selectedCrust.prices[selectedSize.key as 'media' | 'grande' | 'familia'].toFixed(2).replace('.', ',')})</span>
                )}.
              </div>

              {/* Seletor de Quantidade */}
              <div className="flex items-center justify-between my-4 pt-2">
                <span className="text-xs text-zinc-400 font-medium">Quantidade:</span>
                <div className="flex items-center gap-3 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="text-zinc-400 hover:text-white font-bold w-6 text-center text-lg leading-none"
                  >
                    -
                  </button>
                  <span className="font-bold text-white text-sm w-4 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="text-zinc-400 hover:text-white font-bold w-6 text-center text-lg leading-none"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Total e Botão */}
              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-sm font-semibold text-zinc-300">Total da Pizza:</span>
                  <span className="text-2xl font-black text-white">
                    R$ {(calculatedPrice * quantity).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all duration-150 shadow-lg shadow-red-600/30 hover:shadow-red-600/50 active:scale-[0.98]"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Adicionar ao Pedido
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
