'use client';

import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, CheckCircle2, RefreshCw, AlertCircle, Bike, HeartHandshake } from 'lucide-react';

interface CustomerOrderRatingProps {
  token: string;
  orderNumber: string | number;
  driverName?: string | null;
  isDelivered: boolean;
  initialRating?: {
    orderStars?: number;
    stars?: number;
    driverStars?: number | null;
    comment?: string | null;
    driverName?: string | null;
  } | null;
  onRatingSubmitted?: (rating: any) => void;
}

export default function CustomerOrderRating({
  token,
  orderNumber,
  driverName,
  isDelivered,
  initialRating,
  onRatingSubmitted
}: CustomerOrderRatingProps) {
  const [rated, setRated] = useState<boolean>(Boolean(initialRating?.orderStars || initialRating?.stars));
  const [orderStars, setOrderStars] = useState<number>(initialRating?.orderStars || initialRating?.stars || 0);
  const [hoverOrderStars, setHoverOrderStars] = useState<number>(0);
  const [driverStars, setDriverStars] = useState<number>(initialRating?.driverStars || 0);
  const [hoverDriverStars, setHoverDriverStars] = useState<number>(0);
  const [comment, setComment] = useState<string>(initialRating?.comment || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(true);

  // Sincroniza se o pedido já vier avaliado do backend
  useEffect(() => {
    if (initialRating?.orderStars || initialRating?.stars) {
      setRated(true);
      setOrderStars(initialRating.orderStars || initialRating.stars || 0);
      if (initialRating.driverStars) {
        setDriverStars(initialRating.driverStars);
      }
      if (initialRating.comment) {
        setComment(initialRating.comment);
      }
    }
  }, [initialRating]);

  // Se o pedido não estiver finalizado/entregue, não disponibiliza o formulário
  if (!isDelivered) {
    return null;
  }

  const effectiveDriverName = driverName || initialRating?.driverName || null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || submitting || rated) return;

    if (orderStars < 1 || orderStars > 5) {
      setErrorMsg('Por favor, selecione uma nota de 1 a 5 estrelas para o pedido.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setFeedbackMsg(null);

    try {
      const payload: {
        token: string;
        orderStars: number;
        driverStars?: number | null;
        comment?: string;
      } = {
        token,
        orderStars,
        comment: comment.trim() || undefined
      };

      if (effectiveDriverName && driverStars >= 1 && driverStars <= 5) {
        payload.driverStars = driverStars;
      }

      const res = await fetch('/api/customer-tracking/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setRated(true);
        setFeedbackMsg('Obrigado pela sua avaliação! Sua opinião ajuda a melhorar nossos serviços.');
        if (data.rating) {
          setOrderStars(data.rating.orderStars || orderStars);
          if (data.rating.driverStars) setDriverStars(data.rating.driverStars);
          if (data.rating.comment) setComment(data.rating.comment);
        }
        if (onRatingSubmitted) {
          onRatingSubmitted(data.rating || payload);
        }
      } else {
        if (data.alreadyRated) {
          setRated(true);
          setFeedbackMsg('Este pedido já possui uma avaliação registrada. Agradecemos sua preferência!');
        } else {
          setErrorMsg(data.error || 'Não foi possível registrar a avaliação. Tente novamente.');
        }
      }
    } catch (err: any) {
      setErrorMsg('Falha de conexão com o servidor ao enviar a avaliação. Verifique sua internet.');
    } finally {
      setSubmitting(false);
    }
  }

  // Visualização de Avaliação Já Confirmada
  if (rated) {
    return (
      <div className="p-6 rounded-3xl bg-zinc-900/90 border border-emerald-800/40 shadow-xl space-y-4 animate-fadeIn">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-600/50 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-white text-base">Avaliação do Pedido Confirmada</h3>
            <p className="text-xs text-zinc-400">
              {feedbackMsg || 'Sua avaliação foi registrada com sucesso. Muito obrigado!'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {/* Estrelas do Pedido */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
              Pedido & Atendimento
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= orderStars
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-zinc-700'
                  }`}
                />
              ))}
              <span className="text-xs font-bold text-white ml-2">
                {orderStars} / 5
              </span>
            </div>
          </div>

          {/* Estrelas do Motoboy (quando avaliado) */}
          {effectiveDriverName && driverStars > 0 && (
            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                Entregador ({effectiveDriverName})
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-5 h-5 ${
                      star <= driverStars
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-zinc-700'
                    }`}
                  />
                ))}
                <span className="text-xs font-bold text-white ml-2">
                  {driverStars} / 5
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Comentário enviado */}
        {comment && (
          <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              Seu Comentário
            </span>
            <p className="text-xs text-zinc-300 italic leading-relaxed">
              &ldquo;{comment}&rdquo;
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/95 border border-amber-800/40 shadow-2xl space-y-6">
      {/* Header do Formulário de Avaliação */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-md">
            <HeartHandshake className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">
              Avaliar meu pedido
            </h3>
            <p className="text-xs text-zinc-400">
              Conte-nos como foi a sua experiência com a Bella Pizza
            </p>
          </div>
        </div>

        <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
          #{orderNumber}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bloco 1: Avaliação do Pedido e Atendimento (Obrigatório) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-200">
              1. Como estava o seu pedido e o atendimento da loja? *
            </label>
            {orderStars > 0 && (
              <span className="text-xs font-bold text-amber-400">
                {orderStars === 5
                  ? 'Excelente!'
                  : orderStars === 4
                  ? 'Muito bom'
                  : orderStars === 3
                  ? 'Bom'
                  : orderStars === 2
                  ? 'Regular'
                  : 'Precisa melhorar'}
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-2 pt-1"
            role="group"
            aria-label="Avaliação do pedido de 1 a 5 estrelas"
          >
            {[1, 2, 3, 4, 5].map((starVal) => {
              const isFilled = starVal <= (hoverOrderStars || orderStars);
              return (
                <button
                  key={starVal}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setOrderStars(starVal);
                    setErrorMsg(null);
                  }}
                  onMouseEnter={() => setHoverOrderStars(starVal)}
                  onMouseLeave={() => setHoverOrderStars(0)}
                  aria-label={`Avaliar pedido com ${starVal} estrela${starVal > 1 ? 's' : ''}`}
                  className="p-2 rounded-xl transition transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-pizza-gold hover:bg-zinc-900"
                >
                  <Star
                    className={`w-7 h-7 sm:w-8 sm:h-8 transition ${
                      isFilled
                        ? 'fill-amber-400 text-amber-400 filter drop-shadow'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-zinc-500 block">
            Clique em uma das estrelas para avaliar
          </span>
        </div>

        {/* Bloco 2: Avaliação do Motoboy (quando houver entregador vinculado) */}
        {effectiveDriverName && (
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                <Bike className="w-4 h-4 text-orange-400" />
                <span>2. Como foi o atendimento do motoboy ({effectiveDriverName})?</span>
              </label>
              {driverStars > 0 && (
                <span className="text-xs font-bold text-orange-400">
                  {driverStars === 5
                    ? 'Ótima entrega!'
                    : driverStars === 4
                    ? 'Muito pontual'
                    : driverStars === 3
                    ? 'Dentro do padrão'
                    : 'Abaixo do esperado'}
                </span>
              )}
            </div>

            <div
              className="flex items-center gap-2 pt-1"
              role="group"
              aria-label="Avaliação do motoboy de 1 a 5 estrelas"
            >
              {[1, 2, 3, 4, 5].map((starVal) => {
                const isFilled = starVal <= (hoverDriverStars || driverStars);
                return (
                  <button
                    key={starVal}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setDriverStars(starVal);
                      setErrorMsg(null);
                    }}
                    onMouseEnter={() => setHoverDriverStars(starVal)}
                    onMouseLeave={() => setHoverDriverStars(0)}
                    aria-label={`Avaliar entregador com ${starVal} estrela${starVal > 1 ? 's' : ''}`}
                    className="p-2 rounded-xl transition transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-orange-500 hover:bg-zinc-900"
                  >
                    <Star
                      className={`w-7 h-7 sm:w-8 sm:h-8 transition ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400 filter drop-shadow'
                          : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-zinc-500 block">
              Avalie a pontualidade, simpatia e cuidado do entregador parceiro
            </span>
          </div>
        )}

        {/* Bloco 3: Comentário Opcional */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="customer-rating-comment"
              className="text-xs font-bold text-zinc-200 flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5 text-pizza-gold" />
              <span>Deixe um comentário sobre a sua experiência (opcional)</span>
            </label>
            <span className="text-[10px] text-zinc-500 font-mono">
              {comment.length}/500
            </span>
          </div>

          <textarea
            id="customer-rating-comment"
            rows={3}
            maxLength={500}
            disabled={submitting}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="A pizza estava crocante? O motoboy foi rápido e atencioso? Conte os detalhes..."
            className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pizza-gold resize-none transition"
          />
        </div>

        {/* Mensagens de Erro / Sucesso */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/50 flex items-center gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Botão de Enviar Avaliação */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || orderStars === 0}
            className={`px-6 py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition shadow-lg ${
              orderStars === 0 || submitting
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/40'
                : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-zinc-950 shadow-amber-500/20 active:scale-98'
            }`}
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Enviando avaliação...</span>
              </>
            ) : (
              <>
                <Star className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                <span>Enviar avaliação</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
