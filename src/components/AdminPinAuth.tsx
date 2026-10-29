'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Flame, Lock, ShieldCheck, AlertCircle, ArrowRight, Delete } from 'lucide-react';

interface AdminPinAuthProps {
  onSuccess: () => void;
}

const CORRECT_PIN = '615210';

export default function AdminPinAuth({ onSuccess }: AdminPinAuthProps) {
  const [pin, setPin] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focar no primeiro input ao carregar
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    // Permitir apenas números
    if (value && !/^\d+$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value ? value.slice(-1) : '';
    setPin(newPin);
    setError(false);
    setErrorMessage('');

    // Avançar para o próximo input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Se completou os 6 dígitos, valida automaticamente
    if (newPin.every(d => d !== '')) {
      const fullPin = newPin.join('');
      validatePin(fullPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasted)) {
      const digits = pasted.split('');
      setPin(digits);
      validatePin(pasted);
    }
  };

  const validatePin = (candidate: string) => {
    if (candidate === CORRECT_PIN) {
      sessionStorage.setItem('novaesweb_admin_auth', 'authenticated');
      onSuccess();
    } else {
      setError(true);
      setErrorMessage('Código de acesso incorreto. Tente novamente.');
      // Limpa os inputs e refoca no primeiro
      setTimeout(() => {
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 500);
    }
  };

  const handleKeypadPress = (num: string) => {
    const firstEmpty = pin.findIndex(d => d === '');
    if (firstEmpty !== -1) {
      handleDigitChange(firstEmpty, num);
    }
  };

  const handleKeypadBackspace = () => {
    const lastFilled = [...pin].reverse().findIndex(d => d !== '');
    if (lastFilled !== -1) {
      const actualIndex = 5 - lastFilled;
      const newPin = [...pin];
      newPin[actualIndex] = '';
      setPin(newPin);
      inputRefs.current[actualIndex]?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Luz ambiente de fundo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10 text-center space-y-6">
        
        {/* Cabeçalho */}
        <div className="space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center text-white mx-auto shadow-lg shadow-red-600/30">
            <Lock className="w-7 h-7 text-amber-300" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">
            Acesso Restrito ao Painel
          </h1>
          <p className="text-xs text-zinc-400">
            Digite o PIN de 6 dígitos do lojista para desbloquear a operação.
          </p>
        </div>

        {/* 6 Caixas de Dígitos */}
        <div className="space-y-3">
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {pin.map((digit, idx) => (
              <input
                key={idx}
                ref={el => { inputRefs.current[idx] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleDigitChange(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(idx, e)}
                className={`w-11 h-14 text-center text-2xl font-black rounded-xl border bg-zinc-950 text-white focus:outline-none transition-all duration-150 ${
                  error
                    ? 'border-red-600 ring-2 ring-red-600/30 bg-red-950/20'
                    : digit
                    ? 'border-red-500 ring-2 ring-red-500/20 text-red-400'
                    : 'border-zinc-800 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center justify-center gap-1.5 animate-shake">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </p>
          )}
        </div>

        {/* Teclado Numérico na Tela */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeypadPress(num)}
              className="h-12 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 active:scale-95 border border-zinc-800/80 text-white font-extrabold text-lg transition flex items-center justify-center shadow-sm"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin(['', '', '', '', '', ''])}
            className="h-12 rounded-xl bg-zinc-950/40 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs font-bold transition flex items-center justify-center border border-zinc-800/60"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="h-12 rounded-xl bg-zinc-950/60 hover:bg-zinc-800 active:scale-95 border border-zinc-800/80 text-white font-extrabold text-lg transition flex items-center justify-center shadow-sm"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleKeypadBackspace}
            className="h-12 rounded-xl bg-zinc-950/40 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold transition flex items-center justify-center border border-zinc-800/60"
            title="Apagar"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Rodapé informativo */}
        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Proteção de Terminal NovaesWeb</span>
        </div>

      </div>

    </div>
  );
}
