'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone } from './Icone';

// [endereço, nome, cor pastel da área (globals.css, [data-cor]), ícone, cor do ícone no protótipo]
const ITENS: ([string, string, string, string, string] | null)[] = [
  ['/', 'Dashboard', 'lavanda', 'dash', '#6786A3'],
  ['/autopilot', 'ZARO Autopilot', 'lilas', 'auto', '#9B82BD'],
  ['/empresas', 'Empresas e Filiais', 'ceu', 'emp', '#7F98AE'],
  ['/pessoal', 'Departamento Pessoal', 'pessego', 'dp', '#C98580'],
  ['/financeiro', 'Financeiro', 'menta', 'fin', '#5FA67C'],
  ['/inteligencia', 'Inteligência Financeira', 'lavanda', 'intel', '#8A6BBF'],
  ['/comercial', 'Comercial', 'rosa', 'com', '#5FA67C'],
  ['/estoque', 'Produtos e Estoque', 'agua', 'est', '#7FA9A3'],
  ['/custos', 'Custos e Preços', 'lilas', 'cst', '#B49CCB'],
  ['/contabilidade', 'Contabilidade', 'ceu', 'cnt', '#7F98AE'],
  ['/fiscal', 'Fiscal e Tributário', 'lavanda', 'fis', '#9B82BD'],
  ['/especialistas', 'Especialistas', 'pessego', 'espec', '#C9956F'],
  ['/conselho', 'Conselho ZARO', 'lilas', 'cons', '#9B82BD'],
  ['/documentos', 'Documentos', 'lilas', 'doc', '#B49CCB'],
  null,
  ['/configuracoes', 'Configurações', 'neutro', 'cfg', '#7C756F'],
  ['/auditoria', 'Auditoria', 'neutro', 'audit', '#5F5954'],
];

export function Menu() {
  const p = usePathname();
  return (
    <nav className="menu">
      {ITENS.map((i, k) =>
        i ? (
          <Link key={i[0]} href={i[0]} data-cor={i[2]} title={i[1]} className={(i[0] === '/' ? p === '/' : p.startsWith(i[0])) ? 'ativo' : ''}>
            <Icone nome={i[3]} cor={i[4]} />
            <span className="nome">{i[1]}</span>
          </Link>
        ) : (
          <div key={k} className="sep" />
        ),
      )}
    </nav>
  );
}

/** Recolhe o menu lateral para só os ícones, e lembra a escolha neste navegador. */
export function BotaoRecolher() {
  const alternar = () => {
    const r = document.documentElement;
    const recolhido = r.toggleAttribute('data-menu-recolhido');
    try { localStorage.setItem('zaro:menu-recolhido', recolhido ? '1' : ''); } catch {}
  };
  return (
    <button type="button" className="recolher" onClick={alternar} title="Recolher ou expandir menu" aria-label="Recolher ou expandir menu">
      <Icone nome="painel" tam={16} traco={2} />
    </button>
  );
}
