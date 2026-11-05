// Quem faz o quê. O administrador pode tudo. Gerente, caixa e estoquista entram pela tela de
// gestão e só veem (e só conseguem usar, no servidor) as áreas da própria função.

export const PAPEIS = ['admin', 'gerente', 'caixa', 'garcom', 'estoquista', 'cozinha', 'bar'] as const;
export type Papel = (typeof PAPEIS)[number];

export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  caixa: 'Caixa',
  garcom: 'Garçom',
  estoquista: 'Estoquista',
  cozinha: 'Cozinha',
  bar: 'Bar',
};

/** Tela inicial de cada papel. */
export const INICIO: Record<Papel, string> = {
  admin: '/admin',
  gerente: '/admin',
  caixa: '/admin/mesas',
  garcom: '/garcom',
  estoquista: '/admin/estoque',
  cozinha: '/cozinha',
  bar: '/bar',
};

/** Áreas da gestão. Nenhum nome coincide com um papel, para a rota aceitar os dois. */
export const PERMISSOES = ['visao', 'mesas', 'vendas', 'autorizar', 'fechamento', 'estoque', 'cardapio', 'relatorios', 'auditoria', 'equipe', 'financeiro', 'site'] as const;
export type Permissao = (typeof PERMISSOES)[number];

const ACESSO: Record<Papel, readonly Permissao[]> = {
  admin: PERMISSOES,
  // operação, relatórios e autorizações; funcionários, custos e o site ficam com o administrador
  gerente: ['visao', 'mesas', 'vendas', 'autorizar', 'fechamento', 'estoque', 'cardapio', 'relatorios', 'auditoria'],
  caixa: ['mesas', 'vendas', 'fechamento'],
  estoquista: ['estoque'],
  garcom: [],
  cozinha: [],
  bar: [],
};

/** Telas de operação que cada papel também usa (o gerente cobre qualquer posto; o caixa lança e cobra como o garçom). */
const ATUA_COMO: Partial<Record<Papel, Papel[]>> = {
  gerente: ['garcom', 'cozinha', 'bar'],
  caixa: ['garcom'],
};

export function ehPapel(p: unknown): p is Papel {
  return typeof p === 'string' && (PAPEIS as readonly string[]).includes(p);
}

export function ehPermissao(p: unknown): p is Permissao {
  return typeof p === 'string' && (PERMISSOES as readonly string[]).includes(p);
}

/** Pode usar a tela de operação de algum destes papéis? */
export function pode(papel: string, ...permitidos: Papel[]): boolean {
  if (papel === 'admin') return true;
  const como = ATUA_COMO[papel as Papel] || [];
  return permitidos.some((p) => p === papel || como.includes(p));
}

/** Tem acesso a esta área da gestão? */
export function tem(papel: string, permissao: Permissao): boolean {
  return ehPapel(papel) && ACESSO[papel].includes(permissao);
}

/** Entra pela tela de gestão (/admin)? */
export function ehGestao(papel: string): boolean {
  return ehPapel(papel) && ACESSO[papel].length > 0;
}

/** O usuário deste papel pode entrar pelo link deste perfil? Gestão (admin) aceita gerente, caixa e estoquista. */
export function entraPor(papel: string, perfil: Papel): boolean {
  return perfil === 'admin' ? ehGestao(papel) : pode(papel, perfil);
}

/** Acesso de uma rota: papéis de operação e/ou áreas da gestão. Basta um. */
export function liberado(papel: string, acesso: readonly (Papel | Permissao)[]): boolean {
  if (!acesso.length) return true;
  return acesso.some((a) => (ehPapel(a) ? pode(papel, a) : tem(papel, a)));
}
