from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import fitz

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'modelo_proposta'
OUT.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold',r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialBold',italic='Arial',boldItalic='ArialBold')
navy=colors.HexColor('#183B61')
styles={
 'title':ParagraphStyle('title',fontName='ArialBold',fontSize=27,leading=32,spaceAfter=17),
 'h1':ParagraphStyle('h1',fontName='ArialBold',fontSize=19,leading=24,spaceAfter=14),
 'h2':ParagraphStyle('h2',fontName='ArialBold',fontSize=12,leading=16,spaceBefore=13,spaceAfter=7),
 'body':ParagraphStyle('body',fontName='Arial',fontSize=10,leading=14.5,spaceAfter=8,textColor=colors.HexColor('#263442')),
 'small':ParagraphStyle('small',fontName='Arial',fontSize=8.4,leading=12,spaceAfter=7,textColor=colors.HexColor('#52616D')),
 'cell':ParagraphStyle('cell',fontName='Arial',fontSize=9,leading=12),
 'head':ParagraphStyle('head',fontName='ArialBold',fontSize=9,leading=12,textColor=colors.white),
}
story=[]; md=[]
def p(text,sty='body'):
 story.append(Paragraph(escape(text),styles[sty])); md.append(('# ' if sty=='title' else '## ' if sty=='h1' else '### ' if sty=='h2' else '')+text+'\n')
def page(title):
 if story: story.append(PageBreak())
 p(title,'h1')
def tab(head,rows,widths):
 data=[[Paragraph(escape(str(x)),styles['head' if i==0 else 'cell']) for x in row] for i,row in enumerate([head]+rows)]
 t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F1F5F8')]),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
 story.extend([t,Spacer(1,9)])
 md.extend(['| '+' | '.join(head)+' |','| '+' | '.join(['---']*len(head))+' |']+['| '+' | '.join(row)+' |' for row in rows]+[''])

p('JOÃO VICTOR VASCONCELOS','small')
p('Proposta de software\ne automação'.replace('\n',' '),'title')
p('Desenvolvimento sob medida, integração de sistemas e automação de processos','body')
p('Engenheiro de Software • +55 79 99116-2353','small')
p('Cliente: [EMPRESA CLIENTE]  |  Responsável: [NOME E CARGO]')
p('Projeto: [NOME DO PROJETO]')
p('Proposta: [NÚMERO]  |  Versão: [VERSÃO]  |  Emissão: [DATA]','small')
p('Validade comercial: [DATA LIMITE]  |  Contato do proponente: [E-MAIL]','small')
p('1 Objetivo da contratação','h2')
p('Proponho desenvolver [SOLUÇÃO] para ajudar a [CLIENTE] a resolver [PROBLEMA PRINCIPAL]. A entrega permitirá que [EQUIPE OU USUÁRIO] execute [PROCESSO] com [MELHORIA ESPERADA], mantendo os controles e as aprovações definidos pela operação.')
p('2 Situação atual e resultado esperado','h2')
p('Hoje, [DESCREVER COMO O PROCESSO FUNCIONA], o que provoca [ATRASOS, RETRABALHO OU FALTA DE VISIBILIDADE]. A solução será aplicada inicialmente a [ÁREA, UNIDADE OU GRUPO DE USUÁRIOS], com expansão condicionada à avaliação da primeira entrega.')
tab(['Indicador','Situação atual','Meta e medição'],[
 ['[Tempo por atendimento ou tarefa]','[LINHA DE BASE]','[META] em [PERÍODO]'],
 ['[Retrabalho ou falhas]','[LINHA DE BASE]','[META E FONTE DOS DADOS]'],
], [181,115,195])
p('As metas orientam a avaliação do projeto. Resultados de negócio dependem também do volume, da qualidade dos dados e da adoção pela equipe; não representam garantia de faturamento ou economia.')
p('3 Resumo da oferta','h2')
p('Implantação: R$ [VALOR]  •  Prazo estimado: [PRAZO]\nSuporte contratado: [PLANO OU NÃO CONTRATADO]\nCustos de plataformas: [ESTIMATIVA E RESPONSÁVEL PELO PAGAMENTO]')

