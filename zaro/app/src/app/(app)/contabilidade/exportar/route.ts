// Balancete, DRE e Balanço em Excel.
import ExcelJS from 'exceljs';
import { getDb } from '@/db';
import { balanceteModelo, nomeDaLinha, SECOES } from '@/domain/balancete-modelo';
import { balanceteComGrupos, balanco, balancete, dre, periodoContabil } from '@/domain/demonstracoes';
import { auditar } from '@/server/auditoria';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { lancamentosDaEmpresa } from '@/server/contabil';

export async function GET(req: Request) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const q = new URL(req.url).searchParams;
  const sp = { per: q.get('per') || undefined, ref: q.get('ref') || undefined, de: q.get('de') || undefined, ate: q.get('ate') || undefined };
  const aba = ['balancete', 'dre', 'balanco'].includes(q.get('aba') || '') ? q.get('aba')! : 'balancete';
  const previa = q.get('previa') === '1';
  const db = await getDb();
  const lancs = await lancamentosDaEmpresa(db, emp);
  const p = periodoContabil(sp, lancs.map((l) => l.comp));
  await auditar(db, u, { empresaId: emp.id, acao: `Exportou ${aba} (Excel)`, entidade: p.titulo });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(aba === 'balancete' ? 'Balancete' : aba === 'dre' ? 'DRE' : 'Balanço');
  ws.addRow([`${emp.razao} · CNPJ ${emp.cnpj}`]).font = { bold: true };
  ws.addRow([`${aba === 'balancete' ? 'Balancete de Verificação' : aba === 'dre' ? 'Demonstração do Resultado' : 'Balanço Patrimonial'} · ${p.titulo}${previa ? ' · PRÉVIA (inclui não aprovados)' : ''}`]);
  ws.addRow([]);
  const moeda = '#,##0.00;[Red]-#,##0.00';
  if (aba === 'balancete' && q.get('modelo') !== 'zaro') {
    const b = balanceteModelo(lancs, p, previa);
    const dc = (v: number) => (v > 0.004 ? 'D' : v < -0.004 ? 'C' : '');
    for (const s of SECOES) {
      ws.addRow([s.titulo]).font = { bold: true, size: 12 };
      ws.addRow(['Código', 'Descrição da conta', 'Saldo anterior', 'D/C', 'Débitos', 'Créditos', 'Saldo atual', 'D/C']).font = { bold: true };
      const linhas = b.linhas.filter((l) => l.codigo === s.grupo || l.codigo.startsWith(s.grupo + '.'));
      for (const l of linhas) {
        const r = ws.addRow([l.codigo, l.sintetica ? l.nome.toUpperCase() : l.nome, Math.abs(l.anterior) || null, dc(l.anterior), l.debitos || null, l.creditos || null, Math.abs(l.final) || null, dc(l.final)]);
        if (l.sintetica) r.font = { bold: true };
      }
      const g = linhas[0];
      ws.addRow(['', s.total, Math.abs(g.anterior), dc(g.anterior), g.debitos, g.creditos, Math.abs(g.final), dc(g.final)]).font = { bold: true };
      ws.addRow([]);
    }
    ws.addRow(['5. RESUMO DO BALANCETE']).font = { bold: true, size: 12 };
    ws.addRow(['', 'Grupo contábil', 'Saldo devedor', '', 'Saldo credor']).font = { bold: true };
    for (const r of b.resumo) ws.addRow(['', r.grupo, r.saldo > 0.004 ? r.saldo : null, '', r.saldo < -0.004 ? -r.saldo : null]);
    ws.addRow(['', 'TOTAL GERAL', b.totalDevedor, '', b.totalCredor]).font = { bold: true };
    ws.columns = [{ width: 10 }, { width: 46 }, { width: 16, style: { numFmt: moeda } }, { width: 5 }, { width: 16, style: { numFmt: moeda } }, { width: 16, style: { numFmt: moeda } }, { width: 16, style: { numFmt: moeda } }, { width: 5 }];
    const dp = wb.addWorksheet('De-para ZARO');
    dp.addRow(['Conta ZARO', 'Descrição', 'Linha do modelo', 'Descrição', 'Movimento do período']).font = { bold: true };
    for (const d of b.dePara) dp.addRow([d.conta, d.nome, d.linha, nomeDaLinha(d.linha), d.valor]);
    dp.columns = [{ width: 12 }, { width: 40 }, { width: 12 }, { width: 40 }, { width: 18, style: { numFmt: moeda } }];
  } else if (aba === 'balancete') {
    const b = balancete(lancs, p, previa);
    ws.addRow(['Conta', 'Descrição', 'Saldo anterior', 'D/C', 'Débitos', 'Créditos', 'Saldo atual', 'D/C']).font = { bold: true };
    for (const l of balanceteComGrupos(b.linhas)) {
      const r = ws.addRow([l.conta, l.nome, Math.abs(l.anterior), l.anterior > 0.004 ? 'D' : l.anterior < -0.004 ? 'C' : '', l.debitos, l.creditos, Math.abs(l.final), l.final > 0.004 ? 'D' : l.final < -0.004 ? 'C' : '']);
      if (l.sintetica) r.font = { bold: true };
    }
    ws.addRow(['', 'Totais do período', null, '', b.totalDebitos, b.totalCreditos]).font = { bold: true };
    ws.columns = [{ width: 12 }, { width: 46 }, { width: 16, style: { numFmt: moeda } }, { width: 5 }, { width: 16, style: { numFmt: moeda } }, { width: 16, style: { numFmt: moeda } }, { width: 16, style: { numFmt: moeda } }, { width: 5 }];
  } else if (aba === 'dre') {
    for (const l of dre(lancs, p, previa).linhas) { const r = ws.addRow([(l.nivel === 2 ? '    ' : '') + l.rotulo, l.valor]); if (l.destaque) r.font = { bold: true }; }
    ws.columns = [{ width: 50 }, { width: 18, style: { numFmt: moeda } }];
  } else {
    const b = balanco(lancs, p.ate, previa);
    ws.addRow(['ATIVO', b.ativo]).font = { bold: true };
    for (const c of b.contasAtivo) ws.addRow([`    ${c.conta} ${c.nome}`, c.valor]);
    ws.addRow(['PASSIVO', b.passivo]).font = { bold: true };
    for (const c of b.contasPassivo.filter((x) => !x.conta.startsWith('2.3'))) ws.addRow([`    ${c.conta} ${c.nome}`, c.valor]);
    ws.addRow(['PATRIMÔNIO LÍQUIDO', b.pl]).font = { bold: true };
    for (const c of b.contasPassivo.filter((x) => x.conta.startsWith('2.3'))) ws.addRow([`    ${c.conta} ${c.nome}`, c.valor]);
    ws.addRow(['    Resultado acumulado', b.resultadoAcumulado]);
    ws.columns = [{ width: 50 }, { width: 18, style: { numFmt: moeda } }];
  }
  const buf = await wb.xlsx.writeBuffer();
  const nome = `${aba}-${p.de}-a-${p.ate}.xlsx`;
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}` } });
}
