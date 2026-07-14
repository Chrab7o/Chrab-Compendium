import { useCallback, useEffect } from 'react'
import { useWorlds } from '../../hooks/useWorlds'
import WorldManager from '../../components/dm/WorldManager'

export default function DMWorldsPage() {
  const { worlds, loading, reload } = useWorlds()

  const load = useCallback(() => {
    reload()
  }, [reload])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="status-message">Loading...</p>

  return (
    <section className="page">
      <div className="view-header">
        <h1>Worlds</h1>
      </div>
      <WorldManager worlds={worlds} onChange={load} />
    </section>
  )
}
