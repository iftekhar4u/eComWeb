import { Link } from 'react-router-dom'
import { FiArrowRight } from 'react-icons/fi'
import { useStore } from '../context/StoreContext'
import useApi from '../hooks/useApi'

export default function About() {
  const { settings } = useStore()
  const { data, loading, error, reload } = useApi('/content/pages/about')
  const brand = settings.brandName || 'AURELIA'
  if (loading) return <main className="page-shell about-page"><p role="status">Loading our story…</p></main>
  if (error) return <main className="page-shell about-page"><p className="eyebrow">Our story</p><h1>About {brand}</h1><p role="alert">{error === 'Page not found' ? 'Our About page is not available right now.' : error}</p><div className="about-actions"><button className="button button-dark" onClick={reload}>Try again</button><Link className="text-link" to="/contact">Contact us <FiArrowRight/></Link></div></main>
  if (!data) return null
  const paragraphs = data.content.split(/\r?\n\s*\r?\n/).filter(value => value.trim())
  return <main className="page-shell about-page">
    <header className="about-heading"><p className="eyebrow">Our story</p><h1>{data.title}</h1></header>
    <section className="about-story" aria-label="Our story">
      <div className="about-mark" aria-hidden="true"><span>{brand.slice(0, 1)}</span><small>{brand}</small></div>
      <div className="about-copy">{paragraphs.map((paragraph, index) => <p className={index === 0 ? 'about-intro' : ''} key={index}>{paragraph}</p>)}</div>
    </section>
    <div className="about-footer"><div><p className="eyebrow">Continue exploring</p><h2>Find your everyday ritual.</h2></div><div className="about-actions"><Link className="button button-dark" to="/shop">Explore the collection <FiArrowRight/></Link><Link className="text-link" to="/contact">Get in touch <FiArrowRight/></Link></div></div>
  </main>
}
