import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BRAND, GLOBAL_MODULES, JOURNEYS, JOURNEY_IDS, MODULES, scopeColor, type Scope } from '../config/journeys'
import { PERIODS, type PeriodId } from '../domain/metrics'
import { REF_DATE, dateLabel } from '../domain/dates'
import { useApp } from './AppContext'

function useScope(): Scope {
  const seg = useLocation().pathname.split('/')[1]
  return (JOURNEY_IDS as string[]).includes(seg) ? (seg as Scope) : 'global'
}

export function Layout() {
  const scope = useScope()
  const accent = scopeColor(scope)
  const style = { '--accent': accent, '--accent-soft': scope === 'global' ? '#ece8f3' : JOURNEYS[scope].corSuave } as CSSProperties

  return (
    <div className="app" style={style}>
      <Sidebar scope={scope} />
      <div className="main">
        <Topbar scope={scope} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Sidebar({ scope }: { scope: Scope }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [menuMobile, setMenuMobile] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMenuMobile(false), [pathname])
  const aberto = (s: Scope) => abertos[s] ?? s === scope
  const toggle = (s: Scope) => setAbertos((a) => ({ ...a, [s]: !aberto(s) }))

  return (
    <aside className={`sidebar ${menuMobile ? 'open' : ''}`}>
      <div className="brand">
        <div>
          <div className="brand-name">AKORA</div>
          <div className="brand-sub">Command Center</div>
        </div>
        <button className="menu-toggle" onClick={() => setMenuMobile((m) => !m)} aria-label="Menu">
          {menuMobile ? '✕' : '☰'}
        </button>
      </div>
      <div className="side-body">

      <div className="side-group">
        <button className={`side-title ${scope === 'global' ? 'active' : ''}`} onClick={() => toggle('global')}>
          <span className="t">
            <span className="dot" style={{ background: BRAND.softLavender }} />
            AKORA Global
          </span>
          <small>Empresa</small>
        </button>
        {aberto('global') && (
          <nav className="side-links">
            {GLOBAL_MODULES.map((m) => (
              <NavLink key={m.id} to={`/global/${m.id}`}>
                <span className="ico">{m.icon}</span>
                {m.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      {JOURNEY_IDS.map((j) => (
        <div className="side-group" key={j}>
          <button className={`side-title ${scope === j ? 'active' : ''}`} onClick={() => toggle(j)}>
            <span className="t">
              <span className="dot" style={{ background: JOURNEYS[j].cor === BRAND.deepPlum ? BRAND.softWhite : JOURNEYS[j].cor }} />
              {JOURNEYS[j].nome.replace('AKORA ', '')}
            </span>
            <small>{JOURNEYS[j].faixa}</small>
          </button>
          {aberto(j) && (
            <nav className="side-links">
              {MODULES.map((m) => (
                <NavLink key={m.id} to={`/${j}/${m.id}`}>
                  <span className="ico">{m.icon}</span>
                  {m.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      ))}

      <div className="side-foot">
        Sistema interno de gestão — acesso restrito.
        <br />
        Indicadores agregados e autorizados.
        <br />
        Dados fictícios até a configuração das integrações. Referência: {dateLabel(REF_DATE)}.
      </div>
      </div>
    </aside>
  )
}

function Topbar({ scope }: { scope: Scope }) {
  const { period, setPeriod } = useApp()
  const { pathname } = useLocation()
  const modulo = pathname.split('/')[2] ?? 'dashboard'
  // Ao trocar de jornada, mantém o módulo quando ele existe no destino.
  const destino = (s: Scope) => {
    const ids: readonly string[] = (s === 'global' ? GLOBAL_MODULES : MODULES).map((m) => m.id)
    return `/${s}/${ids.includes(modulo) ? modulo : 'dashboard'}`
  }
  const opcoes: { s: Scope; label: string }[] = [
    { s: 'global', label: 'Global' },
    { s: 'teen', label: 'Teen' },
    { s: 'ciclo', label: 'Ciclo' },
    { s: 'mais40', label: '40+' },
  ]

  return (
    <header className="topbar">
      <nav className="journey-switch" aria-label="Seletor de jornada">
        {opcoes.map((o) => (
          <NavLink key={o.s} to={destino(o.s)} className={o.s === scope ? 'active' : ''}>
            <span className="dot" style={{ background: scopeColor(o.s) }} />
            {o.label}
          </NavLink>
        ))}
      </nav>
      <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)} aria-label="Período">
        {PERIODS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <div className="top-spacer" />
      <GlobalSearch />
      <nav className="module-strip" aria-label="Módulos">
        {(scope === 'global' ? GLOBAL_MODULES : MODULES).map((m) => (
          <NavLink key={m.id} to={`/${scope}/${m.id}`}>
            <span aria-hidden="true">{m.icon}</span> {m.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

function GlobalSearch() {
  const { ds } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out: { label: string; hint: string; to: string }[] = []
    for (const m of GLOBAL_MODULES) if (m.label.toLowerCase().includes(term)) out.push({ label: m.label, hint: 'AKORA Global', to: `/global/${m.id}` })
    for (const j of JOURNEY_IDS)
      for (const m of MODULES)
        if (m.label.toLowerCase().includes(term) || JOURNEYS[j].nome.toLowerCase().includes(term))
          out.push({ label: `${m.label}`, hint: JOURNEYS[j].nome, to: `/${j}/${m.id}` })
    for (const c of ds.campanhas)
      if (c.nome.toLowerCase().includes(term) || c.canal.toLowerCase().includes(term))
        out.push({ label: c.nome, hint: `Campanha · ${JOURNEYS[c.jornada].nome} · ${c.canal}`, to: `/${c.jornada}/marketing?tab=campanhas&q=${encodeURIComponent(c.nome)}` })
    return out.slice(0, 14)
  }, [q, ds])

  return (
    <div className="search">
      <input
        placeholder="Pesquisar módulos e campanhas…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((r, i) => (
            <button
              key={i}
              onMouseDown={() => {
                nav(r.to)
                setQ('')
                setOpen(false)
              }}
            >
              {r.label}
              <small>{r.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
