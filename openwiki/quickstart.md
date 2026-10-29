---
type: guia
title: Guia rápido
description: Ponto de entrada do wiki do OrçaCloud/ÒPURA — o que o sistema é, como rodar, as regras que não se pode ignorar e qual página ler para cada tipo de tarefa.
tags: [quickstart, onboarding, overview, routing]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-af66b266e558bf4271ff4b84
    resource: repo://lib/supabase.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-5e1b077422a94ae165e88e4e
    resource: repo://vite.config.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Guia rápido

**OrçaCloud / ÒPURA** é um SaaS multi-tenant para construtoras e
incorporadoras: obras (orçamento SINAPI, planejamento, diário), suprimentos,
financeiro (títulos, conciliação, boletos, Asaas), fiscal (NF-e), RH/folha,
comercial (empreendimentos, vendas, locações, condomínio), a **Planta
Inteligente** (editor 2D/3D com kernel geométrico próprio) e portais para quem
está de fora (cliente, fornecedor, parceiro, investidor, corretor, síndico,
colaborador).

É uma SPA **React 19 + TypeScript + Vite**, publicada no **Vercel**, falando
direto com o **Supabase** (Postgres com RLS, Auth, Storage, Realtime, Edge
Functions em Deno). Não há servidor de aplicação próprio.

## Rodar

```bash
npm install          # Node 24.x
npm run dev          # http://localhost:3100  (precisa de .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY)
npm run test         # Vitest
npm run typecheck    # tsc --noEmit
npm run ci           # typecheck && test && build
```

## Antes de mexer em qualquer coisa

1. **Trabalhe numa frente própria**: `bash scripts/nova-frente.sh <nome>` (worktree a
   partir de `origin/main`). O checkout de integração costuma estar muito atrasado —
   não leia nem edite por ele.
2. **Chegar em `main` é publicar.** Não há comando de deploy; nunca
   `vercel deploy --prod`.
3. **Nunca `supabase db push`.** Migrations são aplicadas à mão com
   `npx supabase db query --linked -f <arquivo>`.
4. Leia o `CLAUDE.md` do repositório: as regras obrigatórias (UI, projetos de
   sistema, classificação de obra, seletor de organização, planos em
   `docs/planos/`, segurança de migrations, frentes) têm verificação mecânica e o
   CI quebra se forem violadas.

## Mapa do wiki por tarefa

| Vou… | Leia |
|---|---|
| entender a estrutura geral | [Visão geral da arquitetura](./arquitetura/visao-geral.md) |
| mexer em estado global, cache ou acesso a dados | [Estado global e acesso a dados](./arquitetura/estado-e-dados.md) |
| criar uma tela, rota ou item de menu | [Navegação e casca](./arquitetura/navegacao-e-telas.md) · [Padrões de interface](./interface/padroes-de-ui.md) |
| ler ou gravar algo "de uma organização" | [Multi-tenancy e o seletor de organização](./conceitos/multi-tenancy-organizacao.md) |
| listar obras, orçamentos ou planejamentos | [Projetos e classificação](./conceitos/classificacao-de-projetos.md) |
| mexer em login, perfis ou permissões | [Autenticação, perfis e permissões](./conceitos/autenticacao-e-perfis.md) |
| escrever policy, RPC ou Edge Function | [Segurança](./seguranca/rls-funcoes-e-edge-functions.md) · [Edge Functions](./integracoes/edge-functions.md) |
| escrever ou aplicar migration | [Banco de dados e migrations](./operacao/banco-e-migrations.md) |
| publicar ou conferir produção | [Frentes, publicação e conferência](./operacao/publicacao-e-frentes.md) |
| escrever ou rodar testes | [Testes e travas mecânicas](./testes/suite-e-travas.md) |
| contas a pagar/receber, como títulos nascem | [Títulos e sincronização](./modulos/financeiro/titulos-e-sincronizacao.md) |
| extrato e conciliação | [Conciliação bancária](./modulos/financeiro/conciliacao-bancaria.md) |
| boletos, Asaas/PIX, cobrança | [Boletos, Asaas e cobrança](./modulos/financeiro/boletos-asaas-e-cobranca.md) |
| NF-e e tributos | [Ingestão de NF-e](./modulos/fiscal/ingestao-nfe.md) |
| folha, encargos, colaboradores | [Folha de pagamento](./modulos/rh/folha-de-pagamento.md) |
| orçamento, SINAPI, CUB, NBR 12721 | [Orçamento e SINAPI](./modulos/obras/orcamento-e-sinapi.md) |
| cronograma, Gantt, diário de obra | [Planejamento e diário](./modulos/obras/planejamento-e-diario.md) |
| solicitação, cotação, pedido, contrato de fornecedor | [Suprimentos](./modulos/suprimentos/compras-e-contratos.md) |
| vendas, locações, corretores, condomínio, Imovib | [Comercial](./modulos/comercial/empreendimentos-vendas-e-locacoes.md) |
| algo num portal externo | [Portais externos](./modulos/portais/portais-externos.md) |
| Planta Inteligente — modelo, editor, importação | [Kernel e editor](./modulos/planta/kernel-e-editor.md) |
| Planta Inteligente — elétrica, hidráulica, incêndio, geradores | [Disciplinas e geradores](./modulos/planta/disciplinas-e-geradores.md) |

## Cinco armadilhas que mais voltam

1. **"Todas as organizações" é `null` na leitura e nunca `organization_id NULL` na
   escrita.** Não bloqueie carregamento por falta de organização.
2. **`useStore().projects` já é só obra**, sem "Gestão Comercial". Não filtre à mão;
   e nunca grave o id de projeto de sistema como `project_id`.
3. **Portal lê por RPC.** Tabela direta devolve `[]` sem erro para quem não é membro.
4. **O PostgREST corta em 1000 linhas em silêncio** — use `fetchAllPages` com
   ordenação determinística.
5. **Coluna nova no código antes da migration no banco = erro `42703`** em produção.

## Fontes da verdade

Código e testes mandam. Documentos de raiz `PLANO_MODULO_*.md` são PRDs (não
garantem implementação); planos vivos ficam em `docs/planos/` com o pedido
original. O guia de UI é `docs/ui_ux_guia_unificado.md`.
