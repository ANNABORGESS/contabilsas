'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDados } from '@/cliente/api';
import { BotaoSair, Conexao } from '@/cliente/ui';
import { INICIO, NOME_PAPEL, pode, tem, type Papel, type Permissao } from '@/domain/papeis';

const ITENS: [string, string, Permissao][] = [
  ['/admin', 'Visão geral', 'visao'],
  ['/admin/mesas', 'Mesas', 'mesas'],
  ['/admin/vendas', 'Vendas', 'vendas'],
  ['/admin/cancelamentos', 'Cancelamentos e estornos', 'autorizar'],
  ['/admin/cardapio', 'Cardápio', 'cardapio'],
  ['/admin/promocoes', 'Promoções', 'cardapio'],
  ['/admin/estoque', 'Estoque', 'estoque'],
  ['/admin/equipe', 'Funcionários', 'equipe'],
  ['/admin/relatorios', 'Relatórios', 'relatorios'],
  ['/admin/caixa', 'Caixa do turno', 'fechamento'],
  ['/admin/financeiro', 'Custos e lucro', 'financeiro'],
  ['/admin/auditoria', 'Auditoria', 'auditoria'],
];

export default function Lateral({ nome, papel, children }: { nome: string; papel: Papel; children: React.ReactNode }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const itens = ITENS.filter(([, , p]) => tem(papel, p));
  // cada função só vê as próprias áreas; o servidor também recusa as outras
  const area = ITENS.find(([href]) => href === caminho);
  const permitido = !area || tem(papel, area[2]);
  const { dados } = useDados<{ solicitacoes: unknown[] }>(tem(papel, 'autorizar') ? '/api/solicitacoes?status=pendente' : null);
  const pendentes = dados?.solicitacoes.length || 0;
  const { dados: equipe } = useDados<{ equipe: { pendente: boolean }[] }>(tem(papel, 'equipe') ? '/api/equipe' : null);
  const contas = equipe?.equipe.filter((f) => f.pendente).length || 0;
  useEffect(() => setAberto(false), [caminho]);
  const logo = (
    <div className="logo">
      <img src="/logo.png" alt="" className="logo-mini" /> Porão Vikings · Admin
    </div>
  );
  return (
    <div className={`admin tema-vikings ${aberto ? 'menu-aberto' : ''}`}>
      <div className="menu-movel">
        {logo}
        <button className="btn pequeno" onClick={() => setAberto((a) => !a)}>
          ☰ Menu{pendentes + contas ? ` (${pendentes + contas})` : ''}
        </button>
      </div>
      <nav className="lateral" onClick={(e) => e.target === e.currentTarget && setAberto(false)}>
        {logo}
        {/* o administrador também lança e cobra pedidos (mesa ou balcão), como um caixa */}
        {pode(papel, 'garcom') && (
          <a href="/garcom" className="lancar-pedido">
            🧾 Lançar pedido
          </a>
        )}
        {itens.map(([href, rotulo]) => (
          <a key={href} href={href} className={caminho === href ? 'ativo' : ''}>
            {rotulo}
            {href === '/admin/cancelamentos' && pendentes > 0 && <span className="selo">{pendentes}</span>}
            {href === '/admin/equipe' && contas > 0 && <span className="selo">{contas}</span>}
          </a>
        ))}
        {pode(papel, 'cozinha') && (
          <>
            <div className="sep">Telas de operação</div>
            {tem(papel, 'equipe') && <a href="/admin/equipe#links">Links de acesso</a>}
            <a href="/garcom" target="_blank" rel="noreferrer">
              Celular do garçom ↗
            </a>
            <a href="/cozinha" target="_blank" rel="noreferrer">
              Painel da cozinha ↗
            </a>
            <a href="/bar" target="_blank" rel="noreferrer">
              Painel do bar ↗
            </a>
          </>
        )}
        <div className="rodape">
          <Conexao />
          <span>
            {nome} <span className="fraco">· {NOME_PAPEL[papel]}</span>
          </span>
          <BotaoSair />
        </div>
      </nav>
      <main className="conteudo">
        {permitido ? (
          children
        ) : (
          <div className="cartao vazio">
            Esta área não faz parte da função de {NOME_PAPEL[papel].toLowerCase()}. <a href={INICIO[papel]}>Voltar ao início</a>
          </div>
        )}
      </main>
    </div>
  );
}
