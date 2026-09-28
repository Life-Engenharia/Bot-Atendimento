from docx import Document
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfbase.pdfmetrics import stringWidth
from pathlib import Path

SRC=Path('output/docx/Proposta_Final_Piloto_WhatsApp_Life.docx')
OUT=Path('output/pdf/Proposta_Final_Piloto_WhatsApp_Life.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)
CHAR=colors.HexColor('#272727'); INK=colors.HexColor('#333333'); TERR=colors.HexColor('#9D4C36'); SAND=colors.HexColor('#F3EEE6'); PALE=colors.HexColor('#FBF9F6'); LINE=colors.HexColor('#D8D0C6'); MUTED=colors.HexColor('#686868')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='PBody', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.6, leading=13.2, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name='H1Exec', parent=styles['Heading1'], fontName='Times-Bold', fontSize=18, leading=23, textColor=CHAR, spaceBefore=14, spaceAfter=8))
styles.add(ParagraphStyle(name='H2Exec', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11.2, leading=14, textColor=TERR, spaceBefore=9, spaceAfter=5))
styles.add(ParagraphStyle(name='ListExec', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.4, leading=12.5, leftIndent=15, firstLineIndent=-9, bulletIndent=3, textColor=INK, spaceAfter=3))
styles.add(ParagraphStyle(name='CoverLabel', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=TERR, spaceAfter=18))
styles.add(ParagraphStyle(name='CoverTitle', fontName='Times-Bold', fontSize=28, leading=33, textColor=CHAR, spaceAfter=11))
styles.add(ParagraphStyle(name='CoverSub', fontName='Helvetica', fontSize=12, leading=17, textColor=MUTED, spaceAfter=28))
styles.add(ParagraphStyle(name='CoverFoot', fontName='Helvetica', fontSize=10, leading=15, textColor=INK, spaceAfter=5))

def esc(s): return (s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('\n','<br/>'))
def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(LINE); canvas.setLineWidth(.35); canvas.line(.72*inch,.53*inch,7.78*inch,.53*inch)
    canvas.setFont('Helvetica',8); canvas.setFillColor(colors.HexColor('#777777')); canvas.drawRightString(7.78*inch,.34*inch, f'Life Engenharia  |  Proposta final  |  {doc.page}')
    canvas.restoreState()
def make_table(rows):
    compact = bool(rows and rows[0] and rows[0][0].startswith('Item de decisão'))
    cell_size = 7.55 if compact else 8.15
    cell_leading = 9.1 if compact else 10.2
    data=[]
    for row in rows:
        data.append([Paragraph(esc(c), ParagraphStyle('cell', parent=styles['PBody'], fontSize=cell_size, leading=cell_leading, spaceAfter=0)) for c in row])
    n=len(data[0]); widths=[6.35*inch/n]*n
    if n==2: widths=[1.45*inch,4.90*inch]
    elif n==3: widths=[.92*inch,3.75*inch,1.68*inch]
    elif n==4: widths=[1.12*inch,1.06*inch,1.06*inch,3.11*inch]
    t=Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    pad = 3.5 if compact else 5
    cmds=[('BACKGROUND',(0,0),(-1,0),CHAR),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,0),8.2),('LEADING',(0,0),(-1,0),10),('GRID',(0,0),(-1,-1),.35,LINE),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),pad),('BOTTOMPADDING',(0,0),(-1,-1),pad)]
    for r in range(1,len(data)):
        if r%2==0: cmds.append(('BACKGROUND',(0,r),(-1,r),PALE))
    t.setStyle(TableStyle(cmds)); return t

src=Document(SRC); story=[]
# bespoke cover
story += [Spacer(1,.55*inch), Paragraph('LIFE ENGENHARIA  •  DOCUMENTO PARA APROVAÇÃO',styles['CoverLabel']), Paragraph('Proposta final do piloto de atendimento por WhatsApp',styles['CoverTitle']), Paragraph('Arquitetura, operação, custos, cronograma e critérios para iniciar um piloto controlado de 5 a 10 clientes.',styles['CoverSub'])]
cover=Table([[Paragraph('<b>DECISÃO SOLICITADA</b><br/>Aprovar o plano de execução, a faixa de custos e as pendências de governança antes de qualquer contratação, compra ou publicação em produção.',styles['PBody']),Paragraph('<b>ESCOPO INICIAL</b><br/>Número oficial no WhatsApp, três rotas de atendimento, operação humana por WhatsApp privado, Ploomes apenas no comercial e piloto de 5 a 10 clientes.',styles['PBody'])]],colWidths=[3.15*inch,3.2*inch])
cover.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),SAND),('GRID',(0,0),(-1,-1),.45,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12)])); story += [cover,Spacer(1,2.05*inch),Paragraph('Preparado por João Victor Vasconcelos  |  Engenharia de Software',styles['CoverFoot']),Paragraph('Versão para validação da Life  |  25 de setembro de 2026',styles['CoverFoot']),PageBreak()]

seen_title=False
for item in src.element.body:
    if item.tag.endswith('}p'):
        from docx.text.paragraph import Paragraph as DocxParagraph
        para=DocxParagraph(item,src); val=para.text.strip()
        if not val: continue
        sty=para.style.name
        if val == 'Decisão e resumo executivo':
            seen_title=True
        if not seen_title:
            continue
        if sty=='Title' or sty=='Subtitle':
            continue
        if sty.startswith('Heading 1'):
            story.append(Paragraph(esc(val),styles['H1Exec']))
        elif sty.startswith('Heading 2'):
            story.append(Paragraph(esc(val),styles['H2Exec']))
        elif 'List Bullet' in sty:
            story.append(Paragraph(esc(val),styles['ListExec'],bulletText='•'))
        else:
            story.append(Paragraph(esc(val),styles['PBody']))
    elif item.tag.endswith('}tbl'):
        if not seen_title:
            continue
        from docx.table import Table as DocxTable
        tbl=DocxTable(item,src); rows=[[cell.text.strip() for cell in row.cells] for row in tbl.rows]
        if rows: story += [Spacer(1,3),make_table(rows),Spacer(1,7)]

doc=SimpleDocTemplate(str(OUT),pagesize=letter,rightMargin=.72*inch,leftMargin=.72*inch,topMargin=.68*inch,bottomMargin=.65*inch,title='Proposta Final Piloto WhatsApp Life',author='João Victor Vasconcelos')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
