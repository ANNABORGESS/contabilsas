'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { type Db, getDb } from '@/db';
import { numero } from '@/domain/dinheiro';
import { type Empresa, exigirEdicao, exigirEmpresa, type Usuario } from '@/server/auth';
import { concluirConferencia, importarDocumentoDP, registrarEvento, registrarObrigacao, revisarItem, salvarConvencao } from '@/server/dp';

const txt = (f: FormData, k: string) => String(f.get(k) || '');
const num = (f: FormData, k: string) => (txt(f, k).trim() ? numero(f.get(k)) : null);

async function executar(aba: string, comp: string, fn: (db: Db, u: Usuario, emp: Empresa) => Promise<string>) {
  const volta = `/pessoal?aba=${aba}${comp ? `&comp=${comp}` : ''}`;
  try {
    const u = await exigirEdicao();
    const emp = await exigirEmpresa(u);
    const msg = await fn(await getDb(), u, emp);
    revalidatePath('/pessoal');
    redirect(`${volta}&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${volta}&erro=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function importarAcao(form: FormData) {
  await executar(txt(form, 'volta') || 'folha', txt(form, 'competencia'), async (db, u, emp) => {
    const arqs = form.getAll('arquivo').filter((f): f is File => f instanceof File && f.size > 0);
    if (!arqs.length) throw new Error('Escolha ao menos um arquivo.');
    const msgs: string[] = [];
    for (const f of arqs) {
      if (f.size > 20_000_000) throw new Error(`${f.name}: arquivo grande demais (máximo 20 MB).`);
      msgs.push(await importarDocumentoDP(db, u, emp, { tipo: txt(form, 'tipo'), competencia: txt(form, 'competencia'), tipoFolha: txt(form, 'tipoFolha') || 'mensal', nome: f.name, mime: f.type || 'application/octet-stream', conteudo: Buffer.from(await f.arrayBuffer()) }));
    }
    return msgs.join(' ');
  });
}
export async function revisarAcao(form: FormData) {
  await executar('folha', txt(form, 'comp'), (db, u, emp) => revisarItem(db, u, emp, txt(form, 'comp'), txt(form, 'chave'), txt(form, 'decisao'), txt(form, 'nota')));
}
export async function concluirAcao(form: FormData) {
  await executar('relatorios', txt(form, 'comp'), (db, u, emp) => concluirConferencia(db, u, emp, txt(form, 'comp'), txt(form, 'parecer'), form.get('reabrir') === '1'));
}
export async function declaradoAcao(form: FormData) {
  await executar('encargos', txt(form, 'comp'), (db, u, emp) => registrarObrigacao(db, u, emp, { competencia: txt(form, 'comp'), tributo: txt(form, 'tributo'), declarado: num(form, 'declarado'), fonte: txt(form, 'fonte') }));
}
export async function eventoAcao(form: FormData) {
  await executar('ferias', txt(form, 'comp'), (db, u, emp) => registrarEvento(db, u, emp, {
    tipo: txt(form, 'tipo') as 'ferias', funcionarioId: txt(form, 'funcionario'), competencia: txt(form, 'comp'), referencia: txt(form, 'referencia'), pagoEm: txt(form, 'pagoEm'),
    remuneracao: num(form, 'remuneracao'), terco: num(form, 'terco'), valorPago: num(form, 'valorPago'), parcela: txt(form, 'parcela'), obs: txt(form, 'obs'),
  }));
}
export async function convencaoAcao(form: FormData) {
  await executar('convencoes', '', (db, u, emp) => salvarConvencao(db, u, emp, {
    id: txt(form, 'id') || undefined, sindicato: txt(form, 'sindicato'), de: txt(form, 'de'), ate: txt(form, 'ate'), dataBase: txt(form, 'dataBase'), piso: num(form, 'piso'), reajuste: num(form, 'reajuste'),
    beneficios: txt(form, 'beneficios'), regras: txt(form, 'regras'), validar: form.get('validar') === 'on',
  }));
}
