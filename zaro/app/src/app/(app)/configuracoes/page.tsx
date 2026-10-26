import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { empresaAtiva, exigirUsuario, podeEditar } from '@/server/auth';
import { configSefaz, resumosSefaz, ultimaSincronizacao } from '@/server/sefaz';
import { infoCertificado } from '@/server/sefaz-nuvem';
import { situacaoCertificado } from '@/domain/certificado';
import { alternarUsuario, apagarCertificado, criarUsuario, guardarCertificadoAcao, importar, manifestarNota, salvarSefaz, sincronizar, testar, trocarSenha } from './acoes';

// busca de NF-e na SEFAZ pode levar alguns lotes: dá mais tempo à função na nuvem
export const maxDuration = 60;

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ aba?: string; msg?: string; erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await empresaAtiva(u);
  const sp = await searchParams;
  const aba = ['sefaz', 'backup', 'usuarios'].includes(sp.aba || '') ? sp.aba! : 'sefaz';
  const db = await getDb();
  const edita = podeEditar(u);
  const admin = u.perfil === 'Administrador';
  return (
    <>
      <div className="cabeca"><div><h1>Configurações</h1><p>Integrações, importação dos dados do protótipo e usuários do escritório.</p></div></div>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      <div className="abas">
        <Link href="/configuracoes?aba=sefaz" className={aba === 'sefaz' ? 'ativo' : ''}>Integração SEFAZ</Link>
        <Link href="/configuracoes?aba=backup" className={aba === 'backup' ? 'ativo' : ''}>Importar backup do protótipo</Link>
        <Link href="/configuracoes?aba=usuarios" className={aba === 'usuarios' ? 'ativo' : ''}>Usuários</Link>
      </div>
      {aba === 'sefaz' && <Sefaz tenantId={u.tenantId} empresa={emp} edita={edita} />}
      {aba === 'backup' && (
        <div className="card">
          <h2>Trazer os dados do protótipo</h2>
          <ol style={{ lineHeight: 1.8 }}>
            <li>Abra o protótipo (ABRIR-ZARO.bat) no mesmo navegador em que você usava o ZARO.</li>
            <li>Acesse <b>http://localhost:5500/exportar-backup.html</b> e clique em <b>Baixar backup</b>.</li>
            <li>Envie aqui o arquivo <code>ZARO_backup_….json</code>. Pode importar de novo depois: o que já entrou é pulado.</li>
          </ol>
          {admin ? (
            <form action={importar} className="linha">
              <input type="file" name="backup" accept=".json,application/json" required style={{ flex: 1, minWidth: 240 }} />
              <button className="btn primario">Importar</button>
            </form>
          ) : <div className="aviso">Só o perfil Administrador pode importar.</div>}
        </div>
      )}
      {aba === 'usuarios' && <Usuarios tenantId={u.tenantId} meuId={u.id} admin={admin} />}
      {aba === 'usuarios' && (
        <form action={trocarSenha} className="card linha" style={{ marginTop: 16 }}>
          <div style={{ flex: 1 }}><label>Trocar a minha senha</label><input name="nova" type="password" minLength={8} placeholder="Nova senha (mínimo 8 caracteres)" required /></div>
          <button className="btn" style={{ alignSelf: 'flex-end' }}>Trocar</button>
        </form>
      )}
    </>
  );
}

