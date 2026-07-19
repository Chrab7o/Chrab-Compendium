import { useCampaignContext } from '../../contexts/CampaignContext'
import { useWorlds } from '../../hooks/useWorlds'
import CampaignManager from '../../components/dm/CampaignManager'

export default function DMCampaignsPage() {
  const { campaigns, reload } = useCampaignContext()
  const { worlds } = useWorlds()

  return (
    <section className="page">
      <div className="view-header">
        <h1>Campaigns</h1>
      </div>
      <CampaignManager campaigns={campaigns} worlds={worlds} onChange={reload} />
    </section>
  )
}
