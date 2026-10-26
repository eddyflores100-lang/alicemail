'use client'

// Página Bandeja v2: respuestas unificadas + análisis del agente IA
// (temperatura, resumen, borrador) y respuesta directa
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Inbox as InboxIcon,
  MailOpen,
  Loader2,
  RefreshCw,
  Reply,
  AlertTriangle,
  Sparkles,
  Thermometer,
  Send,
  PenLine,
} from 'lucide-react'
import { api, InboxDTO, InboxMessageDTO, TEMP_LABEL, TEMP_BADGE } from './types'
import { toast } from 'sonner'

type Filter = 'all' | 'unclassified' | 'hot' | 'drafts'

export function Inbox({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [data, setData] = useState<InboxDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [classifying, setClassifying] = useState<string | null>(null)

  const load = useCallback(() => {
    const qs = filter === 'all' ? '' : `?filter=${filter}`
    api<InboxDTO>(`/api/inbox${qs}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(load, [load, refreshKey])

  const openMessage = async (id: string) => {
    await api('/api/inbox', { method: 'PATCH', body: JSON.stringify({ id }) })
    load()
  }

  const classify = async (id: string) => {
    setClassifying(id)
    try {
      await api('/api/inbox', { method: 'PATCH', body: JSON.stringify({ classify: id }) })
      toast.success('Mensaje clasificado por el agente')
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error clasificando')
    } finally {
      setClassifying(null)
    }
  }

  const sendReply = async (m: InboxMessageDTO) => {
    setSending(m.id)
    try {
      await api('/api/agent/reply', { method: 'POST', body: JSON.stringify({ messageId: m.id, body: replyText[m.id] || m.aiReply || undefined }) })
      toast.success(`Respuesta enviada a ${m.from}`)
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setSending(null)
    }
  }

  const markAll = async () => {
    await api('/api/inbox', { method: 'PATCH', body: JSON.stringify({ all: true }) })
    toast.success('Todo marcado como leído')
    load()
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todo' },
    { id: 'unclassified', label: `Sin clasificar${data?.unclassifiedCount ? ` (${data.unclassifiedCount})` : ''}` },
    { id: 'hot', label: '🔥 Calientes' },
    { id: 'drafts', label: 'Borradores' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'default' : 'outline'}
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={markAll}>
            <MailOpen className="h-3.5 w-3.5 mr-1" /> Marcar todo leído
          </Button>
          <Button size="sm" variant="outline" onClick={load} aria-label="Recargar">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !data || data.messages.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Nada por aquí. Las respuestas aparecen cuando el motor sincroniza IMAP (cada ~5 min) y el agente las clasifica (caliente / tibio / frío).
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.messages.map((m) => (
                <li key={m.id}>
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3" onClick={() => openMessage(m.id)}>
                        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${m.read ? 'bg-transparent' : 'bg-emerald-500'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-sm truncate ${m.read ? 'text-slate-500' : 'font-semibold text-slate-800'}`}>{m.from}</span>
                            {m.temperature && (
                              <Badge className={`${TEMP_BADGE[m.temperature]} hover:${TEMP_BADGE[m.temperature]} text-[10px] gap-0.5`}>
                                <Thermometer className="h-2.5 w-2.5" />
                                {TEMP_LABEL[m.temperature] || m.temperature}
                              </Badge>
                            )}
                            {m.isReply && <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100 text-[10px]"><Reply className="h-2.5 w-2.5 mr-0.5" />respuesta</Badge>}
                            {m.isBounce && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />rebote</Badge>}
                            {!m.classified && m.isReply && !m.isBounce && <Badge variant="outline" className="text-[10px] text-slate-400">sin clasificar</Badge>}
                          </div>
                          <p className={`text-sm truncate ${m.read ? 'text-slate-400' : 'text-slate-700'}`}>{m.aiSummary || m.subject}</p>
                          <p className="text-xs text-slate-400 truncate">{m.aiIntent ? `${m.aiIntent} · ` : ''}{m.subject}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-slate-400">{new Date(m.receivedAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                          <p className="text-xs text-slate-300 truncate max-w-40">{m.mailbox}</p>
                        </div>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="text-left flex flex-wrap items-center gap-2 text-base">
                          {m.subject}
                          {m.temperature && (
                            <Badge className={`${TEMP_BADGE[m.temperature]} hover:${TEMP_BADGE[m.temperature]}`}>
                              <Thermometer className="h-3 w-3 mr-1" />
                              {TEMP_LABEL[m.temperature] || m.temperature}
                            </Badge>
                          )}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="text-xs text-slate-400 space-y-0.5">
                        <p>De: {m.from} → recibido en {m.mailbox}</p>
                        <p>{new Date(m.receivedAt).toLocaleString('es')}</p>
                      </div>

                      {m.aiSummary && (
                        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 space-y-1">
                          <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" /> Análisis del agente
                          </p>
                          <p className="text-sm text-slate-700">{m.aiSummary}</p>
                          {m.aiIntent && <p className="text-xs text-slate-500">Intención: {m.aiIntent}</p>}
                        </div>
                      )}

                      <pre className="whitespace-pre-wrap text-sm font-sans text-slate-700 bg-slate-50 rounded-lg p-4">{m.body}</pre>

                      {m.isReply && !m.isBounce && (
                        <div className="space-y-2 border-t pt-3">
                          {!m.classified ? (
                            <Button size="sm" variant="outline" onClick={() => classify(m.id)} disabled={classifying === m.id}>
                              {classifying === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                              Clasificar con IA ahora
                            </Button>
                          ) : (
                            <>
                              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                                <PenLine className="h-3 w-3" /> Respuesta {m.repliedAt ? 'ya enviada' : 'del agente (editable)'}
                              </p>
                              <textarea
                                className="w-full rounded-md border bg-white p-3 text-sm min-h-32 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400"
                                disabled={!!m.repliedAt}
                                value={replyText[m.id] ?? m.aiReply ?? ''}
                                onChange={(e) => setReplyText({ ...replyText, [m.id]: e.target.value })}
                              />
                              {!m.repliedAt && (
                                <div className="flex justify-end">
                                  <Button size="sm" onClick={() => sendReply(m)} disabled={sending === m.id} className="bg-emerald-600 hover:bg-emerald-700">
                                    {sending === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                                    Enviar respuesta
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <InboxIcon className="h-3 w-3" />
        Los mensajes de MAILER-DAEMON se marcan como rebote y penalizan el warmup −25% durante 48 h. El agente responde automáticamente a los leads calientes si está en modo Autónomo.
      </p>
    </div>
  )
}
