import { Link, useParams } from 'react-router-dom'
import { FiArrowRight } from 'react-icons/fi'
import ProductCard from '../components/ProductCard'
import { useStore } from '../context/StoreContext'
import useApi from '../hooks/useApi'
import { toProduct } from '../services/format'
import { useSearchParams } from 'react-router-dom'

export default function CategoryProducts() {
  const { category: categoryParam } = useParams();
  const category = categoryParam.toLowerCase()
  const { categoryDetails, loading: contentLoading } = useStore()
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page')) || 1
  const { data, loading, error } = useApi(`/products?category=${encodeURIComponent(category)}&page=${page}&limit=12`)
  const details = categoryDetails[category];
  const items = (data?.products || []).map(toProduct)
  if (contentLoading || loading) return <main className="page-shell" role="status">Loading collection...</main>
  if (error) return <main className="page-shell form-error">{error}</main>

  if (!details) return <main className="page-shell"><p className="eyebrow">AURELIA edit</p><h1>Collection not found.</h1><Link className="button button-dark" to="/shop">Explore the shop <FiArrowRight /></Link></main>

  return <><main className="page-shell category-products-page"><nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>{details.label}</span></nav><div className="shop-tools"><span>{data?.total || 0} essentials</span><span className="category-filter-label">Curated for your ritual</span></div>{items.length ? <div className="product-grid">{items.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <p className="empty-category">New pieces for this collection are coming soon.</p>}<div className="pagination">{page > 1 && <button onClick={() => setParams({ page: page - 1 })}>Previous</button>}{page < data?.pages && <button onClick={() => setParams({ page: page + 1 })}>Next</button>}</div></main></>
}