import { Menu } from '@/components/Menu';
import { SeletorEmpresa } from '@/components/SeletorEmpresa';
import { empresaAtiva, empresasDoEscritorio, exigirUsuario } from '@/server/auth';
import { sair } from '../(acesso)/acoes';
import { trocarEmpresa } from './acoes-comuns';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const [lista, ativa] = await Promise.all([empresasDoEscritorio(u.tenantId), empresaAtiva(u)]);
  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <b>ZARO</b>
          <span>Contabilidade inteligente.<br />Gestão conectada.</span>
        </div>
        <Menu />
      </aside>
      <div className="conteudo">
        <header className="topo">
          <SeletorEmpresa empresas={lista.map((e) => ({ id: e.id, nome: e.fantasia || e.razao }))} ativa={ativa?.id} acao={trocarEmpresa} />
          <div className="cresce" />
          <div className="pequeno" style={{ textAlign: 'right' }}>
            <b>{u.nome}</b> · {u.perfil}
            <br />
            <span className="mudo">{u.tenantNome}</span>
          </div>
          <form action={sair}><button className="btn mini" type="submit">Sair</button></form>
        </header>
        {children}
      </div>
    </div>
  );
}
