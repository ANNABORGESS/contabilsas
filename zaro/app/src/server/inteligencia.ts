// Inteligência Financeira: dados das cinco abas (Executivo, Caixa, Inadimplência, Pagamentos,
// Orçamento). Toda consulta filtra pela empresa ativa, já conferida contra o escritório do usuário.
import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { addDias, arred, brl, dataBr, soDigitos } from '@/domain/dinheiro';
import { composicao100, duplicidades, foraDoPadrao, inadimplencia, LIMITES_PADRAO, projecaoCaixa, resultadoGerencial, ritmoAnual, semaforo, STATUS_COBRANCA, totaisGerenciais, type Limites, type TituloPagar } from '@/domain/inteligencia';
import { STATUS_NO_LIVRO } from '@/domain/motor';
import type { DadosDocumento } from './autopilot';
import { ehTributo, mesesAte } from '@/domain/painel';
import { auditar } from './auditoria';
import type { Empresa, Usuario } from './auth';
import { saldoBancario } from './banco';
import { lancamentosDaEmpresa } from './contabil';
import { ehAberto } from './consultas';

const compBr = (c: string) => c.split('-').reverse().join('/');
const dias = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 864e5);

// ---------------------------------------------------------------- configurações por empresa

async function lerConfig<T>(db: Db, tenantId: string, chave: string): Promise<T | null> {
  const [r] = await db.select().from(schema.configuracoes).where(and(eq(schema.configuracoes.tenantId, tenantId), eq(schema.configuracoes.chave, chave)));
  return (r?.valor as T) ?? null;
}
async function gravarConfig(db: Db, tenantId: string, chave: string, valor: unknown) {
  await db.insert(schema.configuracoes).values({ tenantId, chave, valor }).onConflictDoUpdate({ target: [schema.configuracoes.tenantId, schema.configuracoes.chave], set: { valor, atualizadoEm: new Date() } });
}

export async function definirCaixaMinimo(db: Db, u: Usuario, emp: Empresa, valor: number) {
  await gravarConfig(db, u.tenantId, `caixaMinimo:${emp.id}`, arred(Math.max(0, valor)));
  await auditar(db, u, { empresaId: emp.id, acao: 'Definiu caixa mínimo', depois: brl(valor) });
}

export async function definirLimitesOrcamento(db: Db, u: Usuario, emp: Empresa, l: Limites) {
  if (!(l.verde > 0 && l.amarelo >= l.verde)) throw new Error('O limite amarelo precisa ser maior ou igual ao verde.');
  await gravarConfig(db, u.tenantId, `orcamentoLimites:${emp.id}`, l);
  await auditar(db, u, { empresaId: emp.id, acao: 'Definiu limites do orçamento', depois: `verde até ${l.verde}% · amarelo até ${l.amarelo}%` });
}

// ---------------------------------------------------------------- carteira (títulos com saldo)

async function carteira(db: Db, emp: Empresa) {
  const [titulos, baixas] = await Promise.all([
    db.select().from(schema.titulos).where(eq(schema.titulos.empresaId, emp.id)),
    db
      .select({ tituloId: schema.baixas.tituloId, data: schema.baixas.data, valor: schema.baixas.valor })
      .from(schema.baixas)
      .innerJoin(schema.titulos, eq(schema.titulos.id, schema.baixas.tituloId))
      .where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.baixas.estornada, false))),
  ]);
  const bx = new Map<string, { data: string; valor: number }[]>();
  for (const b of baixas) bx.set(b.tituloId, [...(bx.get(b.tituloId) || []), b]);
  const validos = titulos.filter((t) => !t.retorno && !/cancel/i.test(t.status));
  const comSaldo = validos.map((t) => {
    const pago = (bx.get(t.id) || []).reduce((a, b) => a + b.valor, 0);
    return { t, baixas: bx.get(t.id) || [], saldo: ehAberto(t) ? Math.max(0, arred(t.valor - pago)) : 0 };
  });
  return { titulos, validos, comSaldo, abertos: comSaldo.filter((x) => x.saldo > 0.004) };
}
type ItemCarteira = Awaited<ReturnType<typeof carteira>>['abertos'][number];

// ---------------------------------------------------------------- 01 Executivo

export async function dadosExecutivo(db: Db, emp: Empresa, ref: string, periodo: 'mes' | 'ano', detalhe: 'centro' | 'categoria', previa: boolean) {
  const [lancs, cart, imob] = await Promise.all([
    lancamentosDaEmpresa(db, emp),
    carteira(db, emp),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.imobilizado).where(eq(schema.imobilizado.empresaId, emp.id)),
  ]);
  const deTitulo = new Map(cart.titulos.map((t) => [t.id, t]));
  const unidade = (origemId: string) => {
    const t = deTitulo.get(origemId);
    return (detalhe === 'centro' ? t?.centro : t?.categoria) || 'Sem classificação';
  };
  const meses = mesesAte(ref, 12);
  const anoRef = ref.slice(0, 4);
  const noPeriodo = (c: string, r = ref) => (periodo === 'mes' ? c === r : c >= `${r.slice(0, 4)}-01` && c <= r);
  const anterior = periodo === 'mes' ? mesesAte(ref, 2)[0] : `${Number(anoRef) - 1}${ref.slice(4)}`;
  const tot = totaisGerenciais(lancs, (l) => noPeriodo(l.comp), previa);
  const totAnt = totaisGerenciais(lancs, (l) => noPeriodo(l.comp, anterior), previa);
  const temAnt = lancs.some((l) => noPeriodo(l.comp, anterior));
  const mensal = meses.map((m) => {
    const t = totaisGerenciais(lancs, (l) => l.comp === m, previa);
    return { mes: m, ...t, ...resultadoGerencial(t) };
  });
  const unidades = new Map<string, ReturnType<typeof totaisGerenciais>>();
  const nomes = new Set(lancs.filter((l) => noPeriodo(l.comp)).map((l) => unidade(l.origemId)));
  for (const n of nomes) unidades.set(n, totaisGerenciais(lancs, (l) => noPeriodo(l.comp) && unidade(l.origemId) === n, previa));
  const porUnidade = [...unidades].map(([nome, t]) => {
    const r = resultadoGerencial(t);
    return { nome, faturamento: t.faturamento, custos: arred(t.custo + t.deducoes), despesas: arred(t.pessoal + t.operacionais + t.tributosLucro + t.depreciacao + t.financeiras), lucro: r.lucro, margem: r.margem };
  }).filter((x) => x.faturamento || x.custos || x.despesas).sort((a, b) => b.lucro - a.lucro);
  const pendentes = lancs.filter((l) => noPeriodo(l.comp) && !STATUS_NO_LIVRO.includes(l.status)).length;
  const faltas: string[] = [];
  if (!tot.depreciacao && !imob[0].n) faltas.push('depreciação: nenhum bem cadastrado no imobilizado');
  if (!tot.tributosLucro) faltas.push('IRPJ/CSLL: nenhuma guia identificada no período (identificação pelo histórico do lançamento)');
  if (!previa && pendentes) faltas.push(`${pendentes} lançamento(s) sem aprovação ficaram de fora (ligue a prévia para incluir)`);
  // maiores despesas do período (por conta), para explicar a margem
  const despesas = new Map<string, number>();
  for (const l of lancs) if (noPeriodo(l.comp) && (previa || STATUS_NO_LIVRO.includes(l.status)) && l.deb.startsWith('4')) despesas.set(l.deb, arred((despesas.get(l.deb) || 0) + l.valor));
  return {
    ref, periodo, anterior, detalhe, previa, pendentes,
    atual: { ...tot, ...resultadoGerencial(tot) },
    antes: temAnt ? { ...totAnt, ...resultadoGerencial(totAnt) } : null,
    mensal, composicao: composicao100(tot), porUnidade,
    ebitdaConfiavel: faltas.length === 0, faltas,
    maioresDespesas: [...despesas].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([conta, valor]) => ({ conta, valor })),
    vazio: !lancs.length,
    tituloPeriodo: periodo === 'mes' ? compBr(ref) : `jan a ${compBr(ref)}`,
  };
}

