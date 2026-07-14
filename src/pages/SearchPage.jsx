import { useCampaignContext } from '../contexts/CampaignContext'
import EntrySearch from '../components/EntrySearch'

export default function SearchPage() {
  const { campaign } = useCampaignContext()

  return (
    <section className="page">
      <div className="view-header">
        <h1>Search</h1>
        <p className="view-subtitle">
          {campaign ? `Scoped to ${campaign.name}.` : 'Find anything by name, category, or tag.'}
        </p>
      </div>
      <EntrySearch />
    </section>
  )
}
