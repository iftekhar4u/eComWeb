import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { FiArrowLeft, FiArrowRight, FiChevronLeft, FiChevronRight, FiHeart, FiRefreshCw, FiShield, FiTruck } from 'react-icons/fi'
import ProductCard from '../components/ProductCard'
import { categoryDetails, categoryOrder, products } from '../data/products'
import { blogs } from '../data/blogs'
import { BlogCard } from './BlogPages'

const image = (id, width = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`
const categories = categoryOrder.map((slug) => [categoryDetails[slug].label, categoryDetails[slug].image, slug])
const slides = [
  ['YOUR BEAUTY.\nYOUR RADIANCE.', 'Discover skincare and beauty essentials designed for your everyday routine.', image('photo-1612817288484-6f916006741a', 1600)],
    // ['GOODNESS OF NATURE.\nVISIBLE ON YOU.', 'Natural ingredients and thoughtful formulas for healthy, glowing skin.', image('photo-1556228578-8c89e6adf883', 1600)],
    // ['GLOW WITH\nCONFIDENCE.', 'Build a simple ritual that makes your natural radiance feel effortless.', image('photo-1611930022073-b7a4ba5fcccd', 1600)],
]
const benefits = [[FiHeart, '100% Original', 'Products'], [FiTruck, 'Free Shipping', 'Above Rs. 499'], [FiRefreshCw, 'Easy Returns', '& Exchanges'], [FiShield, 'Secure Payments', '100% Safe']]
const reviews = [
  { id: 1, name: 'Ananya S.', text: 'The serum has made my morning routine feel so easy. My skin looks fresh and bright.', rating: 5 },
  { id: 2, name: 'Meera R.', text: 'Beautiful textures, quick delivery and such a lovely thoughtful brand.', rating: 5 },
  { id: 3, name: 'Riya K.', text: 'The moisturizer is light but nourishing. It is now a permanent part of my shelf.', rating: 5 },
  { id: 4, name: 'Nisha P.', text: 'My skin feels softer and more balanced after only a few weeks.', rating: 5 },
  { id: 5, name: 'Tara M.', text: 'The packaging is beautiful, and every product feels thoughtfully made.', rating: 5 },
  { id: 6, name: 'Kavya S.', text: 'This cleanser is gentle on my sensitive skin and leaves it feeling fresh.', rating: 5 },
  { id: 7, name: 'Aditi V.', text: 'Fast delivery, lovely packaging, and products that actually work.', rating: 5 },
  { id: 8, name: 'Ishita G.', text: 'The sunscreen feels lightweight and does not leave a white cast.', rating: 5 },
  { id: 9, name: 'Pooja N.', text: 'A simple skincare routine that has made a noticeable difference.', rating: 5 },
  { id: 10, name: 'Sana A.', text: 'The body lotion absorbs quickly and keeps my skin moisturized all day.', rating: 5 }
]

function SectionHeading({ eyebrow, title, id, link = 'View all', linkTo = '/shop' }) { return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div>{link && <Link className="text-link" to={linkTo}>{link} <FiArrowRight /></Link>}</div> }
function CategoryCard({ name, src, slug }) { return <Link className="category-item" to={`/category/${slug}`}><div className="category-image"><img src={src} alt={`${name} collection`} loading="lazy" /></div><span>{name}</span></Link> }
function CategoryGroup({ hidden = false }) { return <div className="category-group" aria-hidden={hidden}>{categories.map(([name, src, slug]) => <CategoryCard name={name} src={src} slug={slug} key={slug} />)}</div> }
function ProductGrid({ items }) { return <div className="product-grid">{items.map((product) => <ProductCard product={product} key={product.id} />)}</div> }

function ReviewCarousel() {
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
  const [activeSlide, setActiveSlide] = useState(0)
  useEffect(() => { const timer = setInterval(() => setActiveSlide((slide) => (slide + 1) % slides.length), 5000); return () => clearInterval(timer) }, [])
  const [title, description, slideImage] = slides[activeSlide]
  return <>
    <Helmet><title>AURELIA | Your beauty. Your radiance.</title><meta name="description" content="Premium botanical beauty and skincare essentials for your everyday routine." /></Helmet>
    <main>
      <section className="hero-slider" aria-label="Featured beauty collections"><div className="hero-slide-copy"><p className="eyebrow">Aurelia botanical beauty</p><h1>{title.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}<em>{line}</em></span>)}</h1><p className="hero-description">{description}</p><a className="button button-dark" href="#bestsellers">Shop now <FiArrowRight /></a></div><div className="hero-slide-image"><img src={slideImage} alt="AURELIA botanical skincare collection" /><div className="slider-controls"><button type="button" onClick={() => setActiveSlide((activeSlide + slides.length - 1) % slides.length)} aria-label="Previous slide"><FiArrowLeft /></button>{slides.map((_, i) => <button type="button" className={i === activeSlide ? 'is-active' : ''} onClick={() => setActiveSlide(i)} aria-label={`Show slide ${i + 1}`} key={i}><span /></button>)}<button type="button" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)} aria-label="Next slide"><FiArrowRight /></button></div></div></section>
      <section className="benefit-strip" aria-label="Shopping benefits">{benefits.map(([Icon, title, detail]) => <div className="benefit-item" key={title}><Icon /><span><strong>{title}</strong><small>{detail}</small></span></div>)}</section>
      <section className="content-section category-section" aria-labelledby="category-title"><SectionHeading eyebrow="Explore the edit" title="Shop by category" id="category-title" /><div className="category-grid"><div className="category-track"><CategoryGroup /><CategoryGroup hidden /></div></div></section>
      <section className="content-section product-section" id="bestsellers" aria-labelledby="bestseller-title"><SectionHeading eyebrow="Loved by skin" title="Best sellers" id="bestseller-title" /><ProductGrid items={products.slice(0, 4)} /></section>
      <section className="content-section" aria-labelledby="arrivals-title"><SectionHeading eyebrow="Just arrived" title="New arrivals" id="arrivals-title" /><ProductGrid items={products.slice(4)} /></section>
      <section className="featured-collection"><div className="featured-copy"><p className="eyebrow">The glow collection</p><h2>Glow with confidence.</h2><p>Build a simple skincare routine for naturally radiant-looking skin.</p><a className="button button-dark" href="/shop">Shop the collection <FiArrowRight /></a></div><div className="featured-image"><img src={image('photo-1556229010-6c3f2c9c10c1', 1100)} alt="AURELIA glow collection" loading="lazy" /></div></section>
      <section className="promo-banner"><div className="promo-banner-content"><p className="eyebrow">Aurelia essentials</p><h2>Your daily beauty essentials</h2><p>Discover everyday skincare and personal care favorites.</p><a className="button button-dark" href="/shop">Explore now <FiArrowRight /></a></div><div className="promo-banner-image"><img src={image('photo-1551969014-7ee047889906', 1100)} alt="AURELIA essentials collection" loading="lazy" /></div></section>
      <section className="content-section blog-section" aria-labelledby="blog-title"><SectionHeading eyebrow="From our journal" title="Beauty tips & guides" id="blog-title" link="Read all" linkTo="/blog" /><div className="blog-grid">{blogs.map((blog) => <BlogCard blog={blog} heading="h3" key={blog.slug} />)}</div></section>
      <section className="reviews-section" aria-labelledby="reviews-title"><SectionHeading eyebrow="Kind words" title="Customer reviews" id="reviews-title" link="" /><ReviewCarousel /></section>
    </main>
  </>
}
