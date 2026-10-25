// Planilha (.xlsx) da lista do Financeiro, com o mesmo filtro e busca da tela.
import ExcelJS from 'exceljs';
import { getDb } from '@/db';
import { formatarCnpj } from '@/domain/dinheiro';
import { empresaAtiva, usuarioAtual } from '@/server/auth';
import { pagosPorTitulo, titulosFiltrados } from '@/server/consultas';

export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return new Response('Faça login.', { status: 401 });
  const emp = await empresaAtiva(u);
  if (!emp) return new Response('Escolha uma empresa.', { status: 400 });
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar';
  const hoje = new Date().toISOString().slice(0, 10);
  const db = await getDb();
  // "Gerar planilha do mês": todos os títulos (qualquer situação) com vencimento no mês pedido
  const mes = /^\d{4}-\d{2}$/.test(sp.get('mes') || '') ? sp.get('mes')! : null;
  const [r, pagos] = await Promise.all([titulosFiltrados(db, emp.id, tipo, mes ? 'todos' : sp.get('f') || undefined, mes ? undefined : sp.get('q') || undefined, hoje), pagosPorTitulo(db, emp.id)]);
  const { q } = r;
  const lista = mes ? r.lista.filter((t) => t.venc?.startsWith(mes) && !/cancel/i.test(t.status)) : r.lista;
  const nomeFiltro = mes ? `Vencimentos de ${mes.split('-').reverse().join('/')} (sem cancelados)` : r.nomeFiltro;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ZARO';
  const ws = wb.addWorksheet(tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.addRow([`${tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber'} · ${emp.razao}`]).font = { bold: true, size: 14 };
  ws.addRow([`Filtro: ${nomeFiltro}${q ? ` · busca "${q}"` : ''} · gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}`]).font = { color: { argb: 'FF7C756F' } };
  ws.addRow([]);
  const cab = ws.addRow(['Título', tipo === 'pagar' ? 'Fornecedor' : 'Cliente', 'CNPJ/CPF', 'NF', 'Parcela', 'Emissão', 'Vencimento', 'Valor', 'Pago', 'Saldo', 'Status', 'Categoria', 'Descrição']);
  cab.font = { bold: true };
  cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4DCF7' } }; });
  const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : null);
  for (const t of lista) {
    const pago = pagos.get(t.id) || 0;
    ws.addRow([t.codigo, t.nome, t.docParceiro ? formatarCnpj(t.docParceiro) : '', t.nf || '', t.parcela, data(t.nfEmissao), data(t.venc), t.valor, pago, Math.max(0, t.valor - pago), t.status, t.categoria || '', t.descricao || '']);
  }
  const fim = ws.rowCount;
  const tot = ws.addRow(['Total', `${lista.length} título(s)`, '', '', '', '', '', { formula: `SUM(H5:H${fim})` }, { formula: `SUM(I5:I${fim})` }, { formula: `SUM(J5:J${fim})` }]);
  tot.font = { bold: true };
  [8, 9, 10].forEach((c) => { ws.getColumn(c).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; });
  [6, 7].forEach((c) => { ws.getColumn(c).numFmt = 'dd/mm/yyyy'; });
  [12, 38, 20, 10, 8, 12, 12, 14, 14, 14, 16, 22, 50].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: fim, column: 13 } };

  const nome = `${tipo === 'pagar' ? 'contas-a-pagar' : 'contas-a-receber'}-${(emp.fantasia || emp.razao).replace(/[^\w]+/g, '-').toLowerCase()}-${mes || hoje}.xlsx`;
  return new Response(new Uint8Array(await wb.xlsx.writeBuffer()), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'no-store',
    },
  });
}
