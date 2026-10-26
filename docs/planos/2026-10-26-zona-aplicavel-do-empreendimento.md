# Zona aplicável do empreendimento + importar só as zonas que valem

## Pedido original

> como seleciono um item do mapa regulatorio?
>
> (print: Empreendimentos › 011 - Garden Cambuhy › aba Mapa Regulatório, com as 175 zonas
> de Cambuí importadas e a célula "Urbanização Consolidada" da linha ZEPEC 2 em foco)

Respondido que a aba não tem seleção (a escolha é por planta, na Planta Inteligente) e
oferecidas duas melhorias: **A** — marcar a zona do empreendimento na própria aba (a Planta
já vem com ela); **B** — enxugar a lista (importar com zonas desmarcadas, busca e opção de
substituir as atuais).

> a+b juntos

Sessão: 964ec410-d42a-4f6a-85fa-2d467fc1d716 · 26/10/2026

## Contexto medido (26/10/2026)

- Garden Cambuhy: 175 zonas no empreendimento (todas as do mapa de Cambuí — o modal vinha
  com tudo marcado). As 2 plantas ligadas têm "ZEPEC 2 · Urbanização Consolidada" aplicada,
  mas o `regulatory_zone_id` gravado não existe mais em nenhuma tabela (zona de origem apagada).
- O mapa de Cambuí (Alpa) tem 175 linhas para 59 pares macroárea × zona: a tabela da lei
  entrou 3 vezes (blocos sort_order 5 / 63 / 121) com colunas diferentes preenchidas. **Fora
  deste plano** — limpeza do cadastro da cidade, decisão do usuário sobre qual linha vale.
- A tabela de zonas mostra "—" quando o valor gravado não está nas opções do select
  (opções são as do PDE de São Paulo): "Industrialização e Desenvolvimento Econômico",
  "ZM1", "ZV - Eixo Vert.", "ZEPEC 1ª" aparecem vazias. Entra no item 4 — sem isso não dá
  para reconhecer a zona que se quer marcar.

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 26/10/2026 | A, B ou os dois? | A + B juntos |
| 26/10/2026 | Onde guardar a marca? | Coluna `aplicavel` na própria zona (`empreendimento_regulatory_zones`) com índice único parcial — a Planta já recebe a zona com a marca, sem consultar o empreendimento. No máximo uma por empreendimento; o banco garante. |
| 26/10/2026 | Planta com zona já salva | A marca só entra sozinha quando a planta NÃO tem nada salvo (mesma regra da zona única de 21/10). Nunca passa por cima do que foi aplicado ou ajustado à mão. |

## Plano

1. **`supabase/migrations/20271026950000_zona_aplicavel_do_empreendimento.sql`** — coluna
   `aplicavel boolean not null default false` + `create unique index … (empreendimento_id) where aplicavel`.
   *Terminou quando:* aplicada no remoto e `information_schema`/`pg_indexes` mostram coluna e índice.
2. **`types/empreendimento.ts`** — `aplicavel?: boolean` em `EmpreendimentoRegulatoryZone`.
   *Terminou quando:* `tsc` limpo.
3. **`services/empreendimentoService.ts`** — `aplicavel` em `REGULATORY_ZONE_COLS`;
   `marcarZonaAplicavel(empreendimentoId, zonaId | null)` (desmarca a atual, marca a nova, registra
   no Histórico); `deleteRegulatoryZones(ids)` em lote (pedaços de 100, um insert de auditoria).
   *Terminou quando:* `__tests__/zonaAplicavelEmpreendimento.test.ts` verde.
4. **`components/RegulatoryZoneTable.tsx`** — prop opcional `aplicavel` (id marcado + `onMarcar`):
   1ª coluna "Aplicável" com rádio, linha marcada em destaque, legenda com a zona marcada no
   cabeçalho; select mostra o valor gravado mesmo fora da lista de opções. Sem a prop, nada muda
   (cadastro da cidade).
   *Terminou quando:* `__tests__/components/RegulatoryZoneTableAplicavel.test.tsx` verde e
   `check-ui-standard.sh` sem achado novo.
5. **`components/MapaRegulatorioEditor.tsx`** — liga a marca (estado local, §22) e repassa
   `existingZoneIds` ao modal para substituir.
   *Terminou quando:* marcar/desmarcar na tela grava e sobrevive ao recarregar.
6. **`components/regulatoryMap/ImportRegulatoryZonesModal.tsx`** — zonas vêm desmarcadas; busca;
   "Marcar todas/Desmarcar"; cada zona mostra C.A./T.O. para distinguir linhas de mesmo nome;
   "Substituir as N zonas atuais" (com `useConfirm`): importa primeiro, apaga as antigas depois.
   *Terminou quando:* `__tests__/components/ImportRegulatoryZonesModal.test.tsx` cobre os casos.
7. **`services/regulatoryMapService.ts`** — `importZonesToEmpreendimento` devolve as zonas criadas.
   *Terminou quando:* teste do modal usa o retorno.
8. **`hooks/useBlueprintZonaUrbanistica.ts` + `components/blueprint/PainelZonaUrbanistica.tsx`** —
   sem nada salvo, a zona marcada entra sozinha (como a zona única); no select, a marcada leva
   "· aplicável no empreendimento".
   *Terminou quando:* `__tests__/blueprintZonaAutopreencher.test.ts` com o caso de 175 zonas e uma marcada.

## Estado

- [ ] 1 — arquivo escrito (`aplicar_20271026950000_…`); **NÃO aplicado**: o auto mode barrou a
  aplicação no banco remoto (26/10/2026). Precisa rodar ANTES do merge — o front lê `aplicavel`.
- [x] 2 · [x] 3 · [x] 4 · [x] 5 · [x] 6 · [x] 7 · [x] 8 — testes verdes na frente
  (`zonaAplicavelEmpreendimento`, `RegulatoryZoneTableAplicavel`, `ImportRegulatoryZonesModal`,
  `blueprintZonaAutopreencher`); tsc limpo; build ok; `check-ui-standard` sem achado novo (o
  `useState` da cidade no modal já existia — §3.1).
- [ ] Verificação na tela (abaixo) — depende do item 1.

## Verificação

Garden Cambuhy: importar de Cambuí com "Substituir", marcando só ZEPEC 2 · Urbanização
Consolidada → a aba mostra 1 zona; marcar como aplicável → recarregar mantém; abrir a Planta de
um estudo sem zona salva → ZEPEC 2 aplicada sozinha.
