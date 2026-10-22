import { BotaoEnviar } from '@/components/BotaoEnviar';
import { getDb } from '@/db';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { CONSELHEIROS, historicoConselho } from '@/server/conselho';
import { consultar } from './acoes';

const COR: Record<string, string> = { 'A FAVOR': 'pos', CONTRA: 'neg', DEPENDE: 'at' };

export default async function Conselho({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const hist = await historicoConselho(await getDb(), u.tenantId, emp.id);
  const nome = Object.fromEntries(CONSELHEIROS.map((c) => [c[0], c]));
  const [ult, ...anteriores] = hist;
  return (
    <>
      <div className="cabeca"><div><h1>Conselho ZARO</h1><p>Leve uma decisão ao conselho. Sete conselheiros votam usando os números de {emp.fantasia || emp.razao} e um moderador escreve o veredito.</p></div></div>
      <div className="aviso ia">Os conselheiros são simulações feitas por IA a partir das ideias públicas de cada empresário. Não são falas reais dessas pessoas e não substituem o seu julgamento.</div>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {podeEditar(u) && (
        <form action={consultar} className="card campos" style={{ marginBottom: 16 }}>
          <div><label htmlFor="pergunta">Qual decisão você quer levar?</label><textarea id="pergunta" name="pergunta" rows={3} placeholder="Ex.: Vale a pena comprar um segundo torno CNC financiado em 48 meses?" required /></div>
          <div><BotaoEnviar texto="Convocar o conselho" enviando="O conselho está deliberando… (pode levar 1 minuto)" /></div>
        </form>
      )}
      {ult ? (
        <div className="card">
          <div className="rotulo">{new Date(ult.quando).toLocaleString('pt-BR', { timeZone: 'America/Manaus' })} · {ult.placar}</div>
          <h2 style={{ margin: '6px 0 14px' }}>{ult.pergunta}</h2>
          <div className="grade g2">
            {ult.votos.map((v) => (
              <div key={v.conselheiro} className="card" style={{ margin: 0 }}>
                <div className="linha" style={{ justifyContent: 'space-between' }}><b>{nome[v.conselheiro]?.[1] || v.conselheiro}</b><span className={`tag ${COR[v.voto] || ''}`}>{v.voto}</span></div>
                <div className="pequeno mudo">{nome[v.conselheiro]?.[2]}</div>
                <p style={{ marginBottom: 0 }}>{v.argumento}</p>
              </div>
            ))}
          </div>
          <div className="aviso ia" style={{ marginTop: 16 }}><b>Veredito do moderador.</b> {ult.veredito}</div>
          <h3>Próximos passos</h3>
          <ol>{ult.proximosPassos.map((p) => <li key={p}>{p}</li>)}</ol>
        </div>
      ) : <div className="card vazio">Nenhuma consulta ainda.</div>}
      {anteriores.length > 0 && (
        <div className="card">
          <h2>Consultas anteriores</h2>
          {anteriores.map((p) => (
            <details key={p.quando} style={{ marginTop: 10 }}>
              <summary>{p.pergunta.slice(0, 100)} <span className="mudo pequeno">· {p.placar}</span></summary>
              <p>{p.veredito}</p>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