// ---------------------------------------------------------------- 02 Caixa

export async function dadosCaixa(db: Db, u: Usuario, emp: Empresa, hoje: string) {
  const [cart, banco, contas, minimo, lancs, contratos, porConta] = await Promise.all([
    carteira(db, emp),
    saldoBancario(db, u.tenantId, emp.id),
    db
      .select({ conta: schema.extratoMovimentos.conta, n: sql<number>`count(*)::int`, ultimo: sql<string>`max(${schema.extratoMovimentos.data})::text`, soma: sql<string>`sum(${schema.extratoMovimentos.valor})` })
      .from(schema.extratoMovimentos)
      .where(eq(schema.extratoMovimentos.empresaId, emp.id))
      .groupBy(schema.extratoMovimentos.conta),
    lerConfig<number>(db, u.tenantId, `caixaMinimo:${emp.id}`),
    lancamentosDaEmpresa(db, emp),
    db.select().from(schema.contratosDivida).where(eq(schema.contratosDivida.empresaId, emp.id)),
    lerConfig<Record<string, { data: string; valor: number }>>(db, u.tenantId, `saldoConta:${emp.id}`),
  ]);
  // conciliação: movimentos do extrato cujo lançamento já está aprovado no livro
  const movLanc = new Map<string, boolean>();
  for (const l of lancs) if (l.id.startsWith('BKX|')) movLanc.set(l.origemId, STATUS_NO_LIVRO.includes(l.status));
  const movs = await db.select({ id: schema.extratoMovimentos.id, conta: schema.extratoMovimentos.conta, data: schema.extratoMovimentos.data, valor: schema.extratoMovimentos.valor }).from(schema.extratoMovimentos).where(eq(schema.extratoMovimentos.empresaId, emp.id));
  const bancos = contas.map((c) => {
    const daConta = movs.filter((m) => m.conta === c.conta);
    const conciliados = daConta.filter((m) => movLanc.get(m.id)).length;
    const ini = porConta?.[c.conta];
    const saldo = ini ? arred(ini.valor + daConta.filter((m) => m.data > ini.data).reduce((a, m) => a + m.valor, 0)) : null;
    return { conta: c.conta, movimentos: c.n, ultimo: c.ultimo, saldo, conciliados, pendentes: c.n - conciliados };
  });
  const itens = cart.abertos.filter((x) => x.t.impactaCaixa).map((x) => ({ id: x.t.id, venc: x.t.venc, saldo: x.saldo, tipo: x.t.tipo as 'receber' | 'pagar', vencido: !!x.t.venc && x.t.venc < hoje }));
  const saldoIni = banco?.atual ?? 0;
  const base = projecaoCaixa(saldoIni, itens, hoje, 90, {}, minimo || 0);
  const ate90 = addDias(hoje, 89);
  const categoria = (x: ItemCarteira) => (x.t.origem === 'folha' || x.t.folhaTipo ? 'Folha' : ehTributo(x.t) ? 'Tributo' : x.t.contrato || x.t.origem === 'emprestimo' ? 'Empréstimo' : x.t.categoria || 'Fornecedor');
  const situacao = (x: ItemCarteira) => {
    const p = (x.t.dados as { pagamento?: { etapa?: string } })?.pagamento;
    return x.t.venc && x.t.venc < hoje ? 'Vencido' : p?.etapa || 'A vencer';
  };
  const pagar90 = cart.abertos.filter((x) => x.t.tipo === 'pagar' && x.t.venc && x.t.venc <= ate90);
  const receber90 = cart.abertos.filter((x) => x.t.tipo === 'receber' && x.t.venc && x.t.venc >= hoje && x.t.venc <= ate90);
  const folha30 = arred(cart.abertos.filter((x) => x.t.tipo === 'pagar' && categoria(x) === 'Folha' && x.t.venc && x.t.venc <= addDias(hoje, 29)).reduce((a, x) => a + x.saldo, 0));
  return {
    hoje, banco, bancos, minimo: minimo || 0, itens,
    temSaldo: !!banco,
    saldoInicial: saldoIni,
    receber90: arred(receber90.reduce((a, x) => a + x.saldo, 0)), nReceber90: receber90.length,
    pagar90: arred(pagar90.reduce((a, x) => a + x.saldo, 0)), nPagar90: pagar90.length,
    receberVencido: arred(itens.filter((i) => i.tipo === 'receber' && i.vencido).reduce((a, i) => a + i.saldo, 0)),
    menor: base.menor, negativo: base.negativo, abaixoDoMinimo: base.abaixoDoMinimo,
    folha30,
    emprestimosAtivos: arred(contratos.filter((c) => !/cancel|quitad/i.test(c.status)).reduce((a, c) => a + c.valor, 0)),
    maioresSaidas: [...pagar90].sort((a, b) => b.saldo - a.saldo).slice(0, 15).map((x) => ({ id: x.t.id, codigo: x.t.codigo, data: x.t.venc!, descricao: x.t.descricao || x.t.nf ? `${x.t.descricao || ''}${x.t.nf ? ` NF ${x.t.nf}` : ''}`.trim() : x.t.codigo, favorecido: x.t.nome, categoria: categoria(x), valor: x.saldo, situacao: situacao(x) })),
  };
}

