// ─────────────────────────────────────────────────────────────────────
// AliceMail — Cerebro IA del agente
// Prioridad: 1) endpoint OpenAI-compatible configurado en Ajustes (para la VM)
//           2) z-ai-web-dev-sdk (sandbox)
//           3) null → el agente usa heurísticas locales
// ─────────────────────────────────────────────────────────────────────
import { getSettings } from '@/lib/settings'

export interface AiAnswer {
  temperature: 'HOT' | 'WARM' | 'COLD' | 'OOO'
  intent: string
  summary: string
  reply: string
  source: 'ia' | 'heuristic'
}

let sdkCache: {
  chat: (messages: { role: string; content: string }[]) => Promise<string | null>
} | null = null
let sdkTried = false

/** Llama a un LLM con los mensajes dados; devuelve el texto o null si no hay motor disponible */
export async function aiChat(messages: { role: string; content: string }[]): Promise<string | null> {
  // 1) Endpoint propio (OpenAI-compatible) — ideal en la VM de Oracle
  const s = await getSettings()
  if (s.aiApiUrl && s.aiApiUrl.startsWith('http')) {
    try {
      const base = s.aiApiUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(s.aiApiKey ? { Authorization: `Bearer ${s.aiApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: s.aiModel || 'gpt-4o-mini',
          messages,
          temperature: 0.3,
          max_tokens: 700,
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        const text = data.choices?.[0]?.message?.content
        if (text) return text
      }
    } catch {
      /* cae al siguiente nivel */
    }
  }

  // 2) z-ai-web-dev-sdk (disponible en este entorno)
  if (!sdkTried) {
    sdkTried = true
    try {
      const mod = await import('z-ai-web-dev-sdk')
      const zai = await (mod.default as { create: () => Promise<unknown> }).create()
      const z = zai as {
        chat: { completions: { create: (args: unknown) => Promise<{ choices?: { message?: { content?: string } }[] }> } }
      }
      sdkCache = {
        chat: async (msgs) => {
          const r = await z.chat.completions.create({ messages: msgs })
          return r.choices?.[0]?.message?.content || null
        },
      }
    } catch {
      sdkCache = null
    }
  }
  if (sdkCache) {
    try {
      return await sdkCache.chat(messages)
    } catch {
      sdkTried = false // reintentará crear el SDK en la próxima llamada
    }
  }
  return null
}

const SYSTEM_CLASSIFY = `Eres el agente de AliceMail, plataforma de cold email. Clasificas respuestas de prospectos y redactas la respuesta.
Responde SOLO un JSON válido, sin markdown, con esta forma exacta:
{"temperature":"HOT|WARM|COLD|OOO","intent":"<máx 6 palabras>","summary":"<resumen en 1 frase, español>","reply":"<respuesta lista para enviar, 2-5 frases, español, tono profesional y humano, firma corta>"}
Criterios:
- HOT: interés claro o explícito (pide precio, demo, reunión, llamada, "me interesa", pregunta cómo empezar).
- WARM: interés tibio (pide más información, "ahora no", "más adelante", duda concreta).
- COLD: no interesado, respuesta negativa o pide no recibir más correos.
- OOO: fuera de oficina / autorespuesta automática (la reply debe indicar que se reintenta después).
La reply debe fijarse en el objetivo comercial del remitente original (vender el servicio de datos de TechDigital) pero siempre respondiendo con naturalidad al contenido recibido.`

/** Clasifica una respuesta de lead. Nunca lanza: si la IA falla usa heurísticas */
export async function classifyReply(input: {
  from: string
  subject: string
  body: string
}): Promise<AiAnswer> {
  const raw = await aiChat([
    { role: 'system', content: SYSTEM_CLASSIFY },
    {
      role: 'user',
      content: `De: ${input.from}\nAsunto: ${input.subject}\n\nMensaje:\n${input.body.slice(0, 2500)}`,
    },
  ])
  const parsed = extractJson(raw)
  if (parsed && isValidAnswer(parsed)) {
    return {
      temperature: parsed.temperature,
      intent: String(parsed.intent || '').slice(0, 80),
      summary: String(parsed.summary || '').slice(0, 300),
      reply: String(parsed.reply || '').slice(0, 3000),
      source: 'ia',
    }
  }
  return heuristic(input)
}

function extractJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isValidAnswer(o: Record<string, unknown>): boolean {
  return ['HOT', 'WARM', 'COLD', 'OOO'].includes(String(o.temperature))
}

/** Clasificación por palabras clave cuando no hay LLM disponible */
function heuristic(input: { from: string; subject: string; body: string }): AiAnswer {
  const t = `${input.subject} ${input.body}`.toLowerCase()
  let temperature: AiAnswer['temperature'] = 'WARM'
  let intent = 'respuesta'
  let reply =
    'Gracias por tu respuesta. Te escribo en los próximos días con más detalles.\n\nUn saludo.'
  if (/fuera de la oficina|out of office|vacaciones|autorespuesta|on vacation|automatic reply|estoy de vaca/.test(t)) {
    temperature = 'OOO'
    intent = 'fuera de oficina'
    reply = '¡Gracias por el aviso! Vuelvo a escribirte cuando estés de vuelta. ¡Buenas vacaciones!'
  } else if (/no (me )?intere|no gracias|do not contact|dar de baja|unsubs|remove me|no deseo|quitarme|baja definitiva|stop/.test(t)) {
    temperature = 'COLD'
    intent = 'no interesado'
    reply =
      'Gracias por tu honestidad. Lo dejo aquí y no volveré a escribirte. Si en el futuro te resulta útil, estaré a un correo de distancia.\n\nUn saludo cordial.'
  } else if (/precio|coste|cuánto cuesta|cuanto cuesta|demo|reuni[oó]n|llamada|me interesa|interesa|c[oó]mo empiezo|agenda|disponible para|zip|c[oó]mo funciona|quot|cotiza/.test(t)) {
    temperature = 'HOT'
    intent = 'interés · pide siguiente paso'
    reply =
      '¡Gracias por responder! Me alegra que te interese.\n\nTe propongo una llamada de 15 minutos para enseñarte cómo funciona y darte un precio según tu volumen. ¿Te va bien mañana o pasado? Si prefieres, te envío ahora mismo una propuesta con números.\n\nUn saludo.'
  } else if (/m[aá]s informaci[oó]n|más adelante|now|despu[eé]s|otro momento|presupuesto|env[ií]ame|enviame|informaci[oó]n/.test(t)) {
    temperature = 'WARM'
    intent = 'pide información'
    reply =
      'Gracias por tu respuesta. Te envío un resumen breve con los puntos clave y algunos casos de uso parecidos a tu caso. Cualquier duda, aquí estoy.\n\nUn saludo.'
  }
  return { temperature, intent, summary: input.subject.slice(0, 120), reply, source: 'heuristic' }
}

export const TEMPERATURE_LABEL: Record<string, string> = {
  HOT: 'Caliente',
  WARM: 'Tibio',
  COLD: 'Frío',
  OOO: 'Fuera de oficina',
}
