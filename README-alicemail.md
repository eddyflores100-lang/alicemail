# AliceMail v3.0 — CRM de leads + cold email + warmup + Agente IA

Software a medida de **TechDigital · AliceLabs**. Inspira(d)o en los repos públicos de
warmup/cold-email, pero mejorado y en español. Corre en tu VM de Oracle Cloud Always Free.

## Qué hace

| Módulo | Función |
|---|---|
| **Panel** | Cuota diaria («correos que puedes enviar hoy»), KPIs, gráfico 14 días, calentamiento por buzón |
| **Buzones** | Alta Gmail/Workspace, M365 o SMTP propio con presets; verificación SMTP+IMAP; topes por buzón |
| **CRM · Leads** | **Pipeline kanban con 7 etapas** (Nuevo → En contacto → Caliente / Tibio / Frío → Rechazado / Recuperado) con arrastrar y soltar, ficha de lead con **timeline completo** (enviado, abierto, respondió, rebote, re-engagement), score de engagement, contador de aperturas, notas e import CSV (coma, `;` o tabulador — compatible con el export de TechDigital Prospect) |
| **Automatización** | **Reglas de re-engagement**: si el lead abre N veces sin responder → cambia de enfoque; si lleva N días frío → lo mete en **otra promoción**; si nunca abre → re-envío. Gestor de **enfoques comerciales** (ángulos con plantillas) y registro de toda la automatización |
| **Campañas** | Secuencia email inicial + follow-ups, variables `{{nombre}}` `{{empresa}}` `{{cargo}}`, tope diario global |
| **Bandeja** | Respuestas unificadas vía IMAP + análisis del agente (resumen, intención, borrador) y respuesta directa |
| **Agente IA** | Clasifica cada respuesta (🔥 Caliente / Tibio / Frío / OOO), redacta la respuesta, **responde solo a los calientes** en modo Autónomo, vigila la salud de los buzones y genera el informe diario |
| **Notificaciones** | Avisos en tiempo real por **Telegram** y/o **WhatsApp Cloud API**: respuestas, leads calientes, rebotes, errores e informe diario |
| **MCP** | Servidor **Model Context Protocol** (HTTP JSON-RPC 2.0) con 14 herramientas (incluye `crm_pipeline`, `set_lead_stage`, `reengage_lead`) para controlar AliceMail desde Claude Desktop, Cursor u otro agente |
| **Ajustes** | Motor on/off, ventana horaria, tope global diario, firma, checklist SPF/DKIM/DMARC |

## El CRM y el re-engagement (nuevo en v3)

Cada lead vive en un **pipeline visual** y el agente lo cataloga solo:

- **Caliente** — respondió con interés (pide precio, demo, reunión) → aviso inmediato a Telegram/WhatsApp.
- **Tibio** — pide información o pospone.
- **Frío** — abrió pero no responde, o respuesta fría sin rechazo.
- **Rechazado** — dice «no» o se da de baja → nunca se le vuelve a escribir.
- **Recuperado** — estaba frío/tibio y el agente lo re-activó.

El agente revisa las **reglas de re-engagement** en cada ciclo y actúa con guardas de seguridad
(nunca toca rechazados ni bajas, espera 72 h entre re-activaciones del mismo lead, respeta la
cuota diaria y la ventana horaria):

| Regla | Dispara | Acción |
|---|---|---|
| Abrió 2+ veces sin responder | interés oculto | **Cambio de enfoque**: envía otro correo con un ángulo distinto (caso de éxito, pregunta directa…) |
| Frío desde hace N días | se apagó | **Otra promoción**: lo inscribe en una campaña distinta (p. ej. «Promo B — Auditoría gratuita») |
| Nunca abrió en N días | se le perdió | **Re-envío** del último correo |

También puedes actuar a mano desde la ficha del lead: re-enviar, cambiar de enfoque
(eligiendo el ángulo) o meterlo en otra promoción. Todo queda en el timeline del lead,
en el feed del Agente IA y en tu Telegram/WhatsApp.

## El Agente IA (desde v2)

Cada ~90 s el agente: **1)** clasifica las respuestas nuevas con un LLM (o heurísticas locales si no hay IA configurada), **2)** actualiza la temperatura del lead, **3)** notifica a Telegram/WhatsApp y **4)** actúa según su nivel de autonomía:

- **Observar** — solo clasifica y registra.
- **Asistir** — clasifica, notifica y deja borradores listos para aprobar con un clic.
- **Autónomo** — además responde automáticamente a los leads calientes y pausa buzones con fallos.

En el sandbox la IA ya funciona. En tu VM, conecta cualquier endpoint compatible con OpenAI
(GLM, OpenAI, Groq, Ollama…) en **Agente IA → Motor de IA**; sin configuración usa reglas heurísticas.

