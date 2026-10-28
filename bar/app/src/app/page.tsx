// Site público do restaurante (estrutura inspirada no modelo ScrewFast): apresentação, cardápio ao
// vivo, como funciona o pedido na mesa, dúvidas e contato. A equipe entra pela "Área da equipe".
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { INICIO } from '@/domain/papeis';
import { linkMapa, linkWhatsapp } from '@/domain/site';
import { semUsuarios, usuarioAtual } from '@/server/auth';
import { listarProdutos } from '@/server/cadastros';
import { lerSite } from '@/server/site';
import { reais } from '@/domain/dinheiro';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const site = await lerSite(await getDb()).catch(() => null);
  return {
    title: site ? `${site.nome} · Cardápio, horário e contato` : 'Vikings Restaurante',
    description: site?.slogan || 'Petiscos, chopp e drinks. Peça na mesa e pague na hora.',
  };
}

export default async function Site() {
  const db = await getDb();
  if (await semUsuarios(db)) redirect('/primeiro-acesso');
  const [site, produtos, u] = await Promise.all([lerSite(db), listarProdutos(db), usuarioAtual()]);
  const whats = linkWhatsapp(site.whatsapp, `Olá! Vim pelo site do ${site.nome}.`);
  const mapa = linkMapa(site.endereco, site.cidade);
  const categorias = [...new Set(produtos.map((p) => p.categoria))];
  const ancora = (c: string) => `cat-${c.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`;
  const equipe = u ? { href: INICIO[u.papel], texto: 'Abrir o sistema' } : { href: '/login', texto: 'Área da equipe' };
  const ano = new Date().getFullYear();

  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-largura site-nav-in">
          <a href="#inicio" className="site-marca">
            <img src="/logo.jpg" alt="" />
            <span>{site.nome}</span>
          </a>
          <nav className="site-links">
            <a href="#cardapio">Cardápio</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#duvidas">Dúvidas</a>
            <a href="#contato">Contato</a>
          </nav>
          <a href={equipe.href} className="site-btn site-btn-claro site-btn-p">
            {equipe.texto}
          </a>
        </div>
      </header>

      <section id="inicio" className="site-hero">
        <div className="site-largura site-hero-in">
          <div>
            <p className="site-sobretitulo">Bar e restaurante</p>
            <h1>{site.nome}</h1>
            {site.slogan && <p className="site-hero-sub">{site.slogan}</p>}
            <div className="site-acoes">
              <a href="#cardapio" className="site-btn site-btn-ouro">
                Ver cardápio
              </a>
              {whats ? (
                <a href={whats} className="site-btn site-btn-vidro" target="_blank" rel="noreferrer">
                  Chamar no WhatsApp
                </a>
              ) : mapa ? (
                <a href={mapa} className="site-btn site-btn-vidro" target="_blank" rel="noreferrer">
                  Como chegar
                </a>
              ) : (
                <a href="#contato" className="site-btn site-btn-vidro">
                  Horário e contato
                </a>
              )}
            </div>
            <ul className="site-selos">
              <li>Pague na mesa</li>
              <li>Sem comanda, sem fila no caixa</li>
              <li>Pedido direto para a cozinha</li>
            </ul>
          </div>
          <div className="site-hero-logo">
            <img src="/logo.jpg" alt={`Logo do ${site.nome}`} />
          </div>
        </div>
      </section>

      <section className="site-secao">
        <div className="site-largura">
          <div className="site-cards3">
            <div className="site-card">
              <span className="site-icone">🍟</span>
              <h3>Petiscos saindo na hora</h3>
              <p>O pedido vai do celular do garçom direto para a cozinha. Você acompanha e recebe na mesa.</p>
            </div>
            <div className="site-card">
              <span className="site-icone">🍺</span>
              <h3>Chopp gelado e drinks</h3>
              <p>As bebidas seguem para o bar no mesmo instante. Pediu, pagou, já está sendo preparado.</p>
            </div>
            <div className="site-card">
              <span className="site-icone">💳</span>
              <h3>Pague na mesa</h3>
              <p>A maquininha vem até você. Cada pedido é pago na hora, sem comanda para fechar no fim.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="cardapio" className="site-secao site-secao-cinza">
        <div className="site-largura">
          <div className="site-titulo-secao">
            <p className="site-sobretitulo">Cardápio</p>
            <h2>O que tem hoje</h2>
            <p>Atualizado pelo próprio restaurante: o que aparece aqui está disponível agora.</p>
          </div>
          {categorias.length > 1 && (
            <div className="site-chips">
              {categorias.map((c) => (
                <a key={c} href={`#${ancora(c)}`}>
                  {c}
                </a>
              ))}
            </div>
          )}
          {categorias.map((c) => (
            <div key={c} id={ancora(c)} className="site-categoria">
              <h3>{c}</h3>
              <div className="site-itens">
                {produtos
                  .filter((p) => p.categoria === c)
                  .map((p) => (
                    <div key={p.id} className="site-item">
                      <div>
                        <b>{p.nome}</b>
                        {p.descricao && <p>{p.descricao}</p>}
                      </div>
                      {site.mostrarPrecos && <span className="site-preco">{reais(p.precoCentavos)}</span>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {!produtos.length && <p className="site-vazio">O cardápio está sendo preparado. Volte em breve!</p>}
        </div>
      </section>

      <section id="como-funciona" className="site-secao">
        <div className="site-largura">
          <div className="site-titulo-secao">
            <p className="site-sobretitulo">Como funciona</p>
            <h2>Peça, pague e receba na mesa</h2>
          </div>
          <ol className="site-passos">
            <li>
              <span>1</span>
              <h3>Escolha com o garçom</h3>
              <p>Ele anota no celular os petiscos e as bebidas da sua mesa.</p>
            </li>
            <li>
              <span>2</span>
              <h3>Pague na maquininha</h3>
              <p>Crédito, débito ou Pix, ali mesmo. Também aceitamos dinheiro.</p>
            </li>
            <li>
              <span>3</span>
              <h3>Receba na mesa</h3>
              <p>A cozinha e o bar já recebem o pedido. Quer mais? É só chamar de novo.</p>
            </li>
          </ol>
          {site.sobre && <p className="site-sobre">{site.sobre}</p>}
        </div>
      </section>

      <section id="duvidas" className="site-secao site-secao-cinza">
        <div className="site-largura site-estreito">
          <div className="site-titulo-secao">
            <p className="site-sobretitulo">Dúvidas</p>
            <h2>Perguntas frequentes</h2>
          </div>
          <div className="site-faq">
            <details>
              <summary>Preciso abrir comanda?</summary>
              <p>Não. Cada pedido é pago na hora, na mesa. Você pode pedir quantas vezes quiser, sem conta acumulada para fechar no final.</p>
            </details>
            <details>
              <summary>Quais formas de pagamento vocês aceitam?</summary>
              <p>Crédito, débito e Pix na maquininha que o garçom leva até a mesa, e também dinheiro.</p>
            </details>
            <details>
              <summary>Posso pedir mais coisas depois?</summary>
              <p>Claro. Chame o garçom, faça um novo pedido e pague só ele. A mesa pode fazer vários pedidos durante a noite.</p>
            </details>
            <details>
              <summary>E se eu precisar cancelar um pedido?</summary>
              <p>Fale com o garçom. O cancelamento é autorizado pela gerência e o valor é devolvido na maquininha.</p>
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

      <section id="contato" className="site-secao">
        <div className="site-largura">
          <div className="site-titulo-secao">
            <p className="site-sobretitulo">Contato</p>
            <h2>Venha nos visitar</h2>
          </div>
          <div className="site-cards3">
            <div className="site-card">
              <span className="site-icone">🕒</span>
              <h3>Horário</h3>
              {site.horario ? (
                site.horario.split('\n').map((l, i) => <p key={i}>{l}</p>)
              ) : (
                <p>Consulte pelo WhatsApp.</p>
              )}
            </div>
            <div className="site-card">
              <span className="site-icone">📍</span>
              <h3>Endereço</h3>
              {site.endereco || site.cidade ? (
                <>
                  {site.endereco && <p>{site.endereco}</p>}
                  {site.cidade && <p>{site.cidade}</p>}
                  {mapa && (
                    <a href={mapa} target="_blank" rel="noreferrer" className="site-link">
                      Abrir no mapa →
                    </a>
                  )}
                </>
              ) : (
                <p>Em breve.</p>
              )}
            </div>
            <div className="site-card">
              <span className="site-icone">💬</span>
              <h3>Fale com a gente</h3>
              {whats && (
                <a href={whats} target="_blank" rel="noreferrer" className="site-link">
                  WhatsApp →
                </a>
              )}
              {site.instagram && (
                <a href={`https://instagram.com/${site.instagram}`} target="_blank" rel="noreferrer" className="site-link">
                  @{site.instagram} no Instagram →
                </a>
              )}
              {!whats && !site.instagram && <p>Em breve.</p>}
            </div>
          </div>
        </div>
      </section>

      <footer className="site-rodape">
        <div className="site-largura site-rodape-in">
          <div className="site-marca">
            <img src="/logo.jpg" alt="" />
            <span>{site.nome}</span>
          </div>
          <p>
            © {ano} {site.nome}
          </p>
          <a href={equipe.href}>{equipe.texto}</a>
        </div>
      </footer>
    </div>
  );
}
