import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiPlus } from 'react-icons/fi'
import { useStore } from '../context/StoreContext'
import { RecordEditor } from './ExistingEditors'
import { api, useStudio, date, message } from './studioApi'

function State({ state }) {
  if (state.loading) return <p className="studio-state" role="status">Loading content…</p>
  if (state.error) return <p className="studio-error" role="alert">{state.error} <button onClick={state.reload}>Retry</button></p>
  return null
}

function Blogs() {
  const [params, setParams] = useSearchParams()
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.get('page'), 10) || 1))
  const search = params.get('search') || ''
  const status = ['draft', 'published', 'archived'].includes(params.get('status')) ? params.get('status') : ''
  const state = useStudio(`/admin/blogs?${new URLSearchParams({ page: String(page), search, status })}`)
  const { reload: refreshStore } = useStore()
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const isNew = params.get('new') === '1'

  function update(values) {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.delete('page')
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    })
  }
  function closeEditor() { setEditing(null); update({ new: '' }) }
  function saved(item) {
    closeEditor(); state.reload(); refreshStore(); setError('')
    setNotice(item.status === 'published' ? 'Blog published. It is now visible in your journal.' : item.status === 'archived' ? 'Blog archived.' : 'Blog saved as a draft. It is not visible to visitors.')
  }
  async function archive(item) {
    if (busy || !window.confirm(`Archive “${item.title}”? It will be hidden from the website.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.delete(`/admin/blogs/${item._id}`)
      state.reload(); refreshStore(); setNotice('Blog archived. Use Edit / restore to publish it again.')
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }

  if (editing || isNew) return <>
    <div className="studio-heading"><div><h1>{isNew ? 'New blog' : 'Edit blog'}</h1><p>Write, preview and choose when your article is visible.</p></div></div>
    <RecordEditor key={editing?._id || 'new-blog'} resource="blogs" initial={editing || {}} onCancel={closeEditor} onSaved={saved}/>
  </>
  return <>
    <div className="studio-heading"><div><h1>Blogs</h1><p>Manage the articles in your store journal.</p></div><div className="studio-actions"><Link to="/blog">View journal ↗</Link><button className="studio-primary" onClick={() => { setNotice(''); update({ new: '1' }) }}><FiPlus/> New blog</button></div></div>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    <section className="studio-card">
      <form className="studio-filters" onSubmit={event => { event.preventDefault(); update({ search: new FormData(event.currentTarget).get('search').trim() }) }}>
        <label>Search blogs<input key={search} name="search" defaultValue={search} maxLength={100} placeholder="Search by title…"/></label>
        <button>Search</button>
        <label>Publishing status<select value={status} onChange={event => update({ status: event.target.value })}><option value="">All statuses</option>{['draft', 'published', 'archived'].map(value => <option key={value}>{value}</option>)}</select></label>
      </form>
      <State state={state}/>
      {state.data && <>
        <div className="studio-table-wrap"><table><thead><tr><th>Article</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{state.data.items.map(item => <tr key={item._id}>
          <td><strong>{item.title}</strong><small>/blog/{item.slug}</small></td>
          <td><span className={`studio-badge ${item.status === 'published' ? 'good' : 'waiting'}`}>{item.status}</span></td>
          <td>{date(item.updatedAt)}</td>
          <td><div className="admin-actions"><button disabled={busy} onClick={() => setEditing(item)}>Edit / restore</button>{item.status === 'published' && <Link to={`/blog/${item.slug}`}>View</Link>}{item.status !== 'archived' && <button disabled={busy} onClick={() => archive(item)}>Archive</button>}</div></td>
        </tr>)}</tbody></table></div>
        {!state.data.items.length && <p className="studio-state">No blogs match this view. Create a new blog or change the filters.</p>}
        <div className="studio-pager"><span>{state.data.total} blogs · Page {page} of {Math.max(1, state.data.pages)}</span><button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button><button disabled={page >= state.data.pages} onClick={() => update({ page: String(page + 1) })}>Next</button></div>
      </>}
    </section>
  </>
}

function AboutEditor() {
  const state = useStudio('/admin/pages/by-slug/about')
  const { settings, reload: refreshStore } = useStore()
  const [notice, setNotice] = useState('')
  const brand = settings.brandName || 'AURELIA'
  const starter = {
    title: `About ${brand}`, slug: 'about', status: 'draft',
    content: `${brand} is a space to explore beauty and everyday care, at your own pace.\n\nBrowse our collections, discover ideas in our journal, and find the products that fit your routine.\n\nIf you have a question about a product or an order, our team is here to help. Visit our Contact page to get in touch.`,
  }
  return <>
    <div className="studio-heading"><div><h1>About page</h1><p>Tell visitors about your store and update your story.</p></div>{state.data?.item?.status === 'published' && <Link to="/pages/about">View About page ↗</Link>}</div>
    {notice && <p role="status">{notice}</p>}
    <State state={state}/>
    {state.data && <>
      <div className="studio-notice">{state.data.item ? `Current status: ${state.data.item.status}.` : 'Review the starter text below and make it your own.'} Choose published and save to show this page to visitors. Draft and archived pages are hidden. The page address stays /pages/about.</div>
      <RecordEditor key={state.data.item?.updatedAt || 'new-about'} resource="pages" initial={state.data.item || starter} fixedSlug="about" onCancel={() => { state.reload(); setNotice('Editor reloaded.') }} onSaved={item => { state.reload(); refreshStore(); setNotice(item.status === 'published' ? 'About page published.' : 'About page saved. It is hidden from visitors.') }}/>
    </>}
  </>
}

export default function ContentManagement({ section }) {
  return section === 'about' ? <AboutEditor/> : <Blogs/>
}
