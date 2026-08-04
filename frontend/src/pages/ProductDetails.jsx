import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight, FiHeart, FiShoppingBag } from 'react-icons/fi'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { categoryDetails, getProduct } from '../data/products'

export default function ProductDetails() {
  const { slug } = useParams();
  const product = getProduct(slug);
  const { addToCart } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();
  const [activeImage, setActiveImage] = useState(0);

  if (!product) return <main className="page-shell"><p className="eyebrow">AURELIA edit</p><h1>Product not found.</h1><Link className="button button-dark" to="/shop">Explore the shop <FiArrowRight /></Link></main>

  const images = product.images?.length ? product.images : [product.thumbnail]
  const liked = wishlist.some((item) => String(item.id) === String(product.id))
  const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0
  const category = categoryDetails[product.category]

  return <><Helmet><title>{product.name} | AURELIA</title><meta name="description" content={product.description} /></Helmet><main className="page-shell product-details-page"><nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to={`/category/${product.category}`}>{category?.label || product.category}</Link><span>/</span><span>{product.name}</span></nav><div className="product-details-layout"><section className="product-gallery" aria-label={`${product.name} images`}><div className="product-thumbnails">{images.map((src, index) => <button type="button" className={index === activeImage ? 'is-active' : ''} onClick={() => setActiveImage(index)} key={src} aria-label={`View image ${index + 1}`}><img src={src} alt="" /></button>)}</div><div className="product-main-image"><img src={images[activeImage]} alt={product.name} /></div></section><section className="product-details-copy"><p className="eyebrow">AURELIA botanical beauty</p><p className="product-category">{category?.label || product.category}</p><h1>{product.name}</h1><p className="detail-rating">★ {product.rating} <span>({product.numReviews} reviews)</span></p><p className="detail-description">{product.description}</p><div className="detail-price"><strong>Rs. {product.price}</strong>{product.oldPrice && <del>Rs. {product.oldPrice}</del>}{discount > 0 && <span>{discount}% OFF</span>}</div><p className="tax-note">Inclusive of all taxes</p><p className={product.stock ? 'availability' : 'availability unavailable'}>{product.stock ? 'In stock and ready to ship' : 'Currently unavailable'}</p><div className="detail-section"><h2>Product highlights</h2><ul>{product.highlights?.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul></div><div className="detail-section"><h2>Description</h2><p>{product.description}</p></div></section><aside className="purchase-panel"><p className="eyebrow">Your ritual, delivered</p><h2>Make it part of your everyday.</h2><p>Thoughtful beauty, packed with care and sent directly to you.</p><button className="button button-dark purchase-button" type="button" onClick={() => addToCart(product)} disabled={!product.stock}><FiShoppingBag /> Add to bag</button><button className={`detail-wishlist ${liked ? 'liked' : ''}`} type="button" onClick={() => toggleWishlist(product)}><FiHeart /> {liked ? 'Saved to wishlist' : 'Save to wishlist'}</button><Link className="back-to-shop" to={`/category/${product.category}`}><FiArrowLeft /> Back to {category?.label || 'collection'}</Link></aside></div></main></>
}