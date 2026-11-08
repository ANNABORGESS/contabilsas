// Site público do Porão Vikings: escuro, madeira e dourado (como o cardápio impresso e a tela do
// garçom). Cardápio ao vivo com preços, promoções programadas, como funciona, dúvidas e contato.
// A equipe entra pela "Área da equipe".
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { reais } from '@/domain/dinheiro';
import { nomeLocal } from '@/domain/mesas';
import { INICIO } from '@/domain/papeis';
import { DIAS_SEMANA } from '@/domain/promocao';
import { linkMapa, linkWhatsapp } from '@/domain/site';
import { semUsuarios, usuarioAtual } from '@/server/auth';
import { listarProdutos } from '@/server/cadastros';
import { promocoesDoSite } from '@/server/promocoes';
import { lerSite } from '@/server/site';

export const dynamic = 'force-dynamic';

/** Como as categorias aparecem no site, na ordem do cardápio impresso. */
const GRUPOS: { titulo: string; icone: string; casa: RegExp }[] = [
  { titulo: 'Petiscos', icone: '🍖', casa: /petisc|por[cç][aã]o|lanche|prato/i },
  { titulo: 'Cervejas', icone: '🍺', casa: /cervej|chopp|long/i },
  { titulo: 'Bebidas', icone: '🥤', casa: /refri|[aá]gua|suco|energ|drink|caipi|gin|dose|bebida/i },
  { titulo: 'Couver artístico', icone: '🎵', casa: /couver/i },
];

const titulo = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

function textoDias(d: number[]) {
  if (d.length === 7) return 'todos os dias';
  return d.map((x) => DIAS_SEMANA[x]).join(', ');
}
const hora = (h: string) => (h.endsWith(':00') ? `${Number(h.slice(0, 2))}h` : h.replace(':', 'h'));

export async function generateMetadata() {
  const site = await lerSite(await getDb()).catch(() => null);
  return {
    title: site ? `${site.nome} · Cardápio, promoções e contato` : 'Porão Vikings · Bar e Restaurante',
    description: site?.slogan || 'Petiscos, cerveja gelada e música. Peça na mesa e pague na hora.',
  };
}

