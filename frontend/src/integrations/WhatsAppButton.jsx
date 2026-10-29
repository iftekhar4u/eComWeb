import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FaWhatsapp } from 'react-icons/fa'
import api from '../services/api'
import './whatsapp.css'

export default function WhatsAppButton() {
  const [settings, setSettings] = useState(null)
  const { pathname } = useLocation()
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => api.get('/integrations/whatsapp', { signal: controller.signal }).then(({ data }) => setSettings(data)).catch(error => {
      if (error.code !== 'ERR_CANCELED') setSettings(null)
    })
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener('focus', refresh) }
  }, [])
  if (!settings?.enabled || !/^[1-9][0-9]{6,14}$/.test(settings.phone)) return null
  // Only public product/catalog paths may be included. No queries, hashes, orders or account URLs.
  const shareable = /^\/(?:product|category|collections|blog)(?:\/|$)/.test(pathname) || ['/', '/shop', '/contact'].includes(pathname)
  const message = [settings.message, settings.includePage && shareable ? `${window.location.origin}${pathname}` : ''].filter(Boolean).join('\n')
  return <a className="aurelia-whatsapp-button" href={`https://wa.me/${settings.phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" aria-label={settings.label || 'Chat on WhatsApp'} title={settings.label || 'Chat on WhatsApp'}><FaWhatsapp aria-hidden="true" /></a>
}
