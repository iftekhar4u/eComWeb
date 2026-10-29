import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight, FiChevronLeft, FiChevronRight, FiHeart, FiRefreshCw, FiShield, FiTruck } from 'react-icons/fi'
import ProductCard from '../components/ProductCard'
import { useStore } from '../context/StoreContext'
import useApi from '../hooks/useApi'
import { toProduct } from '../services/format'
import { BlogCard } from '../components/BlogCard'

const benefits = [[FiHeart, '100% Original', 'Products'], [FiTruck, 'Free Shipping', 'Above Rs. 499'], [FiRefreshCw, 'Easy Returns', '& Exchanges'], [FiShield, 'Secure Payments', '100% Safe']]

function SectionHeading({ eyebrow, title, id, link = 'View all', linkTo = '/shop' }) { return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div>{link && <Link className="text-link" to={linkTo}>{link} <FiArrowRight /></Link>}</div> }
function CategoryCard({ name, src, slug, alt }) { return <Link className="category-item" to={`/category/${slug}`}><div className="category-image"><img src={src} alt={alt || `${name} collection`} loading="lazy" /></div><span>{name}</span></Link> }
function CategoryGroup({ hidden = false }) { const { categories: entries } = useStore(); const categories = entries.map(c => [c.name, c.image, c.slug, c.seo?.imageAlt]); return <div className="category-group" aria-hidden={hidden} inert={hidden ? true : undefined}>{categories.map(([name, src, slug, alt]) => <CategoryCard name={name} src={src} slug={slug} alt={alt} key={slug} />)}</div> }
function ProductGrid({ items }) { return <div className="product-grid">{items.map((product) => <ProductCard product={product} key={product.id} />)}</div> }

