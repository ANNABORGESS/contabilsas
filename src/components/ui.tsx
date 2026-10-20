import { useMemo, useState, type ReactNode } from 'react'
import { fmt, signedPct, type Formato } from './format'
import { exportExcel, type Sheet } from './export'
import { IS_ARTIFACT } from '../config/runtime'

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="btn-row no-print">{actions}</div>}
    </div>
  )
}

export function Card({ title, sub, actions, children, className = '' }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="sub">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null || !isFinite(value)) return <span className="muted">—</span>
  const good = inverse ? value < 0 : value > 0
  const cls = Math.abs(value) < 0.0005 ? '' : good ? 'up' : 'down'
  return (
    <span className={`delta ${cls}`}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '•'} {signedPct(value)}
    </span>
  )
}

export function Kpi({ label, value, formato = 'num', delta, inverse, foot }: { label: string; value: number; formato?: Formato; delta?: number | null; inverse?: boolean; foot?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmt(value, formato)}</div>
      <div className="kpi-foot">
        {delta !== undefined && <Delta value={delta} inverse={inverse} />}
        {foot}
      </div>
    </div>
  )
}

export function Badge({ children, tone = '', color }: { children: ReactNode; tone?: string; color?: string }) {
  return (
    <span className={`badge ${tone}`}>
      {color && <span className="dot" style={{ background: color }} />}
      {children}
    </span>
  )
}

export function DemoBadge() {
  return <Badge tone="demo">Dados fictícios</Badge>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs no-print">
      {tabs.map((t) => (
        <button key={t.id} className={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, marker, color }: { value: number; marker?: number; color?: string }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      {marker !== undefined && marker < 1 && <i className="marker" style={{ left: `${marker * 100}%` }} />}
    </div>
  )
}

export interface Column<T> {
  key: string
  label: string
  value: (row: T) => string | number
  render?: (row: T) => ReactNode
  formato?: Formato
  align?: 'right'
}

/** Tabela com pesquisa, ordenação e exportação para Excel. */
export function DataTable<T>({ rows, columns, searchable = true, exportName, pageSize = 25, footer }: { rows: T[]; columns: Column<T>[]; searchable?: boolean; exportName?: string; pageSize?: number; footer?: ReactNode }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [limit, setLimit] = useState(pageSize)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let out = term ? rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(term))) : rows
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)!
      out = [...out].sort((a, b) => {
        const va = col.value(a)
        const vb = col.value(b)
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * sort.dir
      })
    }
    return out
  }, [rows, columns, q, sort])

  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))

  return (
    <div>
      {(searchable || exportName) && (
        <div className="table-tools">
          {searchable && <input className="input" placeholder="Pesquisar na tabela…" value={q} onChange={(e) => setQ(e.target.value)} />}
          <span className="muted small">{filtered.length} registro(s)</span>
          <span style={{ flex: 1 }} />
          {exportName && !IS_ARTIFACT && (
            <button
              className="btn"
              onClick={() =>
                exportExcel(exportName, [
                  {
                    name: exportName.slice(0, 31),
                    rows: filtered.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.value(r)]))),
                  },
                ])
              }
            >
              ⤓ Excel
            </button>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`sortable ${c.align === 'right' || c.formato ? 'num' : ''}`} onClick={() => toggleSort(c.key)}>
                  {c.label} {sort?.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' || c.formato ? 'num' : ''}>
                    {c.render ? c.render(r) : c.formato ? fmt(Number(c.value(r)), c.formato) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
            {footer}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="mt no-print">
          <button className="btn" onClick={() => setLimit((l) => l + pageSize)}>
            Mostrar mais ({filtered.length - limit} restantes)
          </button>
        </div>
      )}
      {filtered.length === 0 && <div className="empty">Nenhum registro encontrado.</div>}
    </div>
  )
}

export function ExportButtons({ name, sheets }: { name: string; sheets: () => Sheet[] }) {
  if (IS_ARTIFACT) return null
  return (
    <>
      <button className="btn" onClick={() => exportExcel(name, sheets())}>
        ⤓ Excel
      </button>
      <button className="btn" onClick={() => window.print()}>
        ⤓ PDF
      </button>
    </>
  )
}
