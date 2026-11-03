import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'Política de Privacidade — Bella Pizza',
  description: 'Política de privacidade e uso de cookies da Bella Pizza.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-pizza-black text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-pizza-gold transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao site
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-pizza-gold/10 border border-pizza-gold/30 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-pizza-gold" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white">Política de Privacidade</h1>
        </div>

        <div className="space-y-6 text-sm text-zinc-300 font-light leading-relaxed">
          <section>
            <h2 className="text-lg font-serif font-bold text-white mb-2">1. Informações Coletadas</h2>
            <p>
              A Bella Pizza coleta informações fornecidas voluntariamente pelo cliente durante o processo de pedido, incluindo nome, telefone, endereço de entrega e forma de pagamento. Também utilizamos armazenamento local (localStorage) para manter o carrinho de compras, histórico de pedidos e preferências do usuário.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-serif font-bold text-white mb-2">2. Uso das Informações</h2>
            <p>
              As informações coletadas são utilizadas exclusivamente para processar pedidos, realizar entregas e melhorar a experiência do usuário. Não compartilhamos dados pessoais com terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-serif font-bold text-white mb-2">3. Cookies e Armazenamento Local</h2>
            <p>
              Este site utiliza cookies e tecnologias de armazenamento local (localStorage) para:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-zinc-400">
              <li>Manter itens no carrinho de compras</li>
              <li>Salvar histórico de pedidos para acompanhamento</li>
              <li>Armazenar preferências do usuário (tema, tamanho de papel, etc.)</li>
              <li>Registrar consentimento de cookies</li>
            </ul>
            <p className="mt-2">
              Você pode limpar esses dados a qualquer momento nas configurações do seu navegador.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-serif font-bold text-white mb-2">4. Segurança</h2>
            <p>
              Utilizamos medidas de segurança para proteger suas informações, incluindo códigos PIN de entrega e validação de pedidos. Dados sensíveis não são armazenados em texto claro.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-serif font-bold text-white mb-2">5. Seus Direitos (LGPD)</h2>
            <p>
              Conforme a Lei Geral de Proteção de Dados (LGPD), você tem direito a acessar, corrigir, excluir ou portar seus dados pessoais. Para exercer esses direitos, entre em contato conosco.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-serif font-bold text-white mb-2">6. Contato</h2>
            <p>
              Para dúvidas sobre privacidade, entre em contato pelo WhatsApp: (11) 98765-4321 ou pelo e-mail de suporte.
            </p>
          </section>

          <p className="text-xs text-zinc-500 mt-8">
            Última atualização: Novembro de 2026
          </p>
        </div>
      </div>
    </div>
  );
}
