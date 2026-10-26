# -*- coding: utf-8 -*-
"""Genera el cuerpo del PDF (sin portada) con ReportLab.
Ruta Report del skill pdf: TocDocTemplate + multiBuild, paleta fija
Template 07 Crystal Blue, tablas con Paragraph(), CondPageBreak antes de H1,
sin saltos de pagina forzados entre capitulos.
"""
import os, sys, hashlib

SKILL_SCRIPTS = '/home/z/my-project/skills/pdf/scripts'
if SKILL_SCRIPTS not in sys.path:
    sys.path.insert(0, SKILL_SCRIPTS)
sys.path.insert(0, '/home/z/my-project/scripts')

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, CondPageBreak,
                                KeepTogether, HRFlowable, Image)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

from warmbly_content import CHAPTERS, DOC_TITLE, DOC_AUTHOR

# ------------------------------------------------------------------ fuentes
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
try:
    pdfmetrics.registerFont(TTFont('Noto Sans SC', f'{FONT_DIR}/truetype/chinese/NotoSansSC[wght].ttf'))
    pdfmetrics.registerFont(TTFont('Noto Sans SC Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
except Exception:
    pdfmetrics.registerFont(TTFont('Noto Sans SC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('Noto Sans SC Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono-Bold.ttf'))

registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('Noto Sans SC', normal='Noto Sans SC', bold='Noto Sans SC Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------------- paleta fija Template 07
PAGE_BG       = colors.HexColor('#f5f8fc')
SECTION_BG    = colors.HexColor('#edf2f9')
CARD_BG       = colors.HexColor('#e4ecf5')
TABLE_STRIPE  = colors.HexColor('#eef3fa')
HEADER_FILL   = colors.HexColor('#1a4a7a')
BORDER        = colors.HexColor('#c0d0e2')
ACCENT        = colors.HexColor('#2d7ab3')
TEXT_PRIMARY  = colors.HexColor('#142840')
TEXT_MUTED    = colors.HexColor('#5a7a96')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ------------------------------------------------------------------ layout
MARGIN = 0.9 * inch                       # simetrico izquierda/derecha
TOP_M, BOT_M = 0.95 * inch, 0.85 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN             # ~465.7 pt
AVAIL_H = PAGE_H - TOP_M - BOT_M
H1_THRESHOLD = AVAIL_H * 0.25
MAX_KEEP_HEIGHT = PAGE_H * 0.4

OUT = '/home/z/my-project/scripts/assets/body_tmp.pdf'

# ------------------------------------------------------------------ estilos
S = {}
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5,
                           leading=17, alignment=TA_JUSTIFY,
                           textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=9)
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif-Bold', fontSize=21,
                         leading=26, textColor=HEADER_FILL,
                         spaceBefore=0, spaceAfter=0, alignment=TA_LEFT)
S['h2'] = ParagraphStyle('H2', fontName='FreeSerif-Bold', fontSize=14.5,
                         leading=19, textColor=TEXT_PRIMARY,
                         spaceBefore=14, spaceAfter=6, alignment=TA_LEFT)
S['h3'] = ParagraphStyle('H3', fontName='FreeSerif-Bold', fontSize=11.5,
                         leading=15, textColor=TEXT_PRIMARY,
                         spaceBefore=10, spaceAfter=4, alignment=TA_LEFT)
S['bullet'] = ParagraphStyle('Bullet', parent=S['body'], alignment=TA_LEFT,
                             leftIndent=16, firstLineIndent=0, spaceAfter=5,
                             bulletIndent=4, bulletFontName='FreeSerif')
S['num'] = ParagraphStyle('Num', parent=S['bullet'])
S['code'] = ParagraphStyle('Code', fontName='DejaVuSans', fontSize=8.3,
                           leading=12.5, textColor=TEXT_PRIMARY,
                           alignment=TA_LEFT)
S['card'] = ParagraphStyle('Card', fontName='DejaVuSans', fontSize=8.6,
                           leading=13.5, textColor=TEXT_PRIMARY,
                           alignment=TA_LEFT)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif-Italic',
                              fontSize=8.5, leading=12, textColor=TEXT_MUTED,
                              alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5,
                         leading=12.5, textColor=colors.white,
                         alignment=TA_LEFT)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9.3,
                         leading=12.5, textColor=TEXT_PRIMARY,
                         alignment=TA_LEFT)
S['stat'] = ParagraphStyle('Stat', fontName='FreeSerif-Bold', fontSize=19,
                           leading=23, textColor=ACCENT, alignment=TA_CENTER)
S['statlab'] = ParagraphStyle('StatLab', fontName='FreeSerif', fontSize=8.8,
                              leading=12, textColor=TEXT_MUTED,
                              alignment=TA_CENTER)
S['toc_title'] = ParagraphStyle('TocTitle', fontName='FreeSerif-Bold',
                                fontSize=20, leading=25,
                                textColor=HEADER_FILL, spaceAfter=16)
S['toc0'] = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=11.5,
                           leading=21, leftIndent=6, textColor=TEXT_PRIMARY)

# ------------------------------------------------------------ utilidades
def esc(t):
    return t.replace('&', '&').replace('<', '<').replace('>', '>')

