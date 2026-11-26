# Portal do Cliente abria em "Acompanhamento de Obra" para quem não tem essa aba

## Pedido original

Sessão `bef90ec4-4d31-470b-a193-71ce97673653` · 26/11/2026. Na prova das assembleias, o portal do
condômino de teste (só a aba Condomínio) abriu em "Acompanhamento de Obra" depois de recarregar. Eu
reportei como "fora do escopo, comportamento que já existia". O usuário respondeu:

> corrigir: Uma observação fora do escopo: o cliente que só tem a aba Condomínio, ao recarregar a página, abre em "Acompanhamento de Obra" e não no Condomínio. Esse comportamento já existia antes deste trabalho.
>
> inicie fase B

## Causa

`components/ClientArea.tsx:153` — `useState(initialTab || 'dashboard')`. A aba inicial nunca era
conferida contra as abas liberadas (`enabledTabIds`); `dashboard` não liberado renderizava o painel
genérico ("Acompanhamento de Obra"). Medido no banco (26/11): 3 clientes reais com `portal_tabs` sem
`dashboard` (ex.: `["financeiro","condominio","manutencao"]`).

## Plano

### 1. `utils/clientPortalTabs.ts` — `abaVisivelDoPortal(atual, liberadas, ehAdmin)`

**O que muda:** fora das liberadas → primeira liberada; administrador (vê todas para configurar) e
lista vazia não trocam.
**Como sei que terminou:** `__tests__/clientPortalAbaInicial.test.ts` (5 casos) — falhavam
("is not a function"), passam.

### 2. `components/ClientArea.tsx` — efeito que aplica a regra

**O que muda:** depois de `enabledTabIds`, um efeito troca `activeTab` pela aba visível. `isAdmin` já
é falso na prévia do gestor, então a prévia vê o mesmo que o cliente.
**Como sei que terminou:** `__tests__/components/ClientPortalAjuda.test.tsx › aba inicial` (o
`ClientArea` montado de verdade): "cliente só com a aba Condomínio abre no Condomínio" falha sem a
correção (mostra "Acompanhamento de Obra") e passa com ela; "cliente com o dashboard liberado
continua abrindo nele" passa nas duas.

## Estado

- [x] 1, 2 — vermelho → verde (26/11)
- [x] publicado — PR #770 (4174226), domínio servindo 4174226

Prova com cliente real de teste no banco de produção foi barrada pelo classificador (criar dado em
produção); a prova é o componente montado em teste.
