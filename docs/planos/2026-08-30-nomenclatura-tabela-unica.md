# Nomenclatura — fundir em uma página só (tabela) + novos tokens

## Pedido original

> Configurações do Sistema < Nomenclatura:
> 1. fundir todos em uma página so, mais pratico e simples para o usuário. veja print da tabela proposta
> 2. Dropdown livre (Empreendimento; Obra; Centro de Custo; Empresa; Fornecedor; Cliente; Investidor; Orçamento; Planejemento)
>
> (print anexado: tabela com colunas `Módulo | Prefixo | Livre ×7`, linhas:
> Pedidos de Compra=PCO, Cotações de Suprimentos=COT, Contrato (suprimentos)=CSU,
> Venda de Ativos=CTV, Locações=CTL, Condomínios=CTC, Contratos de Serviço=CSE,
> Pós-Obra & Garantia=POG, Diário de Obras=DOB, Controle Operacional=COP)
>
> Sessão serene-moler · 2026-08-30

## Contexto

A tela de Nomenclatura tinha 11 folhas separadas no menu de Configurações do
Sistema (uma por `doc_type`), cada uma com um `NumberingSettingsCard` (8
seletores de slot, Prefixo posicionável, Separador/Dígitos por doc_type). O
usuário quer uma tabela única e ampliar as variáveis oferecidas. Motor:
`services/documentNumbering/`; plano anterior:
`docs/planos/2026-08-17-nomenclatura-slots-configuravel.md`.

## Decisões tomadas com o usuário (2026-08-30)

| Pergunta | Resposta |
|---|---|
| Escopo dos módulos | Fundir em tabela e **re-prefixar** os 7 tipos do print. Os 4 tipos restantes (CRM/Negociações) continuam, em seção separada. Pós-Obra & Garantia / Diário de Obras / Controle Operacional **não entram** — sem doc_type/wiring hoje. |
| Prefixo/Separador/Dígitos | Prefixo vira coluna fixa (sempre 1º segmento). Separador e Dígitos do Sequencial viram **um controle único para a página inteira** (antes eram por doc_type). |
| Token "Empresa" | É só o novo rótulo do token `ORGANIZACAO` já existente — resolve `organizations.code`, sem mudança. |
| Opções por linha | Todas as linhas oferecem as mesmas 9 variáveis (ordem: Empreendimento; Obra; Centro de Custo; Empresa; Fornecedor; Cliente; Investidor; Orçamento; Planejamento). "Unidade" sai do seletor. |
| Defaults de Venda de Ativos/Locações sem Unidade | Caem para só Empreendimento (`CTV-RES01-0001`), em vez de incluir a unidade. |

**Risco aceito e sinalizado ao usuário**: `Investidor`/`Orçamento`/`Planejamento`
entram no seletor sem nenhum dos 11 fluxos de criação passar o id
correspondente ainda — por "nunca bloqueia"
([[feedback_nomenclatura_nunca_bloqueia]]), configurar esses tokens hoje não
quebra nada, mas o segmento correspondente **não aparece** no número até um
fluxo futuro ligar o contexto (`investorId`/`orcamentoProjectId`/
`planejamentoProjectId` em `NumberingContext`).

## O que mudou (sem nenhuma migration de banco)

Confirmado nas migrations (`20270912000001` e `20270912000004`/`000006`):
`document_numbering_settings.slots` é `JSONB` sem CHECK sobre o conteúdo, e as
funções SQL tratam qualquer token genericamente. Novos tokens e re-prefixar
são só TypeScript.

- **`services/documentNumbering/types.ts`** — `SlotToken`/`VariableToken`
  ganham `INVESTIDOR`/`ORCAMENTO`/`PLANEJAMENTO`. `ALL_VARIABLE_TOKENS` agora
  lista as 9 variáveis oferecidas na UI, na ordem pedida (sem `UNIDADE`, que
  continua existindo no tipo só por compatibilidade com config já salva).
  `NumberingContext` ganha `investorId?`/`orcamentoProjectId?`/`planejamentoProjectId?`.
