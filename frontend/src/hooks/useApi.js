import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
export default function useApi(path) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setState(s => ({ ...s, loading: true, error: '' }))
    api.get(path, { signal: controller.signal }).then(({ data }) => setState({ data, loading: false, error: '' })).catch(error => {
      if (error.code !== 'ERR_CANCELED') setState({ data: null, loading: false, error: error.response?.data?.message || 'Unable to load this page. Please try again.' })
    })
    return () => controller.abort()
  }, [path, version])
  return { ...state, reload }
}
