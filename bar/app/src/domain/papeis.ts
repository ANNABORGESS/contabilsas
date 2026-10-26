// Quem faz o quê. O administrador pode tudo; os demais só a própria tela.

export const PAPEIS = ['admin', 'garcom', 'cozinha', 'bar'] as const;
export type Papel = (typeof PAPEIS)[number];

export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  garcom: 'Garçom',
  cozinha: 'Cozinha',
  bar: 'Bar',
};

/** Tela inicial de cada papel. */
export const INICIO: Record<Papel, string> = {
  admin: '/admin',
  garcom: '/garcom',
  cozinha: '/cozinha',
  bar: '/bar',
};

export function ehPapel(p: unknown): p is Papel {
  return typeof p === 'string' && (PAPEIS as readonly string[]).includes(p);
}

export function pode(papel: string, ...permitidos: Papel[]): boolean {
  return papel === 'admin' || (permitidos as string[]).includes(papel);
}
