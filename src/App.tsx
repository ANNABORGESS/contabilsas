import { HashRouter, MemoryRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { IS_ARTIFACT } from './config/runtime'
import { AppProvider } from './components/AppContext'
import { Layout } from './components/Layout'
import { JOURNEY_IDS, type JourneyId } from './config/journeys'
import { GlobalDashboard } from './pages/global/GlobalDashboard'
import { Comparativo } from './pages/global/Comparativo'
import { JourneyDashboard } from './pages/journey/JourneyDashboard'
import { Usuarias } from './pages/journey/Usuarias'
import { Marketing } from './pages/journey/Marketing'
import { Assinaturas } from './pages/journey/Assinaturas'
import { Financeiro } from './pages/shared/Financeiro'
import { Metas } from './pages/shared/Metas'
import { Relatorios } from './pages/shared/Relatorios'
import { Conselho } from './pages/shared/Conselho'

function JourneyRoute() {
  const { journey, module } = useParams()
  if (!journey || !(JOURNEY_IDS as string[]).includes(journey)) return <Navigate to="/global/dashboard" replace />
  const j = journey as JourneyId
  // `key` garante que nenhum estado de tela vaze entre jornadas.
  switch (module) {
    case 'dashboard':
      return <JourneyDashboard key={j} journey={j} />
    case 'usuarias':
      return <Usuarias key={j} journey={j} />
    case 'financeiro':
      return <Financeiro key={j} scope={j} />
    case 'marketing':
      return <Marketing key={j} journey={j} />
    case 'assinaturas':
      return <Assinaturas key={j} journey={j} />
    case 'metas':
      return <Metas key={j} scope={j} />
    case 'relatorios':
      return <Relatorios key={j} scope={j} />
    case 'conselho':
      return <Conselho key={j} scope={j} />
    default:
      return <Navigate to={`/${j}/dashboard`} replace />
  }
}

const Router = IS_ARTIFACT ? MemoryRouter : HashRouter

export function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/global/dashboard" replace />} />
            <Route path="global">
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<GlobalDashboard />} />
              <Route path="comparativo" element={<Comparativo />} />
              <Route path="financeiro" element={<Financeiro key="global" scope="global" />} />
              <Route path="metas" element={<Metas key="global" scope="global" />} />
              <Route path="relatorios" element={<Relatorios key="global" scope="global" />} />
              <Route path="conselho" element={<Conselho key="global" scope="global" />} />
            </Route>
            <Route path=":journey" element={<Navigate to="dashboard" replace />} />
            <Route path=":journey/:module" element={<JourneyRoute />} />
            <Route path="*" element={<Navigate to="/global/dashboard" replace />} />
          </Route>
        </Routes>
      </Router>
    </AppProvider>
  )
}
