# -*- coding: utf-8 -*-
"""
Gera o relatório de auditoria de segurança em PDF.

Uso (a partir de docs/security-audit/):
    ./.venv/Scripts/python.exe gerar_relatorio.py

Depende de reportlab e matplotlib, instalados no venv local .venv/.
Todo o conteúdo vem de achados.py — este arquivo só desenha.
Saída: relatorio-auditoria-seguranca.pdf
"""

import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, KeepTogether, PageBreak, CondPageBreak,
)

import achados as A

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "relatorio-auditoria-seguranca.pdf")
SAIDA_MD = os.path.join(AQUI, "issues-github.md")
GRAF = os.path.join(AQUI, "_graficos")
os.makedirs(GRAF, exist_ok=True)

NOME_RELATORIO = "Relatório de Auditoria de Segurança \u2014 %s" % A.PROJETO

TINTA = colors.HexColor("#0F172A")
TINTA_FRACA = colors.HexColor("#475569")
LINHA = colors.HexColor("#E2E8F0")
FUNDO_SUAVE = colors.HexColor("#F8FAFC")
VERDE = colors.HexColor(A.CORES["forte"])


# ───────────────────────── estilos ─────────────────────────

def montar_estilos():
    ss = getSampleStyleSheet()
    e = {}
    e["titulo_capa"] = ParagraphStyle(
        "titulo_capa", parent=ss["Title"], fontName="Helvetica-Bold",
        fontSize=26, leading=31, textColor=colors.white, alignment=TA_CENTER)
    e["sub_capa"] = ParagraphStyle(
        "sub_capa", parent=ss["Normal"], fontName="Helvetica",
        fontSize=12, leading=17, textColor=colors.HexColor("#CBD5E1"),
        alignment=TA_CENTER)
    e["h1"] = ParagraphStyle(
        "h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
        fontSize=17, leading=21, textColor=TINTA, spaceBefore=2, spaceAfter=9)
    e["h2"] = ParagraphStyle(
        "h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
        fontSize=12.5, leading=16, textColor=TINTA, spaceBefore=13, spaceAfter=5)
    e["h3"] = ParagraphStyle(
        "h3", parent=ss["Heading3"], fontName="Helvetica-Bold",
        fontSize=10.5, leading=14, textColor=TINTA, spaceBefore=9, spaceAfter=3)
    e["corpo"] = ParagraphStyle(
        "corpo", parent=ss["Normal"], fontName="Helvetica",
        fontSize=9.3, leading=13.4, textColor=TINTA, alignment=TA_JUSTIFY,
        spaceAfter=5)
    e["corpo_p"] = ParagraphStyle("corpo_p", parent=e["corpo"], fontSize=8.6, leading=12.2)
    e["celula"] = ParagraphStyle(
        "celula", parent=ss["Normal"], fontName="Helvetica",
        fontSize=8.1, leading=11, textColor=TINTA)
    e["celula_mono"] = ParagraphStyle(
        "celula_mono", parent=ss["Normal"], fontName="Courier",
        fontSize=7.3, leading=9.6, textColor=TINTA_FRACA)
    e["th"] = ParagraphStyle(
        "th", parent=ss["Normal"], fontName="Helvetica-Bold",
        fontSize=8.2, leading=11, textColor=colors.white)
    e["chip"] = ParagraphStyle(
        "chip", parent=ss["Normal"], fontName="Helvetica-Bold",
        fontSize=7.4, leading=10, textColor=colors.white, alignment=TA_CENTER)
    e["codigo"] = ParagraphStyle(
        "codigo", parent=ss["Normal"], fontName="Courier",
        fontSize=7.2, leading=9.5, textColor=colors.HexColor("#1E293B"))
    e["rodape"] = ParagraphStyle(
        "rodape", parent=ss["Normal"], fontName="Helvetica",
        fontSize=7.4, leading=9.5, textColor=TINTA_FRACA)
    e["kpi_num"] = ParagraphStyle(
        "kpi_num", parent=ss["Normal"], fontName="Helvetica-Bold",
        fontSize=21, leading=24, alignment=TA_CENTER, textColor=colors.white)
    e["kpi_lab"] = ParagraphStyle(
        "kpi_lab", parent=ss["Normal"], fontName="Helvetica-Bold",
        fontSize=6.9, leading=9, alignment=TA_CENTER, textColor=colors.white)
    e["issue"] = ParagraphStyle(
        "issue", parent=ss["Normal"], fontName="Courier",
        fontSize=7.1, leading=9.4, textColor=colors.HexColor("#0F172A"))
    return e