page('4 Escopo e entregas')
p('O escopo contratado corresponde aos itens e limites preenchidos abaixo. Novas funcionalidades, canais ou integrações serão avaliados por meio do processo de alteração de escopo.')
tab(['Entrega','Limite contratado','Evidência de conclusão'],[
 ['Definição da solução','[PROCESSOS E REGRAS]','Fluxos e requisitos aprovados.'],
 ['Software ou painel','[TELAS, PERFIS E FUNÇÕES]','Funções demonstradas em ambiente de validação.'],
 ['Automações','[QUANTIDADE E NOMES]','Gatilhos, resultados e exceções testados.'],
 ['Integrações','[SISTEMAS, OBJETOS E DIREÇÃO]','Dados de teste consultados ou enviados corretamente.'],
 ['Implantação e transferência','[AMBIENTES E TREINAMENTO]','Publicação, acessos e instruções entregues.'],
], [119,174,198])
p('Parâmetros de operação','h2')
p('Usuários: [NÚMERO] • Unidades: [NÚMERO] • Volume: [EXECUÇÕES OU MENSAGENS/MÊS] • Dados históricos: [VOLUME OU NÃO INCLUÍDO] • Navegadores/dispositivos: [LISTA] • Desempenho esperado e condições de medição: [DEFINIR].')
p('Automação de atendimento e IA quando contratadas','h2')
p('Definir o canal [CANAL], a base de conhecimento [FONTES], os assuntos atendidos [LISTA], as ações permitidas [LISTA] e o encaminhamento humano [REGRAS]. Para WhatsApp, especificar o número, a conta e o provedor da integração oficial.')
p('O assistente será identificado como virtual. Informações ausentes, baixa confiança e pedidos de atendimento humano seguirão a rota de encaminhamento acordada. Ações como agendamento, envio de orçamento ou alteração de cadastro terão as confirmações definidas no fluxo.')
p('Fora do escopo','h2')
p('[LISTAR EXCLUSÕES ESPECÍFICAS]. Exemplos para seleção: aplicativo móvel, migração de histórico, dashboard gerencial, novas integrações, atendimento humano, produção contínua de conteúdo e plantão 24 horas. Manter apenas as exclusões aplicáveis.')
p('Dependências para execução','h2')
p('O cliente fornecerá acessos autorizados, dados de teste, conteúdos, regras operacionais e um responsável por aprovações. APIs, licenças e contas necessárias: [LISTA]. Restrições de fornecedores serão verificadas antes da implementação correspondente.')

page('5 Execução e validação')
p('O prazo começa após o aceite comercial, o pagamento inicial previsto e a disponibilização dos acessos e informações necessários. Datas afetadas por dependências pendentes serão replanejadas e comunicadas.')
tab(['Etapa','Prazo','Marco de validação'],[
 ['1 Diagnóstico e definição','[PERÍODO]','Processo, limites e critérios aprovados.'],
 ['2 Construção','[PERÍODO]','Demonstração das funcionalidades contratadas.'],
 ['3 Integração e testes','[PERÍODO]','Cenários e tratamento de falhas validados.'],
 ['4 Piloto e homologação','[PERÍODO]','Teste com [GRUPO] e ajustes de conformidade.'],
 ['5 Publicação e orientação','[PERÍODO]','Ambiente liberado e responsáveis orientados.'],
], [160,85,246])
p('Critérios de aceite','h2')
p('Antes da construção, registrar os cenários de teste por entrega, os resultados esperados e o responsável pela aprovação. A homologação terá [NÚMERO] dias úteis após a disponibilização da entrega e das evidências.')
p('O cliente enviará o aceite ou uma lista consolidada de divergências em relação ao escopo. Erros que impeçam os cenários essenciais serão corrigidos e submetidos a novo teste antes da liberação. Pendências menores terão tratamento e prazo acordados por escrito. A ausência de resposta exige replanejamento, sem aceite automático.')
p('Exemplos para adaptar aos testes','h2')
p('Software: um usuário autorizado conclui [TAREFA], enquanto um perfil sem permissão tem acesso bloqueado. Automação: o evento [GATILHO] produz [RESULTADO], com registro da execução e tratamento de duplicidade. Atendimento: a solicitação de uma pessoa transfere a conversa e suspende a resposta automática enquanto o humano atende.')
p('Acompanhamento e mudanças','h2')
p('Atualizações de andamento: [FREQUÊNCIA E CANAL]. Responsável do cliente: [NOME]. Responsável técnico: João Victor Vasconcelos. Mudanças serão registradas com descrição, impacto no preço e prazo e aprovação por escrito antes da execução. Correções de divergências do escopo aprovado não serão tratadas como novas funcionalidades.')

