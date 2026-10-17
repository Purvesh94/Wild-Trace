import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const LiveMapPage = lazy(() => import('./pages/LiveMapPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const MissionsPage = lazy(() => import('./pages/MissionsPage'))
const AnimalsPage = lazy(() => import('./pages/AnimalsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

export default function App() {
  return (
    <Suspense fallback={<main className="page-content" role="status">Loading page…</main>}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/map" element={<LiveMapPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/animals" element={<AnimalsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Suspense>
  )
}
