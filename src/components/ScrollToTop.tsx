'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Voltar ao topo"
      className="fixed bottom-24 right-6 z-40 w-11 h-11 rounded-full bg-pizza-card border border-pizza-gold/30 text-pizza-gold flex items-center justify-center shadow-lg shadow-gold-sm hover:bg-pizza-gold hover:text-pizza-black transition-all duration-300 hover:scale-110 active:scale-95 animate-fade-in"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
