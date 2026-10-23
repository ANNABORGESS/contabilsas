import { getDb } from '@/db';
import { BotaoRecolher, Menu } from '@/components/Menu';
import { SeletorEmpresa } from '@/components/SeletorEmpresa';
import { Alertas, Busca } from '@/components/Topo';
import { PainelIa } from '@/components/ZaroIa';
import { empresaAtiva, empresasDoEscritorio, exigirUsuario } from '@/server/auth';
import { alertasDaEmpresa } from '@/server/consultas';
import { sair } from '../(acesso)/acoes';
import { trocarEmpresa } from './acoes-comuns';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const [lista, ativa] = await Promise.all([empresasDoEscritorio(u.tenantId), empresaAtiva(u)]);
  const alertas = ativa ? await alertasDaEmpresa(await getDb(), ativa.id, new Date().toISOString().slice(0, 10)) : { vencidos: 0, documentos: 0 };
  return (
    <div className="app">
      <div className="textura" aria-hidden="true" />
      <aside className="lateral">
        <div className="marca">
          <div className="marca-txt">
            <b>ZARO</b>
            <span>Contabilidade inteligente.<br />Gestão conectada.</span>
          </div>
          <b className="marca-mini">Z</b>
          <BotaoRecolher />
        </div>
        <Menu />
      </aside>
      <div className="conteudo">
        <header className="topo">
          <div className="topo-linha">
            <SeletorEmpresa empresas={lista.map((e) => ({ id: e.id, nome: e.fantasia || e.razao }))} ativa={ativa?.id} acao={trocarEmpresa} />
            <div className="cresce" />
            <Alertas {...alertas} />
            <div className="usuario pequeno">
              <b>{u.nome}</b> · {u.perfil}
              <br />
              <span className="mudo">{u.tenantNome}</span>
            </div>
            <form action={sair}><button className="btn mini" type="submit">Sair</button></form>
          </div>
          <Busca />
        </header>
        {children}
      </div>
      <PainelIa empresa={ativa ? ativa.fantasia || ativa.razao : ''} />
    </div>
  );
}
