import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import GeneralView from './pages/GeneralView'
import CampaignView from './pages/CampaignView'
import EntryDetail from './pages/EntryDetail'
import DMLogin from './pages/DMLogin'
import DMDashboard from './pages/DMDashboard'
import RequireDM from './components/RequireDM'

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/general" replace />} />
          <Route path="/general" element={<GeneralView />} />
          <Route path="/campaign" element={<CampaignView />} />
          <Route path="/campaign/:slug" element={<CampaignView />} />
          <Route path="/entry/:id" element={<EntryDetail />} />
          <Route path="/dm/login" element={<DMLogin />} />
          <Route
            path="/dm"
            element={
              <RequireDM>
                <DMDashboard />
              </RequireDM>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
