# Pedido › Recebimento: sub-abas Rastreamento · Conferência · 3-way match

## Pedido original

Sessão de 19/10/2026 (VS Code), depois das entregas de FOB/retirada no mesmo pedido:

> a tela de recebimento parede ter ficado longa mesmo com poucos itens.
> sugestão de criar abas para Conferência de Entrega, 3-way match e Rastreamento logístico. Avalie

Avaliação apresentada e aceita ("sim"), com duas decisões:

| Pergunta | Decisão |
|---|---|
| Divergências: sub-aba própria? | Não — ficam em **Conferência** (nascem dela; o fornecedor responde ali). A sub-aba conta as pendentes em vermelho. |
| Qual sub-aba abre? | **Pelo status, na 1ª carga**: até a entrega/retirada, Rastreamento; de Entregue em diante, Conferência. Não persiste entre pedidos. |

Precedente seguido: `ContractDetailView` (sub-abas de Itens/Financeiro, mesmo dia) — `TabsBar`.

## Itens

- [x] **`components/ui/TabsBar.tsx`** — `accent` ganha `indigo` e `portal` (coral), as duas
  cores da barra principal do pedido; documentado em `docs/ui_ux_guia_unificado.md` §19.1.
  **Pronto quando:** `tsc` limpo.
- [x] **`components/SupplyChainOrderDetails.tsx`** — `TabsBar` no topo da aba Recebimento:
  Rastreamento logístico · Conferência de entrega (nº de recebimentos; com divergência
  pendente, nº delas em vermelho) · 3-way match (só comprador). Cada bloco existente passa a
  aparecer só na sua sub-aba; estado vazio da Conferência vale para os dois perfis (antes só
  fornecedor), com texto por perfil. Atalho de logística (`initialView='logistics'`) abre em
  Rastreamento. Fornecedor com escolha "match" cai em Conferência.
  **Pronto quando:** `tsc` limpo, `check-ui-standard.sh` sem achado novo, `orgContextGuard` verde.
- [ ] **Conferência na tela** — PCO-011-017-0002 (Recebido → abre em Conferência; 3 sub-abas
  para o comprador; 2 no link do fornecedor, coral). Depende do teste do usuário (senha do
  agente-leitura recusada desde 17:45).
