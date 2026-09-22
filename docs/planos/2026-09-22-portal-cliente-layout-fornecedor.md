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

## Pedido 2 (mesma sessão, depois da 1ª publicação)

> faca novamente. muita coisa ainda nao esta no mesmo UI UX. exemplo, canto superior direito

### O que ainda divergia (levantado aba por aba, print × print, 1600×1000)

| Onde | Fornecedor | Cliente (antes) | Agora |
|---|---|---|---|
| Canto superior direito | 2 botões-ícone `p-2.5 bg-white border-gray-100 rounded-xl text-gray-400` (prévia, abas) | botão azul "Meus dados" + 2 `ActionIconButton` | mesmas classes do fornecedor; "Meus dados" só na visão do próprio cliente (gestor edita em Meus Clientes) |
| Aba oculta | `text-gray-300 border border-dashed` + `EyeOff` | só `text-gray-300` | idem fornecedor, com `title="Oculta para o cliente"` |
| Rodapé "Poderoso e intuitivo…" | não existe na visão do gestor | aparecia | só `isStandalone` |
| Dashboard Locação/Serviços (desktop) | título §20 + `KpiCard` | faixa gradiente com avatar/saudação/ações | título §20 + grade de `KpiCard` (Próximo Vencimento, Contratos, Chamados, Cobranças Pagas · Total Contratado, Contratos); a faixa segue no mobile |
| Conteúdo das 14 abas | escala compacta §16, `h3 text-sm font-bold`, vazio §12 | `rounded-[2.5rem]`/`3xl`/`2xl`, `font-black`, `uppercase tracking-widest`, `shadow-xl`, `p-10`, vazios em caixa alta cinza | passe mecânico (327 + 25 + 21 linhas) fora dos blocos mobile/casca/modais; vazios §12 (ícone 12 · h3 lg · p sm) em Dashboard, Contratos, Obra, Cronograma, Jornada, Documentos, Diário, Suporte, Manutenção |
| Manutenção | — | título interno + botão âmbar + 3 cards à mão | `KpiCard` ×3 → abas → toolbar §5.3 com "Abrir Chamado" §17 |
| Diário | — | `h3 text-xl` "Histórico…" + toggle + botão índigo | toolbar §5.3: toggle §5.1 + "Nova Entrada" §17 |
| Visual | — | título interno "Visão Real da Obra" duplicando o h1 | removido; `ProjectGallery` no vocabulário compacto |
| Filhos das abas | — | `ProjectGallery`, `client/CondominioTab`, `client/UnidadeTab`, `FinishSelection` no vocabulário antigo | mesmo passe mecânico |

### Fora do escopo desta rodada (registrado, não feito)
- `FinishSelection` mantém a faixa gradiente "Studio de Personalização" (é protótipo com imagens quebradas; aba oculta por padrão).
- As sub-abas da galeria (`ProjectGallery`) usam sublinhado, não o trilho §19.1.
- Blocos mobile, casca do link público e modais não entraram no passe (decisão: o pedido é a visão do gestor no desktop).

### Erros meus nesta rodada, pegos pelo print
- `\b` no fim de regex não casa depois de `]`: `rounded-[2.5rem]` e `tracking-[0.2em]` passaram ilesos na 1ª execução.
- `<p className="text-(sm|xs) font-bold …` → `%s` com o grupo sem o prefixo gerou `className="xs …"` em 24 linhas.

## Pedido 3 (mesma sessão)

> [print do menu de conta do Portal do Fornecedor: chip "Sebastião Eugênio (FORNECEDOR)" → Meus dados · Preferências · Notificações · Ajuda e comandos] implemente assim no portal do cliente

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 6 | `components/ClientArea.tsx` (casca do link público) | Menu de conta com os 4 itens do fornecedor. "Notificações" abre o painel real de avisos (adiado 1 tick, porque o painel fecha em qualquer clique no documento); "Preferências" e "Ajuda" com o mesmo toast do fornecedor | ✅ Playwright no `/portal-cliente?token=…`: itens `["Meus dados","Preferências","Notificações","Ajuda e comandos"]`, painel de notificações abre, 0 erros |

Cor do avatar/chip continua índigo (identidade do portal do cliente); o coral é
exclusivo de investidor/fornecedor (§24).
