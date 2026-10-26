// Renderizado de plantillas con variables y utilidades de tracking

export interface TemplateVars {
  nombre?: string | null
  empresa?: string | null
  cargo?: string | null
  email?: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Convierte texto plano con saltos de línea en HTML seguro con párrafos */
export function textToHtml(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">${paras}</div>`
}

/** Reemplaza {{nombre}}, {{empresa}}, {{cargo}}, {{email}} con fallbacks sensatos */
export function renderTemplate(tpl: string, vars: TemplateVars): string {
  const nombre = vars.nombre?.trim() || vars.email?.split('@')[0] || 'por ahí'
  const nombreCorto = nombre.split(' ')[0]
  const nombreTitulo =
    nombreCorto.charAt(0).toUpperCase() + nombreCorto.slice(1)
  return tpl
    .replace(/\{\{\s*nombre\s*\}\}/gi, nombreTitulo)
    .replace(/\{\{\s*empresa\s*\}\}/gi, vars.empresa?.trim() || 'su empresa')
    .replace(/\{\{\s*cargo\s*\}\}/gi, vars.cargo?.trim() || 'su equipo')
    .replace(/\{\{\s*email\s*\}\}/gi, vars.email || '')
}

export interface TrackingConfig {
  baseUrl: string
  campaignId: string
  leadId: string
  stepNumber: number
  unsubToken: string
}

/** Añade píxel de apertura + link de baja al HTML */
export function injectTracking(html: string, cfg: TrackingConfig): string {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const openData = Buffer.from(
    `${cfg.campaignId}.${cfg.leadId}.${cfg.stepNumber}`
  ).toString('base64url')
  const pixel = `<img src="${base}/api/track/open/${openData}" width="1" height="1" alt="" style="display:none"/>`
  const unsub = `<div style="margin-top:22px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">¿No quieres recibir más correos? <a href="${base}/api/unsubscribe/${cfg.unsubToken}" style="color:#6b7280">Date de baja aquí</a>.</div>`
  return html + pixel + unsub
}

/** Encabezados anti-spam recomendados */
export function buildHeaders(cfg: {
  unsubToken: string
  baseUrl: string
  campaignId: string
}): Record<string, string> {
  const base = cfg.baseUrl.replace(/\/$/, '')
  return {
    'List-Unsubscribe': `<${base}/api/unsubscribe/${cfg.unsubToken}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Campaign-Id': cfg.campaignId,
  }
}
