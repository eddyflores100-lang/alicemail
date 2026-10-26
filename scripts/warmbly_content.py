# -*- coding: utf-8 -*-
"""Contenido en espanol de la guia Warmbly + TechDigital (con acentos).
Cada bloque: (tipo, dato). Tipos: p, h2, h3, bullet, num, table, code,
callout, chart, quote, card.
"""

DOC_TITLE = "Guía de despliegue: sistema de cold email con Warmbly"
DOC_AUTHOR = "TechDigital · Z.ai"

CHAPTERS = [
# ------------------------------------------------------------------ CAP 1
{"title": "La solución: arquitectura y componentes", "blocks": [
("p", "Tu aplicación actual en techdigital.site, TechDigital Prospect, resuelve la mitad más delicada del outbound: la calidad del dato. Revisa CSVs voluminosos, detecta duplicados, valida la sintaxis de cada correo, consulta registros MX y puede verificar si un buzón existe mediante diálogos SMTP que no envían mensajes. Lo que no hace, y lo dice explícitamente en su propia página de confianza, es enviar correo. No tiene buzones conectados, ni colas de envío, ni campañas, ni calentamiento de reputación. Intentar agregar esas funciones ahí significaría construir un módulo de envío completo casi desde cero, con todos los riesgos de entregabilidad que eso conlleva."),
("p", "La arquitectura correcta es separar responsabilidades: TechDigital Prospect se queda como estación de limpieza y verificación de leads, y una plataforma especializada asume el envío. Tras comparar los proyectos open source disponibles en GitHub, la recomendación es Warmbly, un sistema de cold outreach autoalojado con licencia Apache 2.0 que ya resuelve exactamente tu lista de requisitos: múltiples buzones, rotación de envíos entre ellos, warmup automático con rampa progresiva, secuencias con seguimientos y monitoreo de entregabilidad."),
("h2", "Por qué Warmbly y no otra alternativa"),
("p", "Warmbly conecta buzones de Gmail y Google Workspace, Microsoft 365 y cualquier servidor SMTP/IMAP genérico, que es justo la mezcla que planeas usar. Su warmup intercambia correos reales entre buzones supervisados, arranca en 10 envíos diarios y sube de forma gradual mientras mide dónde aterrizan los mensajes. Las campañas reparten el volumen entre buzones con límites diarios y pausas de espaciado, y todas las respuestas caen en una bandeja unificada. Además incluye CRM ligero, pruebas de ubicación en bandeja y API REST con webhooks. Se instala en tu propio VPS con un solo comando Docker y no requiere cuenta en la nube."),
("table", {
  "head": ["Proyecto", "Licencia y actividad", "Qué cubre", "Limitación para tu caso"],
  "ratios": [0.20, 0.24, 0.30, 0.26],
  "rows": [
    ["Warmbly (485 estrellas)", "Apache 2.0, muy activo", "Envío multi-buzón, warmup automático, secuencias, bandeja unificada, entregabilidad", "Ninguna relevante: cubre el flujo completo"],
    ["Email-automation (185)", "Django, 1 mantenedor", "Programación de envíos, seguimientos, multi-cuenta SMTP", "Sin warmup; desaconseja Gmail; más limitado"],
    ["OpenOutreach (3,4 mil)", "Agente IA de prospección", "Encuentra leads y redacta correos con IA", "No es motor de campañas ni warmup"],
    ["Coldflow (19)", "GPL 3.0, muy nuevo", "Campañas básicas autoalojadas", "Poco maduro, comunidad mínima"],
  ],
  "caption": "Tabla 1. Alternativas open source evaluadas para el motor de envío.",
}),
("h2", "Arquitectura del flujo completo"),
("p", "El sistema queda compuesto por cuatro piezas que trabajan en cadena. Primero, TechDigital Prospect recibe tu lista grande y la devuelve limpia: sin duplicados, sin correos mal formados y con verificación de dominio. Segundo, el CSV limpio entra a Warmbly, que corre en tu VPS y administra los 10 buzones conectados de los tres tipos. Tercero, el motor de Warmbly calienta los buzones durante las primeras semanas y luego reparte la campaña fría entre ellos respetando límites y horarios. Cuarto, las respuestas vuelven a la bandeja unificada, donde marcas interesados y los conviertes en oportunidades."),
("bullet", [
  "VPS con Docker: aloja el plano de control de Warmbly (API, base Postgres, Redis) y los workers que envían y sincronizan correo.",
  "10 buzones mixtos: 4 de Google Workspace, 3 de Microsoft 365 y 3 SMTP propios, repartidos en dominios dedicados al envío.",
  "Warmup automático: red de calentamiento con rampa de 10 a 40 correos diarios por buzón.",
  "Campaña rotada: 200 correos diarios repartidos en 20 por buzón, con espaciado y ventana horaria.",
  "TechDigital Prospect: validación previa de cada lote de leads antes de importarlo.",
]),
("callout", {"big": "200 correos/día", "label": "10 buzones × 20 envíos diarios: nivel seguro desde la semana 3 y ampliable a 400-500 tras el calentamiento"}),
]},
# ------------------------------------------------------------------ CAP 2
{"title": "Requisitos y preparación del VPS", "blocks": [
("p", "Warmbly se ejecuta como una pila de contenedores: backend, workers de envío, Postgres, Redis y un servicio de tracking de clics. Para 10 buzones y 200 envíos diarios la carga es ligera, pero la instalación desde código fuente compila frontends Go y TypeScript y necesita espacio temporal de disco. Estas son las especificaciones concretas del servidor."),
("table", {
  "head": ["Requisito", "Mínimo", "Recomendado"],
  "ratios": [0.40, 0.28, 0.32],
  "rows": [
    ["CPU (vCores)", "2", "4"],
    ["Memoria RAM", "4 GB", "8 GB"],
    ["Disco SSD", "40 GB", "80 GB (la compilación usa unos 10 GB)"],
    ["Sistema operativo", "Ubuntu 22.04 LTS", "Ubuntu 24.04 LTS"],
    ["Contenedores", "Docker con Compose v2", "Docker Engine actual + Compose v2"],
    ["Red", "IP pública, puertos 22/80/443", "Dominio propio con registro A al VPS"],
  ],
  "caption": "Tabla 2. Especificaciones del VPS para la instancia de Warmbly.",
}),
("h2", "Proveedores y costo estimado"),
("p", "Cualquier proveedor serio de VPS sirve; lo importante es que la IP no tenga historial de spam y que el plan cumpla la memoria recomendada. Evita usar como panel un host de correo masivo: aquí el VPS solo ejecuta la aplicación, el correo sale por los servidores de Gmail, Microsoft o tu SMTP, no por el VPS. Los precios aproximados mensuales de planes adecuados son los siguientes."),
("table", {
  "head": ["Proveedor", "Plan de referencia", "Costo mensual aprox."],
  "ratios": [0.34, 0.38, 0.28],
  "rows": [
    ["Hetzner", "CX22 (2 vCPU / 4 GB)", "4 a 6 dólares"],
    ["DigitalOcean", "Basic 2 vCPU / 4 GB", "18 a 24 dólares"],
    ["Vultr", "Regular 2 vCPU / 4 GB", "15 a 20 dólares"],
    ["AWS Lightsail", "2 vCPU / 4 GB", "20 dólares"],
  ],
  "caption": "Tabla 3. Opciones de VPS con precio orientativo para esta carga.",
}),
("h2", "Preparación básica del servidor"),
("p", "Crea la máquina con Ubuntu 22.04 o 24.04, accede con clave SSH, crea un usuario que no sea root y habilita el cortafuegos permitiendo solo SSH y web. Si el instalador de Warmbly gestiona el proxy, el puerto 5173 solo se usa en modo local de desarrollo; en producción conviene servir el panel tras un proxy con HTTPS. Los comandos de preparación son los siguientes."),
("code", "adduser operador\nusermod -aG sudo operador\n# copia tu clave SSH y entra con el nuevo usuario\nufw allow OpenSSH\nufw allow 80/tcp\nufw allow 443/tcp\nufw enable\nsudo apt update && sudo apt upgrade -y\n# Docker Engine + Compose v2\ncurl -fsSL https://get.docker.com | sh\nsudo usermod -aG docker operador"),
("h2", "DNS del panel de control"),
("p", "Antes de instalar, crea un registro A que apunte un subdominio dedicado, por ejemplo outreach.tudominio.com, a la IP pública del VPS. Si tu dominio está detrás de un proxy de CDN, pon ese subdominio en modo solo DNS durante la instalación: el panel usa conexiones en tiempo real y el servicio de tracking necesita resolver directamente. La propagación suele tardar minutos; verifica con un ping antes de lanzar el instalador, porque el asistente usará ese nombre para el enlace inicial y los certificados."),
]},
# ------------------------------------------------------------------ CAP 3
{"title": "Instalación de Warmbly paso a paso", "blocks": [
("p", "La vía rápida es el instalador oficial de un solo comando, que detecta Docker, escribe el archivo de configuración real, descarga las imágenes y levanta toda la pila saludable: backend, workers, base de datos, caché y tracking. Al terminar imprime un enlace de un solo uso que convierte tu primera cuenta en administradora de la instancia."),
("code", "curl -fsSL https://warmbly.com/install.sh | sh\n# al terminar:\n#   Ready at https://outreach.tudominio.com\n#   abre el enlace impreso para reclamar la instancia y ser admin"),
("p", "El script está firmado con checksum en install.sh.sha256, de modo que puedes descargarlo, verificarlo y leerlo antes de ejecutarlo si tu política de seguridad lo exige. El proceso completo toma entre 5 y 15 minutos según el proveedor, y al final los contenedores quedan reiniciando solos tras cada arranque del VPS."),
("h2", "Opciones útiles del instalador"),
("bullet", [
  "--wizard: asistente interactivo para decidir dónde vive cada almacén de datos, políticas de retención y estrategia de respaldo. Recomendado si quieres las copias de seguridad en un disco o cubo aparte.",
  "--dry-run: imprime cada archivo que escribiría sin tocar nada, ideal para revisar primero.",
  "--demo: recorre el asistente sin instalar, útil para entender las preguntas.",
  "Verificación: descarga install.sh e install.sh.sha256 y comprueba el hash antes de ejecutar.",
]),
("h2", "Primer acceso y cuenta de administrador"),
("num", [
  "Abre el panel en https://outreach.tudominio.com (o el enlace exacto que imprime el instalador).",
  "Sigue el enlace de una sola vez para reclamar la instancia; ese primer usuario queda como administrador.",
  "Si el enlace caducó o se perdió, la guía de primer arranque del repositorio explica cómo reemitirlo.",
  "Completa el registro con tu correo real: los códigos de acceso llegan por email y, en entornos de desarrollo, aparecen en Mailpit.",
  "Cambia la contraseña temporal y activa doble factor si la instancia lo ofrece.",
]),
("h2", "HTTPS, dominio y modo desarrollo"),
("p", "Si usaste el instalador con dominio propio, el HTTPS queda resuelto por el propio instalador con certificados renovados automáticamente. Si instalaste en modo local, el panel vive en el puerto 5173 y los códigos de acceso se leen en Mailpit en el puerto 18025; ese modo es solo para pruebas. Para producción detrás de tu propio proxy, coloca Caddy o nginx delante del panel y emite certificado con Let's Encrypt; el patrón mínimo de Caddy es una sola línea que negocia el certificado solo."),
("code", "# Caddy como proxy inverso mínimo (Caddyfile)\noutreach.tudominio.com {\n    reverse_proxy 127.0.0.1:5173\n}\n# reiniciar: systemctl reload caddy"),
("p", "La alternativa para quien prefiere compilar es clonar el repositorio y ejecutar make up, que construye toda la pila desde el código: necesitarás Go 1.25, pnpm y unos 10 GB libres de disco. Para tu caso el instalador oficial es más simple y recibe las mismas actualizaciones; resérvate la compilación para cuando quieras tocar el código."),
]},
# ------------------------------------------------------------------ CAP 4
{"title": "Dominios y autenticación de correo", "blocks": [
("p", "La entregabilidad se gana o se pierde en la autenticación del dominio. Antes de conectar un solo buzón, cada dominio de envío debe tener sus registros SPF, DKIM y DMARC correctamente publicados. La primera regla práctica es no enviar campañas frías desde tu dominio principal: crea dos dominios de envío dedicados, por ejemplo tudigital.com y tdoutreach.com, y reparte en ellos los buzones. Así, si la reputación de uno se resiente, tu web y tu correo corporativo quedan intactos."),
("h2", "Los tres registros que te hacen legible para Gmail y Outlook"),
("p", "SPF declara qué servidores pueden enviar en nombre del dominio; se publica como registro TXT en la raíz. DKIM firma cada mensaje criptográficamente; el proveedor de correo te da el par de claves y tú publicas el TXT del selector en _domainkey. DMARC le dice a los receptores qué hacer cuando SPF o DKIM fallan y a dónde reportar; arranca en modo observación con p=none, revisa los reportes una o dos semanas y después endurece a p=quarantine."),
("table", {
  "head": ["Registro", "Tipo", "Valor de ejemplo", "Nota"],
  "ratios": [0.14, 0.10, 0.48, 0.28],
  "rows": [
    ["SPF", "TXT", "v=spf1 include:_spf.google.com include:spf.protection.outlook.com include:tu-smtp.com -all", "Uno por dominio; combina los includes de los proveedores que uses"],
    ["DKIM", "TXT", "selector1._domainkey: el valor largo lo genera Google, Microsoft o tu panel SMTP", "Publica el selector de cada proveedor conectado"],
    ["DMARC", "TXT", "_dmarc: v=DMARC1; p=none; rua=mailto:dmarc@tudominio.com", "Tras 2 semanas sin errores, sube a p=quarantine"],
    ["Tracking", "CNAME", "link.tudigital.com: apunta al host de tracking de tu instancia", "Warmbly sugiere el host y verifica el CNAME cada hora"],
  ],
  "caption": "Tabla 4. Registros DNS de autenticación por cada dominio de envío.",
}),
("h2", "Buenas prácticas de dominio para cold email"),
("bullet", [
  "Dos o tres dominios de envío aparte del principal, con 4 a 5 buzones cada uno: diversifica riesgo y reparte volumen.",
  "Redirige el dominio raíz de cada dominio de envío a tu web real; Warmbly soporta redirección con verificación TXT y hace que el dominio parezca un negocio vivo.",
  "Activa el tracking con CNAME propio (host link por defecto) para que los clics pasen por tu dominio y no por uno compartido.",
  "Los dominios nuevos tardan de 2 a 3 semanas en ganar reputación: por eso el warmup empieza el día 1 y la campaña en la semana 3.",
  "Publica página de unsubscribe y respeta las bajas: Warmbly gestiona la supresión automática, pero la marca y la identidad del remitente son tu responsabilidad.",
]),
("callout", {"big": "90% o más", "label": "Inbox rate saludable de referencia: por debajo de 80% el buzón entra en zona de riesgo"}),
]},
# ------------------------------------------------------------------ CAP 5
{"title": "Conexión de los 10 buzones", "blocks": [
("p", "Con los dominios listos, conecta los buzones desde la sección Cuentas. La mezcla recomendada para tu operación es 4 de Google Workspace, 3 de Microsoft 365 y 3 SMTP propios: diversificar proveedores evita que un cambio de política de un solo gigante deje tu operación a cero, y reparte la reputación entre ecosistemas distintos. Warmbly comprueba SPF y DMARC de cada dominio al conectar y muestra la salud de cada buzón en el panel."),
("h2", "Buzones de Gmail y Google Workspace (OAuth)"),
("p", "El flujo es OAuth: autorizas en la pantalla de consentimiento de Google y Warmbly recibe un token, nunca tu contraseña. Los permisos solicitados son gmail.modify, para enviar campaña y warmup, leer respuestas y mover mensajes, y gmail.settings.basic, para leer direcciones de envío y firmas. Dos advertencias: si cambias la contraseña de la cuenta, Google revoca el token y tendrás que reconectar el buzón; y en Workspace el administrador puede restringir las contraseñas de aplicación, así que confirma esa política con tu admin."),
("h2", "Buzones de Microsoft 365"),
("p", "La conexión usa la API Graph con permisos Mail.Send para enviar, Mail.ReadWrite para leer y mover mensajes, User.Read para identificar la cuenta y offline_access para mantener la sesión viva sin reautorizar cada día. Puedes conectar buzón por buzón con OAuth individual, o pedir a un administrador la concesión para toda la organización, más cómoda cuando son varios buzones. Muchos inquilinos exigen aprobación del administrador antes de permitir la app: ese paso se resuelve desde el centro de administración de Microsoft."),
("h2", "Buzones SMTP/IMAP genéricos"),
("p", "Para los buzones de tu propio hosting o de un proveedor económico, Warmbly pide host, puerto, usuario y contraseña tanto de IMAP como de SMTP, y elige el cifrado según el puerto. Los estándares son SMTP 465 con SSL/TLS o 587 con STARTTLS, e IMAP 993 con SSL/TLS o 143 con STARTTLS. El cifrado es obligatorio en red salvo para relays locales de la propia instancia. Verifica las credenciales con un cliente de correo antes de darlas de alta para descartar errores de tipeo."),
("h2", "Contraseñas de aplicación cuando hay 2FA"),
("num", [
  "Activa la verificación en dos pasos en la cuenta de Google: Seguridad, Verificación en 2 pasos.",
  "Genera una contraseña de aplicación en myaccount.google.com/apppasswords; son 16 caracteres de un solo uso.",
  "Usa esa contraseña de aplicación en lugar de la real al dar de alta el buzón por IMAP/SMTP.",
  "En Workspace, el administrador decide si se permiten contraseñas de aplicación; el Programa de Protección Avanzada de Google no las admite.",
]),
("table", {
  "head": ["Tipo de buzón", "Envío frío recomendado", "Techo de warmup", "Observaciones"],
  "ratios": [0.22, 0.24, 0.18, 0.36],
  "rows": [
    ["Google Workspace", "30 a 50/día", "40/día", "El límite por defecto de la plataforma es 50; los buzones nuevos arrancan cerca de 30"],
    ["Gmail gratuito", "20/día", "25/día", "Los buzones gratuitos recién conectados arrancan limitados a 20"],
    ["Microsoft 365", "30 a 50/día", "40/día", "Mismos techos que Workspace; consentimiento de admin si aplica"],
    ["SMTP propio", "20 a 30/día", "40/día", "Depende de la calidad del hosting; vigila rebotes las primeras semanas"],
  ],
  "caption": "Tabla 5. Límites diarios por tipo de buzón según la documentación de Warmbly.",
}),
("p", "Para la fase de escalado, la importación masiva acepta hasta 5.000 buzones de golpe por CSV, TSV, XLSX o lista pegada, así que agregar los siguientes 10 buzones será un trámite de minutos. Cada buzón sincroniza los últimos 90 días de historial, hasta 5.000 mensajes, y sigue sincronizando en vivo, de modo que las respuestas aparecen en la bandeja unificada aunque llegaran minutos antes."),
]},
# ------------------------------------------------------------------ CAP 6
{"title": "Warmup automático: el plan de calentamiento", "blocks": [
("p", "El warmup de Warmbly no usa cuentas desechables: tus buzones intercambian correos reales de diagnóstico con otros buzones supervisados de la red. Cada conversación se genera con IA, pasa controles de seguridad, viaja como texto plano y se registra dónde aterrizó: bandeja principal, pestañas o spam. Si tres o más de veinte entregas caen en spam, el hilo se retira. Los mensajes de warmup nunca aparecen en tu bandeja unificada y se eliminan por defecto a los 30 días, quedando archivados en una carpeta propia llamada Warmbly."),
("p", "Los parámetros por defecto ya siguen la curva segura: arranque en 10 correos diarios por buzón, incremento de 1 por día y techo de 40 en buzones de pago (25 en Gmail y Outlook.com gratuitos). Cuando un buzón respalda una campaña activa, su warmup baja a un máximo de 5 diarios para no competir con el envío frío. Las horas de calentamiento siguen la zona horaria del buzón, y si un mensaje de warmup aterriza en spam en Google, Microsoft o Yahoo, el sistema recorta el objetivo un 25% durante 48 horas y pausa el incremento 3 días: la reputación se defiende sola."),
("chart", {"path": "/home/z/my-project/scripts/assets/warmup_ramp.png",
           "caption": "Figura 1. Rampa de warmup y arranque de campaña por buzón durante las primeras 5 semanas."}),
("h2", "Calendario de calentamiento para tu operación"),
("table", {
  "head": ["Semana", "Warmup por buzón", "Campaña fría", "Acciones clave"],
  "ratios": [0.11, 0.21, 0.18, 0.50],
  "rows": [
    ["1", "10 a 16/día", "Ninguna", "Conectar los 10 buzones, verificar SPF/DKIM/DMARC, activar redirects y tracking"],
    ["2", "17 a 23/día", "Ninguna", "Revisar inbox rate inicial, preparar secuencia y plantillas, limpiar el primer lote en TechDigital"],
    ["3", "Máximo 5/día", "10 a 15/día", "Lanzar la campaña con límite bajo, vigilar rebotes las primeras 72 horas"],
    ["4", "Máximo 5/día", "15 a 20/día", "Subir hacia 20/buzón si el inbox rate se mantiene sobre 90%"],
    ["5", "Máximo 5/día", "20/día estable", "200/día totales sostenidos; evaluar variantes y segunda campaña"],
  ],
  "caption": "Tabla 6. Plan semanal de calentamiento y arranque de la campaña.",
}),
("p", "La regla de oro es no apagar nunca el warmup, ni siquiera con campañas activas: el volumen diario de diagnóstico mantiene la reputación fresca y detecta degradaciones antes de que cuesten leads. La salud de cada buzón se juzga con al menos 20 entregas verificadas en 7 días, o 100 en 30, así que las dos primeras semanas sirven también para que el panel tenga datos suficientes de ubicación."),
]},
# ------------------------------------------------------------------ CAP 7
{"title": "Primera campaña: 200 correos al día", "blocks": [
("callout", {"big": "10 × 20 = 200", "label": "Diez buzones con límite de 20 correos fríos diarios cada uno, repartidos automáticamente por la plataforma"}),
("h2", "Diseña la secuencia en el lienzo visual"),
("p", "Las campañas de Warmbly se construyen sobre un lienzo de pasos. El primer correo cuelga de la tarjeta Inicio; los seguimientos se agregan con el botón más al final del camino y se conectan en el mismo hilo de conversación por defecto. Configura tres pasos: el correo inicial, un seguimiento a los 3 días y un segundo seguimiento a los 6 días, activando Detener al responder para que el flujo frío termine en cuanto haya respuesta humana. Los autoresponders y mensajes de fuera de oficina no cortan la secuencia, lo cual evita perder contactos por vacaciones."),
("p", "La personalización usa variables de combinación como {{.FirstName}} y {{.Company}} tanto en asunto como en cuerpo, con menú de campos para no escribirlas de memoria. Cada paso admite hasta 5 variantes A/B además del original: lanza dos asuntos distintos y deja que los datos decidan cuál gana. Los tiempos de espera entre pasos se configuran haciendo clic en la línea que une las tarjetas y se cuentan por contacto, así que un contacto retrasado no frena a los demás."),
("h2", "Configuración de envío para 200 diarios"),
("bullet", [
  "Ventana horaria: lunes a viernes de 9:00 a 17:00 en la zona horaria de cada buzón; fin de semana sin envío.",
  "Espaciado entre envíos de un mismo buzón: 90 a 420 segundos aleatorios, para que el patrón no parezca automatizado.",
  "Límite diario por buzón: 20 correos fríos; el reparto entre los 10 buzones es automático.",
  "Detener al responder: activado, con el paso final de la secuencia marcado como Fin.",
  "Primer correo: sin demora artificial; el contacto entra y recibe el mensaje dentro de la ventana del día.",
]),
("h2", "Plantilla del primer correo frío"),
("card", "Asunto: Consulta rápida sobre {{.Company}}\n\nHola {{.FirstName}},\n\nVi que {{.Company}} está creciendo en su zona y\nsuele pasar que el equipo comercial pierde horas\nbuscando contactos que luego resultan inválidos.\n\nAyudamos a equipos como el tuyo a trabajar con\nlistas limpias y verificadas antes de enviar.\n¿Te interesa ver en 15 minutos cómo lo haríamos\ncon tus datos?\n\nSaludos,\nTu Nombre\nTuDominio.com"),
("p", "Los asuntos cortos de 2 a 4 palabras abren más que los largos, y el cuerpo ideal se queda por debajo de cien palabras con una sola pregunta como llamada a la acción. Evita enlaces en el primer correo, porque son la señal de spam más barata de detectar; la prueba de interés la hará la respuesta. Y escribe como persona, no como boletín: el objetivo del correo uno es abrir una conversación, no vender el catálogo."),
]},
# ------------------------------------------------------------------ CAP 8
{"title": "Importar leads desde TechDigital Prospect", "blocks": [
("p", "Aquí tu app actual cobra protagonismo. Antes de que un lead toque Warmbly, pasa por TechDigital Prospect: el CSV se revisa, se detectan duplicados, se valida sintaxis y se verifica dominio por MX, con la verificación SMTP opcional como filtro final. El resultado es un archivo limpio que importas sin miedo a rebotes masivos, que son el asesino silencioso de la reputación de un buzón nuevo."),
("num", [
  "Exporta desde TechDigital Prospect el CSV con los leads verificados (sintaxis correcta y dominio con MX válido).",
  "Deja como mínimo las columnas email, first_name, last_name y company; las variables de combinación las mapearás en la importación.",
  "En Warmbly abre Contactos y usa Importar CSV; también acepta TSV, XLSX o lista pegada.",
  "Mapea las columnas del archivo a los campos del contacto y confirma la vista previa.",
  "Crea un segmento por campaña (por ejemplo, sector o país) para poder medir cada envío por separado.",
  "Agrega el segmento a la secuencia de la campaña y deja que el motor reparta el envío entre buzones.",
  "Revisa la supresión al día siguiente: rebotes duros y bajas quedan bloqueados automáticamente y no deben reintroducirse nunca.",
  "Refresca el segmento cada 2 o 3 semanas con un export nuevo de TechDigital, en lugar de cargar el archivo completo cada vez.",
]),
("table", {
  "head": ["Columna del CSV", "Campo en Warmbly", "Uso en la secuencia"],
  "ratios": [0.30, 0.30, 0.40],
  "rows": [
    ["email", "Correo electrónico", "Destinatario único; duplicados y suprimidos se ignoran"],
    ["first_name", "Nombre", "Variable {{.FirstName}} en asunto y saludo"],
    ["last_name", "Apellido", "Saludos formales o firmas"],
    ["company", "Empresa", "Variable {{.Company}} y segmentación por cuenta"],
  ],
  "caption": "Tabla 7. Mapeo de columnas entre TechDigital Prospect y Warmbly.",
}),
("p", "En cuanto al cumplimiento, la operación B2B con listas propias es legítima en la mayoría de jurisdicciones cuando identificas al remitente con nombre y empresa, ofreces una forma clara de salir de la lista y no compras datos de terceros sin base legal. Warmbly lleva el control automático de bajas y supresiones; tu parte es no recargar contactos dados de baja y mantener el contenido honesto. Esta higiene no es solo legal: es exactamente lo que los filtros de Gmail y Outlook premian con bandeja principal."),
]},
# ------------------------------------------------------------------ CAP 9
{"title": "Monitoreo, entregabilidad y mantenimiento", "blocks": [
("p", "La métrica reina es el inbox rate de los últimos 7 días, que mide qué proporción del correo de calentamiento aterriza en bandeja principal. Warmbly lo pinta por bandas de color y lo desglosa por proveedor de destino (Google, Microsoft, Yahoo), día a día y en ventanas de 7 a 90 días. Cuando un buzón empieza a caer en spam, la plataforma le recorta volumen antes de que el problema contamine a los demás: ese freno automático es tu seguro de reputación."),
("table", {
  "head": ["Banda", "Inbox rate a 7 días", "Significado", "Acción"],
  "ratios": [0.14, 0.20, 0.32, 0.34],
  "rows": [
    ["Sano", "90% o más", "Reputación sólida y estable", "Mantener plan; candidato a subir volumen"],
    ["Vigilancia", "80 a 90%", "Señales tempranas de problema", "Revisar DNS y contenido; no subir límites"],
    ["En riesgo", "Menos de 80%", "Aterrizando en spam", "Pausar campaña del buzón 48-72 h y auditar"],
  ],
  "caption": "Tabla 8. Bandas de salud de bandeja principal y acciones asociadas.",
}),
("p", "Además del panel de entregabilidad, las pruebas de ubicación (placement tests) miden dónde aterriza tu correo en bandejas reales de cada proveedor, y la pestaña de analítica grafica envíos, respuestas y rebotes por día, por buzón y por campaña. Una campaña fría B2B sana rinde de forma consistente con tasas de rebote por debajo del 3% y tasas de respuesta entre el 1% y el 5% según sector y mensaje; lo importante es la tendencia semanal, no el día suelto."),
("h2", "Checklist de mantenimiento semanal"),
("bullet", [
  "Revisar el inbox rate de cada buzón y pausar preventivamente los que estén en banda de vigilancia.",
  "Verificar rebotes y quejas de la semana; purgar de la lista las direcciones con rebote duro.",
  "Comprobar que los 10 buzones siguen sincronizando y que ningún token de OAuth se revocó.",
  "Rotar asuntos y variantes A/B si la tasa de respuesta cae dos semanas seguidas.",
  "Confirmar que el warmup sigue activo en todos los buzones y que la carpeta Warmbly se está limpiando.",
  "Hacer copia del archivo de configuración y verificar que los respaldos del asistente siguen corriendo.",
]),
("p", "Si un buzón cae al spam, el protocolo es corto: el propio sistema ya aplicó el recorte del 25% por 48 horas y congeló su rampa 3 días; de tu parte, pausa la campaña para ese buzón, reaudita sus registros DNS, revisa la plantilla vigente y reintroduce el envío a 10 diarios durante una semana antes de volver al objetivo. Y si el problema es generalizado a la vez en varios buzones del mismo dominio, el sospechoso es el dominio o el contenido, no los buzones: revisa DMARC, enlaces y variantes antes de tocar volúmenes."),
]},
# ------------------------------------------------------------------ CAP 10
{"title": "Escalado y solución de problemas", "blocks": [
("h2", "Fase 2: de 200 a 500 correos diarios"),
("p", "Cuando lleves 4 semanas con inbox rate estable por encima de 90% y rebotes bajos, tienes dos palancas para escalar y conviene usarlas en este orden. Primero sube el límite por buzón de 20 a 30 y luego a 40 diarios, una marcha por semana, observando la banda de salud cada vez. Segundo, y más rentable a largo plazo, agrega un tercer dominio de envío con 5 buzones nuevos: cada buzón adicional suma 20 a 40 correos diarios de capacidad sin cargar más a los existentes. Con 10 buzones a 40 diarios, o con 15 buzones a 30, operas cómodo en 400 a 500 correos por día."),
("p", "Recuerda que cada buzón nuevo repite su propio calentamiento desde 10 diarios, así que planifica las incorporaciones con 2 o 3 semanas de anticipación a la necesidad real de volumen. La importación masiva de hasta 5.000 buzones por CSV hace que el alta sea rápida; lo lento, correctamente, es la curva de reputación."),
("h2", "Problemas frecuentes y su solución"),
("table", {
  "head": ["Síntoma", "Causa probable", "Solución"],
  "ratios": [0.28, 0.34, 0.38],
  "rows": [
    ["El correo no sale del buzón", "Token OAuth revocado por cambio de contraseña, o credenciales SMTP inválidas", "Reconectar el buzón desde Cuentas y reautorizar; verificar contraseñas de aplicación"],
    ["Cae en spam de forma sostenida", "SPF/DKIM/DMARC incompletos, dominio sin historial o contenido con señales de spam", "Auditar DNS del dominio, subir calidez y bajar volumen; endurecer contenido"],
    ["El warmup no corre", "Zona horaria del buzón mal definida o carpeta Warmbly eliminada a mano", "Fijar zona horaria del buzón y dejar que la plataforma recree su carpeta"],
    ["Buzón en banda de vigilancia", "Volumen subido demasiado rápido o plantilla degradada", "Congelar límites, rotar variantes, esperar 7 días de inbox rate sobre 90%"],
    ["Tasa de rebotes sobre 5%", "Lista poco filtrada o destinos inexistentes", "Volver a pasar el lote por TechDigital con verificación SMTP activada"],
    ["Respuestas no aparecen", "Sincronización IMAP/Graph detenida", "Revisar estado del buzón en Cuentas y forzar resincronización"],
  ],
  "caption": "Tabla 9. Diagnóstico rápido de incidencias comunes de la operación.",
}),
("h2", "Checklist final de lanzamiento"),
("num", [
  "VPS con Docker operativo y panel accesible en HTTPS con tu dominio.",
  "Instancia reclamada con tu cuenta de administrador y doble factor activada.",
  "Dos dominios de envío con SPF, DKIM y DMARC verificados en verde.",
  "Redirect de dominios de envío a tu web y tracking con CNAME propio verificado.",
  "10 buzones conectados: 4 Workspace, 3 Microsoft 365 y 3 SMTP propios.",
  "Zona horaria correcta en cada buzón para las horas de warmup y de envío.",
  "Warmup activo en los 10 buzones y carpeta Warmbly creada.",
  "Secuencia de 3 pasos con seguimientos a 3 y 6 días y Detener al responder activo.",
  "Límite de campaña en 20 por buzón y ventana de envío de lunes a viernes de 9 a 17.",
  "Primer lote de leads importado desde TechDigital Prospect con supresión revisada.",
]),
("p", "Tres reglas de oro para cerrar. Paciencia con el calentamiento: las dos primeras semanas de solo warmup son las que compran tu bandeja principal de los meses siguientes. Calidad de lista sobre cantidad: cada lote que salga de TechDigital Prospect verificado vale más que cualquier truco de envío. Y medición semanal: el inbox rate, los rebotes y las respuestas dictan cuándo subir volumen, cuándo frenar y cuándo rotar mensajes. Con esas tres reglas, el sistema escala de 200 a 500 correos diarios sin quemar ni dominios ni buzones."),
]},
]
