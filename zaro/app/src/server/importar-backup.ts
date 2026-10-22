// Importa o backup do protótipo (o JSON que o navegador guardava em localStorage) para o banco.
// No protótipo, os dados da empresa ativa ficam no topo do JSON e os das outras empresas em
// "porEmp[idDaEmpresa]". Pode rodar mais de uma vez: o que já foi importado é pulado.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { arred, numero, soDigitos } from '@/domain/dinheiro';
import { auditar } from './auditoria';
import type { Usuario } from './auth';

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const POR_EMPRESA = ['novos', 'clNovos', 'foNovos', 'emprestimos', 'dpFunc', 'dpFolhas', 'cntSt', 'cntOv', 'cntEst', 'cntFech'];
// estados de tela e marcas de migração do protótipo: não são dados de negócio
const DESCARTAR = /Seed\d*$|^(pc|pp|cb|cm|sim|modos|porEmp|porEmpOk|periodo|cpCols)$|^(cancNF|subNF|retTeste|limpaTeste|cancMeta|emDelAym)/;

export interface ResumoImportacao {
  empresas: number;
  titulos: number;
  baixas: number;
  parceiros: number;
  extrato: number;
  imobilizado: number;
  contratos: number;
  funcionarios: number;
  dividas: number;
  decisoes: number;
  regras: number;
  auditoria: number;
  guardadosComoLegado: string[];
  avisos: string[];
}

export function normalizarBackup(bruto: unknown): J {
  let j = bruto as J;
  if (typeof j === 'string') j = JSON.parse(j);
  if (j && typeof j['contabilsas:dados:v1'] === 'string') j = JSON.parse(j['contabilsas:dados:v1']);
  if (j && j.dados && typeof j.dados === 'object' && !j.empresasList) j = j.dados;
  if (!j || typeof j !== 'object' || !Array.isArray(j.empresasList)) throw new Error('Este arquivo não parece um backup do ZARO (não tem a lista de empresas).');
  return j;
}

const isoDe = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const quandoDe = (v: unknown): Date => {
  const s = String(v ?? '');
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{2}):(\d{2}))?/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] || '12'}:${m[5] || '00'}:00-04:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
const txt = (v: unknown) => (v == null || v === '' ? null : String(v));

async function emLotes<T>(itens: T[], f: (lote: T[]) => Promise<unknown>, tam = 200) {
  for (let i = 0; i < itens.length; i += tam) await f(itens.slice(i, i + tam));
}

