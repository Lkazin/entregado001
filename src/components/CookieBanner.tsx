'use client';

import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'novaesweb_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed bottom-0 left-0 right-0 z-40 bg-pizza-card/95 backdrop-blur-md border-t border-pizza-gold/20 px-4 py-3 sm:py-4 shadow-2xl"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-zinc-300 font-light text-center sm:text-left flex-1">
          Este site utiliza cookies e armazenamento local para manter seu carrinho, pedidos e preferências. Ao continuar navegando, você concorda com o uso dessas tecnologias.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/privacidade"
            className="text-xs text-pizza-gold hover:text-pizza-gold-light underline underline-offset-2 transition"
          >
            Saiba mais
          </a>
          <button
            type="button"
            onClick={handleAccept}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-pizza-gold-dark via-pizza-gold to-pizza-gold-light text-pizza-black font-bold text-xs hover:brightness-110 transition active:scale-95"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
