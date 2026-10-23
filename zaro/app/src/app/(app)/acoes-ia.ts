'use server';
import { getDb } from '@/db';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { perguntarZaroIa, type Mensagem } from '@/server/zaro-ia';

export async function perguntarIa(historico: Mensagem[], area?: string): Promise<{ texto?: string; erro?: string }> {
  try {
    const u = await exigirUsuario();
    const emp = await exigirEmpresa(u);
    const limpo = (Array.isArray(historico) ? historico : []).map((m) => ({ papel: m?.papel === 'ia' ? ('ia' as const) : ('usuario' as const), texto: String(m?.texto || '') }));
    return { texto: await perguntarZaroIa(await getDb(), u, emp, limpo, typeof area === 'string' ? area : undefined) };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}
