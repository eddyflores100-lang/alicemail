# Arquitectura del ecosistema ALICE

## Principio de diseño

**Ecosistema vivo, autónomo e independiente**: la VM trabaja sola 24/7 sin puertos abiertos; el dueño solo *mete información* (leads CSV, buzones, órdenes) y *recibe resultados* (dashboard web + Telegram). GitHub no es solo un repo de código: el repo privado `alice-data` actúa de **sistema nervioso** entre el cerebro (VM) y el rostro (Pages).

## Componentes

### 1. Cerebro — VM Oracle Always Free (ARM, 2 vCPU / 12 GB)

Contenedor Docker `alicemail` (Next.js standalone + SQLite):

- **Motor** (`src/lib/worker.ts`): tick cada 45 s con 5 fases — contadores diarios, warmup, campañas con secuencias, IMAP (respuestas/rebotes), agente IA, y **puente GitHub**.
- **Agente IA** (`src/lib/agent.ts`): clasifica respuestas (HOT/WARM/COLD/OOO), cataloga en el CRM, guardianes de entregabilidad (errores SMTP, picos de rebote → penalización 48 h), informe diario. Autonomía OBSERVE/ASSIST/AUTO. Opcionalmente usa un LLM OpenAI-compatible (`Ajustes → Motor IA`).
- **CRM** (`src/lib/crm.ts`): etapas NUEVO → CONTACTADO → CALIENTE / TIBIO / FRIO / RECHAZADO / RECUPERADO con timeline por lead (`LeadEvent`), score de engagement (apertura +5, clic +10, respuesta +25).
- **Re-engagement** (`ReEngageRule`): `OPENS_NO_REPLY` → cambia de enfoque; `COLD_DAYS` → otra promoción del catálogo; `NO_OPEN` → reenvío. Con cooldown de 72 h, ventana humana y respeto de cupos.
- **Cuota** (`src/lib/quota.ts`): tope global 200/día y por buzón 20/día (Gmail/M365 gratis) o el que definas; visible en dashboard y Telegram.
- **Notificaciones** (`src/lib/notify.ts`): Telegram Bot API (principal) y WhatsApp Cloud API (opcional), eventos configurables (reply, hot, bounce, error, daily, crm).
- **MCP** (`src/lib/mcp.ts`): servidor JSON-RPC 2.0 con 14 herramientas (`get_status`, `list_leads`, `crm_pipeline`, `set_lead_stage`, `reengage_lead`, `run_agent`…), autenticado con token generado.

### 2. Sistema nervioso — repo privado `alice-data`

Todo por la Contents API de GitHub con un token fine-grained **que solo sirve para ese repo**:

| Archivo | Dirección | Contenido |
|---|---|---|
| `state.json` | VM → web | KPIs, cuota por buzón, pipeline, eventos del agente, notificaciones, telemetría del propio puente (emails enmascarados) |
| `commands/pending.json` | web → VM | Comandos: `estado`, `cuota`, `pausar`, `reanudar`, `leads`, `lead`, `agente`, `crm`, `reenviar`, `enfoque`, `etapa`, `importar`, `ayuda` |
| `commands/log-YYYY-MM-DD.json` | VM → web | Resultado de cada comando (consola del dashboard) |
| `imports/*.csv` | web → VM | Leads nuevos; la VM los importa (dedupe) y mueve a `imports/processed/` |
| `mailboxes.json` | web → VM | Alta de buzones sin tocar la VM |

Ciclo del puente (`src/lib/githubSync.ts`): cada 4 ticks (~3 min) la VM sondea comandos/imports/mailboxes y empuja `state.json` (throttle 4 min). Toda la comunicación es **HTTPS saliente**: la VM sigue sin tener ni un puerto abierto.

### 3. Rostro — GitHub Pages (`/pages-ui`)

SPA estática en vanilla JS (sin build, sin dependencias), desplegada por `Actions` en cada cambio. El token de GitHub se guarda **solo en el navegador** (localStorage) y debe ser fine-grained restringido a `alice-data`. Vistas: Panel, CRM, Agente IA, Buzones, Promociones, Consola, Importar, Configuración (con guía de puesta en marcha y copiar/pegar).

## Flujos clave

**Nuevo lote de leads** → CSV en la web → commit a `imports/` → VM importa → Telegram confirma → el motor los inscribe en la promoción activa dentro de la ventana humana.

**Lead abre el correo** → píxel de tracking → score +5 → regla `OPENS_NO_REPLY` → cambio de enfoque (o nueva promoción si repite) → Telegram avisa → el CRM muestra el movimiento en el dashboard.

**Lead responde «no»** → agente lo clasifica → etapa RECHAZADO → supresión 90 días → ninguna secuencia lo toca más.

**Pico de rebotes** → guardián → penalización −25 % al buzón 48 h → aviso a Telegram → el dashboard lo refleja.

## Seguridad

- VM sin puertos abiertos (acceso local por túnel SSH; binding 127.0.0.1).
- Tokens separados: `GH_SYNC_TOKEN` (VM) y el del dashboard, ambos ideally fine-grained y solo sobre `alice-data`.
- Emails enmascarados por defecto en `state.json` (`GH_SYNC_MASK_EMAILS=true`).
- El repo de **código** es público pero no contiene secretos; el repo de **datos** es privado.

## Límites y realismo

- El tracking de aperturas requiere URL pública: sin dominio+túnel, las aperturas se contabilizan solo si `trackingUrl` apunta a un host alcanzable (Cloudflare Tunnel opcional con el dominio que el usuario posea).
- Gmail API OAuth y Microsoft Graph están en el roadmap de conectores; hoy el envío es SMTP/IMAP con contraseñas de aplicación (funciona con Gmail/Workspace, Outlook y cualquier SMTP).
- GitHub Pages refresca por polling del navegador: los cambios del estado tardan ≤1 ciclo del puente (~3-7 min) en aparecer.
