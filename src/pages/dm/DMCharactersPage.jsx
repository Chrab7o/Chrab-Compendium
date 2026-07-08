import { useCampaignContext } from '../../contexts/CampaignContext'
import CharacterManager from '../../components/dm/CharacterManager'

export default function DMCharactersPage() {
  const { campaigns } = useCampaignContext()

  return (
    <section className="page">
      <div className="view-header">
        <h1>Characters</h1>
      </div>
      <CharacterManager campaigns={campaigns} />
    </section>
  )
}
