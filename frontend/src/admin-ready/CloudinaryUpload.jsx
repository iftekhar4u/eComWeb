import { useState } from 'react'
import api from '../services/api'

export default function CloudinaryUpload({ onUploaded, label = 'Upload image to Cloudinary', disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function upload(event) {
    const input = event.currentTarget, file = input.files?.[0]
    if (!file) return
    setError(''); setNotice('')
    if (file.size > 5 * 1024 * 1024) { setError('Choose an image of 5 MB or smaller.'); input.value = ''; return }
    setBusy(true)
    try {
      const form = new FormData(); form.append('image', file)
      const { data } = await api.post('/admin-ready/integrations/cloudinary/upload', form)
      onUploaded(data.url)
      setNotice('Uploaded. Save this entry to use the image on your website.')
    } catch (e) { setError(e.response?.data?.message || 'Upload failed. Check Cloudinary in Admin Settings and retry.') }
    finally { setBusy(false); input.value = '' }
  }
  return <div className="ready-cloudinary-upload"><label>{busy ? 'Uploading image…' : label}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy || disabled} onChange={upload} /></label><small>JPEG, PNG, WebP or GIF · up to 5 MB. Configure Cloudinary in Settings.</small>{error && <p role="alert" className="studio-error">{error}</p>}{notice && <p role="status">{notice}</p>}</div>
}
