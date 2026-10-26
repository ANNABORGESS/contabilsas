import Link from 'next/link';
import { EmpresaForm } from '@/components/EmpresaForm';
import { formatarCnpj } from '@/domain/dinheiro';
import { regimeEm } from '@/domain/regime';
import { empresasDoEscritorio, exigirUsuario, podeEditar } from '@/server/auth';
import { situacaoCertificado } from '@/domain/certificado';
import { consultarCnpj, lerCertificado, salvarEmpresa } from './acoes';

export default async function Empresas({ searchParams }: { searchParams: Promise<{ nova?: string; editar?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const lista = await empresasDoEscritorio(u.tenantId);
  const editando = sp.editar ? lista.find((e) => e.id === sp.editar) : null;
  const hoje = new Date().toISOString().slice(0, 10);
  const formAberto = podeEditar(u) && (sp.nova || editando || !lista.length);
  return (
    <>
      <div className="cabeca">
        <div><h1>Empresas e Filiais</h1><p>Cadastro das empresas clientes do escritório, com o histórico de regime por vigência.</p></div>
        {podeEditar(u) && !formAberto && <Link className="btn primario" href="/empresas?nova=1">Nova empresa</Link>}
      </div>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.ok && <div className="aviso ok">Empresa salva.</div>}
      {formAberto && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginBottom: 14 }}>{editando ? `Editar ${editando.fantasia || editando.razao}` : 'Nova empresa'}</h2>
          <EmpresaForm empresa={editando || {}} salvar={salvarEmpresa} consultar={consultarCnpj} lerCertificado={lerCertificado} />
        </div>
      )}
      <div className="card">
        {lista.length ? (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>CNPJ</th><th>Regime hoje</th><th>Cidade</th><th>Certificado A1</th><th /></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td><b>{e.fantasia || e.razao}</b><div className="pequeno mudo">{e.razao}</div></td>
                    <td className="num">{formatarCnpj(e.cnpj)}</td>
                    <td>{regimeEm(e, hoje) || '—'}{e.regimeHist.length > 1 && <div className="pequeno mudo">{e.regimeHist.map((h) => `${h.regime}${h.de ? ` desde ${h.de.split('-').reverse().join('/')}` : ''}${h.ate ? ` até ${h.ate.split('-').reverse().join('/')}` : ''}`).join(' · ')}</div>}</td>
                    <td>{[e.cidade, e.uf].filter(Boolean).join('/') || '—'}</td>
                    <td><Certificado validoAte={(e.dados?.certificado as { validoAte?: string } | undefined)?.validoAte} hoje={hoje} /></td>
                    <td className="num">{podeEditar(u) && <Link className="btn mini" href={`/empresas?editar=${e.id}`}>Editar</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vazio">Nenhuma empresa ainda. Cadastre a primeira acima ou importe o backup do protótipo em Configurações.</div>
        )}
      </div>
    </>
  );
}

function Certificado({ validoAte, hoje }: { validoAte?: string; hoje: string }) {
  if (!validoAte) return <span className="mudo">—</span>;
  const s = situacaoCertificado(validoAte, hoje);
  return <span className={`tag ${s.nivel === 'ok' ? 'pos' : s.nivel === 'atencao' ? 'at' : 'neg'}`} title={s.texto}>{s.nivel === 'vencido' ? 'Vencido' : 'Válido'} até {validoAte.split('-').reverse().join('/')}</span>;
}
