// Ícones de traço do protótipo (ZARO.dc.html), na mesma grade de 24px.
const DESENHOS: Record<string, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
  auto: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  emp: <><rect x="4" y="3" width="10" height="18" /><path d="M14 8h6v13H4" /><path d="M8 7h2M8 11h2M8 15h2" /></>,
  dp: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
  fin: <><rect x="2" y="6" width="20" height="12" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  com: <><path d="M3 4h2l2.4 11h11L21 7H6" /><circle cx="9" cy="19" r="1.6" /><circle cx="18" cy="19" r="1.6" /></>,
  est: <><path d="M21 8v8l-9 5-9-5V8l9-5 9 5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  cst: <><path d="M19 5L5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  cnt: <><rect x="4" y="3" width="16" height="18" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  fis: <><path d="M14 3H6v18h12V7l-4-4z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" /></>,
  cons: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 3-5 6-5" /></>,
  doc: <><rect x="3" y="4" width="18" height="16" /><path d="M3 9h18M9 13h6" /></>,
  cfg: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  audit: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  painel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></>,
  busca: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  sino: <><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></>,
  brilho: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
};

export function Icone({ nome, tam = 20, cor, traco = 1.8 }: { nome: string; tam?: number; cor?: string; traco?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', color: cor }} aria-hidden="true">
      {DESENHOS[nome]}
    </svg>
  );
}
