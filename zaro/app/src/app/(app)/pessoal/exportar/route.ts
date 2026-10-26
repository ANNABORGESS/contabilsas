// Relatório de Auditoria DP em Excel.
import ExcelJS from 'exceljs';
import { getDb } from '@/db';
import { auditar } from '@/server/auditoria';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { dadosDP, exigirDP } from '@/server/dp';

export async function GET(req: Request) {
  const u = await exigirUsuario();
  exigirDP(u);
  const emp = await exigirEmpresa(u);
  const db = await getDb();
  const d = await dadosDP(db, emp, new URL(req.url).searchParams.get('comp'));
  await auditar(db, u, { empresaId: emp.id, acao: 'Exportou auditoria DP (Excel)', entidade: d.comp || '' });
  const wb = new ExcelJS.Workbook();
  const r = wb.addWorksheet('Resumo');
  r.addRow([`Auditoria DP · ${emp.razao} · CNPJ ${emp.cnpj} · competência ${d.comp || '—'} · ${new Date().toLocaleDateString('pt-BR')}`]);
  r.addRow([]);
  for (const [k, x] of Object.entries(d.totais)) r.addRow([k, x]);
  r.addRow([]);
  r.addRow(['Tributo', 'Calculado', 'Declarado', 'Guia', 'Pago', 'Status']).font = { bold: true };
  for (const o of d.obrigacoes) r.addRow([o.tributo, o.calculado, o.declarado, o.guia, o.pago, o.status]);
  r.addRow([]);
  r.addRow(['Parecer', d.conf?.parecer || 'Conferência não concluída', 'Responsável', d.conf?.responsavel || '']);
  r.columns.forEach((c) => (c.width = 22));
  const t = wb.addWorksheet('Divergências');
  t.addRow(['Funcionário', 'Matrícula', 'Competência', 'Item', 'Valor informado', 'Valor conferido', 'Diferença', 'Status', 'Motivo', 'Ação recomendada', 'Revisão']).font = { bold: true };
  for (const l of d.linhas) t.addRow([l.funcionario, l.matricula, l.competencia, l.item, l.informado, l.conferido, l.diferenca, l.status, l.motivo, l.acao, l.revisao ? `${l.revisao.decisao} · ${l.revisao.nota} · ${l.revisao.por}` : '']);
  t.columns.forEach((c) => (c.width = 20));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`auditoria-dp-${d.comp || 'geral'}.xlsx`)}` } });
}
