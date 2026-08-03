import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { FiArrowRight } from 'react-icons/fi'
import ProductCard from '../components/ProductCard'
import { categoryDetails, normaliseCategory, products } from '../data/products'

export default function CategoryProducts() {
  const { category: categoryParam } = useParams();
  const category = normaliseCategory(categoryParam);
  const details = categoryDetails[category];
  const items = products.filter((product) => category === 'women' ? product.gender?.toLowerCase() === 'women' : normaliseCategory(product.category) === category)

  if (!details) return <main className="page-shell"><p className="eyebrow">AURELIA edit</p><h1>Collection not found.</h1><Link className="button button-dark" to="/shop">Explore the shop <FiArrowRight /></Link></main>

  return <><Helmet><title>{details.label} | AURELIA</title><meta name="description" content={details.description} /></Helmet><main className="page-shell category-products-page"><nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>{details.label}</span></nav><div className="shop-tools"><span>{items.length} essentials</span><span className="category-filter-label">Curated for your ritual</span></div>{items.length ? <div className="product-grid">{items.map((product) => <ProductCard product={product} key={product.id} />)}</div> : <p className="empty-category">New pieces for this collection are coming soon.</p>}</main></>
}