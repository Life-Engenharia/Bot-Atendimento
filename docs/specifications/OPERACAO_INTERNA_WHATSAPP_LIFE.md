# Operação interna do piloto via WhatsApp

## Objetivo

O cliente conversa somente com o número oficial da Life. Comercial, Assistência Técnica, Plantão, Backup e Coordenação operam os protocolos por conversas privadas com o bot interno, usando seus números corporativos ou previamente autorizados.

Não haverá dashboard gerencial no piloto. O bot interno executará ações estruturadas, registrará todas as alterações no Supabase e enviará respostas ao cliente pelo número oficial da Life.

```text
Cliente -> WhatsApp oficial Life -> Bot de atendimento -> Protocolo
                                                    -> Bot interno -> equipe autorizada
                                                    -> Supabase -> histórico e auditoria
```

## Cadastro e identificação da equipe

Antes da ativação, a Life cadastra cada colaborador com nome, telefone no formato internacional, cargo, equipe, responsável de backup, horário e situação ativa/inativa.

O bot identifica o colaborador pelo número de WhatsApp de origem. Número não cadastrado não recebe dados de cliente, anexos ou comandos operacionais. Troca de aparelho, número ou desligamento exige atualização imediata do cadastro pela Coordenação ou Administração.

| Campo                               | Uso                                             |
| ----------------------------------- | ----------------------------------------------- |
| Nome e matrícula/e-mail corporativo | Identificação e auditoria                       |
| Telefone autorizado                 | Autenticação inicial no canal interno           |
| Cargo e equipe                      | Define menus e permissões                       |
| Escala, horário e plantão           | Define quem recebe alertas                      |
| Responsável e backup                | Define o escalonamento P1/P2                    |
| Status ativo/inativo                | Suspende acesso imediatamente quando necessário |

## Cargos e funcionamento

### 1. Comercial

Recebe pedidos de orçamento, contratação de serviço e assistência avulsa de quem não possui contrato ou histórico Life. O bot entrega um resumo com serviço solicitado, contato, empresa, cidade e observações coletadas.

**Pode:**

- assumir e responder oportunidades comerciais;
- consultar dados da triagem comercial;
- atualizar o estágio da oportunidade no Ploomes;
- registrar retorno, agendamento ou encerramento comercial;
- transferir a oportunidade a outro comercial autorizado.

**Não pode:** classificar prioridade técnica, alterar escalas técnicas ou acessar fila técnica que não tenha sido encaminhada ao Comercial.

Exemplo de notificação:

```text
Novo orçamento | LIFE-2081
Serviço: PMOC
Empresa: Clínica Alfa | Aracaju

[Assumir lead] [Ver dados] [Responder cliente]
[Atualizar oportunidade] [Transferir]
```

### 2. Assistência Técnica

Recebe chamados de clientes Life com contrato ativo ou equipamento já atendido. O bot entrega protocolo, unidade, equipamento, sintomas, impacto, contingência, risco informado, resumo e anexos permitidos.

**Pode:**

- assumir o chamado e tornar-se responsável;
- consultar o histórico e anexos do próprio chamado;
- responder o cliente pelo número oficial da Life;
- registrar diagnóstico humano, ação realizada, previsão e status;
- transferir o chamado a técnico autorizado;
- solicitar apoio da Coordenação ou do Plantão.

**Não pode:** alterar regras de prioridade, consultar chamados de outra equipe sem transferência/autorização ou modificar a trilha comercial.

Exemplo de notificação:

```text
Chamado técnico | LIFE-1042 | P2
Cliente: Hospital Central
Equipamento: Chiller
Resumo: perda de rendimento relatada

[Assumir] [Ver resumo] [Ver anexos]
[Responder cliente] [Registrar ação] [Transferir]
```

### 3. Plantão

Recebe protocolos P1 e P2 em horário de plantão ou quando não há responsável técnico elegível no horário regular. A atuação é limitada à cobertura definida pela Life.

**Pode:**

- confirmar recebimento de P1/P2;
- assumir o caso, responder o cliente e registrar ação;
- acionar a Coordenação ou o backup;
- transferir o caso ao técnico responsável assim que houver cobertura.

**Regra de SLA proposta:** P1 deve ser confirmado em até 5 minutos e P2 em até 15 minutos. Esses tempos só entram em vigor depois de aprovados pela Life junto com a escala e os responsáveis nominais.

### 4. Backup

É o substituto previamente definido para um responsável ou turno. Não recebe toda a fila de forma ativa: recebe alerta somente quando o responsável não confirma o caso dentro do SLA ou quando a Coordenação aciona manualmente.

**Pode:**

- assumir o protocolo escalado;
- confirmar que não possui disponibilidade, mantendo o caso na fila para nova escalada;
- consultar o contexto necessário e responder o cliente;
- registrar a transição de responsabilidade.

### 5. Coordenação Técnica

É responsável pela organização da fila técnica, sem executar necessariamente todos os atendimentos.

**Pode:**

- consultar fila técnica e chamados críticos;
- designar, transferir ou substituir responsável e backup;
- ajustar prioridade humana após análise;
- monitorar SLA, confirmar escalonamento e encerrar protocolos;
- autorizar acesso excepcional de outro técnico a um protocolo;
- revisar o histórico de ações.

