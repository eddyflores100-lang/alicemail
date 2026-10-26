# -*- coding: utf-8 -*-
"""Grafico de rampa de warmup + campana por buzon (capitulo 6).
Sigue typesetting/charts.md: sin spines top/right, grid discontinua 20%,
linea 2.5pt, area con relleno suave, etiquetas solo en puntos clave,
leyenda sin borde fuera del area de datos.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Noto Sans SC']
plt.rcParams['axes.unicode_minus'] = False

# Paleta fija Template 07 (cover.md)
ACCENT = '#2d7ab3'      # serie warmup
HEADER = '#1a4a7a'      # serie campana
TEXT   = '#142840'
MUTED  = '#5a7a96'
BORDER = '#c0d0e2'

# Datos (dias 1-35)
dias = list(range(1, 36))
# Warmup por buzon: arranca 10/dia, +1/dia hasta techo; cuando arranca la
# campana (dia 15) el warmup queda limitado a 5/dia (regla de Warmbly)
warmup = []
for d in dias:
    if d < 15:
        warmup.append(min(10 + (d - 1), 40))
    else:
        warmup.append(5)
# Campana fria por buzon: 0 hasta dia 14; dias 15-17: 10; 18-21: 15; 22+: 20
campana = []
for d in dias:
    if d < 15:
        campana.append(0)
    elif d < 18:
        campana.append(10)
    elif d < 22:
        campana.append(15)
    else:
        campana.append(20)

fig, ax = plt.subplots(figsize=(8.0, 4.0), dpi=150, constrained_layout=True)

ax.plot(dias, warmup, color=ACCENT, linewidth=2.5, label='Warmup por buzon (dia)',
        solid_capstyle='round', zorder=3)
ax.plot(dias, campana, color=HEADER, linewidth=2.5, label='Campana fria por buzon (dia)',
        solid_capstyle='round', zorder=3)
ax.fill_between(dias, warmup, color=ACCENT, alpha=0.12, zorder=2)
ax.fill_between(dias, campana, color=HEADER, alpha=0.15, zorder=2)

# Linea de referencia de meta
ax.axhline(y=20, color=MUTED, linewidth=1.0, linestyle=(0, (4, 4)), alpha=0.8, zorder=1)
ax.annotate('Meta: 20 por buzon = 200/dia en total', xy=(35, 20), xytext=(23.5, 25.5),
            fontsize=10, color=MUTED)

# Etiquetas solo en puntos clave (primero, techo, inicio campana, meta)
ax.scatter([1, 14, 14], [10, 23, 0], s=22, color=[ACCENT, ACCENT, HEADER], zorder=4)
ax.scatter([22, 35], [20, 20], s=22, color=HEADER, zorder=4)
ax.annotate('Inicio: 10/dia', xy=(1, 10), xytext=(1.5, 13.2), fontsize=10, color=ACCENT)
ax.annotate('Dia 14: warmup 23/dia', xy=(14, 23), xytext=(8.2, 31.5), fontsize=10, color=ACCENT)
ax.annotate('Dia 15: arranca la campana (10/dia)', xy=(15, 10), xytext=(16.0, 4.5),
            fontsize=10, color=HEADER)
ax.annotate('Dia 22: 20/dia por buzon', xy=(22, 20), xytext=(25.5, 15.2),
            fontsize=10, color=HEADER)

# Reglas de charts.md: sin spines superiores/derechos, grid discontinua suave
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color(BORDER)
ax.spines['bottom'].set_color(BORDER)
ax.tick_params(colors=MUTED, labelsize=11)
for lbl in ax.get_xticklabels() + ax.get_yticklabels():
    lbl.set_color(TEXT)
ax.grid(True, linestyle='--', linewidth=0.5, alpha=0.2, color=TEXT)
ax.set_axisbelow(True)

ax.set_xlabel('Dia de operacion', fontsize=12, color=TEXT)
ax.set_ylabel('Correos por buzon y dia', fontsize=12, color=TEXT)
ax.set_xlim(0.5, 35.5)
ax.set_ylim(0, 44)
ax.set_xticks([1, 5, 10, 15, 20, 25, 30, 35])
ax.set_yticks([0, 10, 20, 30, 40])

# Leyenda sin borde, fuera del area de datos (arriba-izquierda)
ax.legend(loc='lower left', bbox_to_anchor=(0.0, 1.02), ncol=2, frameon=False,
          fontsize=11, handlelength=1.6, columnspacing=1.8)

fig.savefig('/home/z/my-project/scripts/assets/warmup_ramp.png', facecolor='white')
print('OK chart saved')