export async function importarBackup(db: Db, u: Usuario, bruto: unknown): Promise<ResumoImportacao> {
  const j = normalizarBackup(bruto);
  const r: ResumoImportacao = { empresas: 0, titulos: 0, baixas: 0, parceiros: 0, extrato: 0, imobilizado: 0, contratos: 0, funcionarios: 0, dividas: 0, decisoes: 0, regras: 0, auditoria: 0, guardadosComoLegado: [], avisos: [] };
  const T = u.tenantId;

  // empresas (filiais entram como empresas próprias, com o CNPJ delas)
  const mapaEmp = new Map<string, string>(); // id do protótipo → id no banco
  for (const e of j.empresasList as J[]) {
    const cnpj = soDigitos(e.cnpj);
    if (!cnpj) { r.avisos.push(`Empresa "${e.razao || e.fantasia || e.id}" sem CNPJ: não importada.`); continue; }
    const [ja] = await db.select().from(schema.empresas).where(and(eq(schema.empresas.tenantId, T), eq(schema.empresas.cnpj, cnpj)));
    const valores = {
      razao: e.razao || e.fantasia || cnpj, fantasia: txt(e.fantasia), regime: txt(e.regime), regimeHist: Array.isArray(e.regimeHist) ? e.regimeHist : [],
      ie: txt(e.ie), im: txt(e.im), cidade: txt(e.cidade), uf: txt(e.uf), cnae: txt(e.cnae), contador: txt(e.contador), crc: txt(e.crc), legadoId: String(e.id),
      dados: e as Record<string, unknown>,
    };
    if (ja) {
      await db.update(schema.empresas).set(valores).where(eq(schema.empresas.id, ja.id));
      mapaEmp.set(String(e.id), ja.id);
    } else {
      const [n] = await db.insert(schema.empresas).values({ tenantId: T, cnpj, ...valores }).returning();
      mapaEmp.set(String(e.id), n.id);
      r.empresas++;
    }
  }
  const empPadrao = mapaEmp.get(String(j.empAtiva)) || [...mapaEmp.values()][0];
  if (!empPadrao) throw new Error('Nenhuma empresa com CNPJ no backup.');

  // dados por empresa: topo do JSON = empresa ativa; porEmp = as outras
  const blocos: [string, J][] = [];
  if (j.empAtiva && mapaEmp.has(String(j.empAtiva))) blocos.push([mapaEmp.get(String(j.empAtiva))!, j]);
  for (const [idProt, bloco] of Object.entries((j.porEmp || {}) as Record<string, J>)) {
    const idDb = mapaEmp.get(idProt);
    if (idDb && bloco && idDb !== blocos[0]?.[0]) blocos.push([idDb, bloco]);
  }
  if (!blocos.length) blocos.push([empPadrao, j]);

  for (const [empresaId, b] of blocos) {
    const existentes = new Set((await db.select({ c: schema.titulos.codigo }).from(schema.titulos).where(eq(schema.titulos.empresaId, empresaId))).map((x) => x.c));

    // clientes e fornecedores
    const parcs: (typeof schema.parceiros.$inferInsert)[] = [];
    for (const [lista, tipo] of [[b.clNovos, 'cliente'], [b.foNovos, 'fornecedor']] as const) {
      for (const p of (lista || []) as J[]) {
        parcs.push({ tenantId: T, empresaId, tipo, doc: soDigitos(p.doc || p.cnpj) || null, razao: p.razao || p.nome || p.fantasia || 'Sem nome', fantasia: txt(p.fantasia), categoria: txt(p.categoria), origem: 'Backup do protótipo', dados: p });
      }
    }
    const parcExist = new Set((await db.select({ d: schema.parceiros.doc, t: schema.parceiros.tipo }).from(schema.parceiros).where(eq(schema.parceiros.empresaId, empresaId))).map((x) => `${x.t}|${x.d}`));
    const parcNovos = parcs.filter((p) => !p.doc || !parcExist.has(`${p.tipo}|${p.doc}`));
    await emLotes(parcNovos, (l) => db.insert(schema.parceiros).values(l));
    r.parceiros += parcNovos.length;

    // títulos e baixas
    const baixasPendentes: { codigo: string; data: string; valor: number }[] = [];
    const tits: (typeof schema.titulos.$inferInsert)[] = [];
    for (const n of (b.novos || []) as J[]) {
      const row = n.row as J;
      if (!row || !row.id) continue;
      const codigo = String(row.id);
      if (existentes.has(codigo)) continue;
      existentes.add(codigo);
      const tipo = /receb/i.test(n.tipo) ? 'receber' : 'pagar';
      const valor = arred(row.totalNum != null ? numero(row.totalNum) : row.valorNum != null ? numero(row.valorNum) : numero(row.valor));
      for (const p of (row.pagos || []) as J[]) {
        const data = isoDe(p.data);
        if (data && p.status !== 'Estornado' && numero(p.valor) > 0) baixasPendentes.push({ codigo, data, valor: numero(p.valor) });
      }
      tits.push({
        tenantId: T, empresaId, codigo, tipo, nome: row.nome || 'Sem nome', docParceiro: soDigitos(row.cliDoc || row.cnpjForn || row.emitCnpj) || null,
        descricao: txt(row.doc), nf: txt(row.nf), serie: txt(row.serie), nfChave: soDigitos(row.nfChave) || null, nfEmissao: isoDe(row.nfEmissao), competencia: txt(row.competencia)?.slice(0, 7) || null,
        parcela: txt(row.parc) || '1/1', venc: isoDe(row.vencIso || row.venc), valor, valorFiscal: row.valorFiscal != null ? numero(row.valorFiscal) : null,
        status: txt(row.status) || (tipo === 'receber' ? 'A receber' : 'A pagar'), retorno: !!row.retorno, impactaCaixa: row.impactaCaixa !== 'Não' && row.impactaCaixa !== false,
        natureza: txt(row.natureza), cfop: txt(row.cfop), categoria: txt(row.categoria), centro: txt(row.centro), contaContabil: txt(row.contaContabil),
        origem: row.origemFolha ? 'folha' : row.origemEmp || row.contrato ? 'emprestimo' : row.origemXml ? 'nf' : 'legado', folhaTipo: txt(row.folhaTipo), contrato: txt(row.contrato),
        juros: row.juros != null ? numero(row.juros) : null, impostos: Array.isArray(row.impostosNF) ? row.impostosNF.map((x: J) => ({ nome: String(x.nome), valor: numero(x.valor) })) : [],
        obs: txt(row.obs), legadoId: codigo,
        // anexos ficavam no navegador (IndexedDB); guardamos só os nomes
        dados: { ...row, anexos: Array.isArray(row.anexos) ? row.anexos.map((a: J) => ({ nome: a?.nome, tipo: a?.tipo })) : [] },
      });
    }
    await emLotes(tits, (l) => db.insert(schema.titulos).values(l));
    r.titulos += tits.length;
    if (baixasPendentes.length) {
      const ids = new Map((await db.select({ id: schema.titulos.id, c: schema.titulos.codigo }).from(schema.titulos).where(eq(schema.titulos.empresaId, empresaId))).map((x) => [x.c, x.id]));
      const linhas = baixasPendentes.filter((x) => ids.has(x.codigo)).map((x) => ({ tenantId: T, tituloId: ids.get(x.codigo)!, data: x.data, valor: arred(x.valor), forma: 'Importado' }));
      await emLotes(linhas, (l) => db.insert(schema.baixas).values(l));
      r.baixas += linhas.length;
    }

    // empréstimos e funcionários
    const ctrs = ((b.emprestimos || []) as J[]).filter((c) => numero(c.valorLib || c.valorContr) > 0 || c.contrato);
    const ctrExist = new Set((await db.select({ l: schema.contratosDivida.legadoId }).from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, empresaId))).map((x) => x.l));
    const ctrNovos = ctrs.filter((c) => !ctrExist.has(String(c.id))).map((c) => ({
      tenantId: T, empresaId, instituicao: c.inst || c.instituicao || '—', contrato: String(c.contrato || c.id), tipo: c.tipo || 'Empréstimo', natureza: /receb|conced/i.test(c.natureza || c.tipoOp || '') ? 'concedido' : 'recebido',
      valor: numero(c.valorLib || c.valorContr), taxa: c.taxa != null ? numero(c.taxa) : null, sistema: txt(c.sistema), parcelas: c.parcelas ? Number(c.parcelas) || null : null,
      dataContr: isoDe(c.dataContr), status: c.status || 'Ativo', dados: c, legadoId: String(c.id),
    }));
    await emLotes(ctrNovos, (l) => db.insert(schema.contratosDivida).values(l));
    r.contratos += ctrNovos.length;

    const funcExist = new Set((await db.select({ l: schema.funcionarios.legadoId }).from(schema.funcionarios).where(eq(schema.funcionarios.empresaId, empresaId))).map((x) => x.l));
    const funcs = ((b.dpFunc || []) as J[]).filter((f) => !funcExist.has(String(f.id || f.nome))).map((f) => ({
      tenantId: T, empresaId, nome: f.nome || 'Sem nome', cargo: txt(f.cargo), admissao: isoDe(f.admissao), salario: f.salario != null ? numero(f.salario) : null, ativo: !/demit|deslig|inativ/i.test(f.status || ''), dados: f, legadoId: String(f.id || f.nome),
    }));
    await emLotes(funcs, (l) => db.insert(schema.funcionarios).values(l));
    r.funcionarios += funcs.length;
    if (b.dpFolhas) await guardarLegado(db, T, `dpFolhas:${empresaId}`, b.dpFolhas);

    // decisões do contador sobre os lançamentos
    const decs = new Map<string, typeof schema.lancamentoDecisoes.$inferInsert>();
    const dec = (id: string) => decs.get(id) || { tenantId: T, empresaId, lancamentoId: id, usuario: 'Importado do protótipo' };
    for (const [id, st] of Object.entries((b.cntSt || {}) as Record<string, string>)) decs.set(id, { ...dec(id), status: st });
    for (const [id, conta] of Object.entries((b.cntOv || {}) as Record<string, string>)) decs.set(id, { ...dec(id), conta });
    for (const [id, e] of Object.entries((b.cntEst || {}) as Record<string, J>)) decs.set(id, { ...dec(id), status: 'Estornado', motivoEstorno: e?.motivo || '—', dataEstorno: isoDe(e?.data) });
    for (const d of decs.values()) {
      await db.insert(schema.lancamentoDecisoes).values(d).onConflictDoNothing();
      r.decisoes++;
    }
    if (b.cntFech) await guardarLegado(db, T, `cntFech:${empresaId}`, b.cntFech);

    // regras aprendidas valem para todas as empresas do protótipo
    for (const [chave, conta] of Object.entries((j.cntRegras || {}) as Record<string, string>)) {
      await db.insert(schema.regrasClassificacao).values({ tenantId: T, empresaId, chave, conta, usuario: 'Importado do protótipo' }).onConflictDoNothing();
      r.regras++;
    }
  }

  // dados com o id da empresa dentro de cada item
  const empDe = (x: J) => mapaEmp.get(String(x.emp || x.empresa || '')) || null;
  const extExist = new Set((await db.select({ l: schema.extratoMovimentos.legadoId }).from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.tenantId, T))).map((x) => x.l));
  const movs = ((j.bkTx || []) as J[]).filter((t) => empDe(t) && isoDe(t.data) && !extExist.has(String(t.id))).map((t) => ({
    tenantId: T, empresaId: empDe(t)!, conta: t.conta || 'Banco', data: isoDe(t.data)!, valor: arred(numero(t.valor)), memo: String(t.memo || ''), fitid: txt(t.fitid), arquivo: txt(t.arq), legadoId: String(t.id),
  }));
  await emLotes(movs, (l) => db.insert(schema.extratoMovimentos).values(l), 500);
  r.extrato = movs.length;

  const imbExist = new Set((await db.select({ l: schema.imobilizado.legadoId }).from(schema.imobilizado).where(eq(schema.imobilizado.tenantId, T))).map((x) => x.l));
  const imbs = ((j.imob || []) as J[]).filter((a) => empDe(a) && numero(a.valor) > 0 && isoDe(a.data) && !imbExist.has(String(a.id))).map((a) => ({
    tenantId: T, empresaId: empDe(a)!, descricao: a.desc || a.descricao || 'Bem', qtd: Number(a.qtd) || 1, valor: numero(a.valor), data: isoDe(a.data)!, taxa: numero(a.taxa) || 10,
    residual: numero(a.residual), origem: /abertura/i.test(a.origem || '') ? 'abertura' : 'compra', nf: txt(a.nf), legadoId: String(a.id),
  }));
  await emLotes(imbs, (l) => db.insert(schema.imobilizado).values(l));
  r.imobilizado = imbs.length;

  const divs = ((j.cfEcac || []) as J[]).filter((x) => empDe(x) && x.inscricao).map((x) => ({
    tenantId: T, empresaId: empDe(x)!, inscricao: String(x.inscricao), natureza: txt(x.natureza), situacao: txt(x.situacao), valor: x.valor != null ? numero(x.valor) : null, atualizadoEm: isoDe(x.atualizadoEm), dados: x,
  }));
  if (divs.length) {
    const jaDiv = new Set((await db.select({ i: schema.dividasAtivas.inscricao, e: schema.dividasAtivas.empresaId }).from(schema.dividasAtivas).where(eq(schema.dividasAtivas.tenantId, T))).map((x) => `${x.e}|${x.i}`));
    const novas = divs.filter((d) => !jaDiv.has(`${d.empresaId}|${d.inscricao}`));
    await emLotes(novas, (l) => db.insert(schema.dividasAtivas).values(l));
    r.dividas = novas.length;
  }

  const aud = ((j.auditExtra || []) as J[]).map((a) => ({
    tenantId: T, usuario: String(a.usuario || 'Protótipo'), quando: quandoDe(a.quando), acao: String(a.acao || '—'), entidade: txt(a.entidade || a.alvo), antes: txt(a.antes), depois: txt(a.depois), justificativa: txt(a.just || a.detalhe),
  }));
  const [jaAud] = await db.select({ id: schema.auditoria.id }).from(schema.auditoria).where(and(eq(schema.auditoria.tenantId, T), eq(schema.auditoria.justificativa, 'importado-do-prototipo-marcador')));
  if (!jaAud && aud.length) {
    await emLotes(aud, (l) => db.insert(schema.auditoria).values(l), 500);
    await db.insert(schema.auditoria).values({ tenantId: T, usuario: 'Sistema', acao: 'Histórico do protótipo importado', justificativa: 'importado-do-prototipo-marcador' });
    r.auditoria = aud.length;
  }

  // o resto fica guardado, sem tela própria ainda
  const tratados = new Set(['empresasList', 'empAtiva', 'porEmp', 'bkTx', 'imob', 'cfEcac', 'auditExtra', 'cntRegras', ...POR_EMPRESA]);
  for (const [k, v] of Object.entries(j)) {
    if (tratados.has(k) || DESCARTAR.test(k) || v == null) continue;
    await guardarLegado(db, T, k, v);
    r.guardadosComoLegado.push(k);
  }

  await auditar(db, u, { acao: 'Importou backup do protótipo', depois: `${r.empresas} empresa(s) nova(s), ${r.titulos} título(s), ${r.extrato} movimento(s) de extrato` });
  return r;
}

async function guardarLegado(db: Db, tenantId: string, chave: string, valor: unknown) {
  await db.insert(schema.legado).values({ tenantId, chave, valor }).onConflictDoUpdate({ target: [schema.legado.tenantId, schema.legado.chave], set: { valor, importadoEm: new Date() } });
}
