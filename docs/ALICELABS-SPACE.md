# Conexión de AliceMail a alicelabs.space

Guía para publicar el panel de forma segura y dejar listo el tracking, sin abrir
un solo puerto en la VM. Todo usa **Cloudflare Tunnel** (gratis): la VM mantiene
una conexión saliente y Cloudflare enruta el tráfico entrante por ese túnel.

```
Navegador ──HTTPS──> app.alicelabs.space ─┐
                                          ├─ Cloudflare (TLS automático)
Destinatario ──GET──> mail.alicelabs.space─┘        │
                                                    ▼ túnel saliente (cloudflared)
                                          VM Oracle · localhost:3000
                                          (AliceMail en Docker)
```

## 1 · Requisitos

- Dominio `alicelabs.space` con DNS en Cloudflare (plan gratuito).
- VM Oracle con AliceMail corriendo (`bash deploy/install.sh`).
- El panel en `http://localhost:3000` dentro de la VM (compose ya lo deja así).

## 2 · Instalar y autenticar cloudflared en la VM

```bash
# ARM64 (Oracle A1) — instala el binario oficial
sudo curl -fsSL -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
sudo chmod +x /usr/local/bin/cloudflared

# Autentica (abre una URL; hazlo desde tu equipo si la VM no tiene navegador)
cloudflared tunnel login
```

## 3 · Crear el túnel y los ingresos

```bash
cloudflared tunnel create alicemail
# ⚠ Apunta el UUID que imprime: es tu <ID-TUNNEL>

cat > ~/.cloudflared/config.yml <<'YML'
tunnel: <ID-TUNNEL>
credentials-file: /home/opc/.cloudflared/<ID-TUNNEL>.json

ingress:
  - hostname: app.alicelabs.space
    service: http://localhost:3000
  - hostname: mail.alicelabs.space
    service: http://localhost:3000
  - service: http_status:404
YML
```

## 4 · Rutas DNS y servicio persistente

```bash
cloudflared tunnel route dns alicemail app.alicelabs.space
cloudflared tunnel route dns alicemail mail.alicelabs.space

sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

Tras esto, **https://app.alicelabs.space** sirve el panel con TLS automático y
**https://mail.alicelabs.space** queda listo para el píxel de aperturas y las bajas.

## 5 · DNS del dominio de envío (entregabilidad)

Si los buzones usan `@alicelabs.space` (o cualquier dominio de envío), añade en Cloudflare:

| Tipo  | Nombre              | Valor                                                        |
|-------|---------------------|--------------------------------------------------------------|
| TXT   | `@`                 | `v=spf1 include:_spf.google.com -all` *(ajusta al proveedor)* |
| CNAME | `google._domainkey` | el que genera Google Admin → DKIM (o tu proveedor SMTP)       |
| TXT   | `_dmarc`            | `v=DMARC1; p=none; rua=mailto:tu@alicelabs.space`             |

> Regla práctica: un dominio para el correo transaccional (Google Workspace) y otro
> para el cold email; el warmup del sistema protege la reputación gradualmente.

## 6 · Configurar en la app

1. Entra al panel → **Conexión**.
2. Comprueba que *Aplicación* = `https://app.alicelabs.space` y *Tracking* =
   `https://mail.alicelabs.space` → **Guardar dominios**.
3. A partir de aquí los correos llevan píxel de apertura y enlace de baja con tu dominio.

## 7 · Seguridad de la exposición

- La VM sigue **sin puertos abiertos**: solo el túnel saliente de cloudflared.
- El panel exige **contraseña** (cookie firmada); las APIs devuelven 401 sin sesión.
- Las contraseñas de buzones y tokens viajan **cifrados (AES-256-GCM)** en la base de datos.
- El MCP sigue disponible para agentes con **Bearer token** y límite de 120 req/min.
- Cloudflare añade TLS 1.3 y protección DDoS de forma gratuita.

## 8 · Verificación final

```bash
curl -I https://app.alicelabs.space            # 200 (redirige al login del panel)
curl -I https://mail.alicelabs.space/api/auth/session   # 200 JSON
sudo systemctl is-active cloudflared           # active
```

Si algo falla: `journalctl -u cloudflared -f` y revisa que el `<ID-TUNNEL>` del
`config.yml` coincida con el archivo de credenciales generado.
