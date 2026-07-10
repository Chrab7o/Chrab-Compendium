import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Home from './pages/Home'
import EntryDetail from './pages/EntryDetail'
import EntryEditorPage from './pages/EntryEditorPage'
import MapsView from './pages/MapsView'
import MapDetail from './pages/MapDetail'
import Login from './pages/Login'
import Notes from './pages/Notes'
import MyCharacter from './pages/MyCharacter'
import CharacterSheet from './pages/CharacterSheet'
import Account from './pages/Account'
import CampaignHome from './pages/CampaignHome'
import ImportPage from './pages/ImportPage'
import PlayerLayout from './components/PlayerLayout'
import DMHome from './pages/dm/DMHome'
import DMCampaignsPage from './pages/dm/DMCampaignsPage'
import DMCategoriesPage from './pages/dm/DMCategoriesPage'
import DMOrganizePage from './pages/dm/DMOrganizePage'
import DMMapsPage from './pages/dm/DMMapsPage'
import DMCharactersPage from './pages/dm/DMCharactersPage'
import DMNotesPage from './pages/dm/DMNotesPage'
import DMLayout from './components/dm/DMLayout'
import RequireDM from './components/RequireDM'
import RequireAuth from './components/RequireAuth'
import NewEntryFab from './components/dm/NewEntryFab'

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/general" element={<Navigate to="/" replace />} />
          <Route path="/entry/:id" element={<EntryDetail />} />
          <Route path="/maps" element={<MapsView />} />
          <Route path="/map/:slug" element={<MapDetail />} />
          <Route path="/campaign/:id" element={<CampaignHome />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/notes"
            element={
              <RequireAuth>
                <PlayerLayout>
                  <Notes />
                </PlayerLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/character"
            element={
              <RequireAuth>
                <PlayerLayout>
                  <MyCharacter />
                </PlayerLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/character/:id"
            element={
              <RequireAuth>
                <PlayerLayout>
                  <CharacterSheet />
                </PlayerLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <PlayerLayout>
                  <Account />
                </PlayerLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/dm"
            element={
              <RequireDM>
                <DMLayout />
              </RequireDM>
            }
          >
            <Route index element={<DMHome />} />
            <Route path="organize" element={<DMOrganizePage />} />
            <Route path="categories" element={<DMCategoriesPage />} />
            <Route path="campaigns" element={<DMCampaignsPage />} />
            <Route path="maps" element={<DMMapsPage />} />
            <Route path="characters" element={<DMCharactersPage />} />
            <Route path="notes" element={<DMNotesPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="entries/new" element={<EntryEditorPage />} />
            <Route path="entries/:id/edit" element={<EntryEditorPage />} />
          </Route>
        </Routes>
      </main>
      <NewEntryFab />
    </div>
  )
}
