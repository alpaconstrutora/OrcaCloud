# Portal do Parceiro (visão do app) — aba Financeiro na visão do credor

**Frente:** `parceiro-financeiro-credor` (`C:\D\frentes\parceiro-financeiro-credor`)
**Branch:** `feat/parceiro-financeiro-credor`, a partir de `origin/main` (`d16e0fe5`)
**Data do pedido:** 09/09/2026

---

## Pedido original

Sessão de 09/09/2026, mensagem 1 do usuário, transcrita literalmente:

> portal do parceiro na visao do app nao tem a aba financeiro, somente na visao do parceiro (token). analise

Resposta da análise ofereceu duas opções. Mensagem 2 do usuário, literal:

> B

Opção B, como escrita na pergunta:

> **B — visão do credor:** o mesmo mais as ações internas (aprovar medição,
> liberar retenção, ver o título em Contas a Pagar). Aí encosta em
> `contractService`/financeiro e é outra conversa de escopo.

("o mesmo" = opção A: sexta aba "Financeiro" no manager, reusando
`listFinancials(selectedWorkspace.id)`, com retenção, parcelas e medições.)

---

## Diagnóstico (medido em 09/09/2026, antes de qualquer edição)

O portal **não** está sem a aba. São três superfícies e a que falta é a quarta:

| Superfície | Componente | Aba Financeiro |
|---|---|---|
| Link público `?partner=` | `PartnerPortal.tsx` modo token | ✅ |
| Staff `ProfileGroup.PARTNER` | `PartnerPortal.tsx` modo app | ✅ |
| "Visualizar como Parceiro" | `PartnerPortal.tsx` modo preview | ✅ |
| **Gestão › Portal de Parceiros** | **`PartnerWorkspaceManager.tsx`** | ❌ |

`PartnerPortal.tsx:1046-1093` renderiza a aba **incondicionalmente** (sem
`isTokenMode`/`isPreview`). Quem nunca teve a aba é o
`PartnerWorkspaceManager`, cujo `activeSubTab` (`:229`) tem cinco valores:
`usuarios | conversas | documentos | contratos | solicitacoes`.

### O backend já está pronto — não há migration nesta frente

Núcleo + duas cascas (migration `20270863000000`), verificado no banco remoto:

```
partner_ws_financials          (p_ws, p_contract_id)     4377 chars   sem grant público
partner_get_financials         (p_workspace_id, ...)      583 chars   authenticated
partner_portal_get_financials  (p_token, ...)             606 chars   anon + authenticated
```

A casca do app autoriza por `partner_can_access_workspace`, que aceita
explicitamente *"membro interno da organização do workspace"*.
`partnerService.listFinancials()` (`services/partnerService.ts:716`) já existe.

RLS das tabelas de escrita, conferida:

| Tabela | Policy | cmd |
|---|---|---|
| `contract_measurements` | `Users can manage contract measurements` | ALL |
| `contract_retention_releases` | `org_access_contract_retention_releases` | ALL |

`fn_contract_retention_ledger` é `SECURITY INVOKER` (RLS aplica) — apesar do
`=X` de PUBLIC na ACL, não é vazamento.

### Divergência encontrada (NÃO corrigida nesta frente — decisão do usuário)

`partner_ws_financials.retention` soma `contract_measurements.retention_value`
**sem excluir `status = 'Cancelada'`**; `fn_contract_retention_ledger` exclui.
Com uma medição cancelada, o parceiro vê retenção maior que a real, e maior que
a que o `releaseRetention` aceita liberar. É o mesmo padrão de "gêmeas
divergentes" do caso de Documentos (06/09).

**Nesta frente:** os números internos saem do **ledger** (fonte que valida a
liberação), não do payload. A correção do lado do parceiro é uma linha
(`AND m.status <> 'Cancelada'` no núcleo) mas muda o que um portal externo
mostra — fica registrada aqui, não aplicada sem decisão.

---

## Itens

### 1. `components/partner/PartnerWorkspaceManager.tsx` — sexta sub-aba "Financeiro"

**O que muda**

- `activeSubTab` ganha `'financeiro'` (`:229`) e o sexto botão na barra (`:903-944`),
  com contador de medições aguardando aprovação.
- Carga: `partnerService.listFinancials(selectedWorkspace.id)` + um
  `contractService.getRetentionLedger(c.id)` por contrato do workspace
  (`Promise.allSettled`, um contrato que falhe não derruba a aba).
- Conteúdo, na anatomia do guia (§20.1 → KPIs → blocos):
  - **KPIs (§4, `<KpiCard>`)** — A pagar em aberto · Pago · Medições aguardando
    aprovação (`pulse` quando > 0) · Saldo retido (soma dos ledgers).
  - **Medições** — tabela §6/§7 (`px-6`, `border-r`, `py-2.5`, thead sentence
    case, StatusBadge §8 texto colorido). Colunas: Contrato · Nº · Período ·
    Status · Bruto · Retenção · Líquido · NF · Ações.
    Ações (§9): **Aprovar** (texto azul, só em `Em Análise`) ·
    `<ActionIconButton>` de devolver · link "Ver NF".
    Aprovar valida antes com `useConfirm()` (§14) e chama
    `contractService.approveMeasurement`.
    Devolver abre painel com o motivo (obrigatório) → `rejectMeasurement`.
  - **Parcelas** — tabela §6/§7. Colunas: Vencimento · Descrição · Origem
    (`origemLabel`, exportado de `ContasPagarParcelas.tsx`) · Status
    (`STATUS_PT`) · Valor · Ações → **"Ver em Contas a Pagar"**.
  - **Retenção por contrato** — uma linha por contrato com retido/liberado/saldo
    do ledger + botão que abre `<ContractRetentionReleaseModal>` (componente
    existente, reusado sem alteração).