E = montar_estilos()


def esc(t):
    """Escapa para os mini-tags do reportlab."""
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def bloco_codigo(texto, largura):
    """Trecho de código em caixa cinza, com quebra manual de linha."""
    linhas = []
    for ln in str(texto).split("\n"):
        limite = 108
        while len(ln) > limite:
            corte = ln.rfind(" ", 0, limite)
            if corte < 40:
                corte = limite
            linhas.append(ln[:corte])
            ln = "    " + ln[corte:].lstrip()
        linhas.append(ln)
    p = Paragraph("<br/>".join(esc(x).replace(" ", "&nbsp;") for x in linhas), E["codigo"])
    t = Table([[p]], colWidths=[largura])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, colors.HexColor("#94A3B8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def chip(sev):
    """Chip colorido de severidade."""
    p = Paragraph(A.ROTULO_SEV[sev], E["chip"])
    t = Table([[p]], colWidths=[2.05 * cm], rowHeights=[0.46 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(A.CORES[sev])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return t


# ───────────────────────── gráficos ─────────────────────────

def contagem_por_severidade():
    c = {s: 0 for s in A.ORDEM_SEV}
    for a in A.ACHADOS:
        c[a["sev"]] += 1
    return c


def contagem_por_categoria():
    c = {k: 0 for k, _ in A.CATEGORIAS}
    for a in A.ACHADOS:
        c[a["cat"]] += 1
    return c


def grafico_rosca():
    cont = contagem_por_severidade()
    itens = [(s, n) for s, n in cont.items() if n > 0]
    valores = [n for _, n in itens]
    cores = [A.CORES[s] for s, _ in itens]
    rotulos = ["%s (%d)" % (A.ROTULO_SEV[s].capitalize(), n) for s, n in itens]

    fig, ax = plt.subplots(figsize=(4.5, 3.5), dpi=220)
    wedges, _ = ax.pie(
        valores, colors=cores, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2.2))
    ax.text(0, 0.10, str(sum(valores)), ha="center", va="center",
            fontsize=27, fontweight="bold", color="#0F172A")
    ax.text(0, -0.24, "achados", ha="center", va="center",
            fontsize=9.5, color="#64748B")
    ax.legend(wedges, rotulos, loc="center left", bbox_to_anchor=(1.0, 0.5),
              frameon=False, fontsize=8.8)
    ax.set(aspect="equal")
    fig.tight_layout()
    caminho = os.path.join(GRAF, "rosca_severidade.png")
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)
    return caminho


def grafico_barras():
    cont = contagem_por_categoria()
    chaves = [k for k, _ in A.CATEGORIAS]
    nomes = {"C1": "C1  Isolamento\nde tenant",
             "C2": "C2  Permissão\nno navegador",
             "C3": "C3  IDOR",
             "C4": "C4  Segredos\nexpostos",
             "C5": "C5  XSS"}
    valores = [cont[k] for k in chaves]

    # cor da barra = severidade mais grave presente na categoria
    cores = []
    for k in chaves:
        sevs = [a["sev"] for a in A.ACHADOS if a["cat"] == k]
        pior = next((s for s in A.ORDEM_SEV if s in sevs), "informativa")
        cores.append(A.CORES[pior])

    fig, ax = plt.subplots(figsize=(5.6, 3.5), dpi=220)
    barras = ax.bar([nomes[k] for k in chaves], valores, color=cores,
                    width=0.62, zorder=3)
    for b, v in zip(barras, valores):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.09, str(v),
                ha="center", va="bottom", fontsize=11, fontweight="bold",
                color="#0F172A")
    ax.set_ylim(0, max(valores) + 1.1)
    ax.set_ylabel("achados", fontsize=9, color="#475569")
    ax.grid(axis="y", color="#E2E8F0", linewidth=0.9, zorder=0)
    ax.set_axisbelow(True)
    for lado in ("top", "right", "left"):
        ax.spines[lado].set_visible(False)
    ax.spines["bottom"].set_color("#CBD5E1")
    ax.tick_params(axis="x", labelsize=8.2, colors="#334155", length=0)
    ax.tick_params(axis="y", labelsize=8.2, colors="#64748B", length=0)
    fig.tight_layout()
    caminho = os.path.join(GRAF, "barras_categoria.png")
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)
    return caminho


