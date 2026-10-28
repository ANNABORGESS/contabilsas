import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { creditosDaNota } from '@/domain/creditos';
import { ehSimples } from '@/domain/regime';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import type { DadosDocumento } from '@/server/autopilot';
import { configCreditos } from '@/server/creditos';
import { aprovar, descartar, enviarArquivos } from './acoes';

// extrato em PDF longo leva mais que o padrão da Vercel para ler e conferir
export const maxDuration = 60;

const COR: Record<string, string> = { Novo: 'acento', Aprovado: 'pos', Processado: 'pos', Duplicado: 'at', Descartado: '', Erro: 'neg' };

export default async function Autopilot({ searchParams }: { searchParams: Promise<{ f?: string; msg?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const filtro = sp.f === 'todos' ? 'todos' : 'novos';
  const db = await getDb();
  const docs = await db
    .select({ id: schema.documentosEntrada.id, tipo: schema.documentosEntrada.tipo, nomeArquivo: schema.documentosEntrada.nomeArquivo, status: schema.documentosEntrada.status, destino: schema.documentosEntrada.destino, confianca: schema.documentosEntrada.confianca, valor: schema.documentosEntrada.valor, canal: schema.documentosEntrada.canal, resultado: schema.documentosEntrada.resultado, dados: schema.documentosEntrada.dados, criadoEm: schema.documentosEntrada.criadoEm, arquivoId: schema.documentosEntrada.arquivoId })
    .from(schema.documentosEntrada)
    .where(filtro === 'novos' ? and(eq(schema.documentosEntrada.empresaId, emp.id), eq(schema.documentosEntrada.status, 'Novo')) : eq(schema.documentosEntrada.empresaId, emp.id))
    .orderBy(desc(schema.documentosEntrada.criadoEm))
    .limit(200);
  const edita = podeEditar(u);
  const cfgCred = await configCreditos(db, u.tenantId, emp.id);
  return (
    <>
      <div className="cabeca">
        <div><h1>ZARO Autopilot</h1><p>Caixa de entrada única: envie XML de NF-e, NFS-e e eventos de cancelamento, extrato bancário em PDF (Itaú, Bradesco) e folha de pagamento em PDF. O ZARO identifica, bloqueia duplicados e lança no módulo certo: NF depois da sua aprovação (com os impostos a recuperar de cada item da compra), extrato direto na conciliação bancária e folha no Departamento Pessoal e na contabilidade.</p></div>
      </div>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.msg && <div className="aviso" style={{ whiteSpace: 'pre-line' }}>{sp.msg}</div>}
      {edita && (
        <form action={enviarArquivos} className="card linha" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="arquivos">Arquivos (XML, ZIP com XMLs, PDF) de {emp.fantasia || emp.razao}</label>
            <input id="arquivos" name="arquivos" type="file" multiple accept=".xml,.zip,.pdf,.png,.jpg,.jpeg" required />
          </div>
          <button className="btn primario" type="submit" style={{ alignSelf: 'flex-end' }}>Enviar</button>
        </form>
      )}
      <div className="abas">
        <Link href="/autopilot" className={filtro === 'novos' ? 'ativo' : ''}>Aguardando aprovação</Link>
        <Link href="/autopilot?f=todos" className={filtro === 'todos' ? 'ativo' : ''}>Todos</Link>
      </div>
      {!docs.length && <div className="card vazio">{filtro === 'novos' ? 'Nada aguardando. Envie arquivos acima ou sincronize a SEFAZ em Configurações.' : 'Nenhum documento ainda.'}</div>}
      {docs.map((d) => {
        const dados = d.dados as DadosDocumento;
        const n = dados.nota;
        const cred = n && n.tipo === 'NF-e' && dados.direcao === 'entrada' && n.itens.some((i) => 'cst' in i || 'icms' in i)
          ? creditosDaNota(d.id, n.itens, { simples: ehSimples(emp, n.dados.emissao), config: cfgCred }) : null;
        const parte = n ? (dados.direcao === 'saida' ? { r: 'Cliente', nome: n.dados.cliNome, doc: n.dados.cliDoc } : { r: 'Emitente', nome: n.dados.emitNome, doc: n.dados.emitCnpj }) : null;
        return (
          <div key={d.id} className="card">
            <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="linha"><span className={`tag ${COR[d.status] || ''}`}>{d.status}</span><b>{d.tipo}{n ? ` ${n.dados.numero}${n.dados.serie ? '/' + n.dados.serie : ''}` : ''}</b><span className="mudo pequeno">{d.nomeArquivo} · {d.canal} · {d.criadoEm.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}</span></div>
                {parte && <div style={{ marginTop: 6 }}>{parte.r}: <b>{parte.nome || '—'}</b> {parte.doc && <span className="mudo">· {formatarCnpj(parte.doc)}</span>}</div>}
                {n && <div className="pequeno mudo">Emissão {dataBr(n.dados.emissao)} · {n.dados.natureza || '—'} · valor {brl(n.dados.vNF)}{n.dados.chave ? ` · chave …${n.dados.chave.slice(-8)}` : ''}</div>}
                <div style={{ marginTop: 6 }}>Destino: <b>{d.destino || '—'}</b> <span className="mudo pequeno">· confiança {d.confianca}%</span></div>
                {cred && (
                  <div className="pequeno" style={{ marginTop: 4 }}>
                    Impostos a recuperar: <b>ICMS {brl(cred.icms)}</b>{cred.ipi > 0 && <> · <b>IPI {brl(cred.ipi)}</b></>}
                    {cred.aConfirmar > 0 && <> · <span className="tag at">{cred.aConfirmar} item(ns) a confirmar</span></>}
                    {cred.itens.some((i) => i.classe === 'simples') && <span className="mudo"> · compra da época do Simples: sem crédito</span>}
                    {' '}<Link href="/fiscal/creditos" className="mudo">ver itens</Link>
                  </div>
                )}
                {d.resultado && <div className="pequeno" style={{ marginTop: 4 }}>{d.resultado}</div>}
              </div>
              <div className="linha">
                {d.arquivoId && <a className="btn mini" href={`/arquivos/${d.arquivoId}`}>Arquivo</a>}
              </div>
            </div>
            {d.status === 'Novo' && dados.titulos && dados.titulos.length > 0 && (
              <div className="tabela-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Título que será criado</th><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th>Conta</th><th>Observação</th></tr></thead>
                  <tbody>
                    {dados.titulos.map((t, i) => (
                      <tr key={i}>
                        <td>{t.tipo === 'receber' ? 'Contas a Receber' : 'Contas a Pagar'} · {t.categoria}</td>
                        <td>{t.parcela}</td>
                        <td>{dataBr(t.venc)} {t.vencEstimado && <span className="tag at">revisar</span>}</td>
                        <td className="num">{brl(t.valor)}{t.retorno && <div className="pequeno mudo">fiscal {brl(t.valorFiscal)}</div>}</td>
                        <td>{t.contaContabil}</td>
                        <td className="pequeno">{t.notaVenc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {d.status === 'Novo' && edita && (
              <div className="linha" style={{ marginTop: 12 }}>
                {n && dados.direcao !== 'terceiros' && (
                  <form action={aprovar}><input type="hidden" name="id" value={d.id} /><button className="btn primario" type="submit">Aprovar e lançar</button></form>
                )}
                <form action={descartar} className="linha">
                  <input type="hidden" name="id" value={d.id} />
                  <input name="motivo" placeholder="Motivo do descarte" style={{ width: 220 }} />
                  <button className="btn perigo" type="submit">Descartar</button>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