function ReviewCarousel({ reviews }) {
  const [slide, setSlide] = useState(reviews.length)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const trackReviews = [...reviews, ...reviews, ...reviews]

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches)
    updateMotionPreference()
    mediaQuery.addEventListener('change', updateMotionPreference)
    return () => mediaQuery.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    if (reducedMotion || isPaused) return undefined
    const timer = setInterval(() => setSlide((current) => current + 1), 3500)
    return () => clearInterval(timer)
  }, [isPaused, reducedMotion])

  function move(direction) {
    setIsPaused(true)
    setSlide((current) => {
      const next = current + direction
      if (reducedMotion && next >= reviews.length * 2) return reviews.length
      if (reducedMotion && next < reviews.length) return reviews.length * 2 - 1
      return next
    });
  }


  function handlePointerDown(event) {
    startX.current = event.clientX
    setIsDragging(true);
    setIsPaused(true);
  }

  function handlePointerUp(event) {
    if (!isDragging) return
    const distance = event.clientX - startX.current
    if (Math.abs(distance) > 40) move(distance < 0 ? 1 : -1)
    setIsDragging(false)
  }

  function handleTransitionEnd() {
    if (slide >= reviews.length * 2) setSlide(reviews.length)
    if (slide < reviews.length) setSlide(reviews.length * 2 - 1)
  }

  const activeReview = ((slide - reviews.length) % reviews.length + reviews.length) % reviews.length
  return <div className={`review-carousel${isDragging ? ' is-dragging' : ''}`} onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => { setIsPaused(false); setIsDragging(false) }} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => setIsDragging(false)}>
    <div className="review-carousel-viewport">
      <div className="review-track" style={{ '--review-position': slide }} onTransitionEnd={handleTransitionEnd}>
        {trackReviews.map((review, index) => <article className="review-card" key={`${review.id}-${index}`}><p className="review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}</p><p>"{review.text}"</p><strong>{review.name}</strong></article>)}
      </div>
    </div>
    <div className="review-carousel-controls">
      <button type="button" onClick={() => move(-1)} aria-label="Previous reviews"><FiChevronLeft /></button>
      <div className="review-dots" aria-label="Review pages">{reviews.map((review, index) => <button type="button" className={index === activeReview ? 'is-active' : ''} onClick={() => { setIsPaused(true); setSlide(reviews.length + index) }} aria-label={`Show review ${index + 1}`} key={review.id} />)}</div>
      <button type="button" onClick={() => move(1)} aria-label="Next reviews"><FiChevronRight /></button>
    </div>
  </div>
}

export default function Home() {
  const { sections, blogs, settings, loading } = useStore()
  const catalog = useApi('/products?bestSeller=true&limit=4')
  const arrivals = useApi('/products?newArrival=true&limit=8')
  const bestSellers = (catalog.data?.products || []).map(toProduct)
  const newArrivals = (arrivals.data?.products || []).map(toProduct)
  const slides = sections.filter(s => s.slot === 'hero').map(s => [s.heading, s.body, s.image, s])
  const featured = sections.find(s => s.slot === 'featured')
  const promo = sections.find(s => s.slot === 'promo')
  const reviews = (settings.testimonials || []).map((r, i) => ({ ...r, id: r._id || i }))
  const [activeSlide, setActiveSlide] = useState(0)
  useEffect(() => { if (slides.length < 2) return; const timer = setInterval(() => setActiveSlide(slide => (slide + 1) % slides.length), 5000); return () => clearInterval(timer) }, [slides.length])
  if ((loading && !sections.length) || (catalog.loading && !catalog.data) || (arrivals.loading && !arrivals.data)) return <main className="storefront-loading" aria-busy="true"><p role="status">Loading your beauty essentials…</p></main>
  const [title = '', description = '', slideImage = '', activeHero = {}] = slides[activeSlide % slides.length] || []
  return <>
    
    <main>
      {catalog.error && <p className="page-shell form-error" role="alert">{catalog.error} <button onClick={catalog.reload}>Try again</button></p>}
      {arrivals.error && <p className="page-shell form-error" role="alert">{arrivals.error} <button onClick={arrivals.reload}>Try again</button></p>}
      {slides.length > 0 && <section className="hero-slider" aria-label="Featured beauty collections"><div className="hero-slide-copy"><p className="eyebrow">{activeHero.eyebrow}</p><h1>{title.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}<em>{line}</em></span>)}</h1><p className="hero-description">{description}</p><Link className="button button-dark" to={activeHero.link || "/shop"}>{activeHero.buttonText || "Shop now"} <FiArrowRight /></Link></div><div className="hero-slide-image"><img src={slideImage} fetchPriority="high" decoding="async" alt="AURELIA botanical skincare collection" /><div className="slider-controls"><button type="button" onClick={() => setActiveSlide((activeSlide + slides.length - 1) % slides.length)} aria-label="Previous slide"><FiArrowLeft /></button>{slides.map((_, i) => <button type="button" className={i === activeSlide ? 'is-active' : ''} onClick={() => setActiveSlide(i)} aria-label={`Show slide ${i + 1}`} key={i}><span /></button>)}<button type="button" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)} aria-label="Next slide"><FiArrowRight /></button></div></div></section>}
      <section className="benefit-strip" aria-label="Shopping benefits">{benefits.map(([Icon, title, detail]) => <div className="benefit-item" key={title}><Icon /><span><strong>{title}</strong><small>{title === "Free Shipping" ? `Above Rs. ${(settings.freeShippingThresholdPaise ?? 99900) / 100}` : detail}</small></span></div>)}</section>
      <section className="content-section category-section" aria-labelledby="category-title"><SectionHeading eyebrow="Explore the edit" title="Shop by category" id="category-title" /><div className="category-grid"><div className="category-track"><CategoryGroup /><CategoryGroup hidden /></div></div></section>
      <section className="content-section product-section" id="bestsellers" aria-labelledby="bestseller-title"><SectionHeading eyebrow="Loved by skin" title="Best sellers" id="bestseller-title" /><ProductGrid items={bestSellers} /></section>
      <section className="content-section" aria-labelledby="arrivals-title"><SectionHeading eyebrow="Just arrived" title="New arrivals" id="arrivals-title" /><ProductGrid items={newArrivals} /></section>
      {featured && <section className="featured-collection"><div className="featured-copy"><p className="eyebrow">{featured.eyebrow}</p><h2>{featured.heading}</h2><p>{featured.body}</p><Link className="button button-dark" to={featured.link}>{featured.buttonText} <FiArrowRight /></Link></div><div className="featured-image"><img src={featured.image} alt={featured.heading} loading="lazy" /></div></section>}
      {promo && <section className="promo-banner"><div className="promo-banner-content"><p className="eyebrow">{promo.eyebrow}</p><h2>{promo.heading}</h2><p>{promo.body}</p><Link className="button button-dark" to={promo.link}>{promo.buttonText} <FiArrowRight /></Link></div><div className="promo-banner-image"><img src={promo.image} alt={promo.heading} loading="lazy" /></div></section>}
      <section className="content-section blog-section" aria-labelledby="blog-title"><SectionHeading eyebrow="From our journal" title="Beauty tips & guides" id="blog-title" link="Read all" linkTo="/blog" /><div className="blog-grid">{blogs.map((blog) => <BlogCard blog={blog} heading="h3" key={blog.slug} />)}</div></section>
      <section className="reviews-section" aria-labelledby="reviews-title"><SectionHeading eyebrow="Kind words" title="Customer reviews" id="reviews-title" link="" />{reviews.length ? <ReviewCarousel reviews={reviews} /> : <p>Share your experience on a product page.</p>}</section>
    </main>
  </>
}
