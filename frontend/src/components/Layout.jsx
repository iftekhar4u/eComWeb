import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
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
import { categoryDetails, categoryOrder } from "../data/products";
export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const { user } = useAuth();
  const links = categoryOrder.map((slug) => ({ label: categoryDetails[slug].label, slug }));
  return (
    <>
      <div className="offer-bar">
        Complimentary shipping on orders above Rs. 999
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
            <Link to="/shop">Collections</Link>
            {/* <Link to="/shop">Offers</Link>
            <Link to="/shop">Blog</Link> */}
          </nav>
          <div className="nav-actions">
            <label className="search-box desktop-search">
              <FiSearch />
              <input
                placeholder="Search essentials"
                aria-label="Search products"
              />
            </label>
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
      <Offcanvas show={open} onHide={() => setOpen(false)} placement="start" className="mobile-drawer">
          <Offcanvas.Header closeButton><Offcanvas.Title>AURELIA</Offcanvas.Title></Offcanvas.Header>
          <Offcanvas.Body><Link to="/" onClick={() => setOpen(false)}>Home</Link>{links.map((link) => <Link to={`/category/${link.slug}`} onClick={() => setOpen(false)} key={link.slug}>{link.label}</Link>)}<Link to="/shop" onClick={() => setOpen(false)}>Collections</Link><Link to="/shop" onClick={() => setOpen(false)}>Offers</Link><Link to="/shop" onClick={() => setOpen(false)}>Blog</Link></Offcanvas.Body>
        </Offcanvas>
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
        <form onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="newsletter-email">Join the Aurelia list</label>
          <div className="email-row">
            <input id="newsletter-email" type="email" placeholder="Your email address" required />
            <button className="button button-dark" type="submit">Join</button>
          </div>
          <small>New rituals, thoughtful notes and first access to our edits.</small>
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
          <Link to="/shop">Collections</Link>
          <Link to="/shop">Our journal</Link>
        </div>
        <div>
          <p className="footer-label">Care</p>
          <Link to="/shop">Contact us</Link>
          <Link to="/shop">Shipping & returns</Link>
          <Link to="/shop">Privacy</Link>
        </div>
        <p className="copyright">© 2026 Aurelia Botanical Beauty. Made with intention.</p>
      </footer>
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
