import Link from 'next/link';
import { getDb } from '@/db';
import { exigirUsuario, podeEditar } from '@/server/auth';
import { listarEspecialistas, temChaveIA } from '@/server/especialistas';
import { removerTodos } from './acoes';
import { Enviar } from './Enviar';

export default async function Especialistas({ searchParams }: { searchParams: Promise<{ q?: string; t?: string; msg?: string }> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const todos = await listarEspecialistas(await getDb(), u.tenantId);
  const q = (sp.q || '').toLowerCase().trim();
  const t = sp.t === 'skill' || sp.t === 'agente' ? sp.t : '';
  const lista = todos.filter((e) => (!t || e.tipo === t) && (!q || `${e.nome} ${e.slug} ${e.descricao}`.toLowerCase().includes(q)));
  const edita = podeEditar(u);
  const link = (tt: string) => `/especialistas?${new URLSearchParams({ ...(tt ? { t: tt } : {}), ...(q ? { q } : {}) })}`;
  return (
    <>
      <div className="cabeca"><div><h1>Especialistas</h1><p>As skills e os agentes de contabilidade que você enviou, prontos para responder com os números da empresa ativa.</p></div></div>
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      {!temChaveIA() && <div className="aviso at">Para os especialistas responderem, falta a chave da Anthropic: coloque <b>ANTHROPIC_API_KEY</b> nas configurações da Vercel (Settings → Environment Variables) e publique de novo.</div>}
      {edita && (
        <div className="card">
          <details open={!todos.length}>
            <summary>{todos.length ? 'Enviar ou atualizar pacotes' : 'Enviar os pacotes de skills e agentes'}</summary>
            <p className="pequeno mudo" style={{ margin: '8px 0 12px' }}>Escolha os arquivos .zip que você já tem (por exemplo <b>skills-contadores-main.zip</b>, <b>57-Agentes-Contabilidade-main.zip</b> e <b>contabilidade-main.zip</b>). O seu navegador abre os zips e manda só os textos das skills e agentes. Eles ficam guardados apenas no banco do seu escritório e não vão para o GitHub. Enviar de novo atualiza.</p>
            <Enviar />
            {todos.length > 0 && (
              <form action={removerTodos} style={{ marginTop: 12 }}><button className="btn mini perigo" type="submit">Remover todos os especialistas</button></form>
            )}
          </details>
        </div>
      )}
      {todos.length > 0 && (
        <>
          <div className="linha" style={{ margin: '16px 0', justifyContent: 'space-between' }}>
            <div className="abas" style={{ margin: 0 }}>
              <Link href={link('')} className={!t ? 'ativo' : ''}>Todos ({todos.length})</Link>
              <Link href={link('skill')} className={t === 'skill' ? 'ativo' : ''}>Skills ({todos.filter((e) => e.tipo === 'skill').length})</Link>
              <Link href={link('agente')} className={t === 'agente' ? 'ativo' : ''}>Agentes ({todos.filter((e) => e.tipo === 'agente').length})</Link>
            </div>
            <form className="linha" action="/especialistas">
              {t && <input type="hidden" name="t" value={t} />}
              <input name="q" defaultValue={sp.q} placeholder="Procurar: DAS, rescisão, SPED…" style={{ width: 260 }} />
              <button className="btn" type="submit">Procurar</button>
            </form>
          </div>
          {lista.length ? (
            <div className="grade g3">
              {lista.map((e) => (
                <Link key={e.id} href={`/especialistas/${e.id}`} className="card especialista">
                  <div className="linha" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <b>{e.nome}</b>
                    <span className={`tag ${e.tipo === 'skill' ? 'acento' : 'ia'}`}>{e.tipo === 'skill' ? 'Skill' : 'Agente'}</span>
                  </div>
                  <p className="pequeno mudo">{e.descricao.length > 170 ? `${e.descricao.slice(0, 170)}…` : e.descricao}</p>
                </Link>
              ))}
            </div>
          ) : <div className="card vazio">Nenhum especialista com esse filtro.</div>}
        </>
      )}
    </>
  );
}
