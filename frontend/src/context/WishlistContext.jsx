import { createContext, useContext, useEffect, useState } from 'react'
const WishlistContext = createContext(null)
export function WishlistProvider({ children }) {
  const [wishlist, setWishlist] = useState(() => JSON.parse(localStorage.getItem('aurelia_wishlist') || '[]'))
  useEffect(() => localStorage.setItem('aurelia_wishlist', JSON.stringify(wishlist)), [wishlist])
  const toggleWishlist = (product) => setWishlist((items) => items.some((item) => item.id === product.id) ? items.filter((item) => item.id !== product.id) : [...items, product])
  const removeFromWishlist = (id) => setWishlist((items) => items.filter((item) => item.id !== id));
  return <WishlistContext.Provider value={{ wishlist, wishlistCount: wishlist.length, toggleWishlist, removeFromWishlist }}>{children}</WishlistContext.Provider>
}
export const useWishlist = () => useContext(WishlistContext)