# ───────────────────────── moldura da página ─────────────────────────

MARGEM = 2 * cm
LARG_UTIL = A4[0] - 2 * MARGEM


class Documento(BaseDocTemplate):
    def __init__(self, caminho, **kw):
        BaseDocTemplate.__init__(self, caminho, pagesize=A4,
                                 leftMargin=MARGEM, rightMargin=MARGEM,
                                 topMargin=MARGEM, bottomMargin=MARGEM,
                                 title=NOME_RELATORIO,
                                 author="Auditoria de Segurança",
                                 subject="Auditoria de segurança de aplicação")
        quadro_capa = Frame(0, 0, A4[0], A4[1], id="capa",
                            leftPadding=0, rightPadding=0,
                            topPadding=0, bottomPadding=0)
        quadro = Frame(MARGEM, MARGEM + 0.85 * cm, LARG_UTIL,
                       A4[1] - 2 * MARGEM - 1.5 * cm, id="corpo",
                       leftPadding=0, rightPadding=0,
                       topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="Capa", frames=[quadro_capa], onPage=self.pintar_capa),
            PageTemplate(id="Corpo", frames=[quadro], onPage=self.pintar_moldura),
        ])

    def pintar_capa(self, canv, doc):
        canv.saveState()
        canv.setFillColor(colors.HexColor("#0B1727"))
        canv.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
        # faixa de severidade no rodapé da capa
        cont = contagem_por_severidade()
        total = sum(cont.values()) or 1
        x = 0
        for s in A.ORDEM_SEV:
            if not cont[s]:
                continue
            larg = A4[0] * cont[s] / float(total)
            canv.setFillColor(colors.HexColor(A.CORES[s]))
            canv.rect(x, 0, larg, 0.5 * cm, stroke=0, fill=1)
            x += larg
        canv.restoreState()

    def pintar_moldura(self, canv, doc):
        canv.saveState()
        # cabeçalho
        canv.setFont("Helvetica", 7.4)
        canv.setFillColor(TINTA_FRACA)
        canv.drawString(MARGEM, A4[1] - MARGEM + 0.42 * cm, NOME_RELATORIO)
        canv.drawRightString(A4[0] - MARGEM, A4[1] - MARGEM + 0.42 * cm,
                             A.DATA_AUDITORIA)
        canv.setStrokeColor(LINHA)
        canv.setLineWidth(0.6)
        canv.line(MARGEM, A4[1] - MARGEM + 0.22 * cm,
                  A4[0] - MARGEM, A4[1] - MARGEM + 0.22 * cm)
        # rodapé
        canv.line(MARGEM, MARGEM + 0.52 * cm, A4[0] - MARGEM, MARGEM + 0.52 * cm)
        canv.setFont("Helvetica", 7.4)
        canv.drawString(MARGEM, MARGEM + 0.17 * cm,
                        "Documento confidencial \u2014 uso interno")
        canv.drawRightString(A4[0] - MARGEM, MARGEM + 0.17 * cm,
                             "Página %d" % canv.getPageNumber())
        canv.restoreState()


# ───────────────────────── seções ─────────────────────────

