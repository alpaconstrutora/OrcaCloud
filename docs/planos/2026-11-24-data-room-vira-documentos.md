# "Data Room" da oportunidade passa a se chamar "Documentos" — 24/11/2026

## Pedido (literal)

> Vamos alterar o nome da Data room para Documentos. Assim empreendimentos, oportunidades e portal do investidor falam a mesma lingua

## Fatos conferidos (origin/main, 24/11)

- Empreendimento: a aba já se chama **Documentos** (`components/empreendimento/EmpreendimentoDetail.tsx`).
- Portal do Investidor › oportunidade: a aba já se chama **Documentos** (`components/investor/portal/PortalOportunidadeDetalhe.tsx`).
- Só o lado do gestor (Oportunidades › Ver) e os textos do GED diziam "Data Room".

## O que muda (só texto visível)

| Onde | Antes | Depois |
|---|---|---|
| Oportunidades › Ver: aba (gestor e prévia) | Data Room | Documentos |
| Aba: botão da lista de candidatos | Adicionar ao Data Room | Adicionar à oportunidade |
| Aba: lixeira | Tirar do Data Room (…) | Tirar da oportunidade (…) |
| Aba: lista vazia | Nenhum documento no data room | Nenhum documento compartilhado com esta oportunidade |
| Aba: todos já adicionados | …já estão no Data Room… | …já estão nesta oportunidade… |
| GED › Compartilhar (ajuda e revogar) | no Data Room da oportunidade | nos Documentos da oportunidade |
| Auditoria do GED | …com o Data Room de uma oportunidade… | …com uma oportunidade… |
| Erro de leitura | Falha ao ler o Data Room | Falha ao ler os documentos da oportunidade |

## Fora, de propósito

- Nomes internos (`DataRoomPanel`, `fn_investor_portal_get_dataroom`, Edge Function
  `investor-portal-dataroom-download`): o usuário não vê; renomear função do banco/Edge Function é
  risco sem ganho.
- Portal de Crédito (Credit Room): lá "Data Room" é outro módulo (banco/credor), não entra.

## Estado

Em PR.
