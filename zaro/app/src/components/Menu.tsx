'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// cada área tem a sua cor pastel (as cores ficam em globals.css, em [data-cor])
const ITENS: ([string, string, string] | null)[] = [
  ['/', 'Dashboard', 'lavanda'],
  ['/autopilot', 'ZARO Autopilot', 'lilas'],
  ['/empresas', 'Empresas e Filiais', 'ceu'],
  ['/pessoal', 'Departamento Pessoal', 'pessego'],
  ['/financeiro', 'Financeiro', 'menta'],
  ['/comercial', 'Comercial', 'rosa'],
  ['/estoque', 'Produtos e Estoque', 'areia'],
  ['/custos', 'Custos e Preços', 'coral'],
  ['/contabilidade', 'Contabilidade', 'agua'],
  ['/fiscal', 'Fiscal e Tributário', 'limao'],
  ['/conselho', 'Conselho ZARO', 'lilas'],
  ['/documentos', 'Documentos', 'ceu'],
  null,
  ['/configuracoes', 'Configurações', 'neutro'],
  ['/auditoria', 'Auditoria', 'neutro'],
];

export function Menu() {
  const p = usePathname();
  return (
    <nav className="menu">
      {ITENS.map((i, k) =>
        i ? (
          <Link key={i[0]} href={i[0]} data-cor={i[2]} className={(i[0] === '/' ? p === '/' : p.startsWith(i[0])) ? 'ativo' : ''}>
            <span className="ponto" aria-hidden="true" />
            {i[1]}
          </Link>
        ) : (
          <div key={k} className="sep" />
        ),
      )}
    </nav>
  );
}
