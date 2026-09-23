import TagGroupManager from '../../components/dm/TagGroupManager'
import TagManager from '../../components/dm/TagManager'

export default function DMTagsPage() {
  return (
    <section className="page">
      <div className="view-header">
        <h1>Tags &amp; Groups</h1>
        <p className="view-subtitle">
          Everything is organized by tags now — groups are the pseudo-folders that decide how
          they're grouped in search.
        </p>
      </div>
      <TagGroupManager />
      <TagManager />
    </section>
  )
}
