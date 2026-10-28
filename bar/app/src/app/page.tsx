// Site público do restaurante (visual de vidro, claro e minimalista): apresentação, cardápio ao
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

// cor de destaque de cada categoria do cardápio, em rodízio
const CORES = ['#c98a2b', '#e9875a', '#5b7cfa', '#2f9e6a', '#8b6cf0'];

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
  const marca = site.nome.split(' ')[0] || site.nome;
  const resto = site.nome.slice(marca.length).trim();

  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-largura site-nav-in">
          <a href="#inicio" className="site-marca">
            <img src="/logo.jpg" alt="" />
            <span>
              {marca}
              {resto && <small>{resto}</small>}
            </span>
          </a>
          <nav className="site-links">
            <a href="#cardapio">Cardápio</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#duvidas">Dúvidas</a>
            <a href="#contato">Visite</a>
          </nav>
          <a href={equipe.href} className="site-btn site-btn-creme site-btn-p">
            {equipe.texto}
          </a>
        </div>
      </header>

      <section id="inicio" className="site-hero">
        <div className="site-largura">
          <h1 className="site-display">
            <span className="site-contorno">Pediu, pagou,</span>
            <br />
            chegou na mesa.
          </h1>
          {site.slogan && <p className="site-hero-sub">{site.slogan}</p>}
          <div className="site-disco">
            <img src="/logo.jpg" alt={`Logo do ${site.nome}`} />
            <span className="site-orbita o1" aria-hidden>
              🍺
            </span>
            <span className="site-orbita o2" aria-hidden>
              🍟
            </span>
            <span className="site-orbita o3" aria-hidden>
              🍹
            </span>
          </div>
          <div className="site-faixa">
            <span>Pague na mesa</span>
            <i />
            <a href="#cardapio" className="site-btn site-btn-creme">
              Ver cardápio
            </a>
            <i />
            <span>Sem comanda</span>
          </div>
        </div>
      </section>

      <section className="site-manifesto">
        <div className="site-largura">
          <p className="site-display">Chopp gelado, petisco quente e nada de fila no caixa.</p>
        </div>
      </section>

      <section className="site-secao">
        <div className="site-largura">
          <div className="site-etiquetas">
            <div className="site-etiqueta">
              <span className="site-icone">🍟</span>
              <h3>Petiscos saindo na hora</h3>
              <p>O pedido vai do celular do garçom direto para a cozinha. Você acompanha e recebe na mesa.</p>
            </div>
            <div className="site-etiqueta">
              <span className="site-icone">🍺</span>
              <h3>Chopp gelado e drinks</h3>
              <p>As bebidas seguem para o bar no mesmo instante. Pediu, pagou, já está sendo preparado.</p>
            </div>
            <div className="site-etiqueta">
              <span className="site-icone">💳</span>
              <h3>Pague na mesa</h3>
              <p>A maquininha vem até você. Cada pedido é pago na hora, sem comanda para fechar no fim.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="cardapio" className="site-secao site-secao-escura">
        <div className="site-largura">
          <div className="site-titulo-secao">
            <h2 className="site-display">
              No <span className="site-contorno">balcão</span> hoje
            </h2>
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
          {categorias.map((c, i) => (
            <div
              key={c}
              id={ancora(c)}
              className="site-categoria"
              style={{ '--cor-cat': CORES[i % CORES.length] } as React.CSSProperties}
            >
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
            <h2 className="site-display">
              Como <span className="site-contorno">funciona</span>
            </h2>
          </div>
          <ol className="site-passos">
            <li>
              <span>01</span>
              <h3>Escolha com o garçom</h3>
              <p>Ele anota no celular os petiscos e as bebidas da sua mesa.</p>
            </li>
            <li>
              <span>02</span>
              <h3>Pague na maquininha</h3>
              <p>Crédito, débito ou Pix, ali mesmo. Também aceitamos dinheiro.</p>
            </li>
            <li>
              <span>03</span>
              <h3>Receba na mesa</h3>
              <p>A cozinha e o bar já recebem o pedido. Quer mais? É só chamar de novo.</p>
            </li>
          </ol>
          {site.sobre && <p className="site-sobre">{site.sobre}</p>}
        </div>
      </section>

      <section id="duvidas" className="site-secao site-secao-escura">
        <div className="site-largura site-duvidas">
          <div className="site-titulo-secao">
            <h2 className="site-display">
              Pergunte
              <br />
              <span className="site-contorno">ao bar</span>
            </h2>
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
                  <a href={whats} target="_blank" rel="noreferrer" style={{ color: 'var(--marca)' }}>
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
            <h2 className="site-display">
              Venha <span className="site-contorno">nos visitar</span>
            </h2>
          </div>
          <div className="site-visita">
            <div className="site-etiqueta">
              <span className="site-icone">🕒</span>
              <h3>Horário</h3>
              {site.horario ? (
                site.horario.split('\n').map((l, i) => <p key={i}>{l}</p>)
              ) : (
                <p>Consulte pelo WhatsApp.</p>
              )}
            </div>
            <div className="site-etiqueta">
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
            <div className="site-etiqueta">
              <span className="site-icone">💬</span>
              <h3>Fale com a gente</h3>
              {whats && (
                <p>
                  <a href={whats} target="_blank" rel="noreferrer" className="site-link">
                    WhatsApp →
                  </a>
                </p>
              )}
              {site.instagram && (
                <p>
                  <a href={`https://instagram.com/${site.instagram}`} target="_blank" rel="noreferrer" className="site-link">
                    @{site.instagram} no Instagram →
                  </a>
                </p>
              )}
              {!whats && !site.instagram && <p>Em breve.</p>}
            </div>
          </div>
        </div>
      </section>

      <footer className="site-rodape">
        <div className="site-largura">
          <p className="site-rodape-marca site-display site-contorno" aria-hidden>
            {marca}
          </p>
          <div className="site-rodape-in">
            <p>
              © {ano} {site.nome}
            </p>
            <a href={equipe.href}>{equipe.texto}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
