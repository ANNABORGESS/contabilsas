// Importa extrato bancário em PDF (Itaú, Bradesco): confere cada movimento com os saldos impressos pelo banco,
// grava só o que ainda não existe e acerta o saldo inicial das contas.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred, brl } from '@/domain/dinheiro';
import { lerExtratoPdf } from '@/domain/extrato-pdf';
import { guardarArquivo } from './arquivos';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { definirSaldoInicial, saldoInicial } from './banco';
import { textoComLayout } from './pdf-layout';

const chaveSaldos = (empresaId: string) => `saldosExtrato:${empresaId}`;

export async function importarExtratoPdf(db: Db, u: Usuario, emp: Empresa, nome: string, conteudo: Buffer) {
  const ext = lerExtratoPdf(await textoComLayout(new Uint8Array(conteudo)));
  if (!ext) throw new Error(`${nome}: não reconheci o extrato. Por enquanto o ZARO lê PDF do Itaú e do Bradesco (extrato por período).`);
  if (ext.divergencias.length) {
    const d = ext.divergencias[0];
    throw new Error(`${nome}: a soma dos movimentos não bate com o saldo do banco em ${d.data.split('-').reverse().join('/')} (banco ${brl(d.banco)}, soma ${brl(d.calculado)}). Nada foi gravado.`);
  }
  if (!ext.movimentos.length) throw new Error(`${nome}: o extrato não tem movimentos no período.`);
  const arq = await guardarArquivo(db, u.tenantId, nome, 'application/pdf', conteudo);
  // identificador estável: conta, data, valor e a ordem entre os de mesmo valor no dia (sem o histórico, que pode
  // ser lido de outro jeito numa versão nova do leitor). Reimportar o mesmo extrato não duplica.
  const vistos = new Map<string, number>();
  const linhas = ext.movimentos.map((m) => {
    const base = `${ext.conta}|${m.data}|${m.valor.toFixed(2)}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return { ...m, fitid: `${base}|${n}` };
  });
  const existentes = new Set((await db.select({ fitid: schema.extratoMovimentos.fitid }).from(schema.extratoMovimentos)
    .where(and(eq(schema.extratoMovimentos.empresaId, emp.id), eq(schema.extratoMovimentos.conta, ext.conta)))).map((r) => r.fitid));
  const novos = linhas.filter((l) => !existentes.has(l.fitid));
  for (let i = 0; i < novos.length; i += 500) {
    await db.insert(schema.extratoMovimentos).values(novos.slice(i, i + 500).map((m) => ({ tenantId: u.tenantId, empresaId: emp.id, conta: ext.conta, data: m.data, valor: m.valor, memo: m.memo, fitid: m.fitid, arquivo: arq.id })));
  }
  // saldo inicial: soma dos saldos anteriores de cada conta, quando todos são da mesma data
  const [cfg] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, u.tenantId), eq(schema.configuracoes.chave, chaveSaldos(emp.id))));
  const saldos = { ...((cfg?.valor as Record<string, { data: string; valor: number }>) || {}), [ext.conta]: { data: ext.dataSaldoInicial, valor: ext.saldoInicial } };
  await db.insert(schema.configuracoes).values({ tenantId: u.tenantId, chave: chaveSaldos(emp.id), valor: saldos })
    .onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor: saldos, atualizadoEm: new Date() } });
  const datas = [...new Set(Object.values(saldos).map((s) => s.data))];
  let msgSaldo = '';
  if (datas.length === 1) {
    const total = arred(Object.values(saldos).reduce((a, s) => a + s.valor, 0));
    const atual = await saldoInicial(db, u.tenantId, emp.id);
    if (!atual || atual.data !== datas[0] || Math.abs(atual.valor - total) > 0.005) {
      await definirSaldoInicial(db, u, emp, datas[0], total);
      msgSaldo = ` Saldo inicial das contas em ${datas[0].split('-').reverse().join('/')}: ${brl(total)}.`;
    }
  } else {
    msgSaldo = ' Os extratos começam em datas diferentes: confira o saldo inicial abaixo.';
  }
  await auditar(db, u, { empresaId: emp.id, acao: 'Importou extrato bancário (PDF)', entidade: ext.conta, depois: `${novos.length} movimento(s) novo(s) de ${linhas.length}; saldo final ${brl(ext.saldoFinal)}` });
  return `${ext.conta}: ${linhas.length} movimentos lidos e conferidos com ${ext.conferidos} saldos do banco (saldo final ${brl(ext.saldoFinal)}); ${novos.length} novo(s) gravado(s)${linhas.length - novos.length ? `, ${linhas.length - novos.length} já existiam` : ''}.${msgSaldo}`;
}
