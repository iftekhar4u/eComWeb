import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { StoreProvider } from './context/StoreContext'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import Layout from './components/Layout'
import { lazy, Suspense } from 'react'
import Home from './pages/Home'
import { NotFound } from './pages/SimplePages'
import RouteBoundary from './components/RouteBoundary'
const named = (load, name) => lazy(() => load().then(module => ({ default: module[name] })))
const Login = named(() => import('./pages/AuthPages'), 'Login')
const Signup = named(() => import('./pages/AuthPages'), 'Signup')
const Shop = named(() => import('./pages/ShopPages'), 'Shop')
const Wishlist = named(() => import('./pages/ShopPages'), 'Wishlist')
const Cart = named(() => import('./pages/ShopPages'), 'Cart')
const Checkout = lazy(() => import('./pages/Checkout'))
const Orders = lazy(() => import('./pages/Orders'))
const Admin = lazy(() => import('./admin-ready/ReadyAdmin'))
const Contact = named(() => import('./pages/ContentPages'), 'Contact')
const Collections = named(() => import('./pages/ContentPages'), 'Collections')
const Collection = named(() => import('./pages/ContentPages'), 'Collection')
const ContentPage = named(() => import('./pages/ContentPages'), 'ContentPage')
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const About = lazy(() => import('./pages/About'))
const CategoryProducts = lazy(() => import('./pages/CategoryProducts'))
const ProductDetails = lazy(() => import('./pages/ProductDetails'))
const BlogArticle = named(() => import('./pages/BlogPages'), 'BlogArticle')
const BlogIndex = named(() => import('./pages/BlogPages'), 'BlogIndex')
const Profile = lazy(() => import('./pages/Profile'))
const ProfilePreview = named(() => import('./pages/Profile'), 'ProfilePreview')
const page = children => <RouteBoundary><Suspense fallback={<div className="page-shell" role="status" aria-live="polite">Loading page…</div>}>{children}</Suspense></RouteBoundary>
import ScrollToTop from './components/ScrollToTop'
import SiteSeo from './components/SiteSeo'
import './App.css'
import './responsive-home.css'
import './commerce.css'
import './content.css'

export default function App() {
  return <HelmetProvider><AuthProvider><StoreProvider><CartProvider><WishlistProvider><BrowserRouter><ScrollToTop /><SiteSeo /><Routes><Route path="/admin/*" element={page(<Admin />)} /><Route path="/login" element={page(<Login />)} /><Route path="/signup" element={page(<Signup />)} /><Route path="/forgot-password" element={page(<ForgotPassword />)} /><Route element={<Layout />}><Route path="/" element={<Home />} /><Route path="/shop" element={page(<Shop />)} /><Route path="/blog" element={page(<BlogIndex />)} /><Route path="/blog/:slug" element={page(<BlogArticle />)} /><Route path="/category/:category" element={page(<CategoryProducts />)} /><Route path="/product/:slug" element={page(<ProductDetails />)} /><Route path="/wishlist" element={page(<Wishlist />)} /><Route path="/cart" element={page(<Cart />)} /><Route path="/checkout" element={page(<Checkout />)} /><Route path="/orders" element={page(<Orders />)} /><Route path="/orders/:id" element={page(<Orders />)} /><Route path="/contact" element={page(<Contact />)} /><Route path="/collections" element={page(<Collections />)} /><Route path="/collections/:slug" element={page(<Collection />)} /><Route path="/about" element={<Navigate to="/pages/about" replace />} /><Route path="/pages/about" element={page(<About />)} /><Route path="/pages/:slug" element={page(<ContentPage />)} /><Route path="/profile" element={page(<Profile />)} />{import.meta.env.DEV && <Route path="/__dev/profile-preview" element={page(<ProfilePreview />)} />}<Route path="*" element={<NotFound />} /></Route></Routes></BrowserRouter></WishlistProvider></CartProvider></StoreProvider></AuthProvider></HelmetProvider>
}