page('6 Investimento e operação')
tab(['Item','Valor','Cobrança'],[
 ['Desenvolvimento e implantação','R$ [VALOR]','[FORMA E MARCOS]'],
 ['Suporte e manutenção opcional','R$ [VALOR]/mês','[INÍCIO E VENCIMENTO]'],
 ['Serviços adicionais autorizados','R$ [VALOR]/hora','[REGRA E LIMITE]'],
], [218,123,150])
p('Pagamento da implantação','h2')
p('Entrada: [PERCENTUAL]% na contratação; parcela intermediária: [PERCENTUAL]% em [MARCO]; saldo: [PERCENTUAL]% em [MARCO]. Os percentuais devem somar 100%. Valor total: R$ [TOTAL]. Tributos: [INCLUÍDOS OU DISCRIMINADOS]. Forma de pagamento e vencimentos: [DEFINIR].')
p('Custos recorrentes de terceiros','h2')
p('Hospedagem, banco de dados, domínio, licenças, APIs de IA e mensagens serão discriminados antes da contratação. Estimativa: R$ [FAIXA]/mês para [VOLUME], com base em preços consultados em [DATA]. Conta e pagamento sob responsabilidade de [RESPONSÁVEL]. Consumo excedente: [REGRA].')
p('Definir alertas em [LIMITE] e procedimento para aumento de consumo [AÇÃO E APROVADOR]. Alterações de preço, câmbio e regras de fornecedores podem afetar a estimativa. Gastos adicionais que dependam de decisão do projeto deverão ser previamente aprovados.')
p('Correções após a entrega','h2')
p('Período incluído: [NÚMERO] dias após [MARCO]. Abrange correções de falhas reproduzíveis em relação ao escopo aprovado. Novas funções, mudanças operacionais e adaptações a alterações de terceiros serão avaliadas separadamente.')
p('Suporte continuado quando contratado','h2')
p('Cobertura: [DIAS, HORÁRIOS E FUSO]. Canal: [CANAL]. Franquia: [HORAS OU DEMANDAS]. Primeira resposta por criticidade: [PRAZOS]. O prazo de resposta corresponde ao início do atendimento; a previsão de solução será informada após o diagnóstico. Excedentes, reajuste, vigência e cancelamento: [CONDIÇÕES].')
p('Contas e continuidade','h2')
p('Definir titularidade de contas, repositório e domínios; acessos administrativos; frequência e retenção de backup; procedimento de restauração; retenção e descarte de dados; e destino das informações no encerramento. Responsáveis e parâmetros: [DEFINIR].')

