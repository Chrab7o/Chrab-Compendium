import { useCampaignContext } from '../contexts/CampaignContext'
import EntrySearch from '../components/EntrySearch'

export default function SearchPage() {
  const { campaign, world } = useCampaignContext()
  const scopeName = campaign?.name ?? world?.name

  return (
    <section className="page">
      <div className="view-header">
        <h1>Search</h1>
        <p className="view-subtitle">
          {scopeName ? `Scoped to ${scopeName}.` : 'Find anything by name, category, or tag.'}
        </p>
      </div>
      <EntrySearch />
    </section>
  )
}
