# Condomínio no portal: Manutenção, Ativos e Financeiro

## Pedido original

Sessão de 23/09/2026, com print das abas de Comercial › Condomínios:

> veja print do comercial < condominios: ainda nao apareceno portal manutencoes; ativos; financeiro; manutencao.

É a continuação direta da auditoria de
`docs/planos/2026-09-23-condominio-portais-conexao.md`, que já tinha registrado
estas três abas como "sem ponte para portal nenhum".

## Decisões do usuário (perguntadas antes de construir)

| Pergunta | Resposta |
|---|---|
| O que o condômino vê do Financeiro? | **Tudo, inclusive as outras unidades** — despesas + rateio unidade por unidade ("transparência de assembleia") |
| Quanto vê de Manutenção e Ativos? | **Plano + ordens + ativos**, em leitura |
| Quais rateios aparecem? | **Fechado e em aberto**, com o em aberto rotulado como prévia |

Consequência da 1ª: a cota de cada vizinho, com o nome de quem é cobrado, fica
visível para todos os condôminos do prédio. É escolha explícita entre três
opções apresentadas — não vazamento acidental. Documento e contato de terceiro
continuam fora, como já valia para `ocupacoes`.

## O que mudou

- `supabase/migrations/20270923000002_...sql` — `fn_condominio_payload_for_client`
  ganha quatro coleções: `manutencao` (itens ativos de plano VIGENTE), `ordens`,
  `ativos` e `rateios` (com `despesas` e `cotas`). O payload é um só, então as
  duas portas do portal (token e cliente logado) recebem tudo sem drift.
  **Pronto quando:** a RPC por token devolve as quatro chaves e a ACL da função
  continua restrita a postgres/service_role. ✔
- `services/clientPortalService.ts` — os quatro tipos novos e o spread sobre
  `CONDOMINIO_VAZIO`, para o bundle não estourar num `.map` de `undefined`
  enquanto o deploy de frontend e o de migration não coincidem. ✔
- `components/client/CondominioTab.tsx` — as três seções, `periodicidade()` e
  `competencia()` exportadas para teste. ✔
- `__tests__/condominioPortalCliente.test.ts` — 6 casos novos. ✔

### Recortes que NÃO foram ao portal (e por quê)

- **Custo da ordem de serviço** (`maintenance_orders.cost`): quanto se pagou ao
  fornecedor é negociação da administração; o total gasto o condômino vê pelo
  rateio.
- **Valor de compra, fornecedor e número de série do ativo**: mesma razão. A
  garantia entra, porque é o que o condômino tem interesse legítimo em cobrar.
- **Rateio CANCELADO**: o vocabulário é RASCUNHO | FECHADO | CANCELADO, e
  cancelado é decisão desfeita, não "em aberto". São **4 dos 5** rateios da base
  — sem esse corte o condômino veria cobrança que a administração já anulou.
- **Item de plano desativado**: decisão administrativa revogada; mostrá-lo faria
  o condômino cobrar manutenção que não existe mais.

## Defeito encontrado de lambuja (e corrigido)

`ClientArea.tsx` tinha um **segundo** ponto de chamada de
`listAllClientInstallments` — o dashboard de Locação/Serviços — que a correção
de 23/09 (`85ac9a8`) não alcançou. Com token ele lia tabela direto (401 em
`commercial_deal_buyers`, vazio em `internal_transactions`) e ainda
**sobrescrevia**, via `.then(setGlobalClientInstallments)`, a lista que a RPC
tinha acabado de trazer. Quem é de locação via o dashboard zerar. Corrigido com
a mesma bifurcação do outro ponto. Prova: os 401 do console sumiram (2 → 0).

## Estado — feito, com prova

Prova visual no portal por link (Dynamis, Galeria Altavista), escritas
bloqueadas, 0 erros de página:

- **Financeiro** — "Competência 08/2026 · Taxa ordinária · rateada por valor
  igual por unidade · **Prévia — pode mudar**", despesas R$ 1.144,95, "Sua cota
  R$ 95,41", as 14 despesas e as 12 cotas, com a linha da própria unidade
  destacada ("· sua unidade").
- **Manutenção** — item do plano (Elevadores, a cada 1 mês, vence 03/09/2026) e
  a ordem "Manutenção preventiva do Elevador · Preventiva · agendada para
  10/07/2026 · Agendada".
- **Equipamentos** — vazio rotulado (não há ativo cadastrado nestes prédios).

Portões: `check-ui-standard.sh` limpo nos dois `.tsx`, `check-xss-sinks.sh`
limpo, `tsc --noEmit` sem erro, suíte cheia **442 arquivos / 5111 testes** verde.

A trava `__tests__/segurancaMigrations.test.ts` reprovou a primeira versão da
migration por não ter `REVOKE EXECUTE ... FROM PUBLIC` literal. Não era
formalidade: `CREATE OR REPLACE` preserva a ACL no banco de hoje, mas num banco
NOVO a função nasceria com EXECUTE para PUBLIC. O REVOKE entrou.

## O que NÃO foi feito

- **`condomino_portal_get_data` (portal legado) não recebeu os três blocos.**
  São 0 links ativos; a superfície viva é a aba Condomínio do Portal do Cliente.
- **Qualidade do dado de origem.** As descrições das despesas do rateio são
  nomes de arquivo importados ("documento_3054431_21_05_2020.pdf",
  "BENEFICIÁRIO:ENERGISA…") e a descrição de um item do plano é "2". O portal
  mostra fielmente o que está cadastrado — a transparência escolhida expõe isso
  ao condômino. É cadastro, não renderização; decisão do usuário sobre limpar.