export default async function Site() {
  const db = await getDb();
  if (await semUsuarios(db)) redirect('/primeiro-acesso');
  const [site, todos, promos, u] = await Promise.all([lerSite(db), listarProdutos(db), promocoesDoSite(db), usuarioAtual()]);
  // esgotado não aparece no site
  const produtos = todos.filter((p) => p.estoque === null || !p.estoqueTrava || p.estoque > 0);
  const whats = linkWhatsapp(site.whatsapp, `Olá! Vim pelo site do ${site.nome}.`);
  const mapa = linkMapa(site.endereco, site.cidade);
  const equipe = u ? { href: INICIO[u.papel], texto: 'Abrir o sistema' } : { href: '/login', texto: 'Área da equipe' };
  const ano = new Date().getFullYear();

  // agrupa as categorias do cadastro nos blocos do cardápio (Petiscos, Cervejas, Bebidas, Couver)
  const grupos = new Map<string, { titulo: string; icone: string; itens: typeof produtos }>();
  for (const p of produtos) {
    const g = GRUPOS.find((x) => x.casa.test(p.categoria)) || { titulo: titulo(p.categoria), icone: '🍽️' };
    const atual = grupos.get(g.titulo) || { titulo: g.titulo, icone: g.icone, itens: [] };
    atual.itens.push(p);
    grupos.set(g.titulo, atual);
  }
  const ordem = (t: string) => {
    const i = GRUPOS.findIndex((g) => g.titulo === t);
    return i < 0 ? 50 : i;
  };
  const blocos = [...grupos.values()].sort((a, b) => ordem(a.titulo) - ordem(b.titulo));
  const couver = blocos.find((b) => b.titulo === 'Couver artístico');
  const cardapio = blocos.filter((b) => b !== couver);
  const promoDe = new Map(promos.map((p) => [p.produto, p]));
  const ancora = (t: string) => `cat-${t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className="pv">
      <header className="pv-nav">
        <div className="pv-largura pv-nav-in">
          <a href="#inicio" className="pv-marca">
            <img src="/logo.png" alt="" />
            <span>
              Porão Vikings
              <small>Bar e Restaurante</small>
            </span>
          </a>
          <nav className="pv-links">
            <a href="#cardapio">Cardápio</a>
            {promos.length > 0 && <a href="#promocoes">Promoções</a>}
            <a href="#como-funciona">Como funciona</a>
            <a href="#contato">Visite</a>
          </nav>
          <a href={equipe.href} className="pv-equipe">
            {equipe.texto}
          </a>
        </div>
      </header>

      <section id="inicio" className="pv-hero">
        <div className="pv-largura pv-hero-in">
          <div className="pv-hero-logo">
            <img src="/logo.png" alt={`Logo do ${site.nome}`} />
          </div>
          <div className="pv-hero-texto">
            <p className="pv-sobretitulo">Bar e restaurante</p>
            <h1 className="pv-titulo">
              Porão <span>Vikings</span>
            </h1>
            <p className="pv-sub">{site.slogan || 'Petiscos na hora, cerveja trincando e música ao vivo.'}</p>
            <div className="pv-acoes">
              <a href="#cardapio" className="pv-btn pv-btn-ouro">
                Ver cardápio
              </a>
              {whats ? (
                <a href={whats} target="_blank" rel="noreferrer" className="pv-btn pv-btn-linha">
                  💬 WhatsApp
                </a>
              ) : (
                mapa && (
                  <a href={mapa} target="_blank" rel="noreferrer" className="pv-btn pv-btn-linha">
                    📍 Como chegar
                  </a>
                )
              )}
            </div>
            <ul className="pv-selos">
              <li>💳 Paga na mesa</li>
              <li>⚡ Sem comanda</li>
              <li>🍺 Cerveja gelada</li>
            </ul>
          </div>
        </div>
      </section>

      {promos.length > 0 && (
        <section id="promocoes" className="pv-secao pv-promos">
          <div className="pv-largura">
            {promos.map((p) => {
              const pagas = p.precoNormalCentavos ? p.precoComboCentavos / p.precoNormalCentavos : 0;
              const gratis = Number.isInteger(pagas) && pagas > 0 ? p.quantidadeCombo - pagas : 0;
              return (
                <div key={p.id} className={`pv-promo ${p.valendo ? 'valendo' : ''}`}>
                  <div className="pv-promo-fogo" aria-hidden>
                    🔥
                  </div>
                  <div className="pv-promo-texto">
                    <span className="pv-promo-tag">{p.valendo ? 'Valendo agora' : 'Promoção'}</span>
                    <h2>{p.nome}</h2>
                    <p>
                      {gratis > 0 ? (
                        <>
                          Pediu {pagas === 1 ? 'uma' : pagas}, leva {p.quantidadeCombo}: <b>{p.quantidadeCombo} {p.produto}</b> por <b>{reais(p.precoComboCentavos)}</b>
                        </>
                      ) : (
                        <>
                          <b>
                            {p.quantidadeCombo} {p.produto}
                          </b>{' '}
                          por <b>{reais(p.precoComboCentavos)}</b>
                        </>
                      )}
                    </p>
                    <p className="pv-promo-quando">
                      {textoDias(p.dias)}, das {hora(p.inicio)} às {hora(p.fim)}
                      {p.mesas?.length ? ` · só no ${p.mesas.map((n) => nomeLocal(n)).join(', ')}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section id="cardapio" className="pv-secao">
        <div className="pv-largura">
          <div className="pv-cabeca">
            <span className="pv-ornamento" aria-hidden />
            <h2 className="pv-titulo">Cardápio</h2>
            <p>Atualizado pelo próprio bar: o que aparece aqui está disponível agora.</p>
          </div>
          {cardapio.length > 1 && (
            <nav className="pv-chips">
              {cardapio.map((b) => (
                <a key={b.titulo} href={`#${ancora(b.titulo)}`}>
                  {b.icone} {b.titulo}
                </a>
              ))}
            </nav>
          )}
          <div className="pv-menu">
            {cardapio.map((b) => (
              <div key={b.titulo} id={ancora(b.titulo)} className="pv-bloco">
                <h3 className="pv-faixa">
                  <span>
                    {b.icone} {b.titulo}
                  </span>
                </h3>
                <ul>
                  {b.itens.map((p) => {
                    const promo = promoDe.get(p.nome);
                    return (
                      <li key={p.id}>
                        <div className="pv-item-nome">
                          <b>{p.nome}</b>
                          {promo && <span className="pv-item-promo">🔥 {promo.nome}</span>}
                          {p.descricao && <small>{p.descricao}</small>}
                        </div>
                        <i aria-hidden />
                        {site.mostrarPrecos && <span className="pv-preco">{reais(p.precoCentavos)}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {!produtos.length && <p className="pv-vazio">O cardápio está sendo preparado. Volte em breve!</p>}
          {couver && (
            <p className="pv-rodape-menu">
              🎵 Couver artístico{site.mostrarPrecos && couver.itens[0] ? ` ${reais(couver.itens[0].precoCentavos)}` : ''} por pessoa nas noites com música ao vivo
            </p>
          )}
        </div>
      </section>

      <section id="como-funciona" className="pv-secao pv-secao-madeira">
        <div className="pv-largura">
          <div className="pv-cabeca">
            <span className="pv-ornamento" aria-hidden />
            <h2 className="pv-titulo">Como funciona</h2>
          </div>
          <ol className="pv-passos">
            <li>
              <span>1</span>
              <h3>Peça ao garçom</h3>
              <p>Ele anota no celular os petiscos e as bebidas da sua mesa.</p>
            </li>
            <li>
              <span>2</span>
              <h3>Pague na mesa</h3>
              <p>Crédito, débito, Pix ou dinheiro. Dá para dividir a conta entre a turma.</p>
            </li>
            <li>
              <span>3</span>
              <h3>Receba na hora</h3>
              <p>O pedido vai direto para a cozinha e o bar. Quer mais? É só chamar de novo.</p>
            </li>
          </ol>
          {site.sobre && <p className="pv-sobre">{site.sobre}</p>}
        </div>
      </section>

      <section id="duvidas" className="pv-secao">
        <div className="pv-largura pv-estreito">
          <div className="pv-cabeca">
            <span className="pv-ornamento" aria-hidden />
            <h2 className="pv-titulo">Dúvidas</h2>
          </div>
          <div className="pv-faq">
            <details>
              <summary>Preciso abrir comanda?</summary>
              <p>Não. Cada pedido é pago na hora, na mesa. Peça quantas vezes quiser, sem conta acumulada para fechar no final.</p>
            </details>
            <details>
              <summary>Quais formas de pagamento vocês aceitam?</summary>
              <p>Crédito, débito e Pix na maquininha que o garçom leva até a mesa, e também dinheiro. A conta pode ser dividida.</p>
            </details>
            <details>
              <summary>Como funciona a promoção em dobro?</summary>
              <p>No horário da promoção, cada cerveja da promoção que você paga vem com outra de graça. O garçom já lança as duas.</p>
            </details>
            <details>
              <summary>E se eu precisar cancelar um pedido?</summary>
              <p>Fale com o garçom. O cancelamento é autorizado pela gerência e o valor volta na maquininha.</p>
            </details>
            {whats && (
              <details>
                <summary>Vocês fazem reserva?</summary>
                <p>
                  Fale com a gente pelo{' '}
                  <a href={whats} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                  .
                </p>
              </details>
            )}
          </div>
        </div>
      </section>

      <section id="contato" className="pv-secao pv-secao-madeira">
        <div className="pv-largura">
          <div className="pv-cabeca">
            <span className="pv-ornamento" aria-hidden />
            <h2 className="pv-titulo">Venha nos visitar</h2>
          </div>
          <div className="pv-visita">
            <div className="pv-cartao">
              <span className="pv-icone">🕒</span>
              <h3>Horário</h3>
              {site.horario ? site.horario.split('\n').map((l, i) => <p key={i}>{l}</p>) : <p>Consulte pelo WhatsApp.</p>}
            </div>
            <div className="pv-cartao">
              <span className="pv-icone">📍</span>
              <h3>Endereço</h3>
              {site.endereco || site.cidade ? (
                <>
                  {site.endereco && <p>{site.endereco}</p>}
                  {site.cidade && <p>{site.cidade}</p>}
                  {mapa && (
                    <a href={mapa} target="_blank" rel="noreferrer" className="pv-btn pv-btn-linha pv-btn-p">
                      Abrir no mapa
                    </a>
                  )}
                </>
              ) : (
                <p>Manaus · AM</p>
              )}
            </div>
            <div className="pv-cartao">
              <span className="pv-icone">💬</span>
              <h3>Fale com a gente</h3>
              {whats && (
                <a href={whats} target="_blank" rel="noreferrer" className="pv-btn pv-btn-ouro pv-btn-p">
                  WhatsApp
                </a>
              )}
              {site.instagram && (
                <p>
                  <a href={`https://instagram.com/${site.instagram}`} target="_blank" rel="noreferrer">
                    @{site.instagram}
                  </a>
                </p>
              )}
              {!whats && !site.instagram && <p>Chame o garçom ou passe no balcão.</p>}
            </div>
          </div>
        </div>
      </section>

      <footer className="pv-rodape">
        <div className="pv-largura pv-rodape-in">
          <img src="/logo.png" alt="" />
          <p>
            © {ano} {site.nome}
          </p>
          <a href={equipe.href}>{equipe.texto}</a>
        </div>
      </footer>

      {whats && (
        <a href={whats} target="_blank" rel="noreferrer" className="pv-whats-flutuante" aria-label="Falar no WhatsApp">
          💬
        </a>
      )}
    </div>
  );
}