def secao_capa():
    f = []
    f.append(Spacer(1, 6.2 * cm))
    f.append(Paragraph("AUDITORIA DE SEGURANÇA", ParagraphStyle(
        "eyebrow", fontName="Helvetica-Bold", fontSize=9.5, leading=13,
        textColor=colors.HexColor("#93C5FD"), alignment=TA_CENTER)))
    f.append(Spacer(1, 0.5 * cm))
    f.append(Paragraph("Relatório de Auditoria de Segurança<br/>%s" % esc(A.PROJETO),
                       E["titulo_capa"]))
    f.append(Spacer(1, 0.85 * cm))

    linha = Table([[""]], colWidths=[5 * cm], rowHeights=[2.2])
    linha.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1),
                               colors.HexColor("#3B82F6"))]))
    linha.hAlign = "CENTER"
    f.append(linha)
    f.append(Spacer(1, 0.85 * cm))
    f.append(Paragraph(esc(A.DATA_AUDITORIA), E["sub_capa"]))
    f.append(Spacer(1, 1.5 * cm))

    # placar de severidade
    cont = contagem_por_severidade()
    celulas, larguras = [], []
    for s in A.ORDEM_SEV:
        if not cont[s]:
            continue
        interna = Table(
            [[Paragraph(str(cont[s]), E["kpi_num"])],
             [Paragraph(A.ROTULO_SEV[s], E["kpi_lab"])]],
            colWidths=[2.65 * cm])
        interna.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(A.CORES[s])),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
            ("TOPPADDING", (0, 1), (-1, 1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ]))
        celulas.append(interna)
        larguras.append(2.9 * cm)
    placar = Table([celulas], colWidths=larguras)
    placar.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    placar.hAlign = "CENTER"
    f.append(placar)

    f.append(Spacer(1, 1.5 * cm))

    # escopo e nota metodológica
    txt_escopo = ParagraphStyle(
        "esc", fontName="Helvetica", fontSize=8.4, leading=12.4,
        textColor=colors.HexColor("#CBD5E1"), alignment=TA_JUSTIFY)
    rot = ParagraphStyle(
        "rot", fontName="Helvetica-Bold", fontSize=7.6, leading=11,
        textColor=colors.HexColor("#60A5FA"))

    cx = Table([
        [Paragraph("ESCOPO AUDITADO", rot)],
        [Paragraph(esc(A.ESCOPO), txt_escopo)],
        [Spacer(1, 0.32 * cm)],
        [Paragraph("NOTA METODOLÓGICA", rot)],
        [Paragraph(
            "As cinco categorias do pedido foram mapeadas para a stack detectada abaixo. "
            "O projeto não possui ORM nem servidor de aplicação próprio: o isolamento de "
            "inquilino é feito por Row Level Security do PostgreSQL, e o papel de “rota de "
            "backend” cabe às 24 Edge Functions Deno, que usam a service role e por isso "
            "operam fora da RLS. O detalhamento do mapeamento de cada categoria está na "
            "seção 1.", txt_escopo)],
    ], colWidths=[13.4 * cm])
    cx.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#132234")),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, colors.HexColor("#3B82F6")),
        ("LEFTPADDING", (0, 0), (-1, -1), 15),
        ("RIGHTPADDING", (0, 0), (-1, -1), 15),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, 0), 14),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
    ]))
    cx.hAlign = "CENTER"
    f.append(cx)
    return f


