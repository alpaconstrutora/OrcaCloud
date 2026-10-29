---
type: arquitetura
title: Visão geral da arquitetura
description: Mapa de alto nível do OrçaCloud/ÒPURA — SPA React 19 + Vite servida pelo Vercel sobre Supabase (Postgres com RLS, Auth, Storage, Edge Functions), as camadas componente → store/React Query → service → Supabase, pontos de entrada e como os módulos de produto se distribuem no código.
tags: [architecture, overview, stack, react, supabase, vite, modules]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-00dc81e442e44f56cd135352
    resource: repo://components/AppRouter.tsx
  - id: openwiki-source-33470089c88a88d57c27c5ee
    resource: repo://index.tsx
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
  - id: openwiki-source-5e1b077422a94ae165e88e4e
    resource: repo://vite.config.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Visão geral da arquitetura

O repositório é **uma SPA (single-page application)** multi-tenant para
construtoras e incorporadoras — gestão de obras, orçamentos, suprimentos,
financeiro, fiscal, RH/folha, comercial (vendas/locações/condomínio), Planta
Inteligente (editor 2D/3D) e uma família de portais externos. O nome de produto
nas telas é **ÒPURA** (`package.json` → `"name": "opura"`); "OrçaCloud" é o nome
histórico do repositório.

Não há servidor de aplicação próprio. O navegador fala direto com o
**Supabase**; regra de negócio sensível mora em **RLS, funções SQL (RPC) e
Edge Functions** do lado do banco.

```
Navegador (React 19 + TS, bundle Vite, PWA)
   │  supabase-js (chave anon + JWT do usuário)
   ▼
Supabase
   ├─ PostgREST  ── tabelas/views ── RLS por organização
   ├─ RPC        ── funções SQL (SECURITY DEFINER com autorização interna)
   ├─ Auth       ── e-mail/senha, convites, recuperação
   ├─ Storage    ── documentos, fotos, XML, PDFs
   ├─ Realtime   ── chat, notificações, colaboração na Planta
   └─ Edge Functions (Deno) ── Asaas, NF-e, e-mail, IA, downloads de portal, crons
Vercel ── hospeda o bundle; push em main = publicação
```

## Stack

| Camada | Tecnologia |
|---|---|
| UI | React 19, TypeScript (strict), Tailwind CSS v4 via `@tailwindcss/vite` |
| Build/dev | Vite 6, porta **3100**, PWA (`vite-plugin-pwa`) |
| Estado | Zustand (`store/useStore.ts`) + TanStack Query |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions em Deno) |
| Testes | Vitest (+ Testing Library/jsdom por arquivo) |
| Documentos | ExcelJS/xlsx, jsPDF, html2canvas, docxtemplater/mammoth, TipTap |
| Planta | Konva/react-konva (2D), Three.js/@react-three/fiber (3D), `web-ifc` (IFC) |
| Runtime | Node 24.x (`engines`), mas o CI roda com Node 20 |

## Pontos de entrada

| Arquivo | Papel |
|---|---|
| `index.html` → `index.tsx` | monta os provedores (React Query, confirmação, toast), trata chunk ausente e atualização do service worker |
| `App.tsx` | orquestrador raiz: rotas por pathname (portais, páginas públicas), guardas de sessão, overlay de carregamento, handlers de projeto/orçamento, `<Layout>` |
| `components/Layout.tsx` | sidebar, topo, busca de comandos, `ContextSelector` (organização → obra / empresa), tema |
| `components/AppRouter.tsx` | `switch (activeView)` com cada módulo em `React.lazy`; trava de rota por permissão |
| `lib/supabase.ts` | o único cliente Supabase, com corte de tempo por tipo de chamada |
| `supabase/functions/*` | Edge Functions (Deno), deploy separado do front |
| `supabase/migrations/*` | histórico SQL (mais de mil arquivos) — ver [Banco de dados e migrations](../operacao/banco-e-migrations.md) |

Detalhe da navegação em [Navegação, roteamento por abas e casca](./navegacao-e-telas.md).

## Camadas do front-end

```
Componente (components/**)
  ├─ useStore()            sessão, perfil, contexto do topo, view ativa
  ├─ hooks/use*            lógica reutilizável de tela (useOrgContext, useBlueprint*, use*Queries…)
  ├─ utils/** , lib/**     cálculo PURO (financeiro, folha, cronograma, geometria) — testável sem DOM
  └─ services/*.ts         regra de negócio + acesso a dados; ÚNICA camada que chama o Supabase
        └─ lib/supabase.ts
```

Convenções que aparecem em todo o código:

- **Services por domínio** (`services/financialService.ts`,
  `services/payrollService.ts`, `services/blueprint*Service.ts` …). Um service
  recebe `organizationId?: string | null` e só aplica `.eq('organization_id')`
  quando há organização — a RLS recorta o resto.
