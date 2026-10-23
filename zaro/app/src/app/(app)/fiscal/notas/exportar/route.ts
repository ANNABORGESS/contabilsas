// Planilha (.xlsx) do controle de NF da SEFAZ, com o filtro e a busca da tela.
import ExcelJS from 'exceljs';
import { getDb } from '@/db';
import { formatarCnpj } from '@/domain/dinheiro';
import { empresaAtiva, usuarioAtual } from '@/server/auth';
import { notasFiltradas } from '@/server/notas-sefaz';

export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u) return new Response('Faça login.', { status: 401 });
  const emp = await empresaAtiva(u);
  if (!emp) return new Response('Escolha uma empresa.', { status: 400 });
  const sp = new URL(req.url).searchParams;
  const { lista, nomeFiltro, q } = await notasFiltradas(await getDb(), emp, sp.get('f') || undefined, sp.get('q') || undefined);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('NF SEFAZ', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.addRow([`NF da SEFAZ · ${emp.razao} · ${nomeFiltro}${q ? ` · busca "${q}"` : ''}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const cab = ws.addRow(['UF', 'Chave', 'Número', 'Série', 'Emissão', 'CNPJ emissor', 'IE emissor', 'Razão emissor', 'CNPJ/CPF dest.', 'IE dest.', 'Razão dest.', 'CFOP', 'Selagem', 'Situação', 'Tipo', 'Valor', 'Pedido', 'Recebida em', 'Lançada em', 'Na ZARO']);
  cab.font = { bold: true };
  cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3CB' } }; });
  const d = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : null);
  for (const { n, naZaro } of lista) {
    ws.addRow([n.uf, n.chave, n.numero, n.serie, d(n.emissao), n.cnpjEmit ? formatarCnpj(n.cnpjEmit) : '', n.ieEmit, n.razaoEmit, n.cnpjDest ? formatarCnpj(n.cnpjDest) : '', n.ieDest, n.razaoDest, n.cfop, n.selagem, n.situacao, n.tipo, n.valor, n.pedido || '', n.recebidoEm, n.lancadoEm, naZaro ? 'Sim' : 'Não']);
  }
  ws.getColumn(16).numFmt = '"R$" #,##0.00';
  [5, 18, 19].forEach((c) => { ws.getColumn(c).numFmt = 'dd/mm/yyyy'; });
  [5, 46, 9, 6, 12, 20, 14, 36, 20, 14, 36, 8, 14, 16, 10, 14, 12, 12, 12, 9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(2).numFmt = '@';
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: ws.rowCount, column: 20 } };
  return new Response(new Uint8Array(await wb.xlsx.writeBuffer()), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`nf-sefaz-${(emp.fantasia || emp.razao).replace(/[^\w]+/g, '-').toLowerCase()}.xlsx`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
