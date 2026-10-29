import { useStore } from '../context/StoreContext'
import { SEO_LIMITS, plainText } from '../../../shared/seo.mjs'

export default function SeoFields({value = {},onChange,title = '',description = '',path = '/',image = '',gallery = false,privatePage = false}) {
  const {settings} = useStore()
  const set = (key,next) => onChange({...value,[key]:next})
  const defaultTitle = `${title || 'Page title'} | ${settings.brandName || 'AURELIA'}`
  const field = (key,label,placeholder = '',multiline = false) => <label key={key}>{label}{multiline ? <textarea rows={3} maxLength={SEO_LIMITS[key]} value={value[key] || ''} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/> : <input type="text" maxLength={SEO_LIMITS[key]} value={value[key] || ''} placeholder={placeholder} onChange={e=>set(key,e.target.value)}/>}</label>
  return <fieldset className="admin-form">
    <legend>SEO &amp; sharing</legend>
    <small>Optional. Empty fields use this page’s details. Save changes to apply them.</small>
    {field('title','SEO title',defaultTitle)}
    <small>{(value.title || '').length} characters · Around 50–60 is a useful guide, not a required limit.</small>
    {field('description','Meta description',plainText(description),true)}
    <small>{(value.description || '').length} characters · Write a clear summary; search engines may choose a different snippet.</small>
    {field('canonical','Canonical URL',path)}
    <small>Leave blank to use this page’s URL. A /local-path or full HTTPS URL is supported.</small>
    {field('imageAlt','Main image alt text',title)}
    {gallery && <label>Gallery image alt text (one line per image, same order)<textarea rows={3} maxLength={3612} value={(value.imageAlts || []).join('\n')} onChange={e=>set('imageAlts',e.target.value.split('\n').slice(0,12))}/></label>}
    <label className="check-label"><input type="checkbox" checked={privatePage || Boolean(value.noindex)} disabled={privatePage} onChange={e=>set('noindex',e.target.checked)}/>{privatePage ? 'Private page — excluded from search results' : 'Exclude this page from search results (noindex)'}</label>
    <details><summary>Social sharing (Open Graph and Twitter/X)</summary><div className="admin-form">
      {field('socialTitle','Social title',value.title || defaultTitle)}
      {field('socialDescription','Social description',value.description || plainText(description),true)}
      {field('socialImage','Social image HTTPS URL',image || 'https://example.com/share-image.jpg')}
      {field('socialImageAlt','Social image alt text',value.imageAlt || title)}
      {field('twitterTitle','Twitter/X title',value.socialTitle || value.title || defaultTitle)}
      {field('twitterDescription','Twitter/X description',value.socialDescription || value.description,true)}
      {field('twitterImage','Twitter/X image HTTPS URL',value.socialImage || image)}
    </div></details>
    <div className="studio-notice"><small>Search preview (illustrative)</small><p>{value.canonical || path}</p><strong>{value.title || defaultTitle}</strong><p>{value.description || plainText(description) || 'Your page description will appear here.'}</p></div>
  </fieldset>
}