- Toast §13 e `useConfirm()` §14 — o manager ainda não tem toast; entra o padrão
  do guia.
- Após aprovar medição ou liberar retenção: **recarga do bloco financeiro**, não
  atualização local. Justificativa escrita no código: `approveMeasurement`
  dispara `syncMeasurementToFinance`, que **cria uma parcela no servidor** que o
  cliente não tem como construir — é a exceção que a §22 prevê.

**Como sei que terminou**

- [x] A aba existe, monta e chama `listFinancials(ws.id)` — coberto por
      `__tests__/components/PartnerWorkspaceFinanceiro.test.tsx` (5 casos).
- [x] O KPI de saldo retido sai do LEDGER (500), não do agregado do payload
      (700) — caso 2 do mesmo teste, que trava a divergência achada.
- [x] Aprovar chama `approveMeasurement` e RECARREGA o financeiro — caso 3.
- [x] Medição fora de `Em Análise` não oferece Aprovar/Devolver — caso 5.
- [x] `bash scripts/check-ui-standard.sh components/partner/PartnerWorkspaceManager.tsx`
      → "Nenhuma violação mecânica encontrada" (exit 0).
- [ ] **PENDENTE — tela aberta no navegador, com dado real.** Não feito: exige a
      senha do usuário de leitura (`PW_SENHA`), que por decisão explícita não
      fica guardada. Devolver-com-motivo e liberar-retenção só têm cobertura de
      unidade; o caminho fim-a-fim (medição volta a `Pendente` no banco, saldo
      cai) não foi observado.

### 2. `components/ContasPagarManager.tsx` — consumir o deep-link

**O que muda**

- Passa a ler `viewFocus` do store (padrão já existente em `BoletoManager.tsx:599`),
  filtrando por `source === 'CONTA_PAGAR'`.
- Ao receber foco: força `visao = 'parcelas'` (a visão é `usePersistedState` e
  pode estar em `notas`/`fechamento`) e repassa o id para o filho.
- Se, depois de carregado, o id não estiver em `payables`, avisa por toast que o
  título está fora do recorte atual (organização/período) — em vez de piscar sem
  explicar. Limpa o foco nos dois caminhos.

**Como sei que terminou**

- [x] O botão emite `navigateToFocus('contas-a-pagar', <id da transação>,
      'CONTA_PAGAR')` — caso 4 de `PartnerWorkspaceFinanceiro.test.tsx`.
- [x] Título fora do recorte reporta `achou=false` (→ toast explicando) —
      `__tests__/components/ContasPagarDeepLink.test.tsx`.
- [ ] PENDENTE (navegador): a troca de visão persistida `fechamento` → `parcelas`
      só tem cobertura por leitura de código.

### 3. `components/ContasPagarParcelas.tsx` — destaque e limpeza de filtro

**O que muda**

- Novos props `focusId?: string` e `onFocusConsumed?: (achou: boolean) => void`.
- Ao receber `focusId`: se a linha não estiver no recorte visível, zera
  `search`/`statusFiltro`/`origemFiltro` (todos `usePersistedState` — sem isso o
  deep-link cai numa tabela vazia por causa de um filtro salvo semanas atrás),
  destaca a linha por ~4 s e faz `scrollIntoView`.
- Reporta ao pai se achou ou não.

**Como sei que terminou**

- [x] Com busca persistida que exclui o título, o deep-link limpa o filtro e a
      linha renderiza — `ContasPagarDeepLink.test.tsx`, caso 1. A prova de que o
      filtro estava mesmo valendo é o segundo argumento do callback
      (`limpouFiltros=true`), que só é `true` no ramo que limpou.
- [x] Linha já visível → filtros do usuário preservados (caso 2). Importa: zerar
      `usePersistedState` apaga o filtro salvo do usuário para sempre.

### 4. Verificação final

- [x] `npx tsc --noEmit -p .` → exit 0.
- [x] `npm run test` → 219 arquivos, 3378 testes, **0 falhas** (5 arquivos e 33
      testes pulados, iguais ao baseline). Antes do diff a suíte estava em 217
      arquivos / 3370 testes, também sem falha — os 2 arquivos e 8 testes a mais
      são os desta frente.
- [x] `bash scripts/check-ui-standard.sh` nos três arquivos tocados → exit 0 nos três.
- [ ] **PENDENTE — tela aberta de verdade.** Ver o item 1.

---

## Fora de escopo (registrado, não feito)

- Corrigir `partner_ws_financials.retention` para excluir `Cancelada` (muda o
  número que o parceiro vê pelo link — precisa de decisão).
- Migrar as outras cinco sub-abas do `PartnerWorkspaceManager` para a escala
  compacta do §16 (hoje em `rounded-2xl`/`text-xs font-bold`). A aba nova nasce
  no padrão do guia, então vai destoar das irmãs até essa migração acontecer.
