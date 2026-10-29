import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
export { api }
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((value || 0) / 100)
export const date = value => value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const message = e => e.response?.data?.message ||
  (e.response?.status === 401 ? 'Your session expired. Sign in again.' :
    e.response?.status === 403 ? 'Administrator access and MFA verification are required.' :
      e.response?.status === 429 ? 'Too many attempts. Wait before trying again.' : 'Request failed. Please retry.')
export function useStudio(path) {
  const [revision,setRevision]=useState(0)
  const [state,setState]=useState({data:null,loading:true,error:''})
  const reload=useCallback(()=>setRevision(n=>n+1),[])
  useEffect(()=>{
    if(!path) {setState({data:null,loading:false,error:''});return}
    const controller=new AbortController()
    setState({data:null,loading:true,error:''})
    api.get(path,{signal:controller.signal}).then(({data})=>setState({data,loading:false,error:''})).catch(e=>{
      if(e.code!=='ERR_CANCELED') setState({data:null,loading:false,error:e.response?.status===404?'This admin API is unavailable. Start the project with node admin-tools/start.mjs.':message(e)})
    })
    return ()=>controller.abort()
  },[path,revision])
  return {...state,reload}
}