export async function definirSaldoConta(db: Db, u: Usuario, emp: Empresa, conta: string, data: string, valor: number) {
  if (!conta.trim()) throw new Error('Escolha a conta.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do saldo.');
  const atual = (await lerConfig<Record<string, { data: string; valor: number }>>(db, u.tenantId, `saldoConta:${emp.id}`)) || {};
  atual[conta] = { data, valor: arred(valor) };
  await gravarConfig(db, u.tenantId, `saldoConta:${emp.id}`, atual);
  await auditar(db, u, { empresaId: emp.id, acao: 'Informou saldo inicial da conta bancária', entidade: conta, depois: `${dataBr(data)} ${brl(valor)}` });
}

// ---------------------------------------------------------------- 03 Inadimplência

const chaveCliente = (doc: string | null, nome: string) => (soDigitos(doc) || nome).toLowerCase().trim();

export async function dadosInadimplencia(db: Db, u: Usuario, emp: Empresa, hoje: string) {
  const [cart, cobr, parceiros, snaps] = await Promise.all([
    carteira(db, emp),
    db.select().from(schema.cobrancas).where(eq(schema.cobrancas.empresaId, emp.id)).orderBy(desc(schema.cobrancas.criadoEm)),
    db.select().from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, 'cliente'))),
    lerConfig<Record<string, { vencido: number; aberto: number; taxa: number | null; em: string }>>(db, u.tenantId, `inadimplencia:${emp.id}`),
  ]);
  const receber = cart.abertos.filter((x) => x.t.tipo === 'receber');
  const r = inadimplencia(receber.map((x) => ({ id: x.t.id, cliente: x.t.nome, doc: soDigitos(x.t.docParceiro) || null, venc: x.t.venc, saldo: x.saldo })), hoje);
  // snapshot do mês (o último valor do mês fica): o histórico não é reconstruído a partir da carteira atual
  const mes = hoje.slice(0, 7);
  const hist = { ...(snaps || {}) };
  if (!hist[mes] || hist[mes].em !== hoje) {
    hist[mes] = { vencido: r.totalVencido, aberto: r.totalAberto, taxa: r.taxa, em: hoje };
    await gravarConfig(db, u.tenantId, `inadimplencia:${emp.id}`, hist);
  }
  const ultimo = new Map<string, (typeof cobr)[number]>();
  for (const c of cobr) if (!ultimo.has(c.cliente)) ultimo.set(c.cliente, c);
  const contato = (chave: string) => {
    const p = parceiros.find((x) => chaveCliente(x.doc, x.razao) === chave);
    const d = (p?.dados || {}) as Record<string, unknown>;
    const txt = (k: string[]) => k.map((x) => d[x]).find((v) => typeof v === 'string' && v.trim()) as string | undefined;
    return { email: txt(['email', 'eMail', 'e_mail']), telefone: txt(['telefone', 'fone', 'celular', 'whatsapp']) };
  };
  // atraso recorrente: títulos já quitados que foram pagos depois do vencimento
  const atrasosPagos = new Map<string, number>();
  for (const x of cart.comSaldo) {
    if (x.t.tipo !== 'receber' || x.saldo > 0 || !x.t.venc || !x.baixas.length) continue;
    const ult = x.baixas.reduce((a, b) => (b.data > a ? b.data : a), '');
    if (ult > x.t.venc) atrasosPagos.set(chaveCliente(x.t.docParceiro, x.t.nome), (atrasosPagos.get(chaveCliente(x.t.docParceiro, x.t.nome)) || 0) + 1);
  }
  const ranking = r.ranking.map((c) => {
    const ult = ultimo.get(c.chave);
    const status = ult?.status || STATUS_COBRANCA[0];
    const promessaVencida = ult?.dataPrometida && ult.dataPrometida < hoje && /Promessa|Acordo/.test(status);
    const proxima = promessaVencida ? 'Promessa venceu: retomar contato' : status === 'Ainda não contatado' ? 'Fazer o primeiro contato' : status === 'Promessa de pagamento' ? `Conferir pagamento em ${dataBr(ult!.dataPrometida)}` : status === 'Acordo registrado' ? 'Acompanhar parcelas do acordo' : status === 'Revisão necessária' ? 'Revisar o título antes de cobrar' : 'Registrar retorno do contato';
    return { ...c, status: promessaVencida ? 'Revisão necessária' : status, ultimoContato: ult ? ult.criadoEm.toISOString() : null, proxima, recorrente: atrasosPagos.get(c.chave) || 0, ...contato(c.chave) };
  });
  const devedores = new Set(r.ranking.map((c) => c.chave));
  const ate90 = addDias(hoje, 89);
  const previsto90 = receber.filter((x) => x.t.venc && x.t.venc >= hoje && x.t.venc <= ate90);
  const deAtrasados = arred(previsto90.filter((x) => devedores.has(chaveCliente(x.t.docParceiro, x.t.nome))).reduce((a, x) => a + x.saldo, 0));
  const meses = mesesAte(mes, 12);
  return {
    ...r, ranking,
    historico: meses.map((m) => ({ mes: m, ...(hist[m] || { vencido: null, aberto: null, taxa: null, em: null }) })),
    impacto: { previsto90: arred(previsto90.reduce((a, x) => a + x.saldo, 0)), deAtrasados, cenarios: [0, 25, 50, 100].map((p) => ({ pct: p, valor: arred((r.totalVencido * p) / 100) })) },
    cobrancas: cobr.slice(0, 30).map((c) => ({ ...c, criadoEm: c.criadoEm.toISOString() })),
  };
}

