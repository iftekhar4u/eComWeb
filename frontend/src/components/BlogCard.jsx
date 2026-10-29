import { Link, useNavigate } from 'react-router-dom'
import { FiArrowRight } from 'react-icons/fi'

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
  return <article className="blog-card" role="link" aria-label={`${blog.title}. ${blog.excerpt || ''} Read guide`} tabIndex="0" onClick={handleClick} onKeyDown={handleKeyDown}>{blog.image ? <img src={blog.image} alt={blog.seo?.imageAlt || ''} loading="lazy"/> : <div className="blog-image-placeholder" aria-hidden="true">A</div>}<p className="eyebrow">Beauty guide</p><Heading>{blog.title}</Heading><p>{blog.excerpt}</p><Link to={destination} className="text-link">Read guide <FiArrowRight /></Link></article>
}
