'use client';

import React from 'react';

interface SkeletonCardProps {
  variant?: 'flavor' | 'drink' | 'category';
}

export default function SkeletonCard({ variant = 'flavor' }: SkeletonCardProps) {
  if (variant === 'drink') {
    return (
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
        <div className="h-3 bg-zinc-800 rounded w-1/2 mb-4" />
        <div className="h-4 bg-zinc-800 rounded w-1/4" />
      </div>
    );
  }

  if (variant === 'category') {
    return (
      <div className="aspect-square rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
    );
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden animate-pulse">
      <div className="h-48 bg-zinc-800" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-zinc-800 rounded w-2/3" />
        <div className="h-3 bg-zinc-800 rounded w-full" />
        <div className="h-3 bg-zinc-800 rounded w-4/5" />
        <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between">
          <div className="h-5 bg-zinc-800 rounded w-1/4" />
          <div className="h-8 bg-zinc-800 rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}