async function Sefaz({ tenantId, empresa, edita }: { tenantId: string; empresa: Awaited<ReturnType<typeof empresaAtiva>>; edita: boolean }) {
  const db = await getDb();
  const cfg = await configSefaz(db, tenantId);
  const resumos = empresa ? await resumosSefaz(db, tenantId, empresa.id) : [];
  const ult = empresa ? await ultimaSincronizacao(db, tenantId, empresa.id) : null;
  const cert = empresa ? await infoCertificado(db, tenantId, empresa.id) : null;
  const sit = cert ? situacaoCertificado(cert.validoAte, new Date().toISOString().slice(0, 10)) : null;
  const pronto = !!cert || !!cfg;
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Certificado A1 no ZARO {cert && <span className={`tag ${sit?.nivel === 'ok' ? 'pos' : sit?.nivel === 'atencao' ? 'at' : 'neg'}`}>{sit?.texto}</span>}</h2>
        <p className="mudo">O ZARO online fala direto com a SEFAZ usando o certificado A1 de {empresa ? <b>{empresa.fantasia || empresa.razao}</b> : 'cada empresa'}. O arquivo e a senha ficam guardados <b>criptografados</b> (AES-256) e só são abertos na hora de consultar. Ninguém consegue ver ou baixar o certificado pela tela.</p>
        {cert ? (
          <div className="linha" style={{ marginTop: 8 }}>
            <span>{cert.titular} · emitido por {cert.emissor || '—'} · {cert.ambiente === 'producao' ? 'Produção' : 'Homologação'} · guardado por {cert.por} em {new Date(cert.guardadoEm).toLocaleDateString('pt-BR')}</span>
            {edita && <form action={apagarCertificado}><button className="btn mini perigo" type="submit">Apagar certificado</button></form>}
          </div>
        ) : null}
        {edita && empresa && (
          <details open={!cert} style={{ marginTop: 10 }}>
            <summary>{cert ? 'Trocar certificado (renovação)' : 'Guardar certificado A1'}</summary>
            <form action={guardarCertificadoAcao} className="grade g4" style={{ alignItems: 'end', marginTop: 10 }}>
              <div><label htmlFor="sf-pfx">Arquivo .pfx ou .p12</label><input id="sf-pfx" name="certificado" type="file" accept=".pfx,.p12,application/x-pkcs12" required /></div>
              <div><label htmlFor="sf-senha">Senha do certificado</label><input id="sf-senha" name="senha" type="password" autoComplete="off" required /></div>
              <div><label htmlFor="sf-amb">Ambiente</label><select id="sf-amb" name="ambiente" defaultValue={cert?.ambiente || 'producao'}><option value="producao">Produção (notas reais)</option><option value="homologacao">Homologação (teste)</option></select></div>
              <div><button className="btn primario" type="submit">Guardar e conectar</button></div>
            </form>
            <p className="pequeno mudo" style={{ marginTop: 6 }}>Só aceita e-CNPJ do mesmo CNPJ da empresa ativa e dentro da validade.</p>
          </details>
        )}
        {pronto && edita && empresa && (
          <div className="linha" style={{ marginTop: 14 }}>
            <form action={testar}><button className="btn">Testar conexão</button></form>
            <form action={sincronizar}><button className="btn primario">Buscar NF-e de {empresa.fantasia || empresa.razao}</button></form>
            <form action={sincronizar}><input type="hidden" name="reiniciar" value="1" /><button className="btn mini">Buscar desde o início</button></form>
            <span className="pequeno mudo">Última busca: {ult ? new Date(ult.em).toLocaleString('pt-BR', { timeZone: 'America/Manaus' }) : 'nunca'}{ult?.nsu ? ` · NSU ${ult.nsu}` : ''}</span>
          </div>
        )}
        <p className="pequeno mudo" style={{ marginTop: 10 }}>O que a integração faz: baixa as NF-e emitidas <b>contra</b> o CNPJ (compras de fornecedores) e manda para o Autopilot, guarda os resumos para manifestação (ciência, confirmação, desconhecimento) e testa se a SEFAZ-AM está no ar. As NFs <b>emitidas</b> pela empresa continuam entrando pelo XML no Autopilot. Emissão de NF-e ainda não está disponível.</p>
      </div>
      <details className="card">
        <summary><b>Servidor SEFAZ local (opcional, para o ZARO instalado no computador)</b></summary>
        <p className="mudo">Abra <code>servidor-sefaz/INICIAR-ZARO-SEFAZ.bat</code> e copie o endereço e o token que aparecem na janela. Como o ZARO roda no mesmo computador, use <code>http://localhost:8787</code>.</p>
        {edita && (
          <form action={salvarSefaz} className="grade g3" style={{ alignItems: 'end' }}>
            <div><label>Endereço</label><input name="url" defaultValue={cfg?.url || 'http://localhost:8787'} required /></div>
            <div><label>Token</label><input name="token" type="password" placeholder={cfg?.token ? `guardado (termina em ${cfg.token.slice(-4)})` : 'cole o token'} /></div>
            <div><button className="btn primario">Salvar</button></div>
          </form>
        )}
      </details>
      <div className="card">
        <h2>NF-e de fornecedores aguardando manifestação</h2>
        <p className="mudo pequeno">A SEFAZ manda primeiro só o resumo. O XML completo é liberado depois da ciência ou confirmação.</p>
        {resumos.length ? (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Emitente</th><th>Emissão</th><th className="num">Valor</th><th>Chave</th><th /></tr></thead>
            <tbody>{resumos.map((r) => (
              <tr key={r.chave}>
                <td>{r.emitente}<div className="pequeno mudo">{formatarCnpj(r.cnpjEmitente)}</div></td><td>{dataBr(r.emissao)}</td><td className="num">{brl(r.valor)}</td><td className="pequeno">…{r.chave.slice(-12)}</td>
                <td>{edita && <div className="linha">
                  {(['ciencia', 'confirmacao', 'desconhecimento'] as const).map((t) => (
                    <form key={t} action={manifestarNota}><input type="hidden" name="chave" value={r.chave} /><input type="hidden" name="tipo" value={t} /><button className={`btn mini ${t === 'desconhecimento' ? 'perigo' : ''}`}>{t === 'ciencia' ? 'Ciência' : t === 'confirmacao' ? 'Confirmar' : 'Desconheço'}</button></form>
                  ))}
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="vazio">Nenhum resumo pendente.</div>}
      </div>
    </>
  );
}

async function Usuarios({ tenantId, meuId, admin }: { tenantId: string; meuId: string; admin: boolean }) {
  const db = await getDb();
  const lista = await db.select().from(schema.usuarios).where(eq(schema.usuarios.tenantId, tenantId));
  return (
    <div className="card">
      <h2>Usuários do escritório</h2>
      <div className="tabela-wrap" style={{ marginTop: 10 }}><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th /></tr></thead>
        <tbody>{lista.map((x) => (
          <tr key={x.id}><td>{x.nome}</td><td>{x.email}</td><td>{x.perfil}</td><td><span className={`tag ${x.ativo ? 'pos' : ''}`}>{x.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>{admin && x.id !== meuId && <form action={alternarUsuario}><input type="hidden" name="id" value={x.id} /><button className="btn mini">{x.ativo ? 'Desativar' : 'Reativar'}</button></form>}</td></tr>
        ))}</tbody>
      </table></div>
      {admin && (
        <details style={{ marginTop: 14 }}>
          <summary>Novo usuário</summary>
          <form action={criarUsuario} className="grade g4" style={{ marginTop: 10, alignItems: 'end' }}>
            <div><label>Nome</label><input name="nome" required /></div>
            <div><label>E-mail</label><input name="email" type="email" required /></div>
            <div><label>Senha inicial</label><input name="senha" type="password" minLength={8} required /></div>
            <div><label>Perfil</label><select name="perfil">{['Contador', 'Fiscal', 'Financeiro', 'Gestor', 'Administrador', 'Consulta'].map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><button className="btn primario">Criar</button></div>
          </form>
        </details>
      )}
    </div>
  );
}