export async function registrarCobranca(db: Db, u: Usuario, emp: Empresa, v: { cliente: string; nomeCliente: string; tipo: string; status: string; canal: string; valor: number | null; dataPrometida: string | null; obs: string }) {
  if (!STATUS_COBRANCA.includes(v.status as (typeof STATUS_COBRANCA)[number])) throw new Error('Status de cobrança inválido.');
  if (!v.cliente.trim()) throw new Error('Cliente não informado.');
  // o cliente precisa ter título a receber nesta empresa (não registra cobrança de outra empresa)
  const tit = await db.select({ doc: schema.titulos.docParceiro, nome: schema.titulos.nome }).from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'receber')));
  if (!tit.some((t) => chaveCliente(t.doc, t.nome) === v.cliente)) throw new Error('Este cliente não tem títulos nesta empresa.');
  if (/Promessa/.test(v.status) && !v.dataPrometida) throw new Error('Informe a data prometida.');
  await db.insert(schema.cobrancas).values({ tenantId: u.tenantId, empresaId: emp.id, cliente: v.cliente, nomeCliente: v.nomeCliente, tipo: v.tipo || 'Contato', status: v.status, canal: v.canal || null, valor: v.valor, dataPrometida: v.dataPrometida || null, obs: v.obs || null, usuario: u.nome });
  await auditar(db, u, { empresaId: emp.id, acao: 'Registrou cobrança', entidade: v.nomeCliente, depois: `${v.status}${v.dataPrometida ? ` · promessa ${dataBr(v.dataPrometida)}` : ''}` });
}

// ---------------------------------------------------------------- 04 Pagamentos

export const FILTROS_PAGAMENTO = [['abertos', 'Em aberto'], ['hoje', 'Vencendo hoje'], ['semana', 'Próximos 7 dias'], ['vencidos', 'Vencidos'], ['programados', 'Programados'], ['revisao', 'Com alerta']] as const;

export async function dadosPagamentos(db: Db, emp: Empresa, hoje: string, filtro: string, busca: string) {
  const [cart, docs, lancs, sefaz, fornecedores] = await Promise.all([
    carteira(db, emp),
    db.select().from(schema.documentosEntrada).where(and(eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.status, 'Novo'))).orderBy(asc(schema.documentosEntrada.criadoEm)),
    lancamentosDaEmpresa(db, emp),
    db.select({ chave: schema.notasSefaz.chave, pedido: schema.notasSefaz.pedido }).from(schema.notasSefaz).where(eq(schema.notasSefaz.empresaId, emp.id)),
    db.select({ doc: schema.parceiros.doc }).from(schema.parceiros).where(and(eq(schema.parceiros.empresaId, emp.id), eq(schema.parceiros.tipo, 'fornecedor'))),
  ]);
  const pagar = cart.comSaldo.filter((x) => x.t.tipo === 'pagar');
  const lista: TituloPagar[] = pagar.map((x) => ({ id: x.t.id, codigo: x.t.codigo, nome: x.t.nome, doc: soDigitos(x.t.docParceiro) || null, nf: x.t.nf, valor: x.t.valor, venc: x.t.venc, aberto: x.saldo > 0 }));
  const dups = duplicidades(lista);
  const pedidoDe = new Map(sefaz.map((n) => [n.chave, n.pedido]));
  const conciliados = new Set(lancs.map((l) => l.tituloBaixado).filter(Boolean));
  const contabilizado = new Set(lancs.filter((l) => l.id.endsWith('|pag') && STATUS_NO_LIVRO.includes(l.status)).map((l) => l.origemId));
  const etapa = (x: (typeof pagar)[number]) => {
    const p = (x.t.dados as { pagamento?: { etapa?: string; agendadoPara?: string } })?.pagamento;
    if (x.saldo <= 0) return contabilizado.has(x.t.id) ? 'Contabilizado' : conciliados.has(x.t.id) ? 'Conciliado' : 'Pago';
    return p?.etapa === 'Agendado' ? 'Agendado' : p?.etapa === 'Aprovado' ? 'Aprovado' : 'Título preparado';
  };
  const alertas = (x: (typeof pagar)[number]) => {
    const a: string[] = [];
    const d = dups.find((y) => y.a.id === x.t.id || y.b.id === x.t.id);
    if (d) a.push(`Possível duplicidade com ${d.a.id === x.t.id ? d.b.codigo : d.a.codigo} (${d.motivo})`);
    const fp = foraDoPadrao(lista.find((l) => l.id === x.t.id)!, lista);
    if (fp) a.push(`Valor acima do padrão do fornecedor (mediana ${brl(fp.mediana)})`);
    if (x.t.juros) a.push(`Inclui juros de ${brl(x.t.juros)}`);
    if (x.t.nfChave && pedidoDe.has(x.t.nfChave) && !pedidoDe.get(x.t.nfChave)) a.push('NF sem pedido de compra vinculado');
    if (x.t.vencEstimado) a.push('Vencimento estimado: confirme no boleto');
    return a;
  };
  const abertos = pagar.filter((x) => x.saldo > 0);
  const ate7 = addDias(hoje, 6);
  const linhas = pagar.map((x) => ({
    id: x.t.id, codigo: x.t.codigo, fornecedor: x.t.nome, documento: x.t.nf ? `NF ${x.t.nf}${x.t.serie ? `-${x.t.serie}` : ''}` : x.t.codigo, emissao: x.t.nfEmissao, venc: x.t.venc,
    valor: x.saldo > 0 ? x.saldo : x.t.valor, aberto: x.saldo > 0, etapa: etapa(x), origem: x.t.origem === 'nf' ? 'XML / Autopilot' : x.t.origem === 'folha' ? 'Folha' : x.t.origem === 'emprestimo' ? 'Empréstimo' : x.t.origem === 'legado' ? 'Importação' : 'Manual',
    agendadoPara: (x.t.dados as { pagamento?: { agendadoPara?: string } })?.pagamento?.agendadoPara || null, alertas: alertas(x),
  }));
  const f = FILTROS_PAGAMENTO.some(([k]) => k === filtro) ? filtro : 'abertos';
  const q = busca.toLowerCase().trim();
  const filtradas = linhas.filter((l) => {
    const ok = f === 'hoje' ? l.aberto && l.venc === hoje : f === 'semana' ? l.aberto && !!l.venc && l.venc >= hoje && l.venc <= ate7 : f === 'vencidos' ? l.aberto && !!l.venc && l.venc < hoje : f === 'programados' ? l.etapa === 'Agendado' : f === 'revisao' ? l.aberto && l.alertas.length > 0 : l.aberto;
    return ok && (!q || `${l.codigo} ${l.fornecedor} ${l.documento}`.toLowerCase().includes(q));
  }).sort((a, b) => (a.venc || '9999').localeCompare(b.venc || '9999'));
  const fornDocs = new Set(fornecedores.map((x) => soDigitos(x.doc)).filter(Boolean));
  const conferencia = docs.map((d) => {
    const dd = d.dados as DadosDocumento;
    const n = dd.nota?.dados;
    const tit = dd.titulos || [];
    const checks = [
      { item: 'Empresa destinatária', ok: dd.direcao === 'entrada' || dd.direcao === 'saida', detalhe: dd.direcao === 'terceiros' ? 'A empresa ativa não é emitente nem destinatária' : dd.direcao === 'saida' ? 'NF de saída (vai para Contas a Receber)' : 'Empresa ativa é a destinatária' },
      { item: 'Fornecedor cadastrado', ok: !n || dd.direcao !== 'entrada' || fornDocs.has(soDigitos(n.emitCnpj)), detalhe: n ? `${n.emitNome} (${n.emitCnpj})` : '—' },
      { item: 'Documento fiscal', ok: !!n?.chave, detalhe: n?.chave ? `Chave ${n.chave.slice(0, 6)}…${n.chave.slice(-6)}` : 'Sem chave de acesso' },
      { item: 'Título já existente', ok: !cart.titulos.some((t) => t.nfChave && t.nfChave === n?.chave), detalhe: 'Nenhum título com a mesma chave' },
      { item: 'Duplicidade por valor', ok: !n || !cart.titulos.some((t) => t.tipo === 'pagar' && soDigitos(t.docParceiro) === soDigitos(n.emitCnpj) && t.nf === n.numero), detalhe: n ? `NF ${n.numero} de ${n.emitNome}` : '—' },
      { item: 'Pedido de compra', ok: !n || !!n.pedido || !!(n.chave && pedidoDe.get(n.chave)), detalhe: n?.pedido || (n?.chave && pedidoDe.get(n.chave)) || 'Sem pedido na NF nem na lista da SEFAZ' },
      { item: 'Valor e vencimento', ok: !!n && n.vNF > 0 && tit.every((t) => !!t.venc), detalhe: n ? `${brl(n.vNF)} · ${tit.length} parcela(s)${tit.some((t) => !t.venc) ? ' · vencimento ausente' : ''}` : '—' },
    ];
    return { id: d.id, tipo: d.tipo, arquivo: d.nomeArquivo, fornecedor: n?.emitNome || '—', numero: n?.numero || '—', valor: d.valor || 0, confianca: d.confianca, canal: d.canal, criadoEm: d.criadoEm.toISOString(), checks, divergencias: checks.filter((c) => !c.ok).length };
  });
  const soma = (l: typeof linhas) => arred(l.reduce((a, x) => a + x.valor, 0));
  const ab = linhas.filter((l) => l.aberto);
  return {
    f, q: busca, linhas: filtradas, conferencia,
    resumo: {
      aberto: soma(ab), nAberto: ab.length,
      hoje: soma(ab.filter((l) => l.venc === hoje)), nHoje: ab.filter((l) => l.venc === hoje).length,
      semana: soma(ab.filter((l) => l.venc && l.venc >= hoje && l.venc <= ate7)), nSemana: ab.filter((l) => l.venc && l.venc >= hoje && l.venc <= ate7).length,
      vencidos: soma(ab.filter((l) => l.venc && l.venc < hoje)), nVencidos: ab.filter((l) => l.venc && l.venc < hoje).length,
      programados: soma(ab.filter((l) => l.etapa === 'Agendado')), nProgramados: ab.filter((l) => l.etapa === 'Agendado').length,
      aguardando: docs.length,
    },
    duplicidades: dups.length, comAlerta: ab.filter((l) => l.alertas.length).length,
    porEtapa: ['Título preparado', 'Aprovado', 'Agendado', 'Pago', 'Conciliado', 'Contabilizado'].map((e) => ({ etapa: e, n: linhas.filter((l) => l.etapa === e).length })),
    // títulos abertos para conferir boleto (valor e vencimento)
    paraBoleto: ab.map((l) => ({ codigo: l.codigo, fornecedor: l.fornecedor, valor: l.valor, venc: l.venc })),
  };
}

