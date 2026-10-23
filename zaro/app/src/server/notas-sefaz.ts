// Controle das NF da lista da SEFAZ-AM: importação da planilha, recebimento da mercadoria
// e marcação de lançamento, cruzando com o que já está na ZARO (títulos e Autopilot).
import 'server-only';
import ExcelJS from 'exceljs';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { brl } from '@/domain/dinheiro';
import { lerListaSefaz, notaCancelada } from '@/domain/notas-sefaz';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';

/** Valor "puro" de uma célula do exceljs (texto rico, fórmula, link). */
function celula(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
  }
  return v;
}

function lerCsv(texto: string): unknown[][] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = [';', '\t', ','].find((s) => (linhas[0] || '').includes(s)) || ';';
  return linhas.map((l) => {
    const out: string[] = [];
    let cur = '', aspas = false;
    for (const ch of l) {
      if (ch === '"') aspas = !aspas;
      else if (ch === sep && !aspas) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

export async function lerPlanilha(nome: string, conteudo: Buffer): Promise<unknown[][]> {
  if (/\.csv$|\.txt$/i.test(nome)) return lerCsv(conteudo.toString('utf8'));
  if (!/\.xlsx$/i.test(nome)) throw new Error('Envie a planilha em .xlsx ou .csv (no Excel: Arquivo → Salvar como → Pasta de Trabalho do Excel).');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(conteudo as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const linhas: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = (r.values as ExcelJS.CellValue[]).slice(1);
    linhas.push(vals.map(celula));
  });
  return linhas;
}

export async function importarNotasSefaz(db: Db, u: Usuario, emp: Empresa, nome: string, conteudo: Buffer) {
  const { notas, ignoradas } = lerListaSefaz(await lerPlanilha(nome, conteudo));
  if (!notas.length) throw new Error('Não achei nenhuma nota com chave de 44 dígitos nesta planilha.');
  const ja = new Set((await db.select({ c: schema.notasSefaz.chave }).from(schema.notasSefaz)
    .where(and(eq(schema.notasSefaz.empresaId, emp.id), inArray(schema.notasSefaz.chave, notas.map((n) => n.chave))))).map((x) => x.c));
  for (let i = 0; i < notas.length; i += 200) {
    const lote = notas.slice(i, i + 200).map((n) => ({ tenantId: u.tenantId, empresaId: emp.id, ...n }));
    await db.insert(schema.notasSefaz).values(lote).onConflictDoUpdate({
      target: [schema.notasSefaz.empresaId, schema.notasSefaz.chave],
      // a situação muda no portal (ex.: nota cancelada depois); recebimento e lançamento ficam como estão
      set: { situacao: sql`excluded.situacao`, selagem: sql`excluded.selagem`, cfop: sql`excluded.cfop`, tipo: sql`excluded.tipo`, valor: sql`excluded.valor`, importadoEm: new Date() },
    });
  }
  const novas = notas.filter((n) => !ja.has(n.chave)).length;
  const msg = `${novas} nota(s) nova(s), ${notas.length - novas} atualizada(s)${ignoradas ? `, ${ignoradas} linha(s) sem chave válida ignorada(s)` : ''}.`;
  await auditar(db, u, { empresaId: emp.id, acao: 'Importou lista de NF da SEFAZ', entidade: nome.slice(0, 120), depois: msg });
  return msg;
}

async function nota(db: Db, emp: Empresa, id: string) {
  const [n] = await db.select().from(schema.notasSefaz).where(and(eq(schema.notasSefaz.id, id), eq(schema.notasSefaz.empresaId, emp.id)));
  if (!n) throw new Error('Nota não encontrada nesta empresa.');
  return n;
}

/** Nota emitida pela própria empresa: é saída, não tem mercadoria a receber. */
export const ehSaida = (n: { cnpjEmit: string | null; tipo: string | null }, emp: Empresa) =>
  (!!n.cnpjEmit && n.cnpjEmit === emp.cnpj) || (/sa[ií]da/i.test(n.tipo || '') && !(/entrada/i.test(n.tipo || '')));

export async function receberNota(db: Db, u: Usuario, emp: Empresa, id: string, pedido: string, mesmoAssim: boolean) {
  const n = await nota(db, emp, id);
  if (notaCancelada(n.situacao)) throw new Error(`A NF ${n.numero} está ${n.situacao}: não dá para receber.`);
  if (ehSaida(n, emp)) throw new Error(`A NF ${n.numero} foi emitida pela própria empresa (saída): não há mercadoria a receber.`);
  if (n.recebidoEm) throw new Error(`A NF ${n.numero} já foi recebida.`);
  const ped = pedido.trim();
  if (ped && !mesmoAssim) {
    const [outra] = await db.select({ numero: schema.notasSefaz.numero }).from(schema.notasSefaz)
      .where(and(eq(schema.notasSefaz.empresaId, emp.id), eq(schema.notasSefaz.pedido, ped), sql`${schema.notasSefaz.id} <> ${id}`));
    if (outra) throw new Error(`O pedido ${ped} já está na NF ${outra.numero}. Se for isso mesmo, marque "pedido repetido, receber assim mesmo".`);
  }
  await db.update(schema.notasSefaz).set({ pedido: ped || null, recebidoEm: new Date(), recebidoPor: u.nome }).where(eq(schema.notasSefaz.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Recebeu mercadoria da NF', entidade: `NF ${n.numero} · ${n.razaoEmit || ''}`.slice(0, 160), depois: `${brl(n.valor)}${ped ? ` · pedido ${ped}` : ''}` });
}

export async function lancarNota(db: Db, u: Usuario, emp: Empresa, id: string) {
  const n = await nota(db, emp, id);
  if (n.lancadoEm) throw new Error(`A NF ${n.numero} já está marcada como lançada.`);
  if (!n.recebidoEm && !notaCancelada(n.situacao) && !ehSaida(n, emp)) throw new Error(`Receba a mercadoria da NF ${n.numero} antes de marcar o lançamento.`);
  await db.update(schema.notasSefaz).set({ lancadoEm: new Date(), lancadoPor: u.nome }).where(eq(schema.notasSefaz.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: 'Marcou NF como lançada', entidade: `NF ${n.numero} · ${n.razaoEmit || ''}`.slice(0, 160) });
}

export async function desfazerNota(db: Db, u: Usuario, emp: Empresa, id: string) {
  const n = await nota(db, emp, id);
  const campo = n.lancadoEm ? 'lançamento' : n.recebidoEm ? 'recebimento' : '';
  if (!campo) throw new Error('Não há nada para desfazer nesta nota.');
  await db.update(schema.notasSefaz).set(n.lancadoEm ? { lancadoEm: null, lancadoPor: null } : { recebidoEm: null, recebidoPor: null, pedido: null }).where(eq(schema.notasSefaz.id, id));
  await auditar(db, u, { empresaId: emp.id, acao: `Desfez ${campo} da NF`, entidade: `NF ${n.numero} · ${n.razaoEmit || ''}`.slice(0, 160) });
  return campo;
}

export const FILTROS_NOTA = [['areceber', 'A receber'], ['alancar', 'Recebidas, falta lançar'], ['lancadas', 'Lançadas'], ['canceladas', 'Canceladas'], ['forazaro', 'Fora da ZARO'], ['todas', 'Todas']] as const;

/** Notas com o filtro da tela e a marca de "já está na ZARO" (título ou documento do Autopilot com a mesma chave). */
export async function notasFiltradas(db: Db, emp: Empresa, filtro: string | undefined, busca: string | undefined) {
  const f = FILTROS_NOTA.some(([k]) => k === filtro) ? filtro! : 'areceber';
  const naZaro = sql<boolean>`(exists (select 1 from ${schema.titulos} t where t.empresa_id = ${emp.id} and t.nf_chave = ${schema.notasSefaz.chave})
    or exists (select 1 from ${schema.documentosEntrada} d where d.empresa_id = ${emp.id} and d.chave = ${schema.notasSefaz.chave}))`;
  const todas = await db.select({ n: schema.notasSefaz, naZaro }).from(schema.notasSefaz).where(eq(schema.notasSefaz.empresaId, emp.id)).orderBy(desc(schema.notasSefaz.emissao), desc(schema.notasSefaz.numero));
  const q = (busca || '').toLowerCase().trim();
  const lista = todas.filter(({ n, naZaro: z }) => {
    const canc = notaCancelada(n.situacao);
    const ok = f === 'todas' ? true
      : f === 'canceladas' ? canc
        : f === 'lancadas' ? !!n.lancadoEm
          : f === 'alancar' ? (!!n.recebidoEm || ehSaida(n, emp)) && !n.lancadoEm && !canc
            : f === 'forazaro' ? !z && !canc
              : !n.recebidoEm && !canc && !ehSaida(n, emp);
    return ok && (!q || `${n.chave} ${n.numero} ${n.razaoEmit} ${n.razaoDest} ${n.cnpjEmit} ${n.pedido || ''} ${n.cfop}`.toLowerCase().includes(q));
  });
  const ativas = todas.filter((x) => !notaCancelada(x.n.situacao));
  return {
    f, q: (busca || '').trim(), lista, nomeFiltro: FILTROS_NOTA.find(([k]) => k === f)![1],
    resumo: {
      total: todas.length,
      aReceber: ativas.filter((x) => !x.n.recebidoEm && !ehSaida(x.n, emp)).length,
      aLancar: ativas.filter((x) => (x.n.recebidoEm || ehSaida(x.n, emp)) && !x.n.lancadoEm).length,
      foraZaro: ativas.filter((x) => !x.naZaro).length,
      canceladas: todas.length - ativas.length,
    },
  };
}
