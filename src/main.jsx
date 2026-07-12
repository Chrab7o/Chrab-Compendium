import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ImpersonationProvider } from './contexts/ImpersonationContext'
import { CampaignProvider } from './contexts/CampaignContext'
import { CategoryProvider } from './contexts/CategoryContext'
import { TagProvider } from './contexts/TagContext'
import App from './App'
import 'leaflet/dist/leaflet.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ImpersonationProvider>
          <CampaignProvider>
            <CategoryProvider>
              <TagProvider>
                <App />
              </TagProvider>
            </CategoryProvider>
          </CampaignProvider>
        </ImpersonationProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
