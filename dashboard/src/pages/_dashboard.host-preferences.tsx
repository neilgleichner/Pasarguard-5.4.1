import PageHeader from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { fetcher } from '@/service/http'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, RotateCcw, Save } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const rowRefs = useRef(new Map<number, HTMLDivElement>())
  const previousPositions = useRef<Map<number, DOMRect> | null>(null)

  useEffect(() => {
    setHosts(data.map(host => ({ ...host, remark: host.is_customized ? host.remark : '' })))
  }, [data])

  const move = (index: number, delta: number) => {
    const next = [...hosts]
    const destination = index + delta
    if (destination < 0 || destination >= next.length) return
    previousPositions.current = new Map(
      hosts.flatMap(host => {
        const row = rowRefs.current.get(host.id)
        return row ? [[host.id, row.getBoundingClientRect()] as const] : []
      }),
    )
    ;[next[index], next[destination]] = [next[destination], next[index]]
    setHosts(next.map((host, priority) => ({ ...host, priority })))
  }

  useLayoutEffect(() => {
    const previous = previousPositions.current
    previousPositions.current = null
    if (!previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    for (const [hostId, previousRect] of previous) {
      const row = rowRefs.current.get(hostId)
      if (!row) continue
      const offsetY = previousRect.top - row.getBoundingClientRect().top
      if (offsetY === 0) continue
      row.animate([{ transform: `translateY(${offsetY}px)` }, { transform: 'translateY(0)' }], {
        duration: 240,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
    }
  }, [hosts])

  const resetRemark = (host: HostPreference) => {
    setHosts(current => current.map(item => item.id === host.id ? { ...item, remark: item.default_remark, is_customized: false } : item))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    requestAnimationFrame(() => {
      rowRefs.current.get(host.id)?.animate(
        [{ opacity: 0.55, transform: 'scale(0.985)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 280, easing: 'ease-out' },
      )
    })
  }

  const save = async () => {
    if (hosts.some(host => host.is_customized && !host.remark.trim())) {
      toast.error(t('hostPreferences.remarkRequired', { defaultValue: 'A custom server name cannot be empty' }))
      return
    }
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
        {isLoading ? <p>{t('loading', { defaultValue: 'Loading...' })}</p> : hosts.map((host, index) => {
          const invalidRemark = host.is_customized && !host.remark.trim()

          return (
          <div
            key={host.id}
            ref={element => {
              if (element) rowRefs.current.set(host.id, element)
              else rowRefs.current.delete(host.id)
            }}
            className="flex items-center gap-2 rounded-md border p-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Input
                aria-label={`Host ${host.id} remark`}
                value={host.is_customized ? host.remark : ''}
                maxLength={256}
                placeholder={host.default_remark}
                isError={invalidRemark}
                aria-invalid={invalidRemark}
                style={{ fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
                onChange={event => setHosts(current => current.map(item => item.id === host.id ? { ...item, remark: event.target.value, is_customized: true } : item))}
              />
              {invalidRemark && <span className="text-destructive text-xs">{t('hostPreferences.remarkRequired', { defaultValue: 'A custom server name cannot be empty' })}</span>}
            </div>
            {host.is_customized && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Use shared server name"
                title={t('hostPreferences.reset', { defaultValue: 'Use shared name' })}
                onClick={() => resetRemark(host)}
              >
                <RotateCcw />
              </Button>
            )}
            <Button variant="outline" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
            <Button variant="outline" size="icon" aria-label="Move down" disabled={index === hosts.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
          </div>
          )
        })}
        <Button onClick={save} disabled={saving || isLoading || hosts.some(host => host.is_customized && !host.remark.trim())}><Save className="mr-2 h-4 w-4" />{t('hostPreferences.save', { defaultValue: 'Save changes' })}</Button>
      </div>
    </div>
  )
}
