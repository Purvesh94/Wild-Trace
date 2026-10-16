import { Routes, Route, Navigate } from 'react-router-dom'
import OverviewPage from './pages/OverviewPage'
import LiveMapPage from './pages/LiveMapPage'
import AlertsPage from './pages/AlertsPage'
import MissionsPage from './pages/MissionsPage'
import AnimalsPage from './pages/AnimalsPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/map" element={<LiveMapPage />} />
      <Route path="/alerts" element={<AlertsPage />} />
      <Route path="/missions" element={<MissionsPage />} />
      <Route path="/animals" element={<AnimalsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}
