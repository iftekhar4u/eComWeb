import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { blogs } from '../data/blogs'

export function BlogIndex() {
  return <><Helmet><title>Beauty tips & guides | AURELIA</title><meta name="description" content="Thoughtful skincare tips and beauty guides from AURELIA." /></Helmet><main className="page-shell blog-page"><div className="section-heading"><div><p className="eyebrow">From our journal</p><h1>Beauty tips & guides</h1></div><Link className="text-link" to="/">Back home <FiArrowLeft /></Link></div><div className="blog-grid">{blogs.map((blog) => <BlogCard blog={blog} key={blog.slug} />)}</div></main></>
}

export function BlogCard({ blog, heading = 'h2' }) {
  const navigate = useNavigate()
  const destination = `/blog/${blog.slug}`

  function handleClick(event) {
    if (!event.target.closest('a')) navigate(destination)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate(destination)
    }
  }

  const Heading = heading
  return <article className="blog-card" role="link" tabIndex="0" onClick={handleClick} onKeyDown={handleKeyDown}><img src={blog.image} alt="" /><p className="eyebrow">Beauty guide</p><Heading>{blog.title}</Heading><p>{blog.excerpt}</p><Link to={destination} className="text-link">Read guide <FiArrowRight /></Link></article>
}

export function BlogArticle() {
  const { slug } = useParams()
  const blog = blogs.find((item) => item.slug === slug)
  if (!blog) return <main className="page-shell empty-state"><p className="eyebrow">404</p><h1>Guide not found.</h1><Link className="button button-dark" to="/blog">Back to the journal</Link></main>
  return <><Helmet><title>{blog.title} | AURELIA</title><meta name="description" content={blog.excerpt} /></Helmet><main className="page-shell blog-article"><div className="blog-detail-header"><Link className="text-link" to="/blog"><FiArrowLeft /> Back to journal</Link><p className="eyebrow">Beauty guide</p><h1 className="blog-detail-title">{blog.title}</h1></div><img className="blog-hero-image" src={blog.image} alt={blog.title} /><div className="blog-article-body"><p>{blog.body}</p></div></main></>
}