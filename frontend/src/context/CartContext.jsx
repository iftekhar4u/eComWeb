import { createContext, useContext } from 'react'
import useSavedItems from './useSavedItems'
import { notifyToast } from '../services/toast'
const CartContext = createContext(null)
export function CartProvider({ children }) {
  const { items: cartItems, update, error, loading, setError, flush, refresh } = useSavedItems('cart')
  const addToCart = p => {
    if (!p.variantId || p.stock < 1) { setError('This product is currently unavailable.'); return }
    update(items => { const found = items.find(i => i.id === p.id); return found ? items.map(i => i.id === p.id ? { ...i, quantity: Math.min(99, p.stock, i.quantity + 1) } : i) : [...items, { ...p, quantity: 1 }] })
    notifyToast(`${p.name} added to your bag`)
  }
  const removeFromCart = id => update(items => items.filter(i => i.id !== id))
  const increaseQuantity = id => update(items => items.map(i => i.id === id ? { ...i, quantity: Math.min(99, i.stock, i.quantity + 1) } : i))
  const decreaseQuantity = id => update(items => items.flatMap(i => i.id === id ? i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : [] : [i]))
  const clearCart = () => update(() => [])
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0)
  const cartTotal = cartItems.reduce((n, i) => n + i.price * i.quantity, 0)
  return <CartContext.Provider value={{ cartItems, cartCount, cartTotal, error, loading, addToCart, removeFromCart, increaseQuantity, decreaseQuantity, clearCart, flush, refreshCart: refresh }}>{children}</CartContext.Provider>
}
export const useCart = () => useContext(CartContext)