### 6. Administração / Gestor operacional

Mantém a estrutura de operação.

**Pode:**

- cadastrar, inativar ou corrigir números autorizados;
- configurar equipes, horários, escalas e backups;
- manter modelos de mensagens, categorias e serviços;
- consultar auditoria operacional;
- acionar a equipe responsável por LGPD e segurança em caso de incidente.

**Não deve:** usar essa permissão para acessar anexos ou conversas sem necessidade operacional justificada.

## Menus internos por perfil

O botão ou comando `MENU` mostra somente as opções permitidas ao telefone identificado.

| Perfil              | Menu interno                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Comercial           | Meus leads; Novas oportunidades; Responder cliente; Atualizar oportunidade; Transferir            |
| Assistência Técnica | Meus chamados; Fila técnica autorizada; Ver anexos; Responder cliente; Registrar ação; Transferir |
| Plantão             | Alertas críticos; Confirmar P1/P2; Meus chamados; Acionar backup; Registrar ação                  |
| Backup              | Casos escalados; Assumir; Indisponibilidade; Ver resumo; Responder cliente                        |
| Coordenação         | Fila técnica; P1/P2 pendentes; Designar responsável; Transferir; Histórico; Encerrar              |
| Administração       | Equipes; Números autorizados; Escalas; Backups; Auditoria; Incidentes                             |

## Fluxos operacionais

### Fluxo comercial

```text
Cliente escolhe orçamento/contratação
-> bot coleta serviço e dados mínimos
-> cria protocolo e lead/oportunidade no Ploomes
-> notifica Comercial elegível
-> comercial assume e responde pelo número oficial
-> registra retorno, proposta, ganho, perda ou transferência
```

Se o cliente solicita assistência sem contrato, o bot preserva a experiência: registra a oportunidade de assistência avulsa e encaminha ao Comercial, sem afirmar que o caso foi recusado.

### Fluxo de assistência técnica

```text
Cliente Life solicita assistência
-> bot confirma contrato ou histórico Life
-> coleta equipamento, sintoma, impacto, contingência e anexos
-> sugere prioridade P1-P4
-> cria protocolo e notifica equipe técnica
-> técnico assume, responde e registra as ações
-> coordenação acompanha e encerra quando aplicável
```

O bot sugere prioridade; a confirmação humana é obrigatória para P1/P2 e para qualquer decisão que envolva risco operacional ou de segurança.

### Fluxo P1/P2 e escalonamento

```text
Protocolo P1/P2 criado
-> notificação privada ao responsável
-> aguarda confirmação no prazo aprovado
-> sem confirmação: notifica backup
-> sem confirmação do backup: notifica Coordenação/Plantão
-> todas as tentativas ficam registradas no protocolo
```

## Como a equipe responde ao cliente

Quando o colaborador escolhe `Responder cliente`, o bot apresenta o protocolo e solicita a mensagem. Após confirmação, o backend envia a resposta pelo número oficial da Life no WhatsApp.

O cliente nunca recebe o número pessoal do colaborador. O histórico armazena protocolo, autor, data/hora, conteúdo enviado e status de entrega da Meta.

## Anexos, áudio e documentos

O bot aceita mídia do cliente e cria uma cópia privada associada ao protocolo. Para a equipe autorizada, o bot pode enviar o arquivo diretamente na conversa interna ou um link temporário, sem acesso público.

| Tipo recebido     | Tratamento no piloto                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| Texto             | Triagem e resumo automatizados                                         |
| Imagem/foto       | Leitura visual para contexto; arquivo preservado                       |
| Áudio             | Transcrição; áudio original preservado                                 |
| PDF/DOCX/planilha | Extração de texto e leitura visual quando necessário                   |
| Vídeo             | Áudio e quadros selecionados para triagem; arquivo original preservado |

Arquivos ilegíveis, protegidos por senha, acima do limite ou de tipo não permitido são marcados para análise humana. O bot não inventa conteúdo nem diagnóstico técnico.

## Segurança, LGPD e auditoria

- O telefone autorizado identifica o acesso operacional inicial; contas administrativas e serviços em nuvem exigem MFA.
- O bot valida o perfil antes de mostrar qualquer protocolo, resumo ou anexo.
- Toda ação relevante gera registro imutável: protocolo, usuário, data/hora, ação, responsável anterior/novo e resultado.
- Anexos não possuem URL pública. Se for usado link, ele é temporário e limitado ao usuário autorizado.
- A Life define a retenção de conversas, anexos e backups com a área de LGPD. A proposta inicial é 180 dias para conversas e 90 dias para anexos, sujeita a aprovação.
- Dados de pacientes, doadores, prontuários e demais dados sensíveis não devem ser solicitados no fluxo padrão. Caso recebidos, o acesso deve ser limitado e o caso encaminhado à equipe humana.

## Decisões pendentes da Life

1. Nome, telefone, cargo e equipe de cada responsável.
2. Escala, horários e cobertura de plantão.
3. Responsável e backup por equipe/turno.
4. Aprovação do SLA de P1 e P2.
5. Retenção de conversas, anexos e backups, validada por Administração/LGPD.
6. Canal de notificação de contingência caso o WhatsApp esteja indisponível.
7. Confirmação da API do Ploomes e do usuário de integração.