page('7 Entrega e aprovação')
p('Materiais entregues','h2')
p('A entrega incluirá [CÓDIGO OU ACESSO À SOLUÇÃO], [DOCUMENTAÇÃO], [INSTRUÇÕES DE OPERAÇÃO] e [TREINAMENTO]. Registrar o que será transferido ao cliente, o momento da transferência e eventuais licenças de componentes de terceiros ou preexistentes: [CONDIÇÕES].')
p('Dados e acessos','h2')
p('O projeto utilizará somente os dados necessários aos fluxos contratados. Definir categorias de dados, finalidades, perfis autorizados, fornecedores envolvidos, retenção e canal para incidentes: [DEFINIR]. Credenciais serão compartilhadas por meio seguro, com permissões compatíveis com cada função.')
p('Confirmação comercial','h2')
p('O aceite deverá identificar a versão desta proposta, o escopo, o valor, o cronograma e as condições escolhidas. Antes do início, as partes registrarão também as condições de suspensão, cancelamento, entrega parcial e encerramento em [INSTRUMENTO OU DOCUMENTO ACORDADO].')
p('Cliente: [RAZÃO SOCIAL E CNPJ/CPF]\nRepresentante: [NOME E CARGO]\nAceite e data: [ASSINATURA OU REGISTRO ELETRÔNICO]')
p('Proponente: João Victor Vasconcelos\nIdentificação fiscal: [CNPJ/CPF]\nAceite e data: [ASSINATURA OU REGISTRO ELETRÔNICO]')
p('Condições ou anexos adicionais: [LISTAR OU INFORMAR NENHUM].')

page('Guia de adaptação do modelo')
p('Uso interno do proponente. Remover esta página antes de enviar a proposta ao cliente.','small')
p('Como preparar cada proposta','h2')
p('Duplique o arquivo, substitua todos os campos entre colchetes e elimine os módulos que não serão vendidos. Confirme seus dados profissionais. Preencha quantidades, limites, exclusões, critérios de aceite, responsáveis, valores e datas. Confira se escopo, cronograma e investimento correspondem à mesma oferta.')
p('Para desenvolvimento de software','h2')
p('Detalhe telas, perfis, regras de negócio, relatórios e integrações. Especifique dispositivos suportados, volume esperado, migração e entrega do código. Cada função deve ter um cenário de aceite observável.')
p('Para automação de processos','h2')
p('Registre cada fluxo com gatilho, entrada, regras, sistema de destino, resultado, exceções e responsável por falhas. Defina volume de execuções, duplicidades, reprocessamento e necessidade de aprovação humana.')
p('Para WhatsApp e agentes de IA','h2')
p('Inclua canal oficial, número de atendimento, fontes de conhecimento, regras de transferência humana e ações permitidas. Dimensione mensagens e consumo de IA separadamente da implantação. Para um piloto semelhante ao projeto Life, descreva triagem comercial e técnica, integração comercial com CRM, fila operacional e teste com grupo limitado; orçamento e prazo exigem avaliação própria.')
p('Referências pesquisadas','h2')
p('PandaDoc • Software Development Scope of Work. Referência para organizar requisitos, entregas, premissas, cronograma e investimento.\nhttps://www.pandadoc.com/software-development-sow-template/','small')
p('Proposal Kit • Software Automation Sample Proposal. Referência de apresentação comercial de uma solução de automação.\nhttps://www.proposalkit.com/htm/business-proposal-example/sample-business-proposal/sample-software-automation-consulting-proposal.htm','small')
p('Pesquisa realizada em 25/09/2026. Texto original elaborado para este modelo. Os exemplos e campos devem ser ajustados à oferta contratada.','small')

def footer(c,d):
 c.setFont('Arial',8); c.setFillColor(colors.HexColor('#52616D'))
 c.drawString(52,28,'João Victor Vasconcelos  |  Software e automação')
 c.drawRightString(A4[0]-52,28,str(d.page))
pdf=OUT/'Modelo_Proposta_Joao_Victor.pdf'
doc=SimpleDocTemplate(str(pdf),pagesize=A4,leftMargin=52,rightMargin=52,topMargin=43,bottomMargin=49,title='Modelo de proposta de software e automação',author='João Victor Vasconcelos')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
(OUT/'Modelo_Proposta_Joao_Victor.md').write_text('\n'.join(md),encoding='utf-8')
qa=ROOT/'tmp'/'proposal_qa'; qa.mkdir(exist_ok=True)
with fitz.open(pdf) as f:
 print('Pages:',len(f))
 for i,page in enumerate(f):
  page.get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(str(qa/f'page-{i+1}.png'))
  print(i+1,len(page.get_text()))
print(pdf)
