// Preferências do Dashboard por usuário (ordem e visibilidade dos blocos).
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Usuario } from './auth';

export const BLOCOS = [
  ['indicadores', 'Indicadores principais'],
  ['posicao', 'Posição financeira'],
  ['ia', 'ZARO IA'],
  ['evolucao', 'Gráfico: evolução financeira'],
  ['fluxo', 'Gráfico: fluxo de caixa projetado'],
  ['fechamento', 'Fechamento da competência'],
  ['atencao', 'Requer sua atenção'],
  ['insights', 'Insights ZARO IA'],
  ['atividades', 'Atividades recentes'],
  ['acoes', 'Ações rápidas'],
] as const;
export type Bloco = (typeof BLOCOS)[number][0];
export interface PrefPainel { ordem: Bloco[]; ocultos: Bloco[] }

const chave = (u: Usuario) => `painel:${u.id}`;
const validos = new Set<string>(BLOCOS.map((b) => b[0]));

export function normalizar(p: Partial<PrefPainel> | null | undefined): PrefPainel {
  const ordem = (p?.ordem || []).filter((b, i, a) => validos.has(b) && a.indexOf(b) === i) as Bloco[];
  for (const [b] of BLOCOS) if (!ordem.includes(b)) ordem.push(b);
  return { ordem, ocultos: (p?.ocultos || []).filter((b) => validos.has(b)) as Bloco[] };
}

export async function prefPainel(db: Db, u: Usuario): Promise<PrefPainel> {
  const [r] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, u.tenantId), eq(schema.configuracoes.chave, chave(u))));
  return normalizar(r?.valor as PrefPainel | undefined);
}

export async function salvarPrefPainel(db: Db, u: Usuario, p: Partial<PrefPainel>) {
  const valor = normalizar(p);
  await db.insert(schema.configuracoes).values({ tenantId: u.tenantId, chave: chave(u), valor }).onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor, atualizadoEm: new Date() } });
}
