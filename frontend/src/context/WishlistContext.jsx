import { createContext, useContext } from 'react'
import useSavedItems from './useSavedItems'
const WishlistContext = createContext(null)
export function WishlistProvider({ children }) {
  const { items: wishlist, update, error, loading } = useSavedItems('wishlist')
  const toggleWishlist = p => update(items => items.some(i => i.id === p.id) ? items.filter(i => i.id !== p.id) : [...items, p])
  const removeFromWishlist = id => update(items => items.filter(i => i.id !== id))
  return <WishlistContext.Provider value={{ wishlist, wishlistCount: wishlist.length, toggleWishlist, removeFromWishlist, error, loading }}>{children}</WishlistContext.Provider>
}
export const useWishlist = () => useContext(WishlistContext)
