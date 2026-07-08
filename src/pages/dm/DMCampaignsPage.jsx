import { useCampaignContext } from '../../contexts/CampaignContext'
import CampaignManager from '../../components/dm/CampaignManager'

export default function DMCampaignsPage() {
  const { campaigns, reload } = useCampaignContext()

  return (
    <section className="page">
      <div className="view-header">
        <h1>Campaigns</h1>
      </div>
      <CampaignManager campaigns={campaigns} onChange={reload} />
    </section>
  )
}