/** Etapas do fluxo de aprovação. Aprovar ou agendar NÃO executa pagamento no banco. */
export async function moverPagamento(db: Db, u: Usuario, emp: Empresa, ids: string[], acao: 'aprovar' | 'agendar' | 'voltar', data?: string) {
  if (!ids.length) throw new Error('Selecione ao menos um título.');
  if (acao === 'agendar' && !/^\d{4}-\d{2}-\d{2}$/.test(data || '')) throw new Error('Informe a data do agendamento.');
  const tits = await db.select().from(schema.titulos).where(and(eq(schema.titulos.empresaId, emp.id), eq(schema.titulos.tipo, 'pagar'), inArray(schema.titulos.id, ids)));
  if (tits.length !== new Set(ids).size) throw new Error('Algum título não pertence a esta empresa.');
  for (const t of tits) {
    if (!ehAberto(t)) throw new Error(`${t.codigo} já está quitado ou cancelado.`);
    const p = ((t.dados as { pagamento?: Record<string, unknown> })?.pagamento || {}) as Record<string, unknown>;
    if (acao === 'agendar' && p.etapa !== 'Aprovado' && p.etapa !== 'Agendado') throw new Error(`${t.codigo} precisa ser aprovado antes de agendar.`);
    const novo = acao === 'voltar' ? {} : acao === 'aprovar' ? { etapa: 'Aprovado', aprovadoPor: u.nome, aprovadoEm: new Date().toISOString() } : { ...p, etapa: 'Agendado', agendadoPara: data, agendadoPor: u.nome };
    await db.update(schema.titulos).set({ dados: { ...(t.dados || {}), pagamento: novo } }).where(and(eq(schema.titulos.id, t.id), eq(schema.titulos.empresaId, emp.id)));
    await auditar(db, u, { empresaId: emp.id, acao: acao === 'aprovar' ? 'Aprovou pagamento' : acao === 'agendar' ? 'Agendou pagamento' : 'Voltou pagamento para preparação', entidade: t.codigo, antes: String(p.etapa || 'Título preparado'), depois: acao === 'agendar' ? `Agendado para ${dataBr(data)}` : String(novo.etapa || 'Título preparado') });
  }
  return tits.length;
}

// ---------------------------------------------------------------- 05 Orçamento

export type Versao = typeof schema.orcamentos.$inferSelect;

