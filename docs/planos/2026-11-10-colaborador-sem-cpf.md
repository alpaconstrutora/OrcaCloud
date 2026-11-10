# Colaborador sem CPF (10/11/2026)

## Pedido original

Sessão de 10/11/2026, primeira mensagem:

> "recursos humanos > Colaboradores: permitir criar novo colaborador sem CPF obrigatorio"

Mesma sessão, depois do PR #317:

> "Corrigir estas 3 coisas"

As "3 coisas" eram as pendências listadas no relatório do #317: (1) as funções SQL que gravam em
`employees` sem passar pelo serviço, (2) o registro antigo com `cpf = ''`, (3) a busca de Colaboradores
que não filtra por nome.

## Causa

O formulário nunca exigiu CPF. O índice `idx_employees_cpf_unique (org_id, cpf) WHERE cpf IS NOT NULL`
só ignora NULL, e o campo vazio ia como `''`: o 2º colaborador sem CPF da mesma organização batia em
`duplicate key`.

## Itens

- [x] **Serviço grava NULL** (`services/laborService.ts`, PR #317). Pronto quando: `laborServiceCpfVazio.test.ts`
  verde e produção servindo a mensagem "Já existe um colaborador com este CPF nesta organização.". Feito em 10/11.
- [x] **Trava no banco** (`supabase/migrations/aplicar_20271110970000_employees_cpf_vazio_null.sql`): gatilho
  `trg_employees_cpf_vazio_null` converte CPF sem dígito em NULL em qualquer INSERT/UPDATE, o que cobre a
  contratação do ATS e o cadastro do portal de treinamentos. Pronto quando: aplicada no remoto e
  `pg_trigger` lista o gatilho. Aplicada em 10/11 (o usuário pediu "Aplique você mesmo"). `pg_trigger` lista o
  gatilho, e a ACL da função é só `postgres`/`service_role`. Prova numa transação desfeita: dois INSERTs na mesma
  org, com `''` e com `'   .   .   -  '`, gravaram NULL sem colidir; `'000.000.001-91'` ficou como veio.
- [x] **Registro antigo** (mesma migration, UPDATE final). Pronto quando:
  `SELECT count(*) FROM employees WHERE cpf IS NOT NULL AND regexp_replace(cpf,'\D','','g') = ''` dá 0.
  Deu 0 em 10/11; o Josmar (`88c05928…`) ficou com `cpf` NULL.
- [x] **Busca de Colaboradores** (`utils/buscaColaborador.ts` + `components/LaborEmployeeList.tsx`): o CPF só
  entra na comparação quando o termo tem dígito. Pronto quando: `buscaColaborador.test.ts` verde
  ("Cristiano" não casa com "Josmar").
