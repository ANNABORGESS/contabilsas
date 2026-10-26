// Relatório do Split Payment em Excel: operações, divergências e projeção (dados reais, estimados e simulados separados).
import ExcelJS from 'exceljs';
import { getDb } from '@/db';
import { DIVERGENCIAS, REGRAS_SPLIT } from '@/domain/split-payment';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { dadosSplit } from '@/server/split-payment';

const STATUS: Record<string, string> = { nao_informado: 'Não informado', informado_psp: 'Informado pelo PSP', confirmado: 'Confirmado com evidência' };

export async function GET(req: Request) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const comp = new URL(req.url).searchParams.get('comp') || undefined;
  const hoje = new Date().toISOString().slice(0, 10);
  const d = await dadosSplit(await getDb(), emp, hoje, comp);
  const wb = new ExcelJS.Workbook();
  const ops = wb.addWorksheet('Operações');
  ops.addRow([`Split Payment · ${emp.razao} · ${comp ? `competência ${comp.split('-').reverse().join('/')}` : 'todas as competências'} · gerado em ${hoje.split('-').reverse().join('/')}`]);
  ops.addRow([]);
  ops.addRow(['Data', 'Evento', 'NF', 'Título', 'Cliente', 'Valor documento', 'Bruto', 'IBS destacado (NF)', 'CBS destacado (NF)', 'IBS segregado', 'CBS segregado', 'Taxa PSP', 'Líquido', 'PSP', 'Transação', 'Situação da segregação', 'Conciliado no extrato', 'Divergências', 'Regras']).font = { bold: true };
  for (const o of d.ops) ops.addRow([o.data, o.evento, o.nf, o.titulo, o.cliente, o.valorDocumento, o.valorBruto, o.ibsDestacado, o.cbsDestacado, o.ibsSegregado, o.cbsSegregado, o.taxaPsp, o.valorLiquido, o.psp, o.idTransacao, STATUS[o.status], o.extratoId ? 'Sim' : 'Não', o.divergencias.map((x) => DIVERGENCIAS[x]).join('; '), o.regraVersao]);
  ops.columns.forEach((c) => (c.width = 16));
  const r = wb.addWorksheet('Resumo');
  const s = d.resumo;
  for (const [k, v, n] of [
    ['Transações', s.transacoes, 'real'], ['Valor bruto', s.bruto, 'real'], ['IBS confirmado', s.ibsConfirmado, 'real (com evidência)'], ['CBS confirmada', s.cbsConfirmado, 'real (com evidência)'],
    ['IBS informado pelo PSP', s.ibsInformadoPsp, 'informado, sem confirmação'], ['CBS informada pelo PSP', s.cbsInformadoPsp, 'informado, sem confirmação'],
    ['IBS destacado nas NFs', s.ibsDestacadoEstimado, 'estimado (não é segregação)'], ['CBS destacada nas NFs', s.cbsDestacadoEstimado, 'estimado (não é segregação)'],
    ['Líquido informado', s.liquido, 'real'], ['Aguardando confirmação', s.aguardandoConfirmacao, ''], ['Com divergência', s.divergencias, ''],
  ] as [string, number, string][]) r.addRow([k, v, n]);
  r.addRow([]);
  r.addRow(['Projeção', 'Bruto previsto', 'Segregação estimada', 'Taxas', 'Líquido previsto', 'Sem destaque de IBS/CBS']).font = { bold: true };
  for (const p of d.projecao) r.addRow([`${p.dias} dias`, p.bruto, p.segregacao, p.taxas, p.liquido, p.semDestaque]);
  r.addRow([]);
  for (const g of REGRAS_SPLIT) r.addRow([g.versao, g.titulo, g.vigencia, g.fonte]);
  r.columns.forEach((c) => (c.width = 28));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`split-payment-${comp || 'geral'}.xlsx`)}` } });
}