export async function versoesOrcamento(db: Db, emp: Empresa, ano: number) {
  return db.select().from(schema.orcamentos).where(and(eq(schema.orcamentos.empresaId, emp.id), eq(schema.orcamentos.ano, ano))).orderBy(asc(schema.orcamentos.criadoEm));
}

async function versaoDaEmpresa(db: Db, emp: Empresa, id: string) {
  const [v] = await db.select().from(schema.orcamentos).where(and(eq(schema.orcamentos.id, id), eq(schema.orcamentos.empresaId, emp.id)));
  if (!v) throw new Error('Versão de orçamento não encontrada nesta empresa.');
  return v;
}

/** Realizado por área (centro de custo; sem centro, a categoria), natureza e mês, por competência. */
async function realizado(db: Db, emp: Empresa, ano: number) {
  const tits = await db
    .select({ tipo: schema.titulos.tipo, comp: schema.titulos.competencia, venc: schema.titulos.venc, centro: schema.titulos.centro, categoria: schema.titulos.categoria, valor: schema.titulos.valor, nome: schema.titulos.nome, codigo: schema.titulos.codigo, status: schema.titulos.status, retorno: schema.titulos.retorno })
    .from(schema.titulos)
    .where(eq(schema.titulos.empresaId, emp.id));
  return tits
    .filter((t) => !t.retorno && !/cancel/i.test(t.status))
    .map((t) => ({ ...t, comp: t.comp || t.venc?.slice(0, 7) || '' }))
    .filter((t) => t.comp.startsWith(String(ano)) || t.comp.startsWith(String(ano - 1)))
    .map((t) => ({ area: t.centro || t.categoria || 'Sem área', natureza: t.tipo === 'receber' ? ('receita' as const) : ('despesa' as const), mes: Number(t.comp.slice(5, 7)), ano: Number(t.comp.slice(0, 4)), valor: t.valor, nome: t.nome, codigo: t.codigo }));
}

export async function dadosOrcamento(db: Db, u: Usuario, emp: Empresa, ano: number, versaoId: string | undefined, compararId: string | undefined, ate: number, natureza: 'despesa' | 'receita') {
  const [versoes, real, limites] = await Promise.all([versoesOrcamento(db, emp, ano), realizado(db, emp, ano), lerConfig<Limites>(db, u.tenantId, `orcamentoLimites:${emp.id}`)]);
  const lim = limites || LIMITES_PADRAO;
  const versao = versoes.find((v) => v.id === versaoId) || [...versoes].reverse().find((v) => v.status === 'Aprovado') || versoes[versoes.length - 1] || null;
  const comparar = versoes.find((v) => v.id === compararId && v.id !== versao?.id) || null;
  const linhasDe = async (v: Versao | null) => (v ? db.select().from(schema.orcamentoLinhas).where(eq(schema.orcamentoLinhas.orcamentoId, v.id)) : []);
  const [linhas, linhasComp] = await Promise.all([linhasDe(versao), linhasDe(comparar)]);
  const dn = linhas.filter((l) => l.natureza === natureza);
  const rn = real.filter((r) => r.natureza === natureza);
  const areas = [...new Set([...dn.map((l) => l.area), ...rn.filter((r) => r.ano === ano).map((r) => r.area)])].sort();
  const somaO = (ls: typeof linhas, area: string | null, de: number, a: number) => arred(ls.filter((l) => l.natureza === natureza && (!area || l.area === area) && l.mes >= de && l.mes <= a).reduce((s, l) => s + l.valor, 0));
  const somaR = (area: string | null, de: number, a: number, an = ano) => arred(rn.filter((r) => r.ano === an && (!area || r.area === area) && r.mes >= de && r.mes <= a).reduce((s, r) => s + r.valor, 0));
  const tabela = areas.map((area) => {
    const orcado = somaO(linhas, area, 1, ate);
    const realizadoV = somaR(area, 1, ate);
    const s = semaforo(orcado, realizadoV, natureza, lim);
    const desvio = arred(realizadoV - orcado);
    // causa: maiores títulos do período na área (só quando há excesso)
    const excesso = natureza === 'despesa' ? desvio > 0 : desvio < 0;
    const causas = excesso && natureza === 'despesa'
      ? Object.entries(rn.filter((r) => r.ano === ano && r.area === area && r.mes <= ate).reduce<Record<string, number>>((m, r) => ({ ...m, [r.nome]: arred((m[r.nome] || 0) + r.valor) }), {})).sort((a, b) => b[1] - a[1]).slice(0, 3)
      : [];
    return { area, orcado, realizado: realizadoV, desvio, desvioPct: orcado ? arred((desvio / orcado) * 100) : null, consumo: s.consumo, status: s.status, anual: somaO(linhas, area, 1, 12), revisado: comparar ? somaO(linhasComp, area, 1, ate) : null, anoAnterior: somaR(area, 1, ate, ano - 1), causas };
  }).sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio));
  const totalOrcado = somaO(linhas, null, 1, ate), totalReal = somaR(null, 1, ate);
  const ritmo = ritmoAnual(totalReal, ate);
  return {
    ano, ate, natureza, versoes: versoes.map((v) => ({ ...v, aprovadoEm: v.aprovadoEm?.toISOString() || null, criadoEm: v.criadoEm.toISOString() })), versao, comparar, limites: lim,
    linhasEdicao: linhas.map((l) => ({ area: l.area, natureza: l.natureza, mes: l.mes, valor: l.valor })),
    areasCadastradas: [...new Set(real.map((r) => r.area))].sort(),
    total: { orcado: totalOrcado, realizado: totalReal, desvio: arred(totalReal - totalOrcado), desvioPct: totalOrcado ? arred(((totalReal - totalOrcado) / totalOrcado) * 100) : null, anual: somaO(linhas, null, 1, 12), ritmo, desvioAnualRitmo: ritmo != null ? arred(ritmo - somaO(linhas, null, 1, 12)) : null, saldoDisponivel: arred(somaO(linhas, null, 1, 12) - somaR(null, 1, 12)) },
    acimaDoLimite: tabela.filter((t) => t.status === 'coral').length,
    mensal: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, orcado: somaO(linhas, null, i + 1, i + 1), realizado: i + 1 <= ate ? somaR(null, i + 1, i + 1) : null, revisado: comparar ? somaO(linhasComp, null, i + 1, i + 1) : null, anoAnterior: somaR(null, i + 1, i + 1, ano - 1) })),
    tabela,
  };
}