## Lógica de reputación (rampa de warmup)

- Cada buzón arranca en **3/día**, sube **+2 diarios**, techo **25/día** (configurable por buzón).
- Si hay campaña activa, el warmup baja a **5/día** (protege el dominio).
- Rebote detectado → penalización **−25% durante 48 h**.
- 3 errores SMTP seguidos → buzón en ERROR hasta re-verificar.
- Envíos solo dentro de la **ventana horaria** (por defecto 8:00–20:00) y repartidos en ciclos de 45 s.

## Desarrollo local

```bash
bun install
bun run db:push        # crea el esquema SQLite
bun scripts/seed.ts    # datos demo (buzones sin verificar: el motor no envía nada)
bun run dev            # http://localhost:3000
```

## Despliegue en tu VM Oracle (ARM)

```bash
# desde tu equipo, sube el proyecto (o clónalo)
scp -r ./ usuario@VM:/home/opc/alicemail
ssh alicelabs-free
cd ~/alicemail
mkdir -p alicemail-db
sudo dnf install -y docker-ce docker-compose-plugin  # si aún no lo tienes
sudo systemctl enable --now docker
sudo docker compose up -d --build
```

Acceso recomendado **sin abrir puertos**: túnel SSH desde Cloud Shell o tu PC

```bash
ssh -L 3000:localhost:3000 alicelabs-free
# abre http://localhost:3000 en tu navegador
```

Opcional con dominio (Cloudflare): registro A `mail.tudominio.com` → IP de la VM
(regla de entrada solo para 80/443 en el Security List), y Caddy/nginx delante con HTTPS.
Pon `https://mail.tudominio.com` en *Ajustes → URL pública de tracking* para activar
píxel de aperturas y links de baja reales.

## Endpoints útiles

- `POST /api/worker/tick` — fuerza un ciclo de envío (útil para cron externo)
- `GET  /api/stats` — métricas del panel (incluye cuota y temperaturas)
- `GET  /api/agent` / `PATCH /api/agent` — estado y ajustes del agente
- `POST /api/agent/run` — ejecuta un ciclo del agente ahora
- `POST /api/agent/reply` — envía la respuesta a un mensaje (borrador o texto propio)
- `POST /api/notify/test` — mensaje de prueba a Telegram/WhatsApp
- `GET  /api/mcp` — discovery del servidor MCP (token + herramientas)
- `POST /api/mcp` — **JSON-RPC 2.0** (Bearer token): initialize, tools/list, tools/call
- `GET  /api/rules` / `PATCH /api/rules` — reglas de re-engagement (activar, umbral, acción, promoción)
- `GET  /api/angles` / `POST /api/angles` / `PATCH /api/angles/<id>` — enfoques comerciales
- `GET  /api/leads/<id>` — ficha completa con timeline; `POST /api/leads/<id>/actions` — reenvío / enfoque / otra promo
- `GET  /api/crm/log` — registro de automatización CRM
- `GET  /api/unsubscribe/<token>` — baja confirmada por el lead
- `GET  /api/track/open/<data>` — píxel 1×1

## MCP desde Claude Desktop (ejemplo)

Página **MCP** de la app → copia el JSON listo. Localmente equivale a:

```json
{
  "mcpServers": {
    "alicemail": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp",
               "--header", "Authorization: Bearer TU_TOKEN"]
    }
  }
}
```

Con esto puedes preguntarle a Claude: *«¿cuántos correos quedan hoy por enviar?»*,
*«muéstrame los leads calientes»*, *«pausa la campaña Q4»* — y las ejecuta vía MCP.

## Notificaciones (2 minutos)

- **Telegram**: habla con `@BotFather` → `/newbot` → copia el token; habla con `@userinfobot` → copia tu Chat ID. Pégalos en *Notificaciones*, guarda y pulsa **Enviar prueba**.
- **WhatsApp**: en `developers.facebook.com` crea una app de WhatsApp Cloud API → copia *Phone Number ID*, token permanente y tu número. (Nota: la Cloud API requiere número verificado; si quieres avisos instantáneos sin trámites, usa Telegram.)

## Puesta en marcha real (checklist)

1. Añade tus buzones con **contraseña de aplicación** (Gmail: 2FA + app passwords; M365: igual con 2FA).
2. Pulsa **Verificar conexión** en cada uno → pasa a estado *Calentando*.
3. Deja **2 semanas solo warmup** (la rampa sube sola; el gráfico del Panel lo muestra).
4. Semana 3: crea la campaña, inscribe leads, pulsa **Iniciar** (tope recomendado: 10–15/buzón al principio).
5. Semana 4-5: sube el límite por buzón a 20 → **200/día con 10 buzones**.
6. Configura SPF/DKIM/DMARC en Cloudflare (checklist en Ajustes) **antes** del paso 3.
