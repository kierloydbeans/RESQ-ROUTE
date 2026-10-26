import React, { useMemo, useRef, useState } from 'react'
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react'
import { API_URL } from '../dataProvider'

const parseImageUrls = (value) => {
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(parsed)) return parsed.filter(Boolean).slice(0, 3)
    if (typeof parsed === 'string' && parsed) return [parsed]
  } catch {
    return typeof value === 'string' ? [value] : []
  }
  return []
}

const CenterImageManager = ({ centerId, token, imageUrl, onChange }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const uploadRef = useRef(null)
  const replaceRefs = useRef([])
  const images = useMemo(() => parseImageUrls(imageUrl), [imageUrl])

  const request = async (index, method, file) => {
    setBusy(true)
    setError('')
    try {
      const options = { method, headers: { Authorization: `Bearer ${token}` } }
      if (file) {
        const body = new FormData()
        body.append('file', file)
        options.body = body
      }
      const response = await fetch(`${API_URL}/shelters/${centerId}/images${index == null ? '' : `/${index}`}`, options)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.detail || 'Center image update failed.')
      onChange?.(payload.image_url)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 3 - images.length)
    for (const file of files) await request(null, 'POST', file)
    event.target.value = ''
  }

  const handleReplace = async (index, event) => {
    const file = event.target.files?.[0]
    if (file) await request(index, 'PUT', file)
    event.target.value = ''
  }

  return (
    <div className="coord-center-image-manager" onClick={(event) => event.stopPropagation()}>
      <div className="coord-center-image-heading">
        <div><strong>EVACUATION CENTER IMAGES</strong><small>{images.length} / 3 uploaded</small></div>
        <button type="button" className="coord-center-image-upload" onClick={() => uploadRef.current?.click()} disabled={busy || images.length >= 3}>
          <ImagePlus size={14} /> Upload image
        </button>
        <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleUpload} />
      </div>
      <div className="coord-center-image-grid">
        {images.map((url, index) => (
          <div className="coord-center-image-tile" key={url}>
            <img src={url} alt={`Evacuation center view ${index + 1}`} />
            <div className="coord-center-image-actions">
              <button type="button" onClick={() => replaceRefs.current[index]?.click()} disabled={busy} aria-label={`Replace center image ${index + 1}`}><RefreshCw size={12} /></button>
              <button type="button" onClick={() => request(index, 'DELETE')} disabled={busy} aria-label={`Delete center image ${index + 1}`}><Trash2 size={12} /></button>
              <input ref={(element) => { replaceRefs.current[index] = element }} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => handleReplace(index, event)} />
            </div>
          </div>
        ))}
        {images.length === 0 && <div className="coord-center-image-empty">No center images uploaded yet.</div>}
      </div>
      {error && <p className="coord-inventory-form-error" role="alert">{error}</p>}
    </div>
  )
}

export { parseImageUrls }
export default CenterImageManager
