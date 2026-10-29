import { createContext, useContext } from 'react'
import useApi from '../hooks/useApi'
const StoreContext = createContext(null)
export function StoreProvider({ children }) {
  const state = useApi('/content/storefront')
  const data = state.data || {}
  const categories = data.categories || []
  return <StoreContext.Provider value={{ ...state, categories, categoryOrder: categories.map(c => c.slug), categoryDetails: Object.fromEntries(categories.map(c => [c.slug, { ...c, label: c.name }])), settings: data.settings || {}, sections: data.sections || [], blogs: data.blogs || [], collections: data.collections || [] }}>{children}</StoreContext.Provider>
}
export const useStore = () => useContext(StoreContext)