def secao_metodologia():
    f = [Paragraph("1. Stack detectada e mapeamento das categorias", E["h1"])]
    f.append(Paragraph(
        "A auditoria começou pela detecção da stack, porque cada categoria do pedido só faz "
        "sentido depois de traduzida para o equivalente real deste projeto. O quadro abaixo "
        "é o que foi detectado; a tabela seguinte diz, categoria por categoria, o que foi "
        "efetivamente procurado e onde.", E["corpo"]))
    f.append(Spacer(1, 0.22 * cm))

    linhas = [[Paragraph("Camada", E["th"]), Paragraph("Tecnologia detectada", E["th"])]]
    for k, v in A.STACK:
        linhas.append([Paragraph("<b>%s</b>" % esc(k), E["celula"]),
                       Paragraph(esc(v), E["celula"])])
    t = Table(linhas, colWidths=[4.3 * cm, LARG_UTIL - 4.3 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    f.append(t)

    f.append(Paragraph("Como cada categoria foi mapeada", E["h2"]))
    linhas = [[Paragraph("Categoria", E["th"]),
               Paragraph("Equivalente nesta stack e método aplicado", E["th"])]]
    for nome, desc in A.METODOLOGIA:
        linhas.append([Paragraph("<b>%s</b>" % esc(nome), E["celula"]),
                       Paragraph(esc(desc), E["celula"])])
    t = Table(linhas, colWidths=[4.3 * cm, LARG_UTIL - 4.3 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    f.append(t)
    return f


def secao_resumo(png_rosca, png_barras):
    cont = contagem_por_severidade()
    total = sum(cont.values())
    f = [Paragraph("2. Resumo executivo", E["h1"])]
    f.append(Paragraph(
        "Foram confirmados <b>%d achados</b> no código real, distribuídos pelas cinco "
        "categorias: <b>%d críticos</b>, <b>%d altos</b>, <b>%d médios</b>, <b>%d baixos</b> "
        "e <b>%d informativo</b>. <b>Os três críticos foram explorados de fato contra o banco "
        "de produção</b>, não apenas inferidos da leitura do código: a tabela "
        "<font face='Courier'>invoices</font> devolveu 829 registros a uma requisição HTTP sem "
        "nenhum login; a escalada a <i>owner</i> levou um usuário sem vínculo de 0 a 2.214 "
        "lançamentos financeiros com um único INSERT; e o papel anônimo emitiu credencial "
        "válida de Portal do Cliente e leu os dados cadastrais do titular. As duas provas que "
        "escrevem rodaram dentro de transação abortada — nada foi persistido. Foram registrados "
        "também <b>%d pontos fortes</b> com evidência, que constam da seção 3."
        % (total, cont["critica"], cont["alta"], cont["media"],
           cont["baixa"], cont["informativa"], len(A.PONTOS_FORTES)),
        E["corpo"]))
    f.append(Paragraph(
        "A leitura de conjunto é que o projeto acertou o desenho do isolamento — RLS "
        "habilitada em toda a base, funções auxiliares corretas, limpeza documentada de 81 "
        "policies permissivas — e errou em três pontos que anulam boa parte desse esforço: "
        "uma policy que deixa qualquer usuário se declarar dono de qualquer organização, "
        "duas funções que emitem credencial de portal sem pedir autorização, e o hábito de "
        "tratar o <font face='Courier'>organization_id</font> recebido do cliente como fato "
        "dentro das Edge Functions que rodam com service role.", E["corpo"]))
    f.append(Spacer(1, 0.3 * cm))

    g1 = Image(png_rosca, width=8.05 * cm, height=8.05 * cm * 0.72)
    g2 = Image(png_barras, width=8.55 * cm, height=8.55 * cm * 0.63)
    cab = ParagraphStyle("gcab", fontName="Helvetica-Bold", fontSize=8.6,
                         leading=11, textColor=TINTA_FRACA, alignment=TA_CENTER)
    t = Table([[Paragraph("ACHADOS POR SEVERIDADE", cab),
                Paragraph("ACHADOS POR CATEGORIA", cab)],
               [g1, g2]],
              colWidths=[LARG_UTIL * 0.47, LARG_UTIL * 0.53])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
    ]))
    f.append(t)
    f.append(Spacer(1, 0.35 * cm))

    # índice dos achados
    f.append(Paragraph("Índice dos achados", E["h2"]))
    linhas = [[Paragraph("ID", E["th"]), Paragraph("Sev.", E["th"]),
               Paragraph("Achado", E["th"]), Paragraph("Local", E["th"])]]
    for a in ordenados(A.ACHADOS):
        linhas.append([
            Paragraph("<b>%s</b>" % esc(a["id"]), E["celula"]),
            chip(a["sev"]),
            Paragraph(esc(a["titulo"]), E["celula"]),
            Paragraph(esc(nome_curto(a["arquivo"])), E["celula_mono"]),
        ])
    t = Table(linhas, colWidths=[1.35 * cm, 2.25 * cm, 8.5 * cm,
                                 LARG_UTIL - 1.35 * cm - 2.25 * cm - 8.5 * cm],
              repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINTA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    f.append(t)
    return f


def nome_curto(caminho):
    if len(caminho) <= 46:
        return caminho
    partes = caminho.split("/")
    return ".../" + "/".join(partes[-2:])


def ordenados(lista):
    return sorted(lista, key=lambda a: (A.ORDEM_SEV.index(a["sev"]), a["id"]))


def secao_fortes_fracos():
    f = [Paragraph("3. Pontos fortes (o que está protegido)", E["h1"])]
    f.append(Paragraph(
        "Esta seção existe para provar a cobertura da auditoria: são os controles que foram "
        "efetivamente verificados e passaram. Cada item traz a evidência que sustenta o "
        "veredito.", E["corpo"]))
    f.append(Spacer(1, 0.2 * cm))

    linhas = []
    for i, pf in enumerate(A.PONTOS_FORTES):
        marca = Table([[Paragraph("OK", ParagraphStyle(
            "ok", fontName="Helvetica-Bold", fontSize=7, leading=9,
            textColor=colors.white, alignment=TA_CENTER))]],
            colWidths=[0.95 * cm], rowHeights=[0.42 * cm])
        marca.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), VERDE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        corpo = [Paragraph("<b>%s</b>" % esc(pf["titulo"]), E["celula"]),
                 Spacer(1, 2),
                 Paragraph(esc(pf["evidencia"]), E["celula_mono"])]
        linhas.append([marca, corpo])
    t = Table(linhas, colWidths=[1.25 * cm, LARG_UTIL - 1.25 * cm])
    t.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINHA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    f.append(t)

    f.append(Paragraph("4. Pontos fracos (os riscos centrais)", E["h1"]))
    f.append(Paragraph(
        "Não é a lista de achados, é a leitura do que os produz. Corrigir o padrão abaixo "
        "impede a próxima ocorrência; corrigir só o achado, não.", E["corpo"]))
    f.append(Spacer(1, 0.2 * cm))
    for pf in A.PONTOS_FRACOS:
        cx = Table([[Paragraph("<b>%s</b>" % esc(pf["titulo"]), E["celula"])],
                    [Paragraph(esc(pf["texto"]), E["celula"])]],
                   colWidths=[LARG_UTIL])
        cx.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
            ("LINEBEFORE", (0, 0), (0, -1), 2.4, colors.HexColor(A.CORES["critica"])),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, 0), 7),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
            ("TOPPADDING", (0, 1), (-1, 1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ]))
        f.append(KeepTogether([cx, Spacer(1, 0.22 * cm)]))
    return f


