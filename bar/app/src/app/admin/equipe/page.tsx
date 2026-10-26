'use client';
import { useEffect, useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { Aviso, Modal } from '@/cliente/ui';
import { NOME_PAPEL, PAPEIS, type Papel } from '@/domain/papeis';
import { Cabecalho } from '../comum';

interface Funcionario {
  id: string;
  nome: string;
  usuario: string;
  papel: Papel;
  ativo: boolean;
}

const DESCRICAO: Record<Papel, string> = {
  admin: 'Tudo: administração, relatórios, cancelamentos e estornos.',
  garcom: 'Celular: mesas, pedidos, confirmação de pagamento e entregas.',
  cozinha: 'Painel da cozinha (petiscos).',
  bar: 'Painel do bar (bebidas).',
};

export default function Equipe() {
  const { dados, erro } = useDados<{ equipe: Funcionario[] }>('/api/equipe');
  const [editando, setEditando] = useState<Funcionario | 'novo' | null>(null);
  return (
    <>
      <Cabecalho titulo="Funcionários" sub="Cada pessoa entra com o próprio usuário: assim todo pedido e status fica registrado com quem fez.">
        <button className="btn primario" onClick={() => setEditando('novo')}>
          + Novo funcionário
        </button>
      </Cabecalho>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="cartao">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuário</th>
              <th>Função</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {dados?.equipe.map((f) => (
              <tr key={f.id} className={`clicavel ${f.ativo ? '' : 'apagado'}`} onClick={() => setEditando(f)}>
                <td>
                  <b>{f.nome}</b>
                </td>
                <td>{f.usuario}</td>
                <td>{NOME_PAPEL[f.papel]}</td>
                <td>{f.ativo ? <span className="chip ped-pago">Ativo</span> : <span className="chip">Desativado</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grade g4" style={{ marginTop: 16 }}>
        {PAPEIS.map((p) => (
          <div key={p} className="cartao">
            <h3>{NOME_PAPEL[p]}</h3>
            <p className="fraco" style={{ marginTop: 6 }}>
              {DESCRICAO[p]}
            </p>
          </div>
        ))}
      </div>
      <LinksDeAcesso />
      {editando && <FormFuncionario f={editando === 'novo' ? null : editando} fechar={() => setEditando(null)} />}
    </>
  );
}

function FormFuncionario({ f, fechar }: { f: Funcionario | null; fechar: () => void }) {
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setSalvando(true);
    try {
      if (f) await api(`/api/equipe/${f.id}`, 'PATCH', { nome: d.get('nome'), papel: d.get('papel'), ativo: d.get('ativo') === 'on', senha: d.get('senha') || undefined });
      else await api('/api/equipe', 'POST', { nome: d.get('nome'), usuario: d.get('usuario'), papel: d.get('papel'), senha: d.get('senha') });
      fechar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }
  return (
    <Modal titulo={f ? `Editar ${f.nome}` : 'Novo funcionário'} aoFechar={fechar}>
      <form className="formulario" onSubmit={salvar}>
        <label className="campo">
          Nome
          <input name="nome" defaultValue={f?.nome} required autoFocus />
        </label>
        <div className="linha-campos">
          <label className="campo">
            Usuário (para entrar)
            <input name="usuario" defaultValue={f?.usuario} disabled={!!f} autoCapitalize="none" placeholder="ex.: joao" required={!f} />
          </label>
          <label className="campo">
            Função
            <select name="papel" defaultValue={f?.papel || 'garcom'}>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {NOME_PAPEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          {f ? 'Nova senha ou PIN (deixe em branco para manter)' : 'Senha ou PIN (mínimo 4)'}
          <input name="senha" type="password" minLength={4} required={!f} autoComplete="new-password" />
        </label>
        {f && (
          <label className="fila">
            <input type="checkbox" name="ativo" defaultChecked={f.ativo} /> Ativo (desativar tira o acesso de todos os aparelhos)
          </label>
        )}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button className="btn primario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </Modal>
  );
}

const LINKS: [Papel, string, string][] = [
  ['garcom', '📱 Garçom', 'abrir no celular de cada garçom'],
  ['cozinha', '🍟 Cozinha', 'abrir no tablet ou TV da cozinha'],
  ['bar', '🍺 Bar', 'abrir no tablet ou TV do bar'],
  ['admin', '💼 Administrador', 'abrir no computador'],
];

/** Endereço de entrada de cada perfil, para enviar pelo WhatsApp ou salvar no aparelho. */
function LinksDeAcesso() {
  const [base, setBase] = useState('');
  const [copiado, setCopiado] = useState('');
  useEffect(() => setBase(window.location.origin), []);
  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copie o link:', url); // http na rede local não libera a área de transferência
    }
    setCopiado(url);
    setTimeout(() => setCopiado(''), 2000);
  }
  return (
    <div id="links" className="cartao" style={{ marginTop: 16 }}>
      <header>
        <h2>Links de acesso</h2>
        <span className="fraco">Cada link abre a entrada com usuário e senha daquele perfil</span>
      </header>
      <div className="pilha" style={{ gap: 10 }}>
        {LINKS.map(([papel, nome, onde]) => {
          const url = `${base}/login/${papel}`;
          return (
            <div key={papel} className="fila entre" style={{ borderBottom: '1px solid var(--borda)', paddingBottom: 10 }}>
              <div>
                <b>{nome}</b> <span className="fraco">· {onde}</span>
                <div>
                  <a href={url} target="_blank" rel="noreferrer" className="num">
                    {url}
                  </a>
                </div>
              </div>
              <button className="btn pequeno" onClick={() => copiar(url)}>
                {copiado === url ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>
          );
        })}
      </div>
      <p className="fraco" style={{ marginTop: 10 }}>
        Nos celulares e tablets, troque “localhost” pelo IP deste computador (aparece na janela do INICIAR-BAR.bat), com todos no mesmo Wi-Fi.
      </p>
    </div>
  );
}