def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def make_table(spec):
    head = spec['head']
    ratios = spec['ratios']
    col_w = [r * AVAIL_W for r in ratios]
    assert abs(sum(col_w) - AVAIL_W) < 1.0, 'colWidths exceden el ancho'
    data = [[Paragraph('<b>%s</b>' % h, S['th']) for h in head]]
    for row in spec['rows']:
        data.append([Paragraph(c, S['td']) for c in row])
    t = Table(data, colWidths=col_w, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        style.append(('BACKGROUND', (0, i), (-1, i),
                      TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 10), t]
    if spec.get('caption'):
        out += [Spacer(1, 2), Paragraph(esc(spec['caption']), S['caption'])]
    out.append(Spacer(1, 10))
    return out

def code_block(text):
    lines = [esc(l) for l in text.split('\n')]
    para = Paragraph('<br/>'.join(lines), S['code'])
    t = Table([[para]], colWidths=[AVAIL_W], hAlign='CENTER')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return [Spacer(1, 6), t, Spacer(1, 10)]

def email_card(text):
    lines = [esc(l) for l in text.split('\n')]
    para = Paragraph('<br/>'.join(lines), S['card'])
    t = Table([[para]], colWidths=[AVAIL_W * 0.86], hAlign='CENTER')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.8, BORDER),
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, HEADER_FILL),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return [Spacer(1, 6), t, Spacer(1, 10)]

def callout(spec):
    inner = Table(
        [[Paragraph('<b>%s</b>' % esc(spec['big']), S['stat'])],
         [Paragraph(esc(spec['label']), S['statlab'])]],
        colWidths=[AVAIL_W * 0.62])
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 1, ACCENT),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 10),
        ('TOPPADDING', (0, 1), (-1, 1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    inner.hAlign = 'CENTER'
    return [Spacer(1, 8), KeepTogether([inner]), Spacer(1, 10)]

def chart_block(spec):
    pil = PILImage.open(spec['path'])
    ow, oh = pil.size
    max_w, max_h = AVAIL_W * 0.96, PAGE_H * 0.33
    ratio = min(max_w / ow, max_h / oh, 1.0)
    img = Image(spec['path'], width=ow * ratio, height=oh * ratio)
    cap = Paragraph(esc(spec['caption']), S['caption'])
    return [Spacer(1, 14)] + safe_keep_together([img, Spacer(1, 4), cap]) + [Spacer(1, 12)]

# ------------------------------------------------- header / footer
def _header_footer(canvas, doc, page_label):
    canvas.saveState()
    # header: titulo izquierda + regla accent
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # footer: autor izquierda + numero derecha + regla fina
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, DOC_AUTHOR)
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, page_label)
    canvas.restoreState()

def on_page(canvas, doc):
    if doc.page == 1:
        _header_footer(canvas, doc, 'i')          # indice: romano
    else:
        _header_footer(canvas, doc, str(doc.page - 1))  # cuerpo: arabigo desde 1

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, max(1, self.page - 1), key))

# ------------------------------------------------------------ historia
story = []

story.append(Paragraph('<b>Índice</b>', S['toc_title']))
toc = TableOfContents()
toc.levelStyles = [S['toc0']]
story.append(toc)
story.append(PageBreak())

for idx, chap in enumerate(CHAPTERS, start=1):
    story.append(CondPageBreak(H1_THRESHOLD))
    h = heading('%d. %s' % (idx, chap['title']), S['h1'], level=0)
    rule = HRFlowable(width='26%', color=ACCENT, thickness=1.2,
                      spaceBefore=5, spaceAfter=12, hAlign='LEFT')
    blocks = chap['blocks']
    # primer bloque para evitar h1 huerfano
    first_type, first_data = blocks[0]
    lead = []
    if first_type == 'p':
        lead = [Paragraph(first_data, S['body'])]
        rest = blocks[1:]
    else:
        rest = blocks
    story.extend(safe_keep_together([h, rule] + lead))
    for btype, bdata in rest:
        if btype == 'p':
            story.append(Paragraph(bdata, S['body']))
        elif btype == 'h2':
            story.append(Paragraph('<b>%s</b>' % bdata, S['h2']))
        elif btype == 'h3':
            story.append(Paragraph('<b>%s</b>' % bdata, S['h3']))
        elif btype == 'bullet':
            for item in bdata:
                story.append(Paragraph(item, S['bullet'], bulletText='•'))
            story.append(Spacer(1, 4))
        elif btype == 'num':
            for n, item in enumerate(bdata, start=1):
                story.append(Paragraph(item, S['num'], bulletText='%d.' % n))
            story.append(Spacer(1, 4))
        elif btype == 'table':
            story.extend(make_table(bdata))
        elif btype == 'code':
            story.extend(code_block(bdata))
        elif btype == 'card':
            story.extend(email_card(bdata))
        elif btype == 'callout':
            story.extend(callout(bdata))
        elif btype == 'chart':
            story.extend(chart_block(bdata))
    story.append(Spacer(1, 14))

doc = TocDocTemplate(
    OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=TOP_M, bottomMargin=BOT_M,
    title=DOC_TITLE, author='Z.ai', creator='Z.ai',
    subject='Guia de despliegue del sistema de cold email con Warmbly para TechDigital')

doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print('OK body:', OUT)
