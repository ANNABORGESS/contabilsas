'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS: ([string, string] | null)[] = [
  ['/', 'Dashboard'],
  ['/autopilot', 'ZARO Autopilot'],
  ['/empresas', 'Empresas e Filiais'],
  ['/pessoal', 'Departamento Pessoal'],
  ['/financeiro', 'Financeiro'],
  ['/comercial', 'Comercial'],
  ['/estoque', 'Produtos e Estoque'],
  ['/custos', 'Custos e Preços'],
  ['/contabilidade', 'Contabilidade'],
  ['/fiscal', 'Fiscal e Tributário'],
  ['/conselho', 'Conselho ZARO'],
  ['/documentos', 'Documentos'],
  null,
  ['/configuracoes', 'Configurações'],
  ['/auditoria', 'Auditoria'],
];

export function Menu() {
  const p = usePathname();
  return (
    <nav className="menu">
      {ITENS.map((i, k) =>
        i ? (
          <Link key={i[0]} href={i[0]} className={(i[0] === '/' ? p === '/' : p.startsWith(i[0])) ? 'ativo' : ''}>
            {i[1]}
          </Link>
        ) : (
          <div key={k} className="sep" />
        ),
      )}
    </nav>
  );
}
