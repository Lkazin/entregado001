import type { Metadata } from 'next';
import Master2Workspace from '@/components/Master2Workspace';

export const metadata: Metadata = {
  title: 'Master 2 — Central de Integração | NovaesWeb',
  description: 'Área administrativa da Central de Integração NovaesWeb Entregador.',
  robots: { index: false, follow: false },
};

export default function Master2Page() {
  return <Master2Workspace />;
}