export async function criarVersao(db: Db, u: Usuario, emp: Empresa, ano: number, tipo: 'Original' | 'Revisão' | 'Forecast', baseId: string | null, nome: string) {
  if (!(ano >= 2000 && ano <= 2100)) throw new Error('Ano inválido.');
  const base = baseId ? await versaoDaEmpresa(db, emp, baseId) : null;
  if (tipo !== 'Original' && !base) throw new Error('Revisão e forecast partem de uma versão existente.');
  const [v] = await db.insert(schema.orcamentos).values({ tenantId: u.tenantId, empresaId: emp.id, ano, nome: nome.trim() || `${tipo} ${ano}`, tipo, baseId: base?.id || null }).returning();
  if (base) {
    const ls = await db.select().from(schema.orcamentoLinhas).where(eq(schema.orcamentoLinhas.orcamentoId, base.id));
    let novas = ls.map((l) => ({ tenantId: u.tenantId, orcamentoId: v.id, area: l.area, natureza: l.natureza, mes: l.mes, valor: l.valor }));
    if (tipo === 'Forecast') {
      // forecast: meses já fechados recebem o realizado; os demais mantêm o orçado da base
      const mesAtual = new Date().getUTCFullYear() === ano ? new Date().getUTCMonth() : ano < new Date().getUTCFullYear() ? 12 : 0;
      const real = (await realizado(db, emp, ano)).filter((r) => r.ano === ano && r.mes <= mesAtual);
      const chave = (a: string, n: string, m: number) => `${a}|${n}|${m}`;
      const somas = new Map<string, number>();
      for (const r of real) somas.set(chave(r.area, r.natureza, r.mes), arred((somas.get(chave(r.area, r.natureza, r.mes)) || 0) + r.valor));
      novas = novas.map((l) => (l.mes <= mesAtual ? { ...l, valor: somas.get(chave(l.area, l.natureza, l.mes)) || 0 } : l));
      for (const [k, valor] of somas) {
        const [area, natureza, mes] = k.split('|');
        if (!novas.some((l) => chave(l.area, l.natureza, l.mes) === k)) novas.push({ tenantId: u.tenantId, orcamentoId: v.id, area, natureza, mes: Number(mes), valor });
      }
    }
    if (novas.length) await db.insert(schema.orcamentoLinhas).values(novas);
  }
  await auditar(db, u, { empresaId: emp.id, acao: 'Criou versão de orçamento', entidade: `${v.nome} (${tipo})`, depois: base ? `a partir de ${base.nome}` : undefined });
  return v.id;
}

export async function salvarLinhasOrcamento(db: Db, u: Usuario, emp: Empresa, id: string, linhas: { area: string; natureza: string; mes: number; valor: number }[]) {
  const v = await versaoDaEmpresa(db, emp, id);
  if (v.status === 'Aprovado') throw new Error('Versão aprovada não pode ser alterada: crie uma revisão.');
  const limpas = linhas.filter((l) => l.area.trim() && l.mes >= 1 && l.mes <= 12 && (l.natureza === 'receita' || l.natureza === 'despesa') && Number.isFinite(l.valor));
  await db.delete(schema.orcamentoLinhas).where(eq(schema.orcamentoLinhas.orcamentoId, v.id));
  if (limpas.length) await db.insert(schema.orcamentoLinhas).values(limpas.map((l) => ({ tenantId: u.tenantId, orcamentoId: v.id, area: l.area.trim(), natureza: l.natureza, mes: l.mes, valor: arred(l.valor) })));
  await auditar(db, u, { empresaId: emp.id, acao: 'Alterou orçamento', entidade: v.nome, depois: `${limpas.length} valor(es) mensais` });
}

export async function aprovarVersao(db: Db, u: Usuario, emp: Empresa, id: string) {
  const v = await versaoDaEmpresa(db, emp, id);
  if (v.status === 'Aprovado') throw new Error('Esta versão já está aprovada.');
  await db.update(schema.orcamentos).set({ status: 'Aprovado', aprovadoPor: u.nome, aprovadoEm: new Date() }).where(and(eq(schema.orcamentos.id, v.id), eq(schema.orcamentos.empresaId, emp.id)));
  await auditar(db, u, { empresaId: emp.id, acao: 'Aprovou versão de orçamento', entidade: v.nome });
}


// ---------------------------------------------------------------- textos para a ZARO IA

