# -*- coding: utf-8 -*-
"""Fusiona portada + cuerpo en un solo PDF, normalizando a A4."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = '/home/z/my-project/scripts/assets/cover_tmp.pdf'
BODY = '/home/z/my-project/scripts/assets/body_tmp.pdf'
OUT = '/home/z/my-project/download/Guia_Warmbly_Cold_Email_TechDigital.pdf'

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
cover_page = PdfReader(COVER).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'Guía de despliegue: sistema de cold email con Warmbly',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Despliegue de Warmbly en VPS: 10 buzones mixtos, warmup automático y campañas de 200 correos diarios para TechDigital',
})
with open(OUT, 'wb') as f:
    writer.write(f)

r = PdfReader(OUT)
print('OK merged:', OUT, '| paginas:', len(r.pages))
