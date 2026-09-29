# Definições pendentes da Life para ativação

Os menus e fluxos abaixo foram implementados com base na especificação atual. Os itens desta lista não bloqueiam o desenvolvimento local, mas bloqueiam ou limitam a ativação para clientes reais.

| Prioridade | Definição necessária                                                             | Impacto se faltar                                                                          | Responsável Life                   |
| ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Crítica    | Telefones corporativos, cargo, equipe e status de cada colaborador.              | Não é possível autenticar a operação interna por perfil.                                   | Administração / Gestor operacional |
| Crítica    | Principal, backup, horários e contingência por fila.                             | Não é possível rotear nem escalar P1/P2 com segurança.                                     | Coordenação Técnica                |
| Crítica    | SLA final de confirmação para P1 e P2.                                           | Os prazos de 5 e 15 minutos permanecem somente propostas.                                  | Coordenação Técnica                |
| Crítica    | Validação do contrato/histórico Life.                                            | A rota técnica não consegue decidir com segurança entre fila técnica e assistência avulsa. | Comercial + Assistência            |
| Crítica    | Contas institucionais Meta, Supabase, Google Cloud, OpenAI e GitHub.             | Bloqueia integração, homologação e produção.                                               | Administração / TI                 |
| Alta       | User-Key de homologação, funil, etapas, usuários e campos do Ploomes.            | Impede criação/atualização de contatos e oportunidades comerciais.                         | Administrador Ploomes              |
| Alta       | Confirmação de que a API do Ploomes está habilitada no plano e eventuais custos. | A documentação pública não confirma acesso gratuito no contrato da Life.                   | Administração / Ploomes            |
| Alta       | Redação final dos menus, categorias e serviços comerciais.                       | Os textos atuais são base de desenvolvimento e precisam de aceite comercial.               | Comercial + Assistência            |
| Alta       | Política LGPD: base legal, retenção, exclusão e incidente.                       | Bloqueia tratamento de dados reais e anexos em produção.                                   | Administração / LGPD               |
| Média      | Canal alternativo se WhatsApp/Meta estiver indisponível.                         | Contingência operacional fica incompleta.                                                  | Gestor operacional                 |
| Média      | Regras de atendimento fora do horário e comunicação de prazo.                    | Bot não deve prometer retorno sem a escala aprovada.                                       | Comercial + Coordenação            |

## Menus já disponíveis na base local

- Abertura, consentimento e opção de atendimento humano.
- Menu principal: comercial, assistência técnica e pessoa.
- Menu comercial com dez opções de serviço: limpeza de dutos, PMOC, assistência avulsa, projetos, engenharia clínica, locação de chillers, chiller novo, banco de sangue, calibração e outro serviço.
- Entrada de assistência com mensagem de segurança e início da pré-triagem.
- Menus internos de Comercial, Assistência, Plantão, Backup, Coordenação e Administração.

Os menus internos ainda não são expostos a números reais: a autorização por telefone e as ações operacionais serão conectadas após o cadastro nominal da equipe.