export async function contextoIa(db: Db, u: Usuario, emp: Empresa, hoje: string, area: string) {
  const ref = hoje.slice(0, 7);
  if (area === 'executivo') {
    const d = await dadosExecutivo(db, emp, mesesAte(ref, 2)[0], 'ano', 'centro', true);
    return [
      `Executivo (prévia, inclui lançamentos não aprovados; ${d.tituloPeriodo}): faturamento ${brl(d.atual.faturamento)}, receita líquida ${brl(d.atual.liquida)}, lucro ${brl(d.atual.lucro)}, margem ${d.atual.margem ?? '—'}%, EBITDA ${brl(d.atual.ebitda)}${d.ebitdaConfiavel ? '' : ` (EBITDA incompleto: ${d.faltas.join('; ')})`}. Link: /inteligencia?aba=executivo`,
      d.antes ? `Mesmo período do ano anterior: faturamento ${brl(d.antes.faturamento)}, lucro ${brl(d.antes.lucro)}, EBITDA ${brl(d.antes.ebitda)}.` : 'Sem dados do ano anterior para comparar.',
      `Por mês (faturamento / lucro / margem): ${d.mensal.map((m) => `${compBr(m.mes)} ${brl(m.faturamento)} / ${brl(m.lucro)} / ${m.margem ?? '—'}%`).join('; ')}.`,
      `Linhas do período: custo ${brl(d.atual.custo)}, pessoal ${brl(d.atual.pessoal)}, operacionais ${brl(d.atual.operacionais)}, tributos sobre venda ${brl(d.atual.deducoes)}, IRPJ/CSLL ${brl(d.atual.tributosLucro)}, depreciação ${brl(d.atual.depreciacao)}, financeiras ${brl(d.atual.financeiras)}.`,
      `Maiores contas de despesa: ${d.maioresDespesas.map((x) => `${x.conta} ${brl(x.valor)}`).join('; ')}.`,
      `Resultado por centro de custo: ${d.porUnidade.map((x) => `${x.nome}: faturamento ${brl(x.faturamento)}, lucro ${brl(x.lucro)}, margem ${x.margem ?? '—'}%`).join('; ') || 'sem centros de custo nos títulos'}.`,
    ].join('\n');
  }
  if (area === 'caixa') {
    const d = await dadosCaixa(db, u, emp, hoje);
    const p = projecaoCaixa(d.saldoInicial, d.itens, hoje, 90, {}, d.minimo);
    const semanas: { de: string; saidas: number; entradas: number; saldo: number }[] = [];
    for (let i = 0; i < p.pontos.length; i += 7) { const b = p.pontos.slice(i, i + 7); semanas.push({ de: b[0].data, entradas: arred(b.reduce((a, x) => a + x.entradas, 0)), saidas: arred(b.reduce((a, x) => a + x.saidas, 0)), saldo: b[b.length - 1].saldo }); }
    return [
      `Caixa: saldo bancário ${d.temSaldo ? brl(d.saldoInicial) : 'NÃO INFORMADO (projeção parte de zero)'}; caixa mínimo definido ${brl(d.minimo)}. Link: /inteligencia?aba=caixa`,
      `Próximos 90 dias: a receber ${brl(d.receber90)} (${d.nReceber90} títulos), a pagar ${brl(d.pagar90)} (${d.nPagar90}). Recebimentos já vencidos ficam fora da projeção: ${brl(d.receberVencido)}.`,
      `Menor saldo projetado: ${d.menor ? `${brl(d.menor.saldo)} em ${dataBr(d.menor.data)}` : '—'}; primeiro dia negativo: ${d.negativo ? dataBr(d.negativo) : 'nenhum'}; primeiro dia abaixo do mínimo: ${d.abaixoDoMinimo ? dataBr(d.abaixoDoMinimo) : 'nenhum'}.`,
      `Folha a pagar nos próximos 30 dias: ${brl(d.folha30)}.`,
      `Semanas (entradas/saídas/saldo final): ${semanas.map((s) => `${dataBr(s.de)} ${brl(s.entradas)}/${brl(s.saidas)}/${brl(s.saldo)}`).join('; ')}.`,
      `Maiores saídas: ${d.maioresSaidas.slice(0, 8).map((s) => `${dataBr(s.data)} ${s.favorecido} (${s.categoria}) ${brl(s.valor)} [${s.situacao}]`).join('; ')}.`,
      `Contas bancárias no extrato: ${d.bancos.map((b) => `${b.conta}: ${b.movimentos} movimentos, último ${dataBr(b.ultimo)}, ${b.pendentes} sem conciliação`).join('; ') || 'nenhuma'}.`,
    ].join('\n');
  }
  if (area === 'inadimplencia') {
    const d = await dadosInadimplencia(db, u, emp, hoje);
    return [
      `Inadimplência: vencido em aberto ${brl(d.totalVencido)} de ${brl(d.totalAberto)} a receber (taxa ${d.taxa ?? '—'}% = vencido ÷ total em aberto). Clientes em atraso: ${d.clientes}. Atraso médio ${d.atrasoMedio ?? '—'} dias (ponderado por valor ${d.atrasoMedioPonderado ?? '—'}). Link: /inteligencia?aba=inadimplencia`,
      `Faixas: ${d.faixas.map((f) => `${f.rotulo} ${brl(f.valor)} (${f.pct}%)`).join('; ')}.`,
      `Devedores: ${d.ranking.slice(0, 10).map((c) => `${c.cliente} ${brl(c.valor)}, ${c.maiorAtraso} dias, ${c.titulos} título(s), status ${c.status}, ${c.recorrente} atraso(s) anteriores pagos com atraso`).join('; ') || 'nenhum'}.`,
      `Impacto no caixa: dos ${brl(d.impacto.previsto90)} previstos para 90 dias, ${brl(d.impacto.deAtrasados)} são de clientes que já estão em atraso.`,
    ].join('\n');
  }
  if (area === 'pagamentos') {
    const d = await dadosPagamentos(db, emp, hoje, 'revisao', '');
    return [
      `Pagamentos: em aberto ${brl(d.resumo.aberto)} (${d.resumo.nAberto}); vence hoje ${brl(d.resumo.hoje)}; 7 dias ${brl(d.resumo.semana)}; vencidos ${brl(d.resumo.vencidos)} (${d.resumo.nVencidos}); agendados ${brl(d.resumo.programados)}; documentos aguardando no Autopilot ${d.resumo.aguardando}. Link: /inteligencia?aba=pagamentos`,
      `Títulos com alerta: ${d.linhas.slice(0, 12).map((l) => `${l.codigo} ${l.fornecedor} ${brl(l.valor)}: ${l.alertas.join('; ')}`).join(' | ') || 'nenhum'}.`,
      `Documentos em conferência: ${d.conferencia.map((c) => `${c.fornecedor} NF ${c.numero} ${brl(c.valor)}: ${c.divergencias} divergência(s)`).join('; ') || 'nenhum'}.`,
      'Descontos por antecipação: não há dado de desconto nos títulos da ZARO.',
    ].join('\n');
  }
  if (area === 'orcamento') {
    const ano = Number(hoje.slice(0, 4));
    const d = await dadosOrcamento(db, u, emp, ano, undefined, undefined, Number(hoje.slice(5, 7)), 'despesa');
    if (!d.versao) return `Orçamento ${ano}: nenhuma versão cadastrada. Link: /inteligencia?aba=orcamento`;
    return [
      `Orçamento de despesas ${ano}, versão "${d.versao.nome}" (${d.versao.status}), jan a mês ${d.ate}: orçado ${brl(d.total.orcado)}, realizado ${brl(d.total.realizado)}, desvio ${brl(d.total.desvio)} (${d.total.desvioPct ?? '—'}%). Anual orçado ${brl(d.total.anual)}; no ritmo atual o ano fecha em ${brl(d.total.ritmo)} (desvio ${brl(d.total.desvioAnualRitmo)}); ainda disponível no ano ${brl(d.total.saldoDisponivel)}. Link: /inteligencia?aba=orcamento`,
      `Por área: ${d.tabela.map((t) => `${t.area}: orçado ${brl(t.orcado)}, realizado ${brl(t.realizado)}, consumo ${t.consumo ?? '—'}%, ${t.status}${t.causas.length ? `, maiores lançamentos: ${t.causas.map(([n, v]) => `${n} ${brl(v)}`).join(', ')}` : ''}`).join('; ')}.`,
    ].join('\n');
  }
  return '';
}
