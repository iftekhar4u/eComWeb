import { useState } from 'react'
import { useStore } from '../context/StoreContext'
import { api, useStudio, message } from './studioApi'
import SeoFields from './SeoFields'

const types = [['fixed','Website pages'],['products','Products'],['categories','Categories'],['collections','Collections'],['pages','Content pages'],['blogs','Blog articles'],['defaults','Site defaults']]
export default function SeoAdmin() {
  const [type,setType] = useState('fixed'), [page,setPage] = useState(1), [search,setSearch] = useState(''), [term,setTerm] = useState(''), [editing,setEditing] = useState(null), [notice,setNotice] = useState('')
  const {reload:refreshStore} = useStore()
  const config = useStudio('/admin/seo/settings')
  const list = useStudio(!['fixed','defaults'].includes(type) ? `/admin/seo/${type}?${new URLSearchParams({page:String(page),search:term})}` : null)
  const done = () => {setEditing(null);setNotice('SEO saved.');config.reload();list.reload();refreshStore()}
  const state = ['fixed','defaults'].includes(type) ? config : list
  return <><div className="studio-heading"><div><h1>SEO</h1><p>Manage search and sharing details for each page.</p></div></div><div className="studio-filters">{types.map(([key,label])=><button key={key} type="button" className={type===key?'studio-primary':''} onClick={()=>{setType(key);setPage(1);setTerm('');setSearch('');setEditing(null);setNotice('')}}>{label}</button>)}</div>
    {notice && <p role="status">{notice}</p>}
    {state.loading && <p className="studio-state" role="status">Loading SEO settings…</p>}
    {state.error && <p className="studio-error" role="alert">{state.error} <button onClick={state.reload}>Retry</button></p>}
    {editing ? <SeoRecord key={`${type}-${editing.key || editing._id}`} type={type} record={editing} version={config.data?.version || 0} onSaved={done} onCancel={()=>setEditing(null)}/> : type==='defaults' ? config.data && <Defaults key={config.data.version} config={config.data} onSaved={done}/> : <section className="studio-card">
      {type!=='fixed' && <form className="studio-filters" onSubmit={e=>{e.preventDefault();setPage(1);setTerm(search)}}><label className="studio-search"><input aria-label="Search SEO records" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or title…"/></label><button>Search</button></form>}
      {state.data && <><div className="studio-table-wrap"><table><thead><tr><th>Page</th><th>URL</th><th>SEO title</th><th>Search visibility</th><th>Actions</th></tr></thead><tbody>{(type==='fixed'?config.data.pages:list.data.items).map(item=><tr key={item.key || item._id}><td>{item.label || item.name || item.title}</td><td>{item.path}</td><td>{item.seo?.title || 'Automatic'}</td><td>{item.private || item.seo?.noindex ? 'Noindex' : item.status && item.status!=='published' || item.active===false ? 'Unpublished / hidden' : 'Indexable'}</td><td><button onClick={()=>setEditing(item)}>Edit SEO</button></td></tr>)}</tbody></table></div>{type!=='fixed' && <div className="studio-pager"><span>{list.data.total} records · Page {page} of {Math.max(1,list.data.pages)}</span><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous</button><button disabled={page>=list.data.pages} onClick={()=>setPage(n=>n+1)}>Next</button></div>}</>}
    </section>}
    <p className="studio-caption">Product, category and content editors also include SEO fields. Product structured data uses the saved price, availability and review totals automatically.</p>
  </>
}
function SeoRecord({type,record,version,onSaved,onCancel}) {
  const [seo,setSeo] = useState(record.seo || {}), [busy,setBusy] = useState(false), [error,setError] = useState('')
  async function save(event) {
    event.preventDefault();if(busy)return;setBusy(true);setError('')
    try { await api.put(type==='fixed'?`/admin/seo/fixed/${record.key}`:`/admin/seo/${type}/${record._id}`,{seo,...(type==='fixed'?{version}:{updatedAt:record.updatedAt})});onSaved() }
    catch(e) {setError(message(e))} finally {setBusy(false)}
  }
  return <section className="admin-panel"><h2>{record.label || record.name || record.title}</h2><form className="admin-form" onSubmit={save}><SeoFields value={seo} onChange={setSeo} title={record.name || record.title} description={record.shortDescription || record.excerpt || record.description} path={record.path} image={record.thumbnail || record.image} gallery={type==='products'} privatePage={record.private}/>{error && <p className="studio-error" role="alert">{error}</p>}<div className="admin-actions"><button className="studio-primary" disabled={busy}>{busy?'Saving…':'Save SEO'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div></form></section>
}
function Defaults({config,onSaved}) {
  const [form,setForm] = useState({siteUrl:'',defaultDescription:'',defaultImage:'',defaultImageAlt:'',...config.settings}),[busy,setBusy] = useState(false),[error,setError] = useState('')
  async function save(event) {event.preventDefault();setBusy(true);setError('');try{await api.put('/admin/seo/settings',{settings:form,version:config.version});onSaved()}catch(e){setError(message(e))}finally{setBusy(false)}}
  return <form className="admin-panel admin-form" onSubmit={save}><h2>Site SEO defaults</h2><label>Public website URL<input type="url" placeholder="https://your-domain.com" value={form.siteUrl} maxLength={2048} onChange={e=>setForm({...form,siteUrl:e.target.value})}/></label><small>Leave blank to use the configured storefront URL. Currently: {config.origin}</small><label>Fallback description<textarea rows={3} maxLength={320} value={form.defaultDescription} onChange={e=>setForm({...form,defaultDescription:e.target.value})}/></label><label>Default sharing image HTTPS URL<input type="url" maxLength={2048} value={form.defaultImage} onChange={e=>setForm({...form,defaultImage:e.target.value})}/></label><label>Default sharing image alt text<input maxLength={300} value={form.defaultImageAlt} onChange={e=>setForm({...form,defaultImageAlt:e.target.value})}/></label>{error&&<p className="studio-error" role="alert">{error}</p>}<div className="admin-actions"><button className="studio-primary" disabled={busy}>{busy?'Saving…':'Save SEO defaults'}</button><a href="/sitemap.xml" target="_blank" rel="noreferrer">View sitemap</a></div></form>
}
