# Portal do Cliente (visão do cliente) com o layout do Portal do Fornecedor

## Pedido original

Sessão de 2026-09-22 (VS Code, frente `portal-cliente-layout-fornecedor`):

> aplicar o mesmo layout do Portais < painel do fornecedor (visão do fornecedor) no Portais < painel do Cliente  (visão do Cliente)

## Leitura do pedido

"Painel do fornecedor (visão do fornecedor)" = Portais › Portal do Fornecedor,
depois de clicar num fornecedor da lista (`supplier/SupplierPortalManager.tsx`
→ `SupplierDashboard.tsx` com `isAdmin`). A anatomia dessa tela, de cima para
baixo:

1. linha `← Voltar para Fornecedores` (esquerda) + botão `Link de Acesso` (roxo, direita);
2. título §20 solto — `h1` + subtítulo que mudam por aba (`TAB_META`) — com
   as ações do gestor à direita (prévia mobile, configurar abas);
3. KPIs da aba (quando há);
4. barra de abas §19.1;
5. conteúdo.

"Painel do Cliente (visão do Cliente)" = Portais › Portal do Cliente, depois
de clicar num cliente (`ClientArea.tsx` com `isAdmin && clientProfile`). Tinha
um **card branco** com avatar quadrado, mancha índigo desfocada, "Olá, Nome" e
as ações (Meus dados, prévia, configurar, **Trocar cliente**) — e nenhum
"Link de Acesso" (o modal vivia só na lista, `ClientList.tsx`).

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/client/ClientPortalLinkModal.tsx` (novo) | Modal "Link de Acesso" extraído de `ClientList` (estado + gerar/copiar/regenerar/revogar + aviso de unidades de condomínio) | ✅ arquivo existe; `tsc` limpo; `check-ui-standard.sh` limpo |
| 2 | `components/ClientList.tsx` | Usa o modal extraído (`tokenModalClient`); some o estado/handlers/JSX duplicados | ✅ 160 linhas removidas, todas do modal; ícone de link nas duas vistas (tabela e grade) continua abrindo o modal |
| 3 | `components/ClientArea.tsx` | Visão do gestor ganha a linha `← Voltar para Clientes` + `Link de Acesso`; card branco vira título §20 (`h1` + subtítulo por aba, `TAB_META`) com as ações à direita; "Trocar cliente" sai (é o "Voltar"); ritmo vertical `space-y-6` (§20) em vez de `space-y-8` | ✅ `tsc` limpo; ✅ prints: h1 em y=163 e abas em y=258 nas duas telas (fornecedor e cliente Vendas), viewport 1600×1000 |
| 4 | Verificação visual (Playwright, `c:/tmp/pwtest/portal_cliente_layout.js`) | Login com o usuário de leitura pela "Área do Desenvolvedor" (`role = DEVELOPER` → `isAdmin`; RLS igual), abrir os dois painéis, comparar; escritas no PostgREST abortadas | ✅ prints em `c:/tmp/pwtest/relatorios/pc_*.png`: fornecedor, cliente Vendas (dashboard + Financeiro), cliente Locação (hero), modal do link pelo painel E pela lista; 0 erros de console |
| 5 | `__tests__/orgContextGuard.test.ts` | Baseline de `organizations[0]` perde a entrada de `ClientList.tsx` (dívida paga) | ✅ 14/14 — o teste acusou o `organizations[0]` que eu tinha LEVADO junto para o modal novo; o modal usa `useOrgContext` + `useOrgWriteTarget('single')` |

## Decisões

- **Org dona do link (REGRA #5)**: prop do AppRouter → `useOrgContext().orgId`
  → `client.organization_id` → `resolveWriteOrg('single')` (pergunta só em
  "Todas" com cliente global). O `organizations.length === 1 ? organizations[0]`
  antigo já é o que o hook faz por dentro. `orgTargetModal` fica FORA do overlay
  do modal (clique não borbulha para o `onClose`) e o overlay é `z-[200]`
  (< 210 do modal do hook).

- **Dashboard de Locação/Serviços mantém a faixa colorida** (decisão de
  `14c4d02d`, "um card, não dois"): ali a saudação e as ações continuam
  dentro da faixa; o que entra por cima é só a linha Voltar + Link de Acesso.
  Nas demais abas (e no dashboard de Vendas) vale o título §20.
- **Acesso por link público (`isStandalone`) não muda**: o card de
  boas-vindas continua lá — o pedido é sobre a visão do gestor em Portais.
- Prévia mobile e Configurar abas continuam como `ActionIconButton`
  (padrão canônico), não os botões à mão do `SupplierDashboard`.
- `TAB_META` é `Partial<Record<ClientAreaTabId, …>>` porque o tipo ainda
  carrega o id legado `'clientes'`, sem aba em `ALL_TABS`.
- `check-ui-standard.sh` acusa §8 em `ClientArea.tsx:2506/2638` — bolinhas
  de legenda de gráfico (`rounded-full` + rótulo em caixa alta), código
  pré-existente fora do escopo; não é pílula de status.
