import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useStore } from '../context/StoreContext'
import api from '../services/api'
import { buildMetadata, jsonForHtml, fixedPage, RESOURCE_PATHS } from '../../../shared/seo.mjs'

// This app uses createRoot, not hydration. React 19 manages Helmet tags natively,
// so release the server-owned head before React mounts. Keep the JSON bootstrap
// for the first render; crawlers without JavaScript retain the complete head.
if (typeof document !== 'undefined') {
  document.head.querySelectorAll('[data-aurelia-seo="server"]').forEach(node => node.remove())
}

export default function SiteSeo() {
  const location = useLocation()
  return <PageHead key={location.pathname + location.search} path={location.pathname} search={location.search} />
}
function PageHead({ path, search }) {
  const { settings } = useStore()
  const [loaded, setLoaded] = useState(() => {
    try { const data = JSON.parse(document.getElementById('aurelia-seo-state')?.textContent || 'null'); return data?.path === path && data?.search === search ? data : null } catch { return null }
  })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api.get('/seo/resolve', { params: { path, search }, signal: controller.signal }).then(({data}) => setLoaded(data)).catch(error => { if (error.code !== 'ERR_CANCELED') setFailed(true) })
    return () => controller.abort()
  }, [path,search])
  const known = fixedPage(path) || Object.values(RESOURCE_PATHS).some(prefix => path.startsWith(prefix))
  const fallback = buildMetadata({path,search,settings,origin:window.location.origin,status:failed ? 503 : known ? 200 : 404})
  const meta = loaded || fallback
  return <Helmet>
    <title>{meta.title}</title>
    <meta name="description" content={meta.description}/>
    <meta name="robots" content={meta.robots}/>
    <link rel="canonical" href={meta.canonical}/>
    <meta property="og:type" content={meta.ogType}/>
    <meta property="og:site_name" content={meta.siteName}/>
    <meta property="og:title" content={meta.socialTitle}/>
    <meta property="og:description" content={meta.socialDescription}/>
    <meta property="og:url" content={meta.canonical}/>
    {meta.image && <meta property="og:image" content={meta.image}/>}
    {meta.image && <meta property="og:image:alt" content={meta.imageAlt}/>}
    <meta name="twitter:card" content={meta.twitterImage ? 'summary_large_image' : 'summary'}/>
    <meta name="twitter:title" content={meta.twitterTitle}/>
    <meta name="twitter:description" content={meta.twitterDescription}/>
    {meta.twitterImage && <meta name="twitter:image" content={meta.twitterImage}/>}
    {meta.twitterImage && <meta name="twitter:image:alt" content={meta.imageAlt}/>}
    {meta.structuredData.length > 0 && <script type="application/ld+json">{jsonForHtml(meta.structuredData)}</script>}
  </Helmet>
}
