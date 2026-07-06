import { useCampaignContext } from '../contexts/CampaignContext'
import CategoryBrowser from '../components/CategoryBrowser'

export default function GeneralView() {
  const { campaign } = useCampaignContext()

  return (
    <section>
      <div className="browse-header">
        <h1>{campaign ? `${campaign.name} Lore` : 'World Lore'}</h1>
      </div>
      <CategoryBrowser />
    </section>
  )
}
