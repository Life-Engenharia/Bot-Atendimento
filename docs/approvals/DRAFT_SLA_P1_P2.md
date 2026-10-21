# RASCUNHO — SLA de confirmação P1/P2

**Status:** aguardando aprovação da Coordenação Técnica  
**Escopo:** confirmação humana e escalonamento interno; não é promessa de resolução ao cliente.

## P1 — Crítico

**Critério proposto:** risco a pessoas, sangue, medicamentos ou operação essencial, com equipamento crítico parado e sem contingência confirmada.

- confirmação do responsável: até **5 minutos**;
- sem confirmação: acionar backup imediatamente após o prazo;
- sem confirmação do backup: acionar Coordenação/Contingência;
- registrar horário de cada tentativa e pessoa notificada;
- não encerrar automaticamente um P1 por ausência de resposta.

## P2 — Alto

**Critério proposto:** parada ou degradação relevante sem risco imediato confirmado, ou contingência insuficiente.

- confirmação do responsável: até **15 minutos**;
- sem confirmação: acionar backup e registrar evento;
- persistindo a ausência: escalar para Coordenação;
- registrar horário de cada tentativa e pessoa notificada.

## Regras comuns

- O SLA inicia quando a pré-triagem é confirmada e o caso entra na fila autorizada.
- O SLA pausa somente quando houver confirmação humana registrada.
- Mensagens automáticas não contam como confirmação humana.
- Fora do horário regular, usar a escala de plantão publicada pelo RH.
- O sistema deve alertar, mas não inventar responsável, backup ou prazo.

## Aprovação necessária

- [ ] Critérios P1/P2 revisados pela Coordenação Técnica
- [ ] Tempos de 5 e 15 minutos aprovados
- [ ] Regras fora do horário aprovadas
- [ ] Responsáveis e backups cadastrados pelo RH
- [ ] Procedimento de escalonamento testado
- [ ] Data, nome, cargo e assinatura do aprovador registrados

