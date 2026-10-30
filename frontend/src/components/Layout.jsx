import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  FiHeart,
  FiMenu,
  FiSearch,
  FiShoppingBag,
  FiUser,
  FiHome,
  FiGrid,
} from "react-icons/fi";
import Offcanvas from "react-bootstrap/Offcanvas";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import api from "../services/api";
import WhatsAppButton from "../integrations/WhatsAppButton";
export default function Layout({ children }) {
  const { categoryDetails, categoryOrder, settings, error, loading, reload } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const [newsletterBusy, setNewsletterBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const { user } = useAuth();
  const links = categoryOrder.map((slug) => ({ label: categoryDetails[slug].label, slug }));
  return (
    <>
      <div className="offer-bar">
        {settings.announcement || "AURELIA botanical beauty"}
      </div>
      <header className="site-header">
        <div className="nav-wrap">
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <FiMenu />
          </button>
          <Link className="wordmark" to="/">
            AURELIA<span>BOTANICAL BEAUTY</span>
          </Link>
          <nav className="main-nav desktop-only">
            {links.map((link) => (
              <Link to={`/category/${link.slug}`} key={link.slug}>
                {link.label}
              </Link>
            ))}
            <Link to="/collections">Collections</Link>
            {/* <Link to="/blog">Blog</Link>
            <Link to="/pages/about">About</Link> */}
          </nav>
          <div className="nav-actions">
            <form className="search-box desktop-search" onSubmit={e => { e.preventDefault(); navigate(`/shop?search=${encodeURIComponent(query)}`); }}>
              <FiSearch />
              <input
                placeholder="Search essentials"
                aria-label="Search products" value={query} onChange={e => setQuery(e.target.value)}
              />
            </form>
            <Link
              className="icon-button desktop-only"
              to={user ? "/profile" : "/login"}
              aria-label="Account"
            >
              <FiUser />
            </Link>
            <Link className="icon-button" to="/wishlist" aria-label="Wishlist">
              <FiHeart />
              <b>{wishlistCount}</b>
            </Link>
            <Link className="bag-button" to="/cart" aria-label="Cart">
              <FiShoppingBag />
              <b>{cartCount}</b>
            </Link>
          </div>
        </div>
      </header>
      <Offcanvas aria-labelledby="mobile-menu-title" show={open} onHide={() => setOpen(false)} placement="start" className="mobile-drawer">
          <Offcanvas.Header closeButton><Offcanvas.Title id="mobile-menu-title">AURELIA</Offcanvas.Title></Offcanvas.Header>
          <Offcanvas.Body><form onSubmit={e => { e.preventDefault(); navigate(`/shop?search=${encodeURIComponent(query)}`); setOpen(false); }}><input aria-label="Search products on mobile" placeholder="Search essentials" value={query} onChange={e => setQuery(e.target.value)} /><button type="submit">Search</button></form><Link to="/" onClick={() => setOpen(false)}>Home</Link>{links.map((link) => <Link to={`/category/${link.slug}`} onClick={() => setOpen(false)} key={link.slug}>{link.label}</Link>)}<Link to="/collections" onClick={() => setOpen(false)}>Collections</Link><Link to="/shop" onClick={() => setOpen(false)}>Offers</Link><Link to="/blog" onClick={() => setOpen(false)}>Blog</Link><Link to="/pages/about" onClick={() => setOpen(false)}>About</Link></Offcanvas.Body>
        </Offcanvas>
      {error && <div className="store-status" role="alert">{error} <button onClick={reload}>Try again</button></div>}
      {loading && <div className="visually-hidden" role="status">Loading your beauty essentials...</div>}
      {children || <Outlet />}
      <section className="newsletter" aria-labelledby="newsletter-title">
        <div>
          <p className="eyebrow">A little note from us</p>
          <h2 id="newsletter-title">
            Beauty,
            <br />
            <em>considered.</em>
          </h2>
        </div>
        <form onSubmit={async (event) => { event.preventDefault(); setNewsletterBusy(true); const form = event.currentTarget; try { const { data } = await api.post('/content/newsletter', { email: new FormData(form).get('email'), consent: true }); setNewsletterMessage(data.message); form.reset(); } catch(e) { setNewsletterMessage(e.response?.data?.message || 'Unable to subscribe. Please try again.'); } finally { setNewsletterBusy(false); } }}>
          <label htmlFor="newsletter-email">Join the Aurelia list</label>
          <div className="email-row">
            <input id="newsletter-email" name="email" type="email" placeholder="Your email address" required />
            <button className="button button-dark" type="submit" disabled={newsletterBusy}>{newsletterBusy ? "Saving..." : "Join"}</button>
          </div>
          <small>New rituals, thoughtful notes and first access to our edits. By joining, you agree to receive our updates.</small><p role="status">{newsletterMessage}</p>
        </form>
      </section>
      <footer className="footer">
        <div className="footer-brand">
          <Link className="wordmark" to="/">AURELIA<span>BOTANICAL BEAUTY</span></Link>
          <p>Nature's care, made for your everyday ritual.</p>
        </div>
        <div>
          <p className="footer-label">Explore</p>
          <Link to="/shop">Shop all</Link>
          <Link to="/collections">Collections</Link>
          <Link to="/blog">Our journal</Link>
          <Link to="/pages/about">About us</Link>
        </div>
        <div>
          <p className="footer-label">Care</p>
          <Link to="/contact">Contact us</Link>
          <Link to="/pages/shipping-returns">Shipping & returns</Link>
          <Link to="/pages/privacy">Privacy</Link>
        </div>
        <p className="copyright">© {new Date().getFullYear()} {settings.brandName || "Aurelia Botanical Beauty"}. Made with intention.</p>
      </footer>
      <WhatsAppButton />
      <nav className="mobile-bottom-nav">
        <NavLink to="/">
          <FiHome />
          Home
        </NavLink>
        <NavLink to="/shop">
          <FiGrid />
          Categories
        </NavLink>
        <NavLink to="/wishlist">
          <FiHeart />
          Wishlist <b>{wishlistCount}</b>
        </NavLink>
        <NavLink to={user ? "/profile" : "/login"}>
          <FiUser />
          Account
        </NavLink>
        <NavLink to="/cart">
          <FiShoppingBag />
          Cart <b>{cartCount}</b>
        </NavLink>
      </nav>
    </>
  );
}
