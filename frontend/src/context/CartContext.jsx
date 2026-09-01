import { createContext, useContext, useEffect, useMemo, useState } from 'react'
const CartContext = createContext(null)
export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => JSON.parse(localStorage.getItem('aurelia_cart') || '[]'))
  useEffect(() => localStorage.setItem('aurelia_cart', JSON.stringify(cartItems)), [cartItems])
  const addToCart = (product) => setCartItems((items) => { const found = items.find((item) => item.id === product.id); return found ? items.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...items, { ...product, quantity: 1 }] })
  const removeFromCart = (id) => setCartItems((items) => items.filter((item) => item.id !== id));
  const increaseQuantity = (id) => setCartItems((items) => items.map((item) => item.id === id ? { ...item, quantity: item.quantity + 1 } : item))
  const decreaseQuantity = (id) => setCartItems((items) => items.flatMap((item) => item.id === id ? (item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []) : [item]))
  const clearCart = () => setCartItems([])
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartItems])
  return <CartContext.Provider value={{ cartItems, cartCount, cartTotal, addToCart, removeFromCart, increaseQuantity, decreaseQuantity, clearCart }}>{children}</CartContext.Provider>
}
export const useCart = () => useContext(CartContext);
