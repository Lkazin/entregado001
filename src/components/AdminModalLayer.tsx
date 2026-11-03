'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep operational dialogs above floating notices, including in TV mode. */
export default function AdminModalLayer({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="relative z-[80]">{children}</div>, document.body);
}
