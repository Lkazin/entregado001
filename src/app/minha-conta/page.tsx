import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import CustomerAccountPanel from '@/components/CustomerAccountPanel';

export default function CustomerAccountPage() {
  return <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white sm:px-6 sm:py-10"><div className="mx-auto max-w-4xl"><Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-pizza-gold"><ArrowLeft className="h-4 w-4" />Voltar ao cardápio</Link><CustomerAccountPanel /></div></main>;
}
