import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { compactBrl, fmt, num, type Formato } from './format'

export interface Serie {
  key: string
  label: string
  color: string
}

const axis = { fontSize: 11, fill: '#6f6782' }
const grid = <CartesianGrid stroke="#efebf3" vertical={false} />

function tickFmt(f: Formato) {
  return (v: number) => (f === 'brl' || f === 'brlCents' ? compactBrl(v) : f === 'pct' ? `${Math.round(v * 100)}%` : num(v))
}

function tooltip(f: Formato) {
  return (
    <Tooltip
      formatter={(v: number, name: string) => [fmt(v, f), name]}
      contentStyle={{ borderRadius: 10, border: '1px solid #e7e2ec', fontSize: 12 }}
      cursor={{ fill: 'rgba(185,176,207,.15)' }}
    />
  )
}


export function LineChartBox({ data, x, series, formato = 'num', height = 260 }: { data: object[]; x: string; series: Serie[]; formato?: Formato; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={tickFmt(formato)} width={70} />
        {tooltip(formato)}
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Line animationDuration={350} key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.4} dot={false} strokeDasharray={s.key.includes('previsto') ? '5 4' : undefined} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function AreaChartBox({ data, x, series, formato = 'num', stacked = false, height = 260 }: { data: object[]; x: string; series: Serie[]; formato?: Formato; stacked?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={tickFmt(formato)} width={70} />
        {tooltip(formato)}
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Area animationDuration={350} key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={stacked ? 0.7 : 0.18} strokeWidth={2} stackId={stacked ? 'a' : undefined} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarChartBox({ data, x, series, formato = 'num', stacked = false, height = 260, horizontal = false }: { data: object[]; x: string; series: Serie[]; formato?: Formato; stacked?: boolean; height?: number; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        {horizontal ? (
          <>
            <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={tickFmt(formato)} />
            <YAxis type="category" dataKey={x} tick={axis} tickLine={false} axisLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
            <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={tickFmt(formato)} width={70} />
          </>
        )}
        {tooltip(formato)}
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar animationDuration={350} key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'a' : undefined} radius={stacked && i < series.length - 1 ? 0 : horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={42} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutBox({ data, formato = 'num', height = 240 }: { data: { name: string; value: number; color: string }[]; formato?: Formato; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        {tooltip(formato)}
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export const PALETA = ['#423566', '#C2877B', '#B9B0CF', '#7B6AA6', '#E0B7AE', '#8F86A8', '#5E9C86']
