import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import Layout from './components/Layout'
import { Login, Signup } from './pages/AuthPages'
import { Shop, Wishlist, Cart } from './pages/ShopPages'
import { Checkout, NotFound } from './pages/SimplePages'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import CategoryProducts from './pages/CategoryProducts'
import ProductDetails from './pages/ProductDetails'
import { BlogArticle, BlogIndex } from './pages/BlogPages'
import Profile, { ProfilePreview } from './pages/Profile'
import ScrollToTop from './components/ScrollToTop'
import './App.css'
import './responsive-home.css'
import './auth-overrides.css'
import './profile.css'

export default function App() {
  return <HelmetProvider><AuthProvider><CartProvider><WishlistProvider><BrowserRouter><ScrollToTop /><Routes><Route path="/login" element={<Login />} /><Route path="/signup" element={<Signup />} /><Route path="/forgot-password" element={<ForgotPassword />} /><Route element={<Layout />}><Route path="/" element={<Home />} /><Route path="/shop" element={<Shop />} /><Route path="/blog" element={<BlogIndex />} /><Route path="/blog/:slug" element={<BlogArticle />} /><Route path="/category/:category" element={<CategoryProducts />} /><Route path="/product/:slug" element={<ProductDetails />} /><Route path="/wishlist" element={<Wishlist />} /><Route path="/cart" element={<Cart />} /><Route path="/checkout" element={<Checkout />} /><Route path="/profile" element={<Profile />} />{import.meta.env.DEV && <Route path="/__dev/profile-preview" element={<ProfilePreview />} />}<Route path="*" element={<NotFound />} /></Route></Routes></BrowserRouter></WishlistProvider></CartProvider></AuthProvider></HelmetProvider>
}
