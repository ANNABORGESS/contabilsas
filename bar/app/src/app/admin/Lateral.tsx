'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDados } from '@/cliente/api';
import { BotaoSair, Conexao } from '@/cliente/ui';

const ITENS = [
  ['/admin', 'Visão geral'],
  ['/admin/mesas', 'Mesas'],
  ['/admin/vendas', 'Vendas'],
  ['/admin/cancelamentos', 'Cancelamentos'],
  ['/admin/cardapio', 'Cardápio'],
  ['/admin/equipe', 'Funcionários'],
  ['/admin/relatorios', 'Relatórios'],
  ['/admin/auditoria', 'Auditoria'],
] as const;

export default function Lateral({ nome, children }: { nome: string; children: React.ReactNode }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const { dados } = useDados<{ solicitacoes: unknown[] }>('/api/solicitacoes?status=pendente');
  const pendentes = dados?.solicitacoes.length || 0;
  useEffect(() => setAberto(false), [caminho]);
  const logo = (
    <div className="logo">
      <span className="marca">🍺</span> Bar · Admin
    </div>
  );
  return (
    <div className={`admin ${aberto ? 'menu-aberto' : ''}`}>
      <div className="menu-movel">
        {logo}
        <button className="btn pequeno" onClick={() => setAberto((a) => !a)}>
          ☰ Menu{pendentes ? ` (${pendentes})` : ''}
        </button>
      </div>
      <nav className="lateral" onClick={(e) => e.target === e.currentTarget && setAberto(false)}>
        {logo}
        {ITENS.map(([href, rotulo]) => (
          <a key={href} href={href} className={caminho === href ? 'ativo' : ''}>
            {rotulo}
            {href === '/admin/cancelamentos' && pendentes > 0 && <span className="selo">{pendentes}</span>}
          </a>
        ))}
        <div className="sep">Telas de operação</div>
        <a href="/garcom" target="_blank" rel="noreferrer">
          Celular do garçom ↗
        </a>
        <a href="/cozinha" target="_blank" rel="noreferrer">
          Painel da cozinha ↗
        </a>
        <a href="/bar" target="_blank" rel="noreferrer">
          Painel do bar ↗
        </a>
        <div className="rodape">
          <Conexao />
          <span>{nome}</span>
          <BotaoSair />
        </div>
      </nav>
      <main className="conteudo">{children}</main>
    </div>
  );
}
