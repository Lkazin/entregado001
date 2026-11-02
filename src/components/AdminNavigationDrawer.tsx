'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function AdminNavigationDrawer({ open, onClose, triggerRef, children }: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const getFocusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]') || []);
    getFocusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      triggerRef.current?.focus();
    };
  }, [open, triggerRef]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-menu-title" className="relative h-dvh w-[min(90vw,380px)] overflow-y-auto border-r border-zinc-700 bg-zinc-950 p-4 shadow-2xl text-white">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><h2 id="admin-menu-title" className="text-lg font-black">Menu da loja</h2><p className="text-xs text-zinc-400">Cada área no seu lugar.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar menu" className="rounded-xl border border-zinc-700 px-3 py-2 hover:bg-zinc-800">✕</button>
        </div>
        {children}
      </div>
    </div>, document.body
  );
}
