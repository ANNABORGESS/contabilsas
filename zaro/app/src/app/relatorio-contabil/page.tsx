// Balancete, DRE e Balanço para impressão (PDF pela impressão do navegador).
import { getDb } from '@/db';
import { brl, formatarCnpj } from '@/domain/dinheiro';
import { balanceteComGrupos, balanco, balancete, dre, periodoContabil } from '@/domain/demonstracoes';
import { auditar } from '@/server/auditoria';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { lancamentosDaEmpresa } from '@/server/contabil';
import { Imprimir } from './Imprimir';
import '../relatorio-dp/relatorio.css';

export const dynamic = 'force-dynamic';
type SP = { aba?: string; per?: string; ref?: string; de?: string; ate?: string; previa?: string };
const NOMES: Record<string, string> = { balancete: 'Balancete de Verificação', dre: 'Demonstração do Resultado', balanco: 'Balanço Patrimonial' };
const comLado = (v: number) => (Math.abs(v) < 0.005 ? '' : `${brl(Math.abs(v))} ${v > 0 ? 'D' : 'C'}`);

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  return { title: `${(NOMES[sp.aba || ''] || NOMES.balancete).split(' ')[0]}_${sp.de || ''}_${sp.ate || ''}_${emp.razao.replace(/[^\w]+/g, '_')}` };
}

export default async function RelatorioContabil({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const aba = NOMES[sp.aba || ''] ? sp.aba! : 'balancete';
  const db = await getDb();
  const lancs = await lancamentosDaEmpresa(db, emp);
  const p = periodoContabil(sp, lancs.map((l) => l.comp));
  const previa = sp.previa === '1';
  await auditar(db, u, { empresaId: emp.id, acao: `Gerou PDF: ${NOMES[aba]}`, entidade: p.titulo });
  const voltar = '/contabilidade?' + new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="rd">
      <Imprimir voltar={voltar} />
      <div className="rd-cab">
        <div><h1>{aba === 'balanco' ? `${NOMES.balanco} em ${p.ate.split('-').reverse().join('/')}` : NOMES[aba]}</h1><div>{emp.razao} · CNPJ {formatarCnpj(emp.cnpj)}</div></div>
        <div style={{ textAlign: 'right' }}><b>Período {p.titulo}</b><div>Emitido em {new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })}</div>{previa && <div className="at">Prévia: inclui lançamentos não aprovados</div>}</div>
      </div>
      {aba === 'balancete' && <Balancete lancs={lancs} p={p} previa={previa} />}
      {aba === 'dre' && <Dre lancs={lancs} p={p} previa={previa} />}
      {aba === 'balanco' && <Balanco lancs={lancs} ate={p.ate} previa={previa} />}
      <div className="rd-ass"><div><span />Contador(a) responsável · CRC</div><div><span />{emp.razao}</div></div>
    </div>
  );
}

type L = Awaited<ReturnType<typeof lancamentosDaEmpresa>>;

function Balancete({ lancs, p, previa }: { lancs: L; p: { de: string; ate: string }; previa: boolean }) {
  const b = balancete(lancs, p, previa);
  if (!b.linhas.length) return <p>Sem lançamentos aprovados no período. Aprove na Contabilidade ou gere a prévia.</p>;
  const linhas = balanceteComGrupos(b.linhas);
  return (
    <table style={{ marginTop: 12 }}>
      <thead><tr><th>Conta</th><th className="n">Saldo anterior</th><th className="n">Débitos</th><th className="n">Créditos</th><th className="n">Saldo atual</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.conta} style={l.sintetica ? { fontWeight: 700, background: l.nivel === 1 ? '#eef2f6' : undefined } : undefined}>
            <td style={{ paddingLeft: 6 + (l.nivel - 1) * 12 }}>{l.conta} {l.nome}</td>
            <td className="n">{comLado(l.anterior)}</td><td className="n">{brl(l.debitos)}</td><td className="n">{brl(l.creditos)}</td><td className="n">{comLado(l.final)}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 700, borderTop: '2px solid #3f5a72' }}><td>Totais do período</td><td /><td className="n">{brl(b.totalDebitos)}</td><td className="n">{brl(b.totalCreditos)}</td><td className="n">{Math.abs(b.totalDebitos - b.totalCreditos) < 0.01 ? 'D = C ✓' : 'Diferença!'}</td></tr>
      </tbody>
    </table>
  );
}

function Dre({ lancs, p, previa }: { lancs: L; p: { de: string; ate: string }; previa: boolean }) {
  const d = dre(lancs, p, previa);
  return (
    <table style={{ marginTop: 12 }}><tbody>
      {d.linhas.map((l) => <tr key={l.rotulo} style={l.destaque ? { fontWeight: 700 } : undefined}><td style={{ paddingLeft: l.nivel === 2 ? 24 : 6 }}>{l.rotulo}</td><td className={`n ${l.destaque && l.valor < 0 ? 'neg' : ''}`}>{brl(l.valor)}</td></tr>)}
    </tbody></table>
  );
}

function Balanco({ lancs, ate, previa }: { lancs: L; ate: string; previa: boolean }) {
  const b = balanco(lancs, ate, previa);
  const linha = (k: string, n: string, v: number, forte = false) => <tr key={k} style={forte ? { fontWeight: 700 } : undefined}><td style={{ paddingLeft: forte ? 6 : 20 }}>{n}</td><td className="n">{brl(v)}</td></tr>;
  return (
    <>
      {!b.fecha && <p className="neg">O balanço não fecha: confira os lançamentos.</p>}
      <table style={{ marginTop: 12 }}><tbody>
        {linha('a', 'ATIVO', b.ativo, true)}
        {b.contasAtivo.map((c) => linha(c.conta, `${c.conta} ${c.nome}`, c.valor))}
        {linha('p', 'PASSIVO', b.passivo, true)}
        {b.contasPassivo.filter((c) => !c.conta.startsWith('2.3')).map((c) => linha(c.conta, `${c.conta} ${c.nome}`, c.valor))}
        {linha('pl', 'PATRIMÔNIO LÍQUIDO', b.pl, true)}
        {b.contasPassivo.filter((c) => c.conta.startsWith('2.3')).map((c) => linha(c.conta, `${c.conta} ${c.nome}`, c.valor))}
        {linha('ra', 'Resultado acumulado', b.resultadoAcumulado)}
      </tbody></table>
    </>
  );
}
