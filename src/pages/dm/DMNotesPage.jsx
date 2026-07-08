import { useCampaignContext } from '../../contexts/CampaignContext'
import PlayerNotesViewer from '../../components/dm/PlayerNotesViewer'

export default function DMNotesPage() {
  const { campaigns } = useCampaignContext()

  return (
    <section className="page">
      <div className="view-header">
        <h1>Player Notes</h1>
      </div>
      <PlayerNotesViewer campaigns={campaigns} />
    </section>
  )
}
