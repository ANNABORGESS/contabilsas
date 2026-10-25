import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BotaoEnviar } from '@/components/BotaoEnviar';
import { Markdown } from '@/components/Markdown';
import { getDb } from '@/db';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { consultasDoEspecialista, especialista, temChaveIA } from '@/server/especialistas';
import { perguntar } from '../acoes';
import { PerguntasProntas } from '../Perguntas';
import { NATIVOS } from '@/domain/especialistas-nativos';

// a resposta da IA pode levar mais de um minuto
export const maxDuration = 300;

export default async function Especialista({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const e = await especialista(db, u.tenantId, id);
  if (!e) notFound();
  const hist = await consultasDoEspecialista(db, emp.id, e.id);
  const nativo = NATIVOS.find((n) => n.slug === e.slug);
  return (
    <>
      <div className="cabeca">
        <div>
          <div className="pequeno"><Link href="/especialistas">← Especialistas</Link></div>
          <h1>{e.nome}</h1>
          <p>{e.descricao}</p>
        </div>
        <span className={`tag ${e.tipo === 'skill' ? 'acento' : 'ia'}`}>{nativo ? 'Nativo ZARO' : `${e.tipo === 'skill' ? 'Skill' : 'Agente'} · ${e.slug}`}</span>
      </div>
      <div className="aviso ia">Resposta feita por IA a partir das instruções deste especialista. É rascunho de apoio: confira alíquotas, códigos e prazos na fonte oficial antes de transmitir ou pagar.</div>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {!temChaveIA() && <div className="aviso at">Falta a chave da Anthropic (ANTHROPIC_API_KEY) nas configurações da Vercel para este especialista responder.</div>}
      {podeEditar(u) && (
        <form action={perguntar} className="card campos" style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={e.id} />
          {nativo && <PerguntasProntas perguntas={nativo.perguntas} />}
          <div><label htmlFor="pergunta">O que você precisa?</label><textarea id="pergunta" name="pergunta" rows={4} required placeholder={nativo ? 'Ex.: Faça o diagnóstico financeiro da empresa e diga o que fazer nos próximos 30 dias.' : 'Ex.: Apure o Lucro Presumido do 3º trimestre de 2026 com as notas lançadas e me diga os DARFs.'} /></div>
          <label className="linha" style={{ fontWeight: 500 }}><input type="checkbox" name="dados" defaultChecked /> Usar os números de {emp.fantasia || emp.razao} ({nativo ? 'caixa, contas a pagar e receber, inadimplência, resultado, EBITDA, endividamento e vencimentos' : 'regime, receita, contas a pagar e receber, dívida ativa'})</label>
          <div><BotaoEnviar texto="Perguntar" enviando="O especialista está trabalhando… (pode levar 1 a 2 minutos)" /></div>
        </form>
      )}
      {hist.map((c, k) => (
        <div key={c.id} className="card">
          <details open={k === 0}>
            <summary>{c.pergunta.length > 140 ? `${c.pergunta.slice(0, 140)}…` : c.pergunta}</summary>
            <div className="pequeno mudo" style={{ margin: '6px 0 12px' }}>{c.usuario} · {c.criadoEm.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}{c.usouDados ? ` · com os números de ${emp.fantasia || emp.razao}` : ''}</div>
            <Markdown texto={c.resposta} />
          </details>
        </div>
      ))}
      {!hist.length && <div className="card vazio">Nenhuma pergunta feita a este especialista em {emp.fantasia || emp.razao} ainda.</div>}
    </>
  );
}