- **Cálculo puro separado do I/O.** `utils/` e `lib/` concentram o que tem
  fórmula (juros, folha INSS/IRRF, CPM do cronograma, kernel geométrico da
  Planta). É o que a suíte do Vitest cobre de forma mais densa.
- **Tipos de domínio** em `types/*.ts` (um arquivo por área, reexportados por
  `types/index.ts`) e tipos gerados do schema em `types_db.ts`.
- **Constantes de referência** (SINAPI, CUB, NBR 12721, tabelas fiscais) em
  `constants.ts`, `constants_nbr.ts` e `constants/`.

Estado e cache: [Estado global e acesso a dados](./estado-e-dados.md).

## Dois eixos transversais

Quase todo domínio passa por duas regras com trava mecânica:

1. **Organização (tenant).** Toda leitura e escrita sabe "de qual organização"
   pelo seletor do topo, via `hooks/useOrgContext.tsx`; o banco recorta por RLS
   sobre `organization_members`. Ver
   [Multi-tenancy e o seletor de organização](../conceitos/multi-tenancy-organizacao.md).
2. **Classificação de projeto.** A tabela `projects` guarda obra, orçamento,
   planejamento e diário, além de projetos de sistema. Telas que falam em
   "obra" recebem só obra. Ver
   [Projetos: classificação e projetos de sistema](../conceitos/classificacao-de-projetos.md).

## Módulos e onde moram

| Área | Telas (principais) | Serviços / lógica |
|---|---|---|
| Obras — orçamento | `BudgetEditor`, `ParametricEstimator`, `Sinapi*` | `sinapiService`, `budgetResolver`, `cubService`, `utils/nbr12721` |
| Obras — planejamento/diário | `PlanningDashboard`, `components/schedule`, `ProjectDiaryManager`, `DiaryMobileApp` | `utils/schedulingEngine`, `diaryEntryService`, `utils/diary*` |
| Suprimentos | `SupplyChain*`, `ProcurementModule`, `components/suprimentos`, `components/p2p` | `procurementService`, `quotationService`, `orderService`, `contractService` |
| Financeiro | `ContasPagarManager`, `ContasReceberManager`, `BankReconciliation`, `BoletoManager`, `FinancialDashboard` | `financialService`, `financialSyncService`, `bankReconciliationService`, `boletoService` |
| Fiscal | `components/fiscal`, `TributosAPagarManager` | `nfeService`, `fiscalService`, Edge `fiscal-nfe-processor` |
| RH / folha | `Labor*` | `laborService`, `payrollService`, `payrollEngine`, `lib/payroll*` |
| Comercial | `SalesModule`, `RentalsModule`, `components/empreendimento`, `components/condominio`, `Imovib*` | `empreendimentoService`, `negotiationService`, `commercialFinanceService`, `imovibService` |
| Planta Inteligente | `components/blueprint` (~190 arquivos) | `utils/blueprintKernel`, `utils/blueprint*` (~300 arquivos), `services/blueprint*Service` |
| Portais externos | `components/portal`, `portalColaborador`, `partner`, `supplier`, `broker`, `investor`, `sindico`, `credit/portal`, `training` | `*PortalService`, `*PortalTokenService`, Edge Functions de download |
| ÒPURA (governança, docs, ofícios, CNO, market, ativos) | `Opura*Module`, `components/oficios`, `components/market` | `opura*Service`, `docGen*Service`, `cnoService` |

Páginas por módulo estão em `openwiki/modulos/`.

## Build, testes e publicação em uma frase cada

- **Build**: `npm run build` = `tsc --noEmit` (heap ampliado: o projeto passou
  de 4 GB) + `vite build`. O `vite.config.ts` carimba o SHA do commit no bundle
  (`__BUILD_COMMIT__`) para provar de fora o que está no ar, e copia o
  `web-ifc.wasm` do `node_modules` para `/wasm/` a cada build.
- **PWA**: o service worker não pré-armazena JS (evita tela branca por hash
  velho), busca HTML sempre da rede e trata o REST do Supabase como
  `NetworkOnly` — respostas filtradas por RLS não podem ser cacheadas por URL.
- **Testes**: `npm run test` (Vitest, ambiente `node`; teste de componente
  declara `// @vitest-environment jsdom` no próprio arquivo). Ver
  [Testes e travas mecânicas](../testes/suite-e-travas.md).
- **Publicação**: push em `main` dispara o build de produção no Vercel; cada
  trabalho acontece numa "frente" (worktree) própria. Ver
  [Frentes, publicação e conferência](../operacao/publicacao-e-frentes.md).

## Documentos de raiz

`CLAUDE.md` (regras obrigatórias, cada uma com script ou teste de
verificação), `UI_PATTERNS.md`, `docs/ui_ux_guia_unificado.md`,
`RUNBOOK_DEPLOY.md` e `docs/planos/` (planos de implementação versionados,
com o pedido original) são vivos. Os `PLANO_MODULO_*.md` da raiz são PRDs
— não implicam que o módulo exista; confira o código.
