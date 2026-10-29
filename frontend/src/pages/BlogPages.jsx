import { BlogCard } from '../components/BlogCard'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { FiArrowLeft } from 'react-icons/fi'
import useApi from '../hooks/useApi'

export function BlogIndex() {
  const [params] = useSearchParams()
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.get('page'), 10) || 1))
  const { data, loading, error, reload } = useApi(`/content/blogs?page=${page}`)
  return <main className="page-shell blog-page">
    <div className="section-heading"><div><p className="eyebrow">From our journal</p><h1>Beauty tips &amp; guides</h1></div><Link className="text-link" to="/">Back home <FiArrowLeft /></Link></div>
    {loading ? <p role="status">Loading articles…</p> : error ? <p className="form-error" role="alert">{error} <button onClick={reload}>Try again</button></p> : data && <>
      <div className="blog-grid">{data.items.map(blog => <BlogCard blog={blog} key={blog.slug}/>)}</div>
      {!data.items.length && <p>No articles on this page yet. {page > 1 && <Link to="/blog">Return to the latest articles.</Link>}</p>}
      {(data.pages > 1 || page > 1) && <nav className="journal-pagination" aria-label="Journal pages">{page > 1 && <Link to={page === 2 ? '/blog' : `/blog?page=${page - 1}`}>← Previous</Link>}<span>Page {page} of {Math.max(1, data.pages)}</span>{page < data.pages && <Link to={`/blog?page=${page + 1}`}>Next →</Link>}</nav>}
    </>}
  </main>
}

export function BlogArticle() {
  const { slug } = useParams()
  const { data: blog, loading, error } = useApi(`/content/blogs/${encodeURIComponent(slug)}`)
  if (loading) return <main className="page-shell">Loading guide...</main>
  if (error) return <main className="page-shell form-error">{error}</main>
  if (!blog) return <main className="page-shell empty-state"><p className="eyebrow">404</p><h1>Guide not found.</h1><Link className="button button-dark" to="/blog">Back to the journal</Link></main>
  return <><main className="page-shell blog-article"><div className="blog-detail-header"><Link className="text-link" to="/blog"><FiArrowLeft /> Back to journal</Link><p className="eyebrow">Beauty guide</p><h1 className="blog-detail-title">{blog.title}</h1></div>{blog.image && <img className="blog-hero-image" src={blog.image} alt={blog.seo?.imageAlt || blog.title} />}<div className="blog-article-body"><p>{blog.content}</p></div></main></>
}