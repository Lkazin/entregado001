import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bella Pizza — A Verdadeira Pizza Artesanal | NovaesWeb",
  description: "Peça sua pizza favorita com até 4 sabores, bordas recheadas e entrega rápida. Cardápio completo, montagem interativa e acompanhamento em tempo real.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-pizza-dark text-white selection:bg-pizza-red selection:text-white">
        {children}
      </body>
    </html>
  );
}
