// Seed de demostración para AliceMail
// Buzones SIN verificar (el motor no enviará nada hasta que los verifiques)
import { PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'

const db = new PrismaClient()

function makeToken(email: string): string {
  return createHash('sha256').update(email + randomUUID()).digest('hex').slice(0, 24)
}

const NAMES = [
  ['Maria Lopez', 'maria.lopez', 'Acme Corp', 'Directora Marketing'],
  ['Juan Garcia', 'j.garcia', 'Globex SA', 'CEO'],
  ['Carla Mendoza', 'c.mendoza', 'AndesTech', 'Head of Sales'],
  ['Pedro Sanchez', 'p.sanchez', 'Nordic Foods', 'Operations Lead'],
  ['Lucia Torres', 'lucia.torres', 'Bright Analytics', 'CTO'],
  ['Diego Ramirez', 'd.ramirez', 'Sucre Logistics', 'Gerente General'],
  ['Ana Silva', 'a.silva', 'Vetor Brasil', 'Product Manager'],
  ['Jorge Cruz', 'j.cruz', 'Quito Digital', 'Founder'],
  ['Valeria Ruiz', 'v.ruiz', 'Mareas Retail', 'CMO'],
  ['Andres Vega', 'a.vega', 'Cumbre Software', 'VP Engineering'],
  ['Sofia Herrera', 's.herrera', 'Litoral Group', 'Directora Comercial'],
  ['Miguel Castro', 'm.castro', 'Delta Consulting', 'Partner'],
  ['Paola Flores', 'p.flores', 'Zenit Health', 'Marketing Manager'],
  ['Ricardo Mendez', 'r.mendez', 'Oriente Energy', 'Business Dev'],
  ['Camila Rios', 'c.rios', 'Fusion Media', 'Content Lead'],
  ['Fernando Diaz', 'f.diaz', 'Atlas Fintech', 'COO'],
  ['Daniela Prado', 'd.prado', 'Selva Organic', 'Founder'],
  ['Roberto Nunez', 'r.nunez', 'Cima Construction', 'Director'],
  ['Isabel Guzman', 'i.guzman', 'Nexo Legal', 'Socia'],
  ['Kevin Solis', 'k.solis', 'Pulso Sports', 'Growth Manager'],
  ['Teresa Aguilar', 't.aguilar', 'Nubla Cloud', 'Sales Director'],
  ['Omar Castillo', 'o.castillo', 'Ruta Cargo', 'Logistics Manager'],
  ['Bianca Moreno', 'b.moreno', 'Lumen Studio', 'Creative Dir'],
  ['Hector Vargas', 'h.vargas', 'Pacific Data', 'Data Analyst'],
]

const DOMAIN = 'prospectos-demo.com'

async function main() {
  console.log('Limpiando…')
  await db.leadEvent.deleteMany()
  await db.send.deleteMany()
  await db.inboxMessage.deleteMany()
  await db.enrollment.deleteMany()
  await db.sequenceStep.deleteMany()
  await db.campaign.deleteMany()
  await db.reEngageRule.deleteMany()
  await db.angle.deleteMany()
  await db.lead.deleteMany()
  await db.mailbox.deleteMany()
  await db.setting.deleteMany()

  console.log('Creando buzones demo (sin verificar)…')
  const mailboxes = await Promise.all(
    [
      ['María Pérez', 'maria.perez'],
      ['Carlos Andrade', 'carlos.andrade'],
      ['Lucía Fernández', 'lucia.fernandez'],
    ].map(([displayName, user]) =>
      db.mailbox.create({
        data: {
          email: `${user}@techdigital.site`,
          displayName,
          provider: 'SMTP',
          smtpHost: 'smtp.demo.invalid',
          smtpPort: 465,
          smtpUser: `${user}@techdigital.site`,
          smtpPass: 'demo',
          imapHost: 'imap.demo.invalid',
          imapPort: 993,
          imapUser: `${user}@techdigital.site`,
          imapPass: 'demo',
          verified: false,
          status: 'WARMUP',
          campaignDailyLimit: 20,
          warmupStart: 3,
          warmupMax: 25,
          warmupRamp: 2,
        },
      })
    )
  )

  console.log('Creando leads…')
  const leads = await Promise.all(
    NAMES.map(([name, user, company, position]) =>
      db.lead.create({
        data: {
          email: `${user}@${DOMAIN}`,
          name,
          company,
          position,
          source: 'csv',
          unsubToken: makeToken(user),
        },
      })
    )
  )

  console.log('Creando campaña con secuencia…')
  const campaign = await db.campaign.create({
    data: {
      name: 'Intro TechDigital Prospect — Q4',
      fromName: 'María de TechDigital',
      status: 'RUNNING',
      dailyTarget: 60,
      trackOpens: true,
      steps: {
        create: [
          {
            stepNumber: 1,
            delayDays: 0,
            subject: '{{nombre}}, validación de listas para {{empresa}}',
            body: `Hola {{nombre}},

Vi que lideras {{cargo}} en {{empresa}}. En TechDigital ayudamos a equipos comerciales a limpiar y validar sus listas de prospectos antes de cada envío (dedupe, MX, SMTP) para que cada correo cuente.

¿Te interesaría ver cómo quedaría tu lista procesada? Te muestro en 10 minutos.

Saludos,
María`,
          },
          {
            stepNumber: 2,
            delayDays: 3,
            subject: 'Re: {{nombre}}, validación de listas para {{empresa}}',
            body: `Hola {{nombre}},

Retomo mi correo anterior por si se te pasó. Tenemos capacidad esta semana para procesar una muestra gratuita de {{empresa}}.

¿Te va el jueves?

Saludos,
María`,
          },
        ],
      },
    },
  })

  console.log('Creando inscripciones…')
  const steps = await db.sequenceStep.findMany({ where: { campaignId: campaign.id }, orderBy: { stepNumber: 'asc' } })
  await Promise.all(
    leads.map((lead, i) =>
      db.enrollment.create({
        data: {
          campaignId: campaign.id,
          leadId: lead.id,
          mailboxId: mailboxes[i % mailboxes.length].id,
          status: 'QUEUED',
          nextSendAt: new Date(Date.now() + (i + 1) * 3 * 60_000),
        },
      })
    )
  )

  console.log('Generando histórico de 14 días (rampa warmup + primeras campañas)…')
  const warmSubjects = ['¿Viste esto?', 'Consulta rápida', 'Idea para el jueves', 'Te comparto algo', '¿Tienes un minuto?']
  const warmBodies = ['Hola, ¿cómo va todo por ahí?', '¿Ya tuviste chance de revisarlo?', 'Buen día, todo en orden por aquí.']
  let opened = 0
  for (let d = 13; d >= 0; d--) {
    const perMailbox = Math.min(3 + 2 * (13 - d), 25)
    for (const mb of mailboxes) {
      const n = Math.max(0, perMailbox - Math.floor(Math.random() * 3))
      for (let k = 0; k < n; k++) {
        const partner = mailboxes[Math.floor(Math.random() * mailboxes.length)]
        await db.send.create({
          data: {
            kind: 'WARMUP',
            mailboxId: mb.id,
            partnerId: partner.id,
            toEmail: partner.email,
            subject: warmSubjects[Math.floor(Math.random() * warmSubjects.length)],
            status: 'SENT',
            sentAt: new Date(Date.now() - d * 86_400_000 - Math.floor(Math.random() * 10) * 3_600_000),
          },
        })
      }
    }
    // campañas: últimos 3 días, volumen creciente pequeño
    if (d <= 2) {
      const campaignSends = d === 0 ? 14 : d === 1 ? 11 : 8
      for (let k = 0; k < campaignSends; k++) {
        const lead = leads[Math.floor(Math.random() * leads.length)]
        const mb = mailboxes[Math.floor(Math.random() * mailboxes.length)]
        const willOpen = Math.random() < 0.38
        if (willOpen) opened++
        await db.send.create({
          data: {
            kind: 'CAMPAIGN',
            mailboxId: mb.id,
            campaignId: campaign.id,
            leadId: lead.id,
            stepNumber: 1,
            toEmail: lead.email,
            subject: steps[0].subject.replace('{{nombre}}', (lead.name || '').split(' ')[0] || ''),
            status: 'SENT',
            openedAt: willOpen ? new Date(Date.now() - d * 86_400_000) : null,
            sentAt: new Date(Date.now() - d * 86_400_000 - Math.floor(Math.random() * 8) * 3_600_000),
          },
        })
      }
    }
  }

  // 2 leads respondieron, 1 rebotó
  await db.lead.update({ where: { id: leads[3].id }, data: { status: 'REPLIED' } })
  await db.lead.update({ where: { id: leads[7].id }, data: { status: 'REPLIED' } })
  await db.lead.update({ where: { id: leads[11].id }, data: { status: 'BOUNCED' } })
  await db.enrollment.updateMany({ where: { leadId: { in: [leads[3].id, leads[7].id] } }, data: { status: 'REPLIED' } })
  await db.enrollment.updateMany({ where: { leadId: leads[11].id }, data: { status: 'BOUNCED' } })

  // temperaturas asignadas por el agente IA
  await db.lead.update({
    where: { id: leads[3].id },
    data: { temperature: 'HOT', temperatureAt: new Date(), aiNotes: 'Pide reunión el jueves a las 10 — interés directo' },
  })
  await db.lead.update({
    where: { id: leads[7].id },
    data: { temperature: 'WARM', temperatureAt: new Date(), aiNotes: 'Quiere ver la muestra antes de decidir' },
  })

  // ─── CRM v3: etapas del pipeline ───
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
  // calientes y tibios (respondieron)
  await db.lead.update({ where: { id: leads[3].id }, data: { stage: 'CALIENTE', stageAt: new Date(Date.now() - 2 * 3_600_000), score: 30, openCount: 2, lastOpenedAt: new Date(Date.now() - 26 * 3_600_000), currentAngle: 'Muestra gratis' } })
  await db.lead.update({ where: { id: leads[7].id }, data: { stage: 'TIBIO', stageAt: new Date(Date.now() - 5 * 3_600_000), score: 30, openCount: 3, lastOpenedAt: new Date(Date.now() - 5 * 3_600_000) } })
  // en contacto (enviados recientes)
  for (const i of [0, 1, 2, 4, 5, 11]) {
    await db.lead.update({ where: { id: leads[i].id }, data: { stage: 'CONTACTADO', stageAt: daysAgo(1), openCount: i % 2, score: i % 2 ? 5 : 0, lastContactedAt: daysAgo(1), currentAngle: 'Validación de listas' } })
  }
  // fríos: abrieron pero no responden
  for (const [i, d] of [[6, 4], [13, 6], [17, 8]] as const) {
    await db.lead.update({ where: { id: leads[i].id }, data: { stage: 'FRIO', stageAt: daysAgo(d), openCount: 2, score: 10, lastOpenedAt: daysAgo(d), lastContactedAt: daysAgo(d + 2), status: 'ACTIVE', currentAngle: 'Validación de listas' } })
  }
  // rechazado (dijo no + baja)
  await db.lead.update({ where: { id: leads[9].id }, data: { stage: 'RECHAZADO', stageAt: daysAgo(3), status: 'UNSUBSCRIBED', temperature: 'COLD', score: 25, lastContactedAt: daysAgo(3) } })
  // recuperados (re-activados por el agente con otro enfoque / otra promoción)
  await db.lead.update({ where: { id: leads[2].id }, data: { stage: 'RECUPERADO', stageAt: new Date(Date.now() - 90 * 60_000), reengagedCount: 1, lastReengageAt: new Date(Date.now() - 90 * 60_000), currentAngle: 'Caso de éxito', score: 15, openCount: 3, lastOpenedAt: new Date(Date.now() - 2 * 3_600_000), lastContactedAt: new Date(Date.now() - 90 * 60_000), status: 'ACTIVE' } })
  await db.lead.update({ where: { id: leads[14].id }, data: { stage: 'RECUPERADO', stageAt: new Date(Date.now() - 5 * 3_600_000), reengagedCount: 1, lastReengageAt: new Date(Date.now() - 5 * 3_600_000), currentAngle: 'Auditoría gratuita', score: 20, openCount: 4, lastOpenedAt: new Date(Date.now() - 4 * 3_600_000), lastContactedAt: new Date(Date.now() - 5 * 3_600_000), status: 'ACTIVE' } })
  // el resto se quedan NUEVO (sin contacto)
  for (const i of [8, 10, 12, 15, 16, 18, 19, 20, 21, 22, 23]) {
    await db.lead.update({ where: { id: leads[i].id }, data: { stage: 'NUEVO' } })
  }

  console.log('Creando enfoques comerciales…')
  await db.angle.createMany({
    data: [
      {
        name: 'Caso de éxito',
        description: 'Ángulo: prueba social con números',
        subject: '{{nombre}}, cómo {{empresa}} podría limpiar 5.000 contactos/semana',
        body: `Hola {{nombre}},

Hace un mes ayudamos a una agencia parecida a {{empresa}}: de 10.000 contactos, 2.300 eran inválidos o duplicados. Tras limpiarlos, su tasa de respuesta subió un 41%.

¿Te enseño los números en una llamada de 10 minutos?

Un saludo.`,
      },
      {
        name: 'Pregunta directa',
        description: 'Ángulo: micro-compromiso, respuesta de sí/no',
        subject: 'Una pregunta de sí/no, {{nombre}}',
        body: `Hola {{nombre}},

¿Te interesa que {{empresa}} deje de enviar correos a direcciones falsas? Responde sí o no y actúo en consecuencia.

Si es sí, preparo una muestra gratis de tu lista esta misma semana.

Gracias por tu tiempo.`,
      },
      {
        name: 'Nueva promo auditoría',
        description: 'Ángulo: auditoría gratuita de entregabilidad',
        subject: 'Auditoría gratuita de entregabilidad para {{empresa}}',
        body: `Hola {{nombre}},

Cambiando de tema: ahora ofrecemos una auditoría gratuita de entregabilidad. Revisamos tu dominio (SPF, DKIM, DMARC), reputación y una muestra de tu lista.

Te entregamos un informe con los 3 problemas que más te están costando respuestas. ¿Te la preparo?

Un saludo.`,
      },
      {
        name: 'Oferta de reactivación',
        description: 'Ángulo: ventana limitada',
        subject: '{{nombre}}, tenemos 2 cupos esta semana',
        body: `Hola {{nombre}},

Esta semana tenemos solo 2 cupos para procesar listas sin coste inicial. Como ya hablamos antes, quería dártelo primero a ti.

Si te apetece, te aparto uno y empezamos por {{empresa}}.

Un saludo.`,
      },
    ],
  })

  console.log('Creando promoción B (para re-engagement)…')
  const promoB = await db.campaign.create({
    data: {
      name: 'Promo B — Auditoría gratuita',
      fromName: 'Carlos de TechDigital',
      status: 'RUNNING',
      dailyTarget: 40,
      trackOpens: true,
      steps: {
        create: [
          {
            stepNumber: 1,
            delayDays: 0,
            subject: 'Auditoría gratuita de entregabilidad — {{empresa}}',
            body: `Hola {{nombre}},

Ahora que seguimos en contacto: te propongo algo distinto a lo de antes. Una auditoría gratuita de entregabilidad para {{empresa}}.

Revisamos tu dominio (SPF, DKIM, DMARC), la reputación de tus buzones y una muestra de tu lista. Recibes un informe con los 3 puntos que más te cuestan respuestas.

¿Te la preparo esta semana?

Carlos`,
          },
          {
            stepNumber: 2,
            delayDays: 4,
            subject: 'Re: Auditoría gratuita de entregabilidad',
            body: `Hola {{nombre}},

Retomo esto por si te pilló con prisa. La auditoría no lleva nada de tu tiempo: tú solo me pasas el dominio y yo hago el resto.

¿Te la envío?

Carlos`,
          },
        ],
      },
    },
  })

  console.log('Creando reglas de re-engagement…')
  await db.reEngageRule.createMany({
    data: [
      {
        key: 'OPENS_NO_REPLY',
        name: 'Abrió varias veces sin responder',
        trigger: 'OPENS_NO_REPLY',
        threshold: 2,
        action: 'CHANGE_ANGLE',
        enabled: true,
        firedCount: 1,
        lastRunAt: new Date(Date.now() - 90 * 60_000),
      },
      {
        key: 'COLD_DAYS',
        name: 'Lleva días frío',
        trigger: 'COLD_DAYS',
        threshold: 5,
        action: 'NEW_PROMO',
        promoCampaignId: promoB.id,
        enabled: true,
        firedCount: 1,
        lastRunAt: new Date(Date.now() - 5 * 3_600_000),
      },
      {
        key: 'NO_OPEN',
        name: 'Nunca abrió el correo',
        trigger: 'NO_OPEN',
        threshold: 4,
        action: 'RESEND',
        enabled: true,
        firedCount: 0,
      },
    ],
  })

  // leads recuperados dentro de la promo B
  await db.enrollment.create({
    data: { campaignId: promoB.id, leadId: leads[14].id, mailboxId: mailboxes[1].id, status: 'IN_PROGRESS', currentStep: 1, nextSendAt: new Date(Date.now() + 3 * 3_600_000), lastSentAt: new Date(Date.now() - 5 * 3_600_000) },
  })

  console.log('Creando timeline CRM de los leads…')
  const ev = (leadId: string, type: string, title: string, detail: string | null, hoursAgo: number) => ({
    leadId,
    type,
    title,
    detail,
    createdAt: new Date(Date.now() - hoursAgo * 3_600_000),
  })
  await db.leadEvent.createMany({
    data: [
      // Pedro — caliente
      ev(leads[3].id, 'IMPORT', 'Lead importado desde CSV de TechDigital', null, 24 * 14),
      ev(leads[3].id, 'SENT', 'Primer correo enviado', 'Validación de listas para Nordic Foods', 30),
      ev(leads[3].id, 'OPEN', 'Abrió tu correo', null, 27),
      ev(leads[3].id, 'OPEN', 'Abrió tu correo', null, 26),
      ev(leads[3].id, 'REPLY', 'Respondió: "Propone reunión el jueves a las 10 am"', 'Temperatura: HOT', 2),
      ev(leads[3].id, 'STAGE', 'Etapa: Caliente', 'vía agente IA', 2),
      // Carla — recuperada con cambio de enfoque (abrió 2 veces sin responder)
      ev(leads[2].id, 'IMPORT', 'Lead importado desde CSV de TechDigital', null, 24 * 14),
      ev(leads[2].id, 'SENT', 'Primer correo enviado', 'Validación de listas para AndesTech', 52),
      ev(leads[2].id, 'OPEN', 'Abrió tu correo', null, 46),
      ev(leads[2].id, 'OPEN', 'Abrió tu correo', null, 20),
      ev(leads[2].id, 'ANGLE', 'Cambio de enfoque: "Caso de éxito"', 'Regla: Abrió varias veces sin responder', 1.5),
      ev(leads[2].id, 'OPEN', 'Abrió el correo del nuevo enfoque', null, 2),
      ev(leads[2].id, 'STAGE', 'Etapa: Recuperado', 'vía re-engagement automático', 1.5),
      // Camila — metida en la promo B
      ev(leads[14].id, 'IMPORT', 'Lead importado desde CSV de TechDigital', null, 24 * 14),
      ev(leads[14].id, 'SENT', 'Primer correo enviado', 'Validación de listas para Fusion Media', 24 * 10),
      ev(leads[14].id, 'OPEN', 'Abrió tu correo', null, 24 * 6),
      ev(leads[14].id, 'STAGE', 'Etapa: Frío', 'vía agente IA', 24 * 5),
      ev(leads[14].id, 'PROMO', 'Metido en otra promoción: "Promo B — Auditoría gratuita"', 'Regla: Lleva días frío', 5),
      ev(leads[14].id, 'SENT', 'Correo de la promo B enviado', 'Auditoría gratuita de entregabilidad — Fusion Media', 5),
      ev(leads[14].id, 'OPEN', 'Abrió el correo de la promo B', null, 4),
      ev(leads[14].id, 'STAGE', 'Etapa: Recuperado', 'vía re-engagement automático', 5),
      // Andrés — rechazado
      ev(leads[9].id, 'SENT', 'Primer correo enviado', 'Validación de listas para Cumbre Software', 24 * 6),
      ev(leads[9].id, 'REPLY', 'Respondió: "No me interesa, no escribir más"', 'Temperatura: COLD', 72),
      ev(leads[9].id, 'STAGE', 'Etapa: Rechazado', 'vía agente IA', 72),
      // Diego — frío
      ev(leads[6].id, 'SENT', 'Primer correo enviado', 'Validación de listas para Sucre Logistics', 24 * 7),
      ev(leads[6].id, 'OPEN', 'Abrió tu correo', null, 24 * 4),
      ev(leads[6].id, 'STAGE', 'Etapa: Frío', 'vía agente IA', 96),
      // rebote Miguel
      ev(leads[11].id, 'SENT', 'Primer correo enviado', 'Validación de listas para Delta Consulting', 30),
      ev(leads[11].id, 'BOUNCE', 'Correo rebotado (dirección inválida)', null, 7),
    ],
  })

  await db.inboxMessage.createMany({
    data: [
      {
        mailboxId: mailboxes[0].id,
        fromEmail: 'p.sanchez@prospectos-demo.com',
        subject: 'Re: validación de listas',
        body: 'Hola María, sí me interesa. ¿El jueves a las 10am? Pedro',
        messageId: 'demo-reply-1@prospectos',
        isReply: true,
        temperature: 'HOT',
        aiIntent: 'pide reunión concreta',
        aiSummary: 'Pedro confirma interés y propone el jueves a las 10 am para una reunión.',
        aiReply:
          '¡Perfecto, Pedro! Jueves 10 am me viene genial. Te envío la invitación con el enlace de la llamada y una muestra de tu lista ya procesada para que la tengas delante durante la reunión.\n\nUn saludo,\nMaría',
        classified: true,
        receivedAt: new Date(Date.now() - 2 * 3_600_000),
      },
      {
        mailboxId: mailboxes[1].id,
        fromEmail: 'j.cruz@prospectos-demo.com',
        subject: 'Re: idea rápida',
        body: 'Perfecto, mándame la muestra y la revisamos. Saludos.',
        messageId: 'demo-reply-2@prospectos',
        isReply: true,
        temperature: 'WARM',
        aiIntent: 'pide más información',
        aiSummary: 'Jorge acepta revisar una muestra antes de tomar una decisión.',
        aiReply:
          'Gracias, Jorge. Te envío la muestra de 200 registros procesados (dedupe, validación MX/SMTP) y un resumen de resultados. Si te cuadra, hablamos de cómo integrarlo en tu flujo.\n\nSaludos,\nCarlos',
        classified: true,
        receivedAt: new Date(Date.now() - 5 * 3_600_000),
      },
      {
        mailboxId: mailboxes[2].id,
        fromEmail: 'lucia.torres@prospectos-demo.com',
        subject: 'Re: validación de listas',
        body: 'Hola, ¿qué precio tendría para una base de 5.000 contactos al mes? Gracias.',
        messageId: 'demo-reply-3@prospectos',
        isReply: true,
        receivedAt: new Date(Date.now() - 40 * 60_000),
      },
      {
        mailboxId: mailboxes[2].id,
        fromEmail: 'mailer-daemon@demo.invalid',
        subject: 'Delivery Status Notification (Failure)',
        body: 'The email address m.castro@prospectos-demo.com does not exist.',
        messageId: 'demo-bounce-1@prospectos',
        isBounce: true,
        receivedAt: new Date(Date.now() - 7 * 3_600_000),
      },
    ],
  })

  console.log('Creando eventos del agente e historial…')
  await db.agentEvent.createMany({
    data: [
      {
        type: 'CLASSIFY',
        level: 'SUCCESS',
        message: 'Respuesta de p.sanchez@prospectos-demo.com clasificada como HOT · interés claro',
        meta: JSON.stringify({ source: 'ia', summary: 'Propone reunión el jueves a las 10' }),
        createdAt: new Date(Date.now() - 2 * 3_600_000),
      },
      {
        type: 'ACTION',
        level: 'SUCCESS',
        message: 'Respuesta automática enviada a p.sanchez@prospectos-demo.com (lead caliente)',
        meta: JSON.stringify({ autonomy: 'AUTO' }),
        createdAt: new Date(Date.now() - 2 * 3_600_000 + 60_000),
      },
      {
        type: 'CLASSIFY',
        level: 'INFO',
        message: 'Respuesta de j.cruz@prospectos-demo.com clasificada como WARM · pide más información',
        meta: JSON.stringify({ source: 'ia' }),
        createdAt: new Date(Date.now() - 5 * 3_600_000),
      },
      {
        type: 'GUARD',
        level: 'WARN',
        message: 'Buzón lucia.fernandez@techdigital.site: 1 rebote en 48 h — reputación vigilada',
        meta: JSON.stringify({ mailboxId: 'demo', key: 'guard-bounce', bounces: 1 }),
        createdAt: new Date(Date.now() - 7 * 3_600_000),
      },
      {
        type: 'REPORT',
        level: 'INFO',
        message: 'Informe diario enviado (Telegram/WhatsApp configurables en Notificaciones)',
        createdAt: new Date(Date.now() - 26 * 3_600_000),
      },
      {
        type: 'CRM',
        level: 'SUCCESS',
        message: 'Lead c.mendoza@prospectos-demo.com re-activado con nuevo enfoque "Caso de éxito" (regla: Abrió varias veces sin responder)',
        meta: JSON.stringify({ ruleId: 'demo', angle: 'Caso de éxito' }),
        createdAt: new Date(Date.now() - 90 * 60_000),
      },
      {
        type: 'CRM',
        level: 'SUCCESS',
        message: 'Lead c.rios@prospectos-demo.com añadido a la promoción "Promo B — Auditoría gratuita" (regla: Lleva días frío)',
        meta: JSON.stringify({ ruleId: 'demo', campaign: 'Promo B' }),
        createdAt: new Date(Date.now() - 5 * 3_600_000),
      },
      {
        type: 'CRM',
        level: 'ACTION',
        message: 'Lead a.vega@prospectos-demo.com movido a Rechazado (agente IA)',
        meta: JSON.stringify({ from: 'CONTACTADO', to: 'RECHAZADO' }),
        createdAt: new Date(Date.now() - 72 * 3_600_000),
      },
    ],
  })

  await db.notification.createMany({
    data: [
      {
        channel: 'TELEGRAM',
        event: 'daily',
        title: 'Informe diario AliceMail',
        body: '✉️ Enviados ayer: 8 campaña + 66 warmup\n💬 Respuestas: 2 · 🔥 calientes: 1 · ↩️ rebotes: 1\n📧 Buzones: 3 calentando',
        status: 'SENT',
        createdAt: new Date(Date.now() - 26 * 3_600_000),
      },
      {
        channel: 'TELEGRAM',
        event: 'hot',
        title: '🔥 Lead CALIENTE: p.sanchez@prospectos-demo.com',
        body: 'Propone reunión el jueves a las 10 am.\nClasificación: HOT',
        status: 'SENT',
        createdAt: new Date(Date.now() - 2 * 3_600_000),
      },
      {
        channel: 'TELEGRAM',
        event: 'crm',
        title: '♻️ Re-activado con otro enfoque: Carla Mendoza',
        body: 'Regla: Abrió varias veces sin responder\nEnfoque: Caso de éxito\nAsunto: Carla, cómo AndesTech podría limpiar 5.000 contactos/semana',
        status: 'SENT',
        createdAt: new Date(Date.now() - 90 * 60_000),
      },
      {
        channel: 'TELEGRAM',
        event: 'crm',
        title: '🎯 c.rios@prospectos-demo.com → otra promoción',
        body: 'Regla: Lleva días frío\nPromoción: Promo B — Auditoría gratuita\nEl primer correo sale en ~2 h',
        status: 'SENT',
        createdAt: new Date(Date.now() - 5 * 3_600_000),
      },
    ],
  })

  console.log('Creando ajustes v2…')
  await db.setting.createMany({
    data: [
      { key: 'agentEnabled', value: 'true' },
      { key: 'agentAutonomy', value: 'AUTO' },
      { key: 'dailyCapGlobal', value: '200' },
      { key: 'dailyReportHour', value: '9' },
      { key: 'notifyChannel', value: 'OFF' },
      { key: 'notifyEvents', value: 'reply,hot,bounce,error,daily,crm' },
      { key: 'mcpToken', value: 'amx_' + makeToken('mcp-alicemail') },
    ],
  })

  // contadores de hoy coherentes con el gráfico
  await db.mailbox.update({ where: { id: mailboxes[0].id }, data: { counterDate: new Date().toISOString().slice(0, 10), sentWarmupToday: 18, sentCampaignToday: 5 } })
  await db.mailbox.update({ where: { id: mailboxes[1].id }, data: { counterDate: new Date().toISOString().slice(0, 10), sentWarmupToday: 19, sentCampaignToday: 5 } })
  await db.mailbox.update({ where: { id: mailboxes[2].id }, data: { counterDate: new Date().toISOString().slice(0, 10), sentWarmupToday: 17, sentCampaignToday: 4 } })

  console.log('✓ Seed listo:', {
    mailboxes: mailboxes.length,
    leads: leads.length,
    campaign: campaign.name,
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
