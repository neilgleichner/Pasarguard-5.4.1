import PageHeader from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { fetcher } from '@/service/http'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Grip, RotateCcw, Save, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

type HostPreference = { id: number; remark: string; default_remark: string; priority: number; default_priority: number; is_customized: boolean; enabled: boolean }

function SortableHostRow({ id, rowRef, children }: { id: number; rowRef: (element: HTMLDivElement | null) => void; children: (dragHandle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const dragHandle = (
    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 touch-none" aria-label="Drag to reorder host" title="Drag to reorder" {...attributes} {...listeners}>
      <Grip className="h-4 w-4" />
    </Button>
  )

  return (
    <div
      data-host-row={id}
      ref={element => {
        setNodeRef(element)
        rowRef(element)
      }}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}
      className={isDragging ? 'relative opacity-70' : ''}
    >
      {children(dragHandle)}
    </div>
  )
}

export default function HostPreferencesPage() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ['host-preferences'], queryFn: () => fetcher<HostPreference[]>('/api/hosts/preferences') })
  const [hosts, setHosts] = useState<HostPreference[]>([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowRefs = useRef(new Map<number, HTMLDivElement>())
  const previousPositions = useRef<Map<number, DOMRect> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  useEffect(() => setHosts(data), [data])
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    [],
  )

  const capturePositions = () => {
    previousPositions.current = new Map(
      hosts.flatMap(host => {
        const row = rowRefs.current.get(host.id)
        return row ? [[host.id, row.getBoundingClientRect()] as const] : []
      }),
    )
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

  const visibleHosts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return term ? hosts.filter(host => `${host.remark} ${host.default_remark}`.toLocaleLowerCase().includes(term)) : hosts
  }, [hosts, search])

  const markMoved = (id: number) => {
    setHighlighted(id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlighted(null), 1000)
  }

  const reorder = (fromId: number, toId: number) => {
    const visibleIds = visibleHosts.map(host => host.id)
    const fromIndex = visibleIds.indexOf(fromId)
    const toIndex = visibleIds.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const reorderedVisible = arrayMove(visibleHosts, fromIndex, toIndex)
    capturePositions()
    setHosts(current => {
      const visiblePositions = current.flatMap((host, index) => (visibleIds.includes(host.id) ? [index] : []))
      const reordered = [...current]
      visiblePositions.forEach((position, index) => {
        const host = reorderedVisible[index]
        reordered[position] = host
      })
      return reordered.map((host, priority) => ({ ...host, priority }))
    })
    markMoved(fromId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over) reorder(Number(event.active.id), Number(event.over.id))
  }

  const move = (host: HostPreference, delta: number) => {
    const index = visibleHosts.findIndex(item => item.id === host.id)
    const target = visibleHosts[index + delta]
    if (target) reorder(host.id, target.id)
  }

  const onRemarkKeyDown = (event: KeyboardEvent<HTMLInputElement>, host: HostPreference) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    move(host, event.key === 'ArrowUp' ? -1 : 1)
  }

  const resetOrder = () => {
    capturePositions()
    setHosts(current =>
      [...current]
        .map(host => ({ ...host, priority: host.default_priority }))
        .sort((a, b) => a.priority - b.priority || a.id - b.id)
        .map((host, priority) => ({ ...host, priority })),
    )
  }

  const resetAll = () => {
    if (!window.confirm(t('hostPreferences.resetAllConfirm', { defaultValue: 'Reset all custom host names, order, and enabled states?' }))) return
    capturePositions()
    setHosts(current =>
      [...current]
        .map(host => ({ ...host, remark: host.default_remark, priority: host.default_priority, is_customized: false, enabled: true }))
        .sort((a, b) => a.priority - b.priority || a.id - b.id)
        .map((host, priority) => ({ ...host, priority })),
    )
  }

  const resetName = (host: HostPreference) => {
    setHosts(current => current.map(item => (item.id === host.id ? { ...item, remark: item.default_remark } : item)))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    requestAnimationFrame(() =>
      rowRefs.current.get(host.id)?.animate(
        [
          { opacity: 0.55, transform: 'scale(0.985)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 260, easing: 'ease-out' },
      ),
    )
  }

  const save = async () => {
    if (hosts.some(host => !host.remark.trim())) {
      toast.error(t('hostPreferences.remarkRequired', { defaultValue: 'A server name cannot be empty' }))
      return
    }
    setSaving(true)
    try {
      await fetcher<HostPreference[]>('/api/hosts/preferences', {
        method: 'PUT',
        body: hosts.map(({ id, remark, default_remark, priority, enabled }) => ({ id, remark: remark === default_remark ? null : remark, priority, enabled })),
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
      <div className="w-full">
        <PageHeader title="hostPreferences.title" description="hostPreferences.description" />
        <p className="text-muted-foreground px-4 pb-3 text-sm">
          {t('hostPreferences.subscriptionNote', { defaultValue: 'Names, order, and enabled hosts are reflected in subscription links and copied configurations for your users.' })}
        </p>
        <Separator />
      </div>
      <div className="w-full space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hosts.length > 8 && (
            <div className="relative min-w-48 flex-1 sm:max-w-sm">
              <Search className="text-muted-foreground absolute start-3 top-2.5 h-4 w-4" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t('hostPreferences.search', { defaultValue: 'Search hosts' })}
                aria-label={t('hostPreferences.search', { defaultValue: 'Search hosts' })}
                className="ps-9"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetOrder}>
              <ArrowUp className="mr-2 h-4 w-4" />
              {t('hostPreferences.resetOrder', { defaultValue: 'Reset order' })}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetAll}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('hostPreferences.resetAll', { defaultValue: 'Reset all' })}
            </Button>
          </div>
        </div>
        {isLoading ? (
          <p>{t('loading', { defaultValue: 'Loading...' })}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleHosts.map(host => host.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visibleHosts.map((host, visibleIndex) => {
                  const invalidRemark = !host.remark.trim()
                  const customized = host.remark !== host.default_remark
                  return (
                    <SortableHostRow
                      key={host.id}
                      id={host.id}
                      rowRef={element => {
                        if (element) rowRefs.current.set(host.id, element)
                        else rowRefs.current.delete(host.id)
                      }}
                    >
                      {dragHandle => (
                        <div
                          className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 rounded-md border px-2 py-2 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3 sm:px-3 ${highlighted === host.id ? 'bg-accent/70' : ''} ${!host.enabled ? 'opacity-70' : ''}`}
                        >
                          <div className="order-2 col-span-2 flex shrink-0 items-center gap-1 sm:order-1 sm:col-span-1">
                            {dragHandle}
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t('hostPreferences.moveUp', { defaultValue: 'Move up' })}
                              title={t('hostPreferences.moveUp', { defaultValue: 'Move up' })}
                              disabled={visibleIndex === 0}
                              onClick={() => move(host, -1)}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t('hostPreferences.moveDown', { defaultValue: 'Move down' })}
                              title={t('hostPreferences.moveDown', { defaultValue: 'Move down' })}
                              disabled={visibleIndex === visibleHosts.length - 1}
                              onClick={() => move(host, 1)}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="order-1 col-start-1 row-start-1 flex min-w-0 flex-col gap-1 sm:order-2 sm:col-auto sm:row-auto">
                            <div className="flex min-w-0 items-center gap-2">
                              <Input
                                aria-label={`${t('hostPreferences.hostName', { defaultValue: 'Host name' })}: ${host.default_remark}`}
                                value={host.remark}
                                maxLength={256}
                                placeholder={host.default_remark}
                                isError={invalidRemark}
                                aria-invalid={invalidRemark}
                                onKeyDown={event => onRemarkKeyDown(event, host)}
                                style={{ fontFamily: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
                                onChange={event => setHosts(current => current.map(item => (item.id === host.id ? { ...item, remark: event.target.value } : item)))}
                              />
                              {customized && (
                                <span className="bg-primary/10 text-primary inline-flex shrink-0 rounded-full px-1.5 py-1 text-[10px] sm:px-2 sm:text-xs">
                                  <span className="sm:hidden" aria-hidden="true">
                                    <span className="block size-1.5 rounded-full bg-current" />
                                  </span>
                                  <span className="hidden sm:inline">{t('hostPreferences.custom', { defaultValue: 'Custom' })}</span>
                                </span>
                              )}
                            </div>
                            {customized && (
                              <span className="text-muted-foreground truncate text-xs">{t('hostPreferences.originalName', { defaultValue: 'Original: {{name}}', name: host.default_remark })}</span>
                            )}
                            {invalidRemark && <span className="text-destructive text-xs">{t('hostPreferences.remarkRequired', { defaultValue: 'A server name cannot be empty' })}</span>}
                          </div>
                          <div className="order-1 col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2 sm:order-3 sm:col-auto sm:row-auto">
                            <Switch
                              checked={host.enabled}
                              onCheckedChange={enabled => setHosts(current => current.map(item => (item.id === host.id ? { ...item, enabled } : item)))}
                              aria-label={t('hostPreferences.enabled', { defaultValue: 'Host enabled' })}
                              title={t('hostPreferences.enabled', { defaultValue: 'Host enabled' })}
                            />
                            {customized && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={t('hostPreferences.resetName', { defaultValue: 'Reset name' })}
                                title={t('hostPreferences.resetName', { defaultValue: 'Reset name' })}
                                onClick={() => resetName(host)}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableHostRow>
                  )
                })}
                {!visibleHosts.length && <p className="text-muted-foreground py-6 text-center text-sm">{t('hostPreferences.noResults', { defaultValue: 'No hosts match your search' })}</p>}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <Button onClick={save} disabled={saving || isLoading || hosts.some(host => !host.remark.trim())}>
          <Save className="mr-2 h-4 w-4" />
          {t('hostPreferences.save', { defaultValue: 'Save changes' })}
        </Button>
      </div>
    </div>
  )
}
