import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZARO',
  description: 'Contabilidade inteligente. Gestão conectada.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
        <style>{`:root{--font-manrope:'Manrope'}`}</style>
        {/* aplica o menu recolhido antes de desenhar a tela, para não piscar */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('zaro:menu-recolhido'))document.documentElement.setAttribute('data-menu-recolhido','')}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
