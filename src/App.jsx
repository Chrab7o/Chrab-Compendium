import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import GeneralView from './pages/GeneralView'
import EntryDetail from './pages/EntryDetail'
import EntryEditorPage from './pages/EntryEditorPage'
import MapsView from './pages/MapsView'
import MapDetail from './pages/MapDetail'
import Login from './pages/Login'
import Notes from './pages/Notes'
import MyCharacter from './pages/MyCharacter'
import CharacterSheet from './pages/CharacterSheet'
import ImportPage from './pages/ImportPage'
import DMDashboard from './pages/DMDashboard'
import RequireDM from './components/RequireDM'
import RequireAuth from './components/RequireAuth'
import NewEntryFab from './components/dm/NewEntryFab'

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/general" replace />} />
          <Route path="/general" element={<GeneralView />} />
          <Route path="/entry/:id" element={<EntryDetail />} />
          <Route path="/maps" element={<MapsView />} />
          <Route path="/map/:slug" element={<MapDetail />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/notes"
            element={
              <RequireAuth>
                <Notes />
              </RequireAuth>
            }
          />
          <Route
            path="/character"
            element={
              <RequireAuth>
                <MyCharacter />
              </RequireAuth>
            }
          />
          <Route
            path="/character/:id"
            element={
              <RequireAuth>
                <CharacterSheet />
              </RequireAuth>
            }
          />
          <Route
            path="/dm"
            element={
              <RequireDM>
                <DMDashboard />
              </RequireDM>
            }
          />
          <Route
            path="/dm/entries/new"
            element={
              <RequireDM>
                <EntryEditorPage />
              </RequireDM>
            }
          />
          <Route
            path="/dm/entries/:id/edit"
            element={
              <RequireDM>
                <EntryEditorPage />
              </RequireDM>
            }
          />
          <Route
            path="/dm/import"
            element={
              <RequireDM>
                <ImportPage />
              </RequireDM>
            }
          />
        </Routes>
      </main>
      <NewEntryFab />
    </div>
  )
}
