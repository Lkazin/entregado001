import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 text-center">
      <h2 className="text-4xl font-extrabold text-red-500 mb-2">404</h2>
      <p className="text-lg text-zinc-300 mb-6">Página não encontrada</p>
      <Link
        href="/"
        className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition"
      >
        Voltar para a Página Inicial
      </Link>
    </div>
  );
}
