# ALICE — Ecosistema autónomo de cold email

> **A**utonomous **L**ead **I**ntelligence & **C**old-mail **E**ngine
> Software 100% propio · single-tenant · sin dependencias de terceros

ALICE es un ecosistema vivo que **solo pide información y devuelve resultados**: le metes leads (CSV) y buzones, y sus agentes IA calientan los buzones, envían con cupo diario, leen cada respuesta, catalogan los leads en el CRM (**calientes / fríos / rechazados**), re-envían con **otro enfoque** o **otra promoción** cuando un lead abre, suprimen a los rechazados y te cuentan todo por **Telegram** — visible además desde el **dashboard público en GitHub Pages**.

```
                    ┌──────────────────────────────────────────┐
                    │   ORACLE VM (alicelabs-free, ARM)        │
                    │   ┌────────────────────────────────┐     │
   CSV de leads ───▶│   │  ALICE (Docker)                │     │      📱 Telegram
   Buzones      ───▶│   │  · Motor warmup + campañas     │     │◀────  estados y
                    │   │  · Agente IA (clasifica/CRM)   │     │       respuestas
                    │   │  · CRM: hot/cold/rejected      │     │
                    │   │  · MCP server (14 herramientas)│     │
                    │   └───────┬───────────▲────────────┘     │
                    └───────────┼───────────┼──────────────────┘
                     push estado│           │ poll comandos/CSV
                                ▼           │            (solo HTTPS saliente,
                    ┌──────────────────────────────────┐      cero puertos abiertos)
                    │  GitHub  repo PRIVADO alice-data │
                    │  state.json · commands/ ·        │
                    │  imports/ · mailboxes.json       │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │  GITHUB PAGES (dashboard)        │
                    │  eddyflores100-lang.github.io/   │
                    │  alicemail                       │
                    │  Panel · CRM · Agentes · Consola │
                    │  · Importar CSV · Buzones        │
                    └──────────────────────────────────┘
```

## ¿Páginas o VM? — Ambas, con roles distintos

| Capa | Dónde vive | Qué hace |
|---|---|---|
| **Cerebro** (agentes, motor, BD, MCP) | VM Oracle, Docker | Trabaja 24/7 sin abrir un solo puerto |
| **Sistema nervioso** | Repo privado `alice-data` | Bus de mensajes: estado ↔ comandos ↔ CSV |
| **Rostro** (dashboard público) | GitHub Pages | Ver todo y mandar órdenes desde cualquier navegador |

## Puesta en marcha (5 minutos)

**1. Cerebro en la VM** (una línea, dentro de `ssh alicelabs-free`):

```bash
curl -fsSL https://raw.githubusercontent.com/eddyflores100-lang/alicemail/main/deploy/install.sh | bash
```

**2. Token de la VM** → crea un *fine-grained token* (Settings → Developer settings → Fine-grained tokens) con acceso **solo a `alice-data`** y permiso **Contents: Read and write**. Pégalo en `~/alicemail/.env`:

```bash
GH_SYNC_TOKEN=github_pat_xxxxx
cd ~/alicemail && docker compose up -d
```

**3. Telegram** → `@BotFather` → `/newbot` → token; manda un mensaje a tu bot y saca tu chat id con `@userinfobot`. Pégalo en el panel de la VM → **Ajustes → Notificaciones** → prueba.

**4. Buzones** → en el dashboard web (o panel local): **📮 Buzones → mailboxes.json**. Gmail/Workspace con contraseña de aplicación. 10 buzones × 20/día = **200/día**.

**5. Alimentar** → **📥 Importar** → sube tu CSV. A partir de aquí, el ecosistema trabaja solo: dashboard + Telegram.

## Cuotas y seguridad del envío

- Warmup: arranque 3/día, +2/día, tope 25/buzón; con campaña activa baja a 5/día; rebote → penalización −25 % durante 48 h.
- Campaña: tope global 200/día (editable), ventana humana 8:00–20:00, rotación ponderada de buzones.
- Cada lead lleva timeline completo; rechazado = suprimido 90 días; apertura = re-envío con otro enfoque u otra promoción del catálogo.
- Los emails en el estado publicado van enmascarados (`a***@dominio.com`).

## Desarrollo

```bash
bun install        # dependencias
bun run dev        # panel en http://localhost:3000
bun run lint       # eslint
bun run build      # build standalone (Docker/VM)
```

Estructura: `src/lib/` (motor, agente, CRM, sync GitHub, MCP, notificaciones) · `src/app/` (API + UI) · `pages-ui/` (dashboard estático de Pages) · `deploy/` (instalador VM) · `docs/` (arquitectura y operación).

Guía completa de la app: [README-alicemail.md](README-alicemail.md) · Arquitectura del ecosistema: [docs/ECOSISTEMA.md](docs/ECOSISTEMA.md)
