// Contenido de calentamiento (warmup): asuntos y cuerpos realistas en español.
// Mensajes breves entre buzones propios que simulan conversación humana.

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return out
}

export const WARMUP_SUBJECTS = [
  '¿Viste esto?',
  'Consulta rápida',
  'Sobre lo que hablamos',
  'Idea para el jueves',
  'Re: notas de la reunión',
  'Te comparto algo',
  'Esto te va a interesar',
  '¿Tienes un minuto?',
  'Documento adjunto pendiente',
  'Checklist antes de enviar',
  'Recordatorio corto',
  'Fw: artículo interesante',
  'Cerramos el trimestre',
  'Pregunta sobre el informe',
  'Resultado de la prueba',
]

export const WARMUP_BODIES = [
  'Hola, ¿cómo va todo por ahí? Te mando un saludo rápido.',
  '¿Ya tuviste chance de revisarlo? Me cuentas cuando puedas.',
  'Buen día. Solo pasaba a confirmar que quedó registrado.',
  'Hola, quedé pensando en lo que comentamos. ¿Lo seguimos la próxima semana?',
  'Te comparto el enlace que mencioné. Dime si te llegó bien.',
  '¿Todo bien? Aquí avanzando con lo pendiente.',
  'Hola, una duda rápida: ¿este viernes sigue en pie?',
  'Gracias por la info de ayer. Me sirvió bastante.',
  'Buenas, te escribo corto: sin novedad por ahora, te aviso apenas avance.',
  '¿Pudiste ver el último borrador? Cualquier comentario suma.',
  'Hola, dejé anotado lo del trimestre. Cuando tengas datos los cruzamos.',
  'Solo saludar y validar que el correo llega bien. ¡Saludos!',
]

export const WARMUP_SIGNATURES = [
  'Saludos.',
  'Un abrazo.',
  'Gracias.',
  'Hablamos pronto.',
  '¡Éxitos!',
]

/** Genera un email de warmup: asunto + cuerpo aleatorio y humano */
export function generateWarmupEmail(fromName: string, toFirstName: string) {
  const subject = pick(WARMUP_SUBJECTS)
  const body = `${pick(['Hola', 'Buenas', 'Qué tal'])} ${toFirstName},

${pick(WARMUP_BODIES)}

${pick(WARMUP_SIGNATURES)}
${fromName}`
  return { subject, body }
}