- **`services/documentNumbering/resolvers.ts`** — resolvers novos para os 3
  tokens (`investors.code`, `projects.code`/`settings.code`), só disparam se o
  chamador passar o id (nenhum passa ainda).
- **`services/documentNumbering/catalog.ts`** — reescrito: `label`/`default`
  atualizados para os 7 tipos re-prefixados (PC→PCO, QT→COT, CT→CSU, CV→CTV,
  CL→CTL, RAT→CTC, SERVICE_CONTRACT ganha CSE pela 1ª vez). `UNIT_SALE_CONTRACT`/
  `RENTAL_CONTRACT` perdem Unidade do default. Campos `group`/`supportedVariables`
  removidos (não eram lidos em lugar nenhum fora do card antigo). Novo
  `advanced?: true` marca os 4 tipos da seção "CRM & Negociações". Novos
  `MAIN_DOC_TYPES`/`ADVANCED_DOC_TYPES` (arrays ordenados, já que `Record` não
  garante ordem).
- **`components/settings/NomenclaturaTable.tsx`** (novo) — substitui
  `NumberingSettingsCard.tsx` (apagado). Uma única tabela (duas seções): 1
  `listNumberingConfigs(orgId)` carrega tudo; Prefixo é `slots[0]='PREFIX'`
  sempre (implícito, não aparece como opção nos 7 seletores livres); Separador/
  Dígitos viram um controle no topo da página, aplicado a todas as linhas ao
  salvar; um único botão "Salvar" grava as 11 linhas de uma vez
  (`useOrgWriteTarget`/`forEachTargetOrg`, replicado por linha); "Restaurar
  padrão" continua por linha.
- **`components/Settings.tsx`** — removidas as 11 folhas `num-*` e o mapa
  `NOMENCLATURA_DOC_TYPE`; "Nomenclatura" virou item de nível único (como
  `indices`/`whatsapp`), renderizando `<NomenclaturaTable />` direto.

## Verificação

- [x] `npx tsc --noEmit` limpo.
- [x] `npx vitest run __tests__/documentNumberFormat.test.ts` — 12/12 (não
  tocamos `format.ts`; os testes usam `NumberingConfig` literal, não o catálogo).
- [x] `bash scripts/check-ui-standard.sh components/settings/NomenclaturaTable.tsx components/Settings.tsx` — sem apontamento.
- [x] **Checagem de segurança antes do deploy** (pedida no plano): `document_numbering_settings`
  em produção tem **1 única linha** (`SUPPLY_CONTRACT`, prefixo custom `CTS`,
  slots `[PREFIX, EMPREENDIMENTO, CENTRO_CUSTO, FORNECEDOR]`) — **nenhuma**
  organização tem `UNIDADE` configurada em `UNIT_SALE_CONTRACT`/`RENTAL_CONTRACT`.
  Confirmado via `npx supabase db query --linked` (leitura, sem RLS). Trocar o
  default dessas duas linhas é seguro — não quebra nenhuma config real.
- [ ] **No navegador** (ainda não verificado nesta sessão): abrir Configurações
  do Sistema › Nomenclatura, conferir a página única com as duas tabelas;
  editar uma linha, Salvar, recarregar e confirmar que persistiu; trocar
  Separador/Dígitos e confirmar que todas as linhas refletem; "Restaurar
  padrão" numa linha e confirmar que só ela volta ao default; conferir que os
  9 tokens aparecem, na ordem pedida, nos 7 seletores de todas as linhas.

## Fora do escopo (confirmado com o usuário)

- Pós-Obra & Garantia / Diário de Obras / Controle Operacional — sem doc_type/wiring.
- Tabela `companies` como token — "Empresa" é só rótulo novo de Organização.
- Ligar `investorId`/`orcamentoProjectId`/`planejamentoProjectId` em qualquer
  fluxo de criação — os 3 tokens ficam disponíveis no seletor, mas cosméticos
  até um pedido futuro estender os chamadores.
