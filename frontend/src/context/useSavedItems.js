import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { toProduct, readSaved } from '../services/format'
import { useAuth } from './AuthContext'
export default function useSavedItems(kind) {
  const { user, mfaRequired } = useAuth()
  const account = !mfaRequired ? user?.id : null
  const key = `aurelia_${kind}_v2`
  const [items, setItems] = useState(() => readSaved(key))
  const [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const revision = useRef(0), saveFailed = useRef(false)
  const ready = useRef(null), current = useRef(account), queue = useRef(Promise.resolve()), data = useRef(items)
  const replaceItems = useCallback(values => { data.current = values; setItems(values) }, [])
  const payload = useCallback(values => kind === 'cart' ? { version: revision.current, items: values.map(i => ({ variantId: i.variantId, quantity: i.quantity })) } : { productIds: values.map(i => i.id) }, [kind])
  useEffect(() => {
    let active = true; ready.current = null; current.current = account; saveFailed.current = false
    if (!account) { replaceItems(readSaved(key)); setLoading(false); return () => { active = false } }
    replaceItems([]); setLoading(true); setError('')
    api.get(`/${kind}`).then(async ({ data: response }) => {
      revision.current = response.version || 0
      const serverItems = response.items.map(toProduct), guest = readSaved(key)
      const merged = [...serverItems]
      for (const item of guest) {
        if (kind === 'cart' && !/^[a-f\d]{24}$/i.test(item.variantId || '')) continue
        const found = merged.find(i => i.id === item.id)
        if (!found) merged.push(item)
        else if (kind === 'cart') found.quantity = Math.min(99, found.quantity + item.quantity)
      }
      if (!active) return
      if (guest.length) {
        const saved = await api.put(`/${kind}`, payload(merged))
        if (!active) return
        revision.current = saved.data.version || 0; replaceItems(saved.data.items.map(toProduct)); localStorage.removeItem(key)
      } else replaceItems(serverItems)
      ready.current = account
    }).catch(e => { if (active) setError(e.response?.data?.message || `Unable to load your ${kind}. Refresh to retry.`) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [account, kind, key, payload, replaceItems])
  const update = useCallback(transform => {
    if (account && ready.current !== account) { setError(`Your ${kind} is still loading. Please try again.`); return }
    const next = transform(data.current); replaceItems(next); setError('')
    if (!account) {
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { setError('Your browser could not save these items. Keep this tab open or sign in.') }
      return
    }
    const owner = account
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (current.current !== owner) return
      try { if (saveFailed.current) return; const saved = await api.put(`/${kind}`, payload(next)); revision.current = saved.data.version || 0 }
      catch (e) { saveFailed.current = true; if (current.current === owner) setError(e.response?.data?.message || `Your ${kind} could not be saved. Refresh to retry.`) }
    })
  }, [account, key, kind, payload, replaceItems])
  const flush = useCallback(async () => { await queue.current; if (saveFailed.current) throw new Error('Your bag could not be saved. Refresh before checkout.'); return revision.current }, [])
  const refresh = useCallback(async () => {
    await queue.current
    const { data: response } = await api.get(`/${kind}`)
    revision.current = response.version || 0; saveFailed.current = false; setError(''); replaceItems(response.items.map(toProduct))
  }, [kind, replaceItems])
  return { items, update, error, loading, setError, flush, refresh }
}
