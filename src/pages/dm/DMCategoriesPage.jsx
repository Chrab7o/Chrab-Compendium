import CategoryManager from '../../components/dm/CategoryManager'
import CategoryConsolidator from '../../components/dm/CategoryConsolidator'

export default function DMCategoriesPage() {
  return (
    <section className="page">
      <div className="view-header">
        <h1>Categories</h1>
      </div>
      <CategoryManager />
      <CategoryConsolidator />
    </section>
  )
}
