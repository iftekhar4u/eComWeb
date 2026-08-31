import { FiHeart, FiArrowRight } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { categoryDetails } from '../data/products'
export default function ProductCard({ product }) {
  const { addToCart } = useCart(); const { wishlist, toggleWishlist } = useWishlist(); const liked = wishlist.some((item) => item.id === product.id)
  return <article className="product-card"><div className="product-image"><Link to={`/product/${product.slug || product.id}`} aria-label={`View ${product.name}`}><img src={product.image || product.thumbnail} alt={`${product.name} beauty product`} loading="lazy" /></Link><span className="product-tag">{product.tag || 'AURELIA'}</span><button className={`heart-button ${liked ? 'liked' : ''}`} onClick={() => toggleWishlist(product)} aria-label={`${liked ? 'Remove' : 'Add'} ${product.name} ${liked ? 'from' : 'to'} wishlist`}><FiHeart /></button></div><div className="product-info"><p className="product-category">{categoryDetails[product.category]?.label || product.category}</p><h3><Link to={`/product/${product.slug || product.id}`}>{product.name}</Link></h3><p className="rating">★ {product.rating || '4.8'} <span>({product.reviews || product.numReviews || 0})</span></p><div className="price-row"><strong>Rs. {product.price}</strong>{product.oldPrice && <del>Rs. {product.oldPrice}</del>}<span>{product.oldPrice ? `${Math.round((1 - product.price / product.oldPrice) * 100)}% off` : ''}</span></div><button className="add-button" onClick={() => addToCart(product)}>Add to bag <FiArrowRight /></button></div></article>
}
