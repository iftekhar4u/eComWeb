import { createContext, useContext } from 'react'
import useSavedItems from './useSavedItems'
import { notifyToast } from '../services/toast'
const WishlistContext = createContext(null)
export function WishlistProvider({ children }) {
  const { items: wishlist, update, error, loading } = useSavedItems('wishlist')
  const toggleWishlist = p => {
    const saved = wishlist.some(i => i.id === p.id)
    update(items => saved ? items.filter(i => i.id !== p.id) : [...items, p])
    notifyToast(saved ? `${p.name} removed from your wishlist` : `${p.name} added to your wishlist`)
  }
  const removeFromWishlist = id => update(items => items.filter(i => i.id !== id))
  return <WishlistContext.Provider value={{ wishlist, wishlistCount: wishlist.length, toggleWishlist, removeFromWishlist, error, loading }}>{children}</WishlistContext.Provider>
}
export const useWishlist = () => useContext(WishlistContext)
