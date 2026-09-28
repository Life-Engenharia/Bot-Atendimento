from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE
from pathlib import Path

OUT = Path('output/docx/Proposta_Final_Piloto_WhatsApp_Life.docx')
OUT.parent.mkdir(parents=True, exist_ok=True)

CHARCOAL = '272727'; INK = '333333'; TERRACOTTA = '9D4C36'; SAND = 'F3EEE6'; PALE = 'FBF9F6'; LINE = 'D8D0C6'; OLIVE = '69705A'; WHITE = 'FFFFFF'

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), fill); tcPr.append(shd)
def border_cell(cell, color=LINE):
    tcPr = cell._tc.get_or_add_tcPr(); borders = tcPr.first_child_found_in('w:tcBorders')
    if borders is None: borders = OxmlElement('w:tcBorders'); tcPr.append(borders)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        el = OxmlElement('w:'+edge); el.set(qn('w:val'),'single'); el.set(qn('w:sz'),'6'); el.set(qn('w:color'),color); borders.append(el)
def set_cell_margin(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr(); mar = tcPr.first_child_found_in('w:tcMar')
    if mar is None: mar = OxmlElement('w:tcMar'); tcPr.append(mar)
    for side, val in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        e = OxmlElement('w:'+side); e.set(qn('w:w'),str(val)); e.set(qn('w:type'),'dxa'); mar.append(e)
def set_repeat_table_header(row):
    trPr = row._tr.get_or_add_trPr(); el = OxmlElement('w:tblHeader'); el.set(qn('w:val'),'true'); trPr.append(el)
def set_width(cell, inches):
    cell.width = Inches(inches)
def set_run(run, size=10.5, bold=False, color=INK, font='Liberation Sans'):
    run.font.name = font; run._element.rPr.rFonts.set(qn('w:eastAsia'), font); run.font.size = Pt(size); run.font.bold = bold; run.font.color.rgb = RGBColor.from_string(color)
def text(cell, value, size=9.2, bold=False, color=INK, align=None):
    p=cell.paragraphs[0]; p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=1.1
    if align is not None: p.alignment=align
    r=p.add_run(value); set_run(r,size,bold,color)
def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r=paragraph.add_run('Life Engenharia  |  Proposta final  |  '); set_run(r,8,False,'777777')
    fldChar1=OxmlElement('w:fldChar'); fldChar1.set(qn('w:fldCharType'),'begin')
    instrText=OxmlElement('w:instrText'); instrText.set(qn('xml:space'),'preserve'); instrText.text='PAGE'
    fldChar2=OxmlElement('w:fldChar'); fldChar2.set(qn('w:fldCharType'),'end')
    r._r.append(fldChar1); r._r.append(instrText); r._r.append(fldChar2)

doc=Document()
sec=doc.sections[0]; sec.top_margin=Inches(.72); sec.bottom_margin=Inches(.62); sec.left_margin=Inches(.72); sec.right_margin=Inches(.72)
styles=doc.styles
normal=styles['Normal']; normal.font.name='Liberation Sans'; normal._element.rPr.rFonts.set(qn('w:eastAsia'),'Liberation Sans'); normal.font.size=Pt(10.5); normal.font.color.rgb=RGBColor.from_string(INK); normal.paragraph_format.space_after=Pt(6); normal.paragraph_format.line_spacing=1.13
for n,size,color in [('Title',29,CHARCOAL),('Heading 1',18,CHARCOAL),('Heading 2',12,TERRACOTTA),('Subtitle',12,'5F5F5F')]:
    s=styles[n]; s.font.name='Liberation Serif' if n in ('Title','Heading 1') else 'Liberation Sans'; s._element.rPr.rFonts.set(qn('w:eastAsia'),s.font.name); s.font.size=Pt(size); s.font.color.rgb=RGBColor.from_string(color); s.font.bold=(n!='Subtitle'); s.paragraph_format.space_before=Pt(15 if n!='Title' else 0); s.paragraph_format.space_after=Pt(7)
footer=sec.footer.paragraphs[0]; add_page_number(footer)

def p(value='', style=None, boldlead=None):
    x=doc.add_paragraph(style=style); x.paragraph_format.space_after=Pt(6)
    if boldlead and value.startswith(boldlead):
        r=x.add_run(boldlead); set_run(r,10.5,True,CHARCOAL); r=x.add_run(value[len(boldlead):]); set_run(r,10.5)
    else: r=x.add_run(value); set_run(r,10.5)
    return x
def heading(value, level=1): return doc.add_paragraph(value, style='Heading '+str(level))
def bullets(items):
    for item in items:
        x=doc.add_paragraph(style='List Bullet'); x.paragraph_format.space_after=Pt(3); x.paragraph_format.left_indent=Inches(.22); x.paragraph_format.first_line_indent=Inches(-.16); r=x.add_run(item); set_run(r,10.2)
def table(headers, rows, widths=None, font=8.7):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.style='Table Grid'; t.autofit=False
    for i,h in enumerate(headers):
        c=t.rows[0].cells[i]; shade(c,CHARCOAL); border_cell(c); set_cell_margin(c); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; text(c,h,8.5,True,WHITE,WD_ALIGN_PARAGRAPH.CENTER)
        if widths: set_width(c,widths[i])
    set_repeat_table_header(t.rows[0])
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,v in enumerate(row):
            if ri%2==1: shade(cells[i],PALE)
            border_cell(cells[i]); set_cell_margin(cells[i]); cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; text(cells[i],str(v),font,False,INK,WD_ALIGN_PARAGRAPH.LEFT)
            if widths: set_width(cells[i],widths[i])
    doc.add_paragraph().paragraph_format.space_after=Pt(2)
    return t
def page(): doc.add_page_break()

# Cover
doc.add_paragraph().paragraph_format.space_after=Pt(28)
lab=doc.add_paragraph(); lab.paragraph_format.space_after=Pt(16); r=lab.add_run('LIFE ENGENHARIA  •  DOCUMENTO PARA APROVAÇÃO'); set_run(r,9,True,TERRACOTTA)
doc.add_paragraph('Proposta final do piloto de atendimento por WhatsApp', style='Title')
p('Arquitetura, operação, custos, cronograma e critérios para iniciar um piloto controlado de 5 a 10 clientes.', style='Subtitle')
doc.add_paragraph().paragraph_format.space_after=Pt(40)
table(['DECISÃO SOLICITADA','ESCOPO INICIAL'], [[
    'Aprovar o plano de execução, a faixa de custos e as pendências de governança antes de qualquer contratação, compra ou publicação em produção.',
    'Número oficial no WhatsApp, três rotas de atendimento, operação humana por WhatsApp privado, Ploomes apenas no comercial e piloto de 5 a 10 clientes.'
]], [3.2,3.2], 10)
doc.add_paragraph().paragraph_format.space_after=Pt(52)
p('Preparado por João Victor Vasconcelos  |  Engenharia de Software', boldlead='Preparado por ')
p('Versão para validação da Life  |  25 de setembro de 2026')
page()

heading('Decisão e resumo executivo')
p('Esta proposta consolida os ajustes solicitados para o piloto. A recomendação é avançar apenas após a Life aprovar os responsáveis, backups, horários, regras de P1 e P2, tratamento de dados e a confirmação operacional da API do Ploomes.')
heading('O que será entregue',2)
bullets([
    'Atendimento pelo número oficial da Life usando a Meta WhatsApp Cloud API.',
    'Menu com rota comercial, rota de assistência para cliente Life e transferência direta para pessoa.',
    'Submenu comercial com limpeza de dutos, PMOC, assistência avulsa, projetos de engenharia, Engenharia Clínica, locação de chillers, venda de chiller novo, Banco de Sangue, calibração de equipamentos e instrumentos de medição e outros serviços.',
    'Triagem assistida por IA para texto, foto, documento e áudio; a IA não diagnostica, não classifica risco de forma definitiva e não substitui a decisão humana.',
    'Operação interna por bot privado no WhatsApp para comercial, técnico, plantão, backup, coordenação e administração; não haverá dashboard de indicadores no piloto.',
    'Ploomes exclusivamente para criação ou atualização de lead e oportunidade comercial. A assistência técnica fica na fila humana nesta fase.'
])
heading('Premissas que ainda exigem aceite',2)
table(['Tema','Situação para o piloto'],[
['P1 e P2','5 minutos para P1 e 15 minutos para P2 são metas propostas. Entram em vigor somente após a Life definir principal, backup, horário e plantão.'],
['Ploomes','A documentação indica que a integração é viável. A disponibilidade no plano, o usuário de integração e qualquer custo adicional dependem de confirmação de Anderson e da equipe Ploomes.'],
['LGPD','Retenção, base legal, fluxo de incidentes e tratamento de dados de pacientes e doadores exigem validação da Administração e do Jurídico antes de produção.'],
['Contas','Meta, Google Cloud, Supabase, GitHub, OpenAI e Ploomes serão criadas ou mantidas em nome e sob controle institucional da Life.']
],[1.25,5.15])
page()

heading('Fluxo do cliente e operação interna')
heading('Menu apresentado no WhatsApp',2)
table(['Opção','Tratamento'],[
['1  Contratar serviço ou solicitar orçamento','Coleta serviço e dados mínimos. Cria ou atualiza oportunidade comercial no Ploomes após confirmação da API.'],
['2  Já sou cliente Life e preciso de assistência técnica','Confirma contrato ou histórico. Coleta contexto e envia para fila humana; não integra com sistema técnico nesta fase.'],
['3  Falar com uma pessoa','Registra protocolo e direciona imediatamente à fila compatível.']
],[2.35,4.05],9.2)
p('Quando o cliente pedir assistência sem contrato ou sem histórico Life, o atendimento não reinicia: os dados já coletados são preservados e a demanda segue como oportunidade comercial de assistência avulsa.')
heading('Como a equipe trabalha sem dashboard',2)
p('Cada colaborador opera com seu próprio número corporativo previamente cadastrado. O bot identifica o número de origem e apresenta somente comandos do cargo. O cliente continua conversando exclusivamente com o número oficial da Life.')
table(['Perfil','Ações no bot privado'],[
['Comercial','Receber e assumir oportunidades, consultar triagem, responder pelo canal oficial, atualizar retorno e transferir.'],
['Técnico e plantão','Receber chamados, confirmar P1/P2, consultar resumo e anexos autorizados, registrar ação e transferir.'],
['Backup','Receber escalonamento quando o principal não confirma e assumir o caso.'],
['Coordenação','Acompanhar pendências, designar responsável, transferir e encerrar protocolos.'],
['Administração','Cadastrar e inativar números, escalas, permissões, responsáveis e backups; consultar auditoria.']
],[1.35,5.05])
page()

heading('Arquitetura e hospedagem')
p('A solução inicia com componentes gerenciados, evitando servidor permanente e reduzindo a carga operacional. O backend é preparado para crescer sem troca de arquitetura.')
table(['Camada','Tecnologia e finalidade','Propriedade'],[
['Canal','Meta WhatsApp Cloud API e Webhooks para mensagens, anexos e eventos.','Meta Business da Life'],
['Aplicação','Node.js, TypeScript e Fastify em contêiner Docker. Aplica menus, protocolos, regras e escalonamento.','Repositório GitHub da Life'],
['Deploy','Google Cloud Run em São Paulo southamerica east1. Mínimo de zero instâncias e cobrança por uso.','Projeto Google Cloud da Life'],
['Dados','Supabase Pro com PostgreSQL gerenciado para protocolos, filas, equipes, auditoria e dados relacionais.','Organização Supabase da Life'],
['Arquivos','Supabase Storage com links privados temporários; cópia de backup cifrada no Google Cloud Storage.','Contas da Life'],
['IA','OpenAI API para texto, imagem, documento e transcrição de áudio. Uso exclusivo pelo backend.','Projeto OpenAI da Life'],
['Segredos','Google Secret Manager para chaves e tokens. Nenhum segredo no código, chat ou notebook pessoal.','Projeto Google Cloud da Life']
],[.85,3.8,1.75],8.7)
heading('Por que Supabase com PostgreSQL',2)
p('O atendimento possui relações que precisam permanecer consistentes: cliente, unidade, protocolo, prioridade, responsável, backup, histórico de mensagens e auditoria. PostgreSQL protege melhor essas relações do que um modelo NoSQL puro. O Supabase reduz a operação ao entregar PostgreSQL gerenciado, autenticação e armazenamento de anexos sob uma mesma governança. NoSQL seria útil para cache ou eventos em grande escala, mas não é necessário no piloto.')
heading('Solução para a conta Google Cloud',2)
p('A Life deve criar uma organização e projeto próprios, habilitar faturamento com cartão ou centro de custo institucional, conceder acesso individual por papel e ativar orçamento com alertas. O projeto terá ambientes separados de homologação e produção, Cloud Run, Artifact Registry, Secret Manager, Cloud Storage para cópia de backup e Cloud Logging. João recebe acesso técnico de menor privilégio e revogável.')
page()

heading('Ploomes, IA e notebook de desenvolvimento')
heading('Confirmação necessária do Ploomes',2)
p('A integração prevista é limitada ao comercial. Antes de ativar, Anderson e a equipe Ploomes precisam confirmar que o plano da Life permite uma chave de usuário de integração, acesso à API e eventual custo adicional. A documentação pública indica autenticação por User Key e endpoints para contatos e oportunidades, com limite de 120 requisições por minuto compartilhado na conta.')
table(['Dados e ações previstas','Uso no piloto'],[
['Contatos','Localizar por telefone ou e-mail; criar ou atualizar nome, empresa, telefone e e-mail quando houver confirmação do cliente.'],
['Oportunidades','Criar ou atualizar oportunidade com serviço, unidade, necessidade, prazo, protocolo Life e responsável comercial.'],
['Catálogos','Consultar funis, estágios, usuários, equipes, campos e tags para mapear o fluxo comercial existente.'],
['Resiliência','Registrar tentativa, idempotência e falha. Se o Ploomes indisponibilizar, manter protocolo local e alertar o Comercial.']
],[2.25,4.15],9)
p('Custo Ploomes: a confirmar. Não foi incluído nas estimativas porque depende do contrato atual da Life e de eventual habilitação da API.')
heading('Ferramenta de IA sugerida para a equipe técnica',2)
p('Para apoio ao desenvolvimento e revisão de documentos, a sugestão é Claude Pro para uso individual institucional ou Claude Team quando houver ao menos cinco usuários e necessidade de administração central. Claude Pro custa US$ 20 por mês; Claude Team custa US$ 30 por usuário/mês no plano mensal, com mínimo de cinco usuários. Não é parte do bot e não substitui a OpenAI API de produção.')
bullets(['Usar contas corporativas, MFA e cobrança da Life.', 'Não enviar conversas, anexos ou dados pessoais reais de clientes à ferramenta de apoio.', 'Restringir uso a código, documentação sanitizada e testes com dados fictícios.'])
heading('Notebook recomendado',2)
p('Recomendação de compra: VAIO FE16 com Ryzen 7 5825U ou equivalente superior, 16 GB de RAM, SSD NVMe de 512 GB, tela 16 polegadas WUXGA, Wi Fi 6 e possibilidade de expansão para 24 ou 32 GB. É adequado para Docker, containers, backend Node.js, banco local, emulador móvel leve e ferramentas de desenvolvimento.')
table(['Item','Orçamento indicativo'],[['VAIO FE16, 16 GB, SSD 512 GB, novo','R$ 4.300 a R$ 4.500, sujeito à cotação e à confirmação da RAM expansível.'],['Compra','Somente após aprovação formal da Life; nota fiscal e garantia em nome da Life.']],[2.55,3.85],9.2)
page()

heading('Segurança, backup e LGPD')
heading('Política inicial de backup',2)
table(['Componente','Regra inicial'],[
['Banco de produção','Backup diário do Supabase Pro com retenção nativa de 7 dias. Exportação cifrada semanal para bucket da Life, com retenção de 30 dias.'],
['Anexos','Cópia cifrada diária para bucket privado; retenção inicial de 30 dias para cópias, sujeita à validação da Life.'],
['Restauração','Teste antes da produção e teste mensal durante o piloto. Meta proposta: RPO de até 24 horas e RTO de até 4 horas.'],
['Falhas','Alerta para backup ausente, falha de cópia e teste de restauração. A falha abre pendência para Administração e tecnologia.']
],[1.35,5.05],9)
heading('Controles de segurança',2)
bullets([
    'Acesso por perfil e princípio do menor privilégio. Números não cadastrados não recebem dados operacionais.',
    'MFA para administradores e contas de nuvem; credenciais individuais, nunca compartilhadas.',
    'Trilha de auditoria com protocolo, usuário, data, ação, responsável anterior e novo responsável.',
    'Anexos privados, criptografia em trânsito e em repouso, URLs temporárias e acesso limitado ao caso autorizado.',
    'Homologação e produção isoladas; testes apenas com dados fictícios ou anonimizados.',
    'Alertas de consumo para Meta, OpenAI, Supabase e Google Cloud, além de alertas de falha de integração e P1/P2 sem confirmação.'
])
heading('LGPD antes da produção',2)
p('A Life será a controladora dos dados e deverá validar, com Administração e Jurídico, a base legal, aviso de privacidade, responsáveis pelo tratamento, canal para titulares, retenção e descarte. Dados de pacientes, doadores, prontuários e demais dados sensíveis não serão solicitados no fluxo padrão. Se chegarem espontaneamente, o bot limita a exposição e encaminha o caso à equipe humana. Nenhum dado real deve ser usado em homologação.')
page()

heading('Cronograma, responsabilidades e critérios de aceite')
table(['Etapa','Duração e esforço','Responsável','Aceite'],[
['1  Regras e governança','1 semana  |  12 a 16 h','Life e desenvolvimento','Menu, segmentos, responsáveis, backups, horários, P1/P2 e LGPD pendente formalmente registrados.'],
['2  Base técnica','1 semana  |  18 a 24 h','Desenvolvimento','Contas Life, ambientes, banco, webhook, segredos, auditoria e alertas configurados.'],
['3  Fluxos e Ploomes comercial','1 semana  |  20 a 28 h','Desenvolvimento e Comercial','Rota comercial, assistência avulsa e contingência Ploomes testadas; atendimento técnico sem integração Ploomes.'],
['4  Operação interna no WhatsApp','1 semana  |  22 a 30 h','Desenvolvimento e Operação','Perfis, fila, confirmação P1/P2, escalonamento, anexos e transferência validados.'],
['5  Testes e entrada controlada','1 semana  |  16 a 22 h','Life e desenvolvimento','Pelo menos 20 cenários aprovados e grupo de 5 a 10 clientes definido.']
],[1.45,1.3,1.25,2.35],8.25)
p('Esforço total estimado: 88 a 120 horas em cinco semanas, contado a partir da aprovação e da entrega das informações que dependem da Life. O desenvolvimento deve ser contratado pela taxa comercial acordada; ele não está incluído nos custos mensais abaixo.')
heading('Responsáveis a nomear pela Life antes da ativação',2)
table(['Área','Informação obrigatória'],[
['Comercial','Principal e backup, telefone corporativo, horário de atendimento e regra de distribuição.'],
['Assistência técnica','Principal e backup por turno, telefones, cobertura e contingência.'],
['Plantão','Responsável e backup de P1/P2, horários e canal alternativo se WhatsApp indisponível.'],
['Administração e LGPD','Aprovador de acesso, retenção, incidente e contato jurídico.']
],[1.65,4.7],9)
page()

heading('Custos e condições para aprovação')
p('Valores de referência em 25 de setembro de 2026. Conversão usada apenas para orçamento: US$ 1 = R$ 5,50. Não inclui impostos, IOF, suporte recorrente, desenvolvimento, aquisição do notebook nem eventual custo do Ploomes.')
table(['Componente','Piloto 5 a 10 clientes','Projeção 100 clientes'],[
['Supabase Pro produção','R$ 137,50','R$ 137,50 ou mais'],
['Homologação Supabase','R$ 0 a R$ 55','R$ 55'],
['Google Cloud Run, registro, segredos, logs e cópia de backup','R$ 2 a R$ 30','R$ 10 a R$ 60'],
['OpenAI API para texto, imagem, documento e áudio','R$ 5 a R$ 15','R$ 30 a R$ 90'],
['Meta WhatsApp Cloud API','R$ 5 a R$ 20','R$ 70 ou mais'],
['GitHub Team','R$ 66  |  3 usuários','R$ 110  |  5 usuários'],
['Ploomes','A confirmar no plano Life','A confirmar no plano Life'],
['TOTAL TÉCNICO ESTIMADO','R$ 215 a R$ 324 por mês','R$ 410 a R$ 560 por mês']
],[3.5,1.45,1.45],8.6)
heading('Itens únicos e condicionais',2)
table(['Item','Previsão'],[
['Notebook de desenvolvimento','R$ 4.300 a R$ 4.500, mediante cotação, garantia e aprovação da Life.'],
['Claude Pro','US$ 20 por mês por usuário institucional; opcional, para desenvolvimento e documentação.'],
['Claude Team','US$ 30 por usuário/mês no plano mensal, mínimo de 5 usuários; alternativa corporativa opcional.'],
['Ploomes','Custo e contratação dependem da confirmação do plano atual; sem inclusão nesta proposta.']
],[2.1,4.3],9)
p('O custo final da Meta é definido pelo rate card aplicável à conta da Life, categoria e destino das mensagens. O consumo da OpenAI deve ter teto mensal e alertas. Antes de ativar produção, a Life receberá a lista final de contas, orçamento, permissões e valores vigentes para aprovação.')
page()

heading('Aprovação para prosseguimento')
p('A aprovação desta versão autoriza somente a preparação técnica, homologação e teste interno. Não autoriza contratação, compra do notebook, cobrança em produção ou publicação do canal até que a Life aprove expressamente cada item aplicável.')
table(['Item de decisão','Decisão da Life'],[
['Escopo do piloto e menu comercial','(   ) Aprovar   (   ) Ajustar   (   ) Não aprovar'],
['Grupo inicial de 5 a 10 clientes','(   ) Definir e aprovar antes da liberação'],
['Matriz de responsáveis, backups, horários e P1/P2','(   ) Anexar e aprovar antes da ativação'],
['Política inicial de backup','(   ) Aprovar como referência   (   ) Ajustar'],
['LGPD, retenção e dados sensíveis','(   ) Encaminhar Administração e Jurídico antes de produção'],
['Ploomes, Google Cloud, Supabase, Meta, GitHub e OpenAI','(   ) Criar ou validar contas institucionais antes da homologação'],
['Custos e cronograma','(   ) Aprovar   (   ) Revisar antes de contratação']
],[3.25,3.15],9)
doc.add_paragraph().paragraph_format.space_after=Pt(22)
p('Responsável Life: ________________________________________________________________')
p('Cargo: ____________________________________    Data: ____ / ____ / ______')
p('Decisão geral:  (   ) Aprovar para homologação   (   ) Ajustar   (   ) Não aprovar')
doc.add_paragraph().paragraph_format.space_after=Pt(16)
p('João Victor Vasconcelos  |  Engenharia de Software')

doc.core_properties.author='João Victor Vasconcelos'
doc.core_properties.title='Proposta Final Piloto WhatsApp Life'
doc.save(OUT)
print(OUT)
