# Unidade de medida nova — 21/11/2026

## Pedido (literal)

> implemente opção para criação de nova unidade de medida

Contexto: chegou logo depois da equivalência de unidades
(`2026-11-21-equivalencia-unidades.md`, PRs #619/#620/#622), cujo cadastro em
Composições › Ver detalhes oferecia uma lista **fixa** de 17 unidades no código
(`UNIDADES_DE_EQUIVALENCIA`).

## Decisão

- **Não criar tabela nova.** Já existe o cadastro global `master_units_of_measure`
  (Dados Mestres › Unidades, 35 unidades, só leitura até aqui). A unidade nova é
  gravada nele.
- **Quem cria:** só o superadministrador — a mesma regra da equivalência (cadastro
  global vale para todas as organizações). Policy de INSERT `is_superadmin()`; sem
  UPDATE/DELETE (unidade usada por item/pedido não pode sumir nem mudar de sentido).
  Símbolo único ignorando caixa (`lower(symbol)`).
- **Onde se cria:**
  1. no cadastro de equivalência do item — o `<select>` fixo virou o
     `CreatableCombobox` do guia §7.1.2: digitar uma unidade que não existe oferece
     "Cadastrar", que abre o formulário (símbolo, nome, grandeza); criada, fica
     escolhida;
  2. em Dados Mestres › Unidades — botão "Nova unidade" (só superadmin).
- **Identidade:** a equivalência continua gravando o código (`identidadeDaUnidade`).
  A lista oferecida é `catalogoDeUnidades` = lista fixa + mestre, por identidade
  (m² = M2). Recusa o que já existe inclusive por apelido ("Barra" = BR) e o ML
  ambíguo. `mlh` (Milheiro do mestre) passou a ser MIL.

## Andamento

- [x] Migration `aplicar_20271121996000_unidade_de_medida_nova.sql` aplicada (2×,
  idempotente). Conferido numa transação desfeita: comum lê 35 e não insere/altera
  (42501); superadmin insere; "ZZTESTE" depois de "zzteste" = 23505; ninguém apaga;
  anon não lê.
- [x] `lib/unidadeDeMedida.ts`: `catalogoDeUnidades`, `motivoNovaUnidadeInvalida`,
  `CATEGORIAS_DE_UNIDADE`; `masterDataService.addUnit`.
- [x] `components/database/NovaUnidadeForm.tsx`, `EquivalenciasDoItem.tsx`,
  `MasterDataBrowser.tsx`.
- [x] Testes: `__tests__/unidadeDeMedidaNova.test.ts`,
  `__tests__/components/EquivalenciaUnidadeNova.test.tsx`.
- [ ] Conferida na tela em produção.