def secao_detalhe():
    f = [Paragraph("5. Achados detalhados por categoria", E["h1"])]
    f.append(Paragraph(
        "Cada achado traz arquivo e linha exatos, o trecho de código, por que é explorável, "
        "o impacto, a correção sugerida e como o achado foi verificado. Onde a exploração "
        "depende de uma condição de ambiente, ela vem destacada.", E["corpo"]))

    for cod, nome in A.CATEGORIAS:
        do_grupo = [a for a in A.ACHADOS if a["cat"] == cod]
        if not do_grupo:
            continue
        f.append(CondPageBreak(6 * cm))
        cab = Table([[Paragraph(
            "<font color='white'><b>%s</b> &nbsp;&nbsp;%s</font>" % (esc(cod), esc(nome)),
            ParagraphStyle("cg", fontName="Helvetica-Bold", fontSize=11,
                           leading=15, textColor=colors.white))]],
            colWidths=[LARG_UTIL])
        cab.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), TINTA),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        f.append(Spacer(1, 0.3 * cm))
        f.append(cab)
        f.append(Spacer(1, 0.28 * cm))

        for a in ordenados(do_grupo):
            f.extend(bloco_achado(a))
    return f


def bloco_achado(a):
    f = []
    # cabeçalho: chip + id + título
    topo = Table([[chip(a["sev"]),
                   Paragraph("<b>%s</b> &nbsp; %s" % (esc(a["id"]), esc(a["titulo"])),
                             ParagraphStyle("ta", fontName="Helvetica-Bold",
                                            fontSize=10, leading=13.5, textColor=TINTA))]],
                 colWidths=[2.25 * cm, LARG_UTIL - 2.25 * cm])
    topo.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("LEFTPADDING", (1, 0), (1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    f.append(KeepTogether([topo, Spacer(1, 0.14 * cm)]))

    # local
    local = Table([[Paragraph(
        "<font face='Courier' size='7.6'><b>%s</b> &nbsp;linha(s) %s</font>"
        % (esc(a["arquivo"]), esc(a["linhas"])), E["celula"])]],
        colWidths=[LARG_UTIL])
    local.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    f.append(local)
    f.append(Spacer(1, 0.14 * cm))
    f.append(bloco_codigo(a["trecho"], LARG_UTIL))
    f.append(Spacer(1, 0.18 * cm))

    def campo(rotulo, texto):
        r = Paragraph("<b>%s</b>" % rotulo, ParagraphStyle(
            "rc", fontName="Helvetica-Bold", fontSize=7.6, leading=10.5,
            textColor=TINTA_FRACA))
        return [r, Paragraph(esc(texto), E["corpo_p"])]

    linhas = [campo("POR QUE É EXPLORÁVEL", a["porque"]),
              campo("IMPACTO", a["impacto"])]
    if a.get("condicao"):
        linhas.append(campo("CONDIÇÃO DE EXPLORABILIDADE", a["condicao"]))
    linhas.append(campo("CORREÇÃO SUGERIDA", a["correcao"]))
    linhas.append(campo("COMO FOI VERIFICADO", a["verificacao"]))

    t = Table(linhas, colWidths=[3.55 * cm, LARG_UTIL - 3.55 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.35, LINHA),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    f.append(t)
    f.append(Spacer(1, 0.42 * cm))
    return f


def secao_recomendacoes():
    f = [Paragraph("6. Recomendações priorizadas", E["h1"])]
    f.append(Paragraph(
        "A ordem não é por severidade isolada, é por quanto risco cada correção remove por "
        "unidade de esforço. P1 são as quatro mudanças que, sozinhas, fecham a quebra de "
        "multi-tenant; nenhuma delas exige refatoração.", E["corpo"]))
    f.append(Spacer(1, 0.2 * cm))

    cores_p = {"P1": A.CORES["critica"], "P2": A.CORES["alta"],
               "P3": A.CORES["media"], "P4": A.CORES["baixa"]}
    for r in A.RECOMENDACOES:
        cab = Table([[
            Paragraph("<font color='white'><b>%s</b></font>" % r["p"],
                      ParagraphStyle("pp", fontName="Helvetica-Bold", fontSize=11,
                                     leading=14, textColor=colors.white,
                                     alignment=TA_CENTER)),
            Paragraph("<font color='white'>%s</font>" % esc(r["prazo"]),
                      ParagraphStyle("pz", fontName="Helvetica-Bold", fontSize=8.6,
                                     leading=13, textColor=colors.white)),
        ]], colWidths=[1.5 * cm, LARG_UTIL - 1.5 * cm])
        cab.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(cores_p[r["p"]])),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))

        linhas = []
        for i, (acao, ref) in enumerate(r["itens"], 1):
            linhas.append([
                Paragraph("<b>%d.</b>" % i, E["celula"]),
                Paragraph(esc(acao), E["celula"]),
                Paragraph("<font face='Courier' size='7'>%s</font>" % esc(ref), E["celula"]),
            ])
        t = Table(linhas, colWidths=[0.75 * cm, LARG_UTIL - 0.75 * cm - 3.3 * cm, 3.3 * cm])
        t.setStyle(TableStyle([
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, FUNDO_SUAVE]),
            ("BOX", (0, 0), (-1, -1), 0.4, LINHA),
            ("LINEBELOW", (0, 0), (-1, -2), 0.35, LINHA),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        f.append(KeepTogether([cab, t, Spacer(1, 0.35 * cm)]))
    return f


# ───────────────────────── issues do github ─────────────────────────

def markdown_issue(issue):
    por_id = {a["id"]: a for a in A.ACHADOS}
    itens = [por_id[i] for i in issue["achados"]]
    sev = issue["sev"]

    L = []
    L.append("## [Segurança] %s" % issue["titulo"])
    L.append("")
    L.append("**Labels:** `security`, `severidade:%s`%s"
             % (sev, ", `multi-tenant`" if sev in ("critica", "alta") else ""))
    L.append("")
    L.append("### Problema")
    L.append("")
    for a in itens:
        if len(itens) > 1:
            L.append("**%s - %s**" % (a["id"], a["titulo"]))
            L.append("")
        L.append(a["porque"])
        L.append("")
    L.append("### Evidência")
    L.append("")
    for a in itens:
        L.append("`%s` (linhas %s):" % (a["arquivo"], a["linhas"]))
        L.append("")
        L.append("```")
        for ln in a["trecho"].split("\n"):
            L.append(ln)
        L.append("```")
        L.append("")
        L.append("_Verificado assim:_ %s" % a["verificacao"])
        L.append("")
    L.append("### Impacto")
    L.append("")
    for a in itens:
        L.append("- %s" % a["impacto"])
    if any(a.get("condicao") for a in itens):
        L.append("")
        for a in itens:
            if a.get("condicao"):
                L.append("> **Condição de explorabilidade (%s):** %s" % (a["id"], a["condicao"]))
    L.append("")
    L.append("### Correção sugerida")
    L.append("")
    for a in itens:
        if len(itens) > 1:
            L.append("**%s:** %s" % (a["id"], a["correcao"]))
        else:
            L.append(a["correcao"])
        L.append("")
    L.append("### Critérios de aceite")
    L.append("")
    vistos = set()
    for a in itens:
        for c in a["aceite"]:
            if c not in vistos:
                vistos.add(c)
                L.append("- [ ] %s" % c)
    L.append("- [ ] Existe teste automatizado que falha se a condição voltar")
    return "\n".join(L)


def secao_issues():
    f = [PageBreak(), Paragraph("7. Issues para o GitHub", E["h1"])]
    f.append(Paragraph(
        "Cada bloco abaixo é o texto completo de uma issue em Markdown, pronto para copiar e "
        "colar. Achados triviais do mesmo tema foram agrupados numa issue única para não "
        "gerar spam \u2014 por exemplo, os quatro sinks de HTML sem sanitização viram uma issue só, "
        "porque a correção é a mesma peça de código. São <b>%d issues</b> para <b>%d achados"
        "</b>." % (len(A.ISSUES), len(A.ACHADOS)), E["corpo"]))
    f.append(Spacer(1, 0.25 * cm))

    for issue in A.ISSUES:
        md = markdown_issue(issue)
        abre = Paragraph(
            "<font face='Courier' size='7.6' color='#B91C1C'><b>--- ISSUE %d ---</b></font>"
            % issue["n"], E["celula"])
        fecha = Paragraph(
            "<font face='Courier' size='7.6' color='#B91C1C'><b>--- FIM ISSUE %d ---</b></font>"
            % issue["n"], E["celula"])

        corpo = []
        for ln in md.split("\n"):
            limite = 104
            partes = []
            while len(ln) > limite:
                corte = ln.rfind(" ", 0, limite)
                if corte < 40:
                    corte = limite
                partes.append(ln[:corte])
                ln = "  " + ln[corte:].lstrip()
            partes.append(ln)
            for p in partes:
                corpo.append(esc(p).replace(" ", "&nbsp;") or "&nbsp;")

        # Uma linha de tabela por linha de texto: tabelas multi-linha do reportlab
        # se dividem entre páginas, o que um único Paragraph gigante não faz.
        cx = Table([[Paragraph(ln, E["issue"])] for ln in corpo],
                   colWidths=[LARG_UTIL], splitByRow=1)
        cx.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAF9")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D6D3D1")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, 0), 7),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
        ]))

        f.append(CondPageBreak(5 * cm))
        f.append(abre)
        f.append(Spacer(1, 0.1 * cm))
        f.append(cx)
        f.append(Spacer(1, 0.1 * cm))
        f.append(fecha)
        f.append(Spacer(1, 0.5 * cm))
    return f


