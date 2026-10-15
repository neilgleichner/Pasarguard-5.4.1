import PageHeader from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { fetcher } from '@/service/http'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

type HostPreference = { id: number; remark: string; default_remark: string; priority: number; is_customized: boolean }

export default function HostPreferencesPage() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['host-preferences'],
    queryFn: () => fetcher<HostPreference[]>('/api/hosts/preferences'),
  })
  const [hosts, setHosts] = useState<HostPreference[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => setHosts(data), [data])

  const move = (index: number, delta: number) => {
    const next = [...hosts]
    const destination = index + delta
    if (destination < 0 || destination >= next.length) return
    ;[next[index], next[destination]] = [next[destination], next[index]]
    setHosts(next.map((host, priority) => ({ ...host, priority })))
  }

  const save = async () => {
    setSaving(true)
    try {
      await fetcher<HostPreference[]>('/api/hosts/preferences', {
        method: 'PUT',
        body: hosts.map(({ id, remark, priority, is_customized }) => ({ id, remark: is_customized ? remark : null, priority })),
      })
      await client.invalidateQueries({ queryKey: ['host-preferences'] })
      toast.success(t('hostPreferences.saved', { defaultValue: 'Host preferences saved' }))
    } catch {
      toast.error(t('hostPreferences.saveFailed', { defaultValue: 'Could not save host preferences' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex w-full flex-col items-start gap-2 pb-8">
      <div className="w-full"><PageHeader title="hostPreferences.title" description="hostPreferences.description" /><Separator /></div>
      <div className="w-full space-y-3 p-4">
        {isLoading ? <p>{t('loading', { defaultValue: 'Loading...' })}</p> : hosts.map((host, index) => (
          <div key={host.id} className="flex items-center gap-2 rounded-md border p-3">
            <Input aria-label={`Host ${host.id} remark`} value={host.remark} maxLength={256} onChange={event => setHosts(current => current.map(item => item.id === host.id ? { ...item, remark: event.target.value, is_customized: true } : item))} />
            {host.is_customized && <Button variant="outline" size="icon" aria-label="Use shared server name" title={t('hostPreferences.reset', { defaultValue: 'Use shared name' })} onClick={() => setHosts(current => current.map(item => item.id === host.id ? { ...item, remark: item.default_remark, is_customized: false } : item))}><RotateCcw /></Button>}
            <Button variant="outline" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
            <Button variant="outline" size="icon" aria-label="Move down" disabled={index === hosts.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
          </div>
        ))}
        <Button onClick={save} disabled={saving || isLoading}><Save className="mr-2 h-4 w-4" />{t('hostPreferences.save', { defaultValue: 'Save changes' })}</Button>
      </div>
    </div>
  )
}
