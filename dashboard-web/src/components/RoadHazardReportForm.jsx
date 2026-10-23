import { useEffect, useState } from 'react'
import { BASE_URL } from '../dataProvider'
import '../styles/road-hazard-report.css'

const HAZARD_TYPES = [
  ['flood', 'Flood'],
  ['debris', 'Debris'],
  ['fire', 'Fire'],
  ['landslide', 'Landslide'],
  ['collapsed_road', 'Collapsed road'],
  ['downed_power_line', 'Downed power line'],
  ['other', 'Other'],
]

export default function RoadHazardReportForm({ initialLocation, reporterName = '', onReported, onClose }) {
  const [form, setForm] = useState({
    hazard_type: 'debris', description: '', latitude: '', longitude: '',
    radius_meters: 75, severity: 'high', road_name: '', reporter_name: reporterName,
  })
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!initialLocation) return
    setForm((current) => ({
      ...current,
      latitude: String(initialLocation.latitude),
      longitude: String(initialLocation.longitude),
    }))
  }, [initialLocation?.latitude, initialLocation?.longitude])

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setStatus('')
    try {
      const response = await fetch(`${BASE_URL}/api/v1/hazards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          radius_meters: Number(form.radius_meters),
        }),
      })
      if (!response.ok) throw new Error(`Unable to submit road hazard (${response.status}).`)
      const feature = await response.json()
      onReported?.(feature)
      setForm((current) => ({ ...current, description: '', road_name: '' }))
      setStatus('Report sent to dispatchers for review. It will appear on public maps only if approved.')
    } catch (error) {
      setStatus(error.message || 'Unable to submit road hazard.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="road-hazard-report-form" onSubmit={submit}>
      <div className="road-hazard-report-heading">
        <div><h2>Report Road Hazard</h2><p>Pin the map or enter the affected location.</p></div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close road hazard report">×</button>}
      </div>
      <label>Hazard type
        <select name="hazard_type" value={form.hazard_type} onChange={update}>
          {HAZARD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Description
        <textarea name="description" required minLength={1} rows={3} value={form.description} onChange={update} placeholder="What is blocking or endangering this road?" />
      </label>
      <div className="road-hazard-report-grid">
        <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" required value={form.latitude} onChange={update} /></label>
        <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" required value={form.longitude} onChange={update} /></label>
        <label>Radius (m)<input name="radius_meters" type="number" min="10" max="2000" required value={form.radius_meters} onChange={update} /></label>
        <label>Severity
          <select name="severity" value={form.severity} onChange={update}>
            {['low', 'medium', 'high', 'critical'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <label>Road name<input name="road_name" value={form.road_name} onChange={update} placeholder="Optional" /></label>
      <label>Reporter name<input name="reporter_name" value={form.reporter_name} onChange={update} placeholder="Optional" /></label>
      <button className="road-hazard-submit" type="submit" disabled={submitting}>{submitting ? 'Publishing…' : 'Publish Road Hazard'}</button>
      {status && <p className="road-hazard-report-status" role="status">{status}</p>}
    </form>
  )
}