# ───────────────────────── montagem ─────────────────────────

def main():
    png_rosca = grafico_rosca()
    png_barras = grafico_barras()

    hist = []
    hist.extend(secao_capa())
    hist.append(PageBreak())
    hist.extend(secao_metodologia())
    hist.append(PageBreak())
    hist.extend(secao_resumo(png_rosca, png_barras))
    hist.append(PageBreak())
    hist.extend(secao_fortes_fracos())
    hist.append(PageBreak())
    hist.extend(secao_detalhe())
    hist.append(PageBreak())
    hist.extend(secao_recomendacoes())
    hist.extend(secao_issues())

    doc = Documento(SAIDA)
    # a primeira página usa o template Capa; o resto, Corpo
    from reportlab.platypus import NextPageTemplate
    hist.insert(0, NextPageTemplate("Corpo"))
    doc.build(hist)

    # As mesmas issues em Markdown puro: colar em massa no GitHub sem
    # depender de copiar do PDF.
    md = ["<!-- Gerado por docs/security-audit/gerar_relatorio.py. Nao editar a mao: "
          "a fonte e achados.py. -->",
          "# Issues de seguranca — %s" % A.PROJETO,
          "",
          "%d issues para %d achados. Cada bloco entre `--- ISSUE n ---` e "
          "`--- FIM ISSUE n ---` e o corpo completo de uma issue."
          % (len(A.ISSUES), len(A.ACHADOS)),
          ""]
    for issue in A.ISSUES:
        md.append("--- ISSUE %d ---" % issue["n"])
        md.append("")
        md.append(markdown_issue(issue))
        md.append("")
        md.append("--- FIM ISSUE %d ---" % issue["n"])
        md.append("")
    with open(SAIDA_MD, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))

    print("PDF gerado:      %s" % SAIDA)
    print("Issues .md:      %s" % SAIDA_MD)
    print("Achados: %d | Pontos fortes: %d | Issues: %d"
          % (len(A.ACHADOS), len(A.PONTOS_FORTES), len(A.ISSUES)))


if __name__ == "__main__":
    main()
