# Homologação do Ploomes

Não use dados de clientes reais nesta etapa. A Life deve fornecer uma `User-Key`
de homologação, com acesso mínimo a contatos e oportunidades comerciais.

## Decisões obrigatórias da Life

Registre antes de habilitar a sincronização:

- ID do funil comercial e etapa inicial;
- usuário/responsável padrão pela oportunidade;
- campos obrigatórios e campos personalizados que receberão serviço, unidade e
  protocolo Life;
- regra de duplicidade (telefone, e-mail e/ou CNPJ);
- limite contratado da API e contato responsável pelo CRM.

O projeto não ativa automaticamente a criação quando houver mais de um funil:
isso evita lançar oportunidades no processo errado.

## Verificação sem escrita

Com `PLOOMES_USER_KEY` configurada somente no ambiente de homologação:

```bash
npm run ploomes:check
npm run ploomes:discover
```

Guarde como evidência a data, o responsável, o ID do funil e os campos
aprovados. Nunca copie a chave para planilhas, tickets ou este repositório.

## Teste controlado de escrita

1. Crie um contato fictício e uma solicitação comercial de teste.
2. Confirme que uma única oportunidade é criada no funil e etapa aprovados.
3. Reenvie o mesmo evento e confirme que não há duplicidade.
4. Induza uma falha temporária e execute `POST /api/admin/jobs/ploomes-sync`
   com autenticação administrativa; confirme o registro da tentativa.
5. Remova manualmente os dados fictícios do Ploomes após registrar a evidência.

Não conclua a homologação se a API retornar campos obrigatórios não mapeados,
mais de um funil sem seleção explícita, ou acesso além de contatos e negócios.
