# Plano — Investidores: a organização da tela é a do topo, nunca a da obra carregada

## Pedido original (22/11/2026, sessão e7b82365)

1ª mensagem (com print do Cadastro de Oportunidade, lista "Viabilidade vinculada" só com "Sem vínculo"):
> 2. Oportunidade (Incorporação › Oportunidades: Veja print não consigo vincular ao estudo. nao tem nenhum vinculo,
> é por que nao tem versão congelado no imovib?

2ª mensagem:
> nao é isso! Escolhi Construção do Edifício Garden Cambuhy SPE e não apareceu. Por favor nunca mais chute, apenas
> verifique e traga a resposta certa.

3ª mensagem (depois do diagnóstico):
> correção agora

## Diagnóstico (reproduzido no navegador do usuário, 22/11)

- Estado: topo em "Todas as organizações" (`orca_activeOrganizationId = TODAS`), obra "Divino Espírito Santo"
  carregada no contexto (`orca_projectSettings.organizationId` = Alpa Construtora e Incorporadora, 0 estudos).
- `AppRouter` passa `activeOrganizationId || undefined` → `undefined`.
- `InvestorDashboard`: `orgId = organizationId ?? settings?.organizationId ?? investorProfile?.organization_id` →
  cai na org da **obra carregada** (Alpa).
- `OpportunitiesTab`: "Nova oportunidade" pergunta a org (Garden SPE escolhida → `createOrgId`), mas o formulário
  recebe `organizationId || createOrgId` → Alpa. `getStudies(Alpa)` → lista vazia.
- Contraprova: com a Garden SPE no seletor do topo, a lista traz "Garden Cambuhy (v1.0)".
- O mesmo `orgId` errado chega, na visão do gestor, a: SPE (`SpeManager`, `CapitalCallPanel`), Financeiro
  (`PaymentsPanel`), Relatórios (`MonthlyReportTrigger`), envio de documento (`handleUploadReport`), detalhe do ativo
  (`AssetDetailModal`) e às contribuições carregadas (`listByInvestor`).

## Itens

| # | O que muda | Pronto quando |
|---|---|---|
| 1 | `InvestorDashboard`: na visão do gestor a org é `useOrgContext().orgId` (null = Todas), nunca `settings.organizationId`. A visão do investidor (link/portal/prévia) segue a org do investidor. | Teste: gestor com topo em Todas e obra de outra org carregada → filhos recebem `null` |
| 2 | `OpportunitiesTab`: criar usa a org resolvida no "Nova oportunidade" (topo ou modal); editar e detalhar usam a org da própria oportunidade. | Teste: topo em Todas + org X escolhida no modal → formulário recebe X |
| 3 | `SpeManager`: em "Todas" lista as SPEs de todas as orgs (RLS recorta); "Nova SPE" resolve a org (topo ou modal `'single'`); obras do formulário e investidores do sócio vêm da org da SPE; `CapitalCallPanel` recebe a org da SPE. `speService.list` aceita org opcional. | Teste do serviço e do componente |
| 4 | `MonthlyReportTrigger`: em "Todas" lista os recentes de todas; "Gerar" resolve a org (`'single'`). | Teste |
| 5 | Envio de documento (`handleUploadReport`): resolve a org (`'single'`) em "Todas". `AssetDetailModal` recebe a org da obra do ativo. | tsc + guard |

Verificação: `npx tsc --noEmit`, `npx vitest run __tests__/orgContextGuard.test.ts` e a suíte `investor*`/`Investor*`,
`check-ui-standard.sh` nos `.tsx` tocados; depois, no navegador, o mesmo caminho do usuário (topo em Todas → Nova
oportunidade → Garden SPE no modal → "Garden Cambuhy" na lista), fechando sem salvar.

## Estado
**Itens 1–5: 5 de 5 feitos no código** (frente `invest-org-topo`).
- 1: `InvestorDashboard` — gestor = `useOrgContext().orgId`; `orgDaLista` some (era a mesma coisa só para 2 leituras).
- 2: `OpportunitiesTab` — `editingOrganizationId = editing === 'new' ? createOrgId : editing.organization_id`; o
  detalhe usa a org da oportunidade.
- 3: `SpeManager` — "Nova SPE" resolve a org; obras da org da SPE; sócio filtrado por `investidorVisivelNaOrg`
  (regra única extraída de `investorService.listInvestors`); `CapitalCallPanel` com `entity.organization_id`;
  `speService.list(org?)`.
- 4: `MonthlyReportTrigger` — recentes sem filtro em "Todas"; "Gerar" resolve a org.
- 5: upload de documento resolve a org; `AssetDetailModal` com a org da obra do ativo.

Provas: `__tests__/components/InvestidorOrgDoTopo.test.tsx` — no código antigo 4 de 5 falham (o formulário recebia
"alpa"); no novo, 5 de 5. `tsc` 0 erros; 113 arquivos / 939 testes de investidor/oportunidade/SPE/portal/Guard verdes;
`check-ui-standard` e `check-org-selector-guard` limpos.
**NO AR** (PR #656, squash bd1629c; `conferir-producao.sh`: o domínio serve bd1629c).
Prova em produção (22/11, navegador do usuário, mesmo caminho do print): topo em "Todas", obra Divino Espírito Santo
(Alpa) no contexto → "Nova Oportunidade" → Garden SPE no modal → "Estudo do Imovib" lista "Garden Cambuhy (v1.0)";
escolhido o estudo, a versão "Conferência do portal · 16/11/2026" aparece. Fechado com Cancelar; 0 oportunidades no
banco. (Antes da correção, no mesmo caminho, a lista vinha só com "Sem vínculo".)
Observação: o formulário da Garden SPE mostra "Nenhuma SPE nesta organização" — não há `spe_entities` nessa org; a
SPE de teste do roteiro tem de ser criada nela.
