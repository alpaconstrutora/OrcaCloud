# ÒPURA Market — média de preço separada por tipo de imóvel

## Pedido original

> ÒPURA Market Intelligence: analise

Sessão `f6c48839-c063-4c06-86b3-c7c17e5cfe46` · 19/10/2026.

A análise (só leitura, sem commit) terminou com quatro recomendações. A primeira, como
foi escrita na resposta:

> 1. **Separar a média do raio por tipo de imóvel.** O estudo escolhe a tipologia e o
>    terreno sai da média. Corrige o VGV já, sem depender de ninguém.

E a pergunta final: *"Quer que eu abra a frente do item 1?"*. Resposta do usuário, na
mesma sessão:

> sim

### Pedido posterior (19/10/2026, mesma sessão)

O relatório da frente terminou com três pendências: (1) conferência na tela, que precisa
da senha do agente-leitura; (2) publicar; (3) *"O campo novo do estudo usa o mesmo estilo
de rótulo antigo (caixa alta) do resto do cartão, de propósito, para não misturar estilos
no mesmo cartão. Migrar o cartão inteiro para o padrão novo do guia (§21) fica para outra
frente."* Resposta do usuário, literal (a senha foi omitida aqui):

> Pendências:
> 1. [senha]
> 3. Implementar

Vira o item 8 abaixo.

## O defeito, medido no banco em 19/10/2026

As quatro RPCs que calculam R$/m² fazem `AVG(price_per_m2)` sobre todos os anúncios,
sem olhar `property_type`:

| Tipo | Anúncios | R$/m² médio | Área média |
|---|---|---|---|
| Terreno | 143 | 385 | 6.209 m² |
| Casa | 106 | 7.734 | 2.213 m² |
| Apartamento | 105 | 6.022 | 93 m² |
| Comercial | 4 | 6.297 | 339 m² |

Raio de 2 km no centro do bairro Centro (Cambuí): **R$ 4.218/m² com terreno** e
**R$ 4.947/m² sem terreno**. Em `calcularVocacao` (`utils/opuraMarketVocacao.ts`) essa
média é o preço de venda do VGV, escolhe o padrão construtivo e decide a velocidade de
vendas pelo limiar de R$ 4.500. Com o terreno dentro, o VGV sai ~15 % abaixo e a
velocidade troca de faixa (8,2 % em vez de 6,5 % ao mês). O total de anúncios do raio, que
entra no risco como "concorrentes", também conta terreno.

O mesmo vale para o lado do bairro: `get_market_neighborhood_stats` (DNA e cor do mapa),
`get_market_neighborhood_dinamica` (Saturação, Score, variação de preço) e
`get_market_neighborhood_series` (gráfico de evolução).

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | Tirar o terreno à força ou deixar escolher? | Escolher ("o estudo escolhe a tipologia"). Padrão = todos os tipos **menos Terreno**. Preço de terreno por bairro continua possível marcando só "Terreno" — é dado útil para incorporação, não deve sumir. |
| 19/10/2026 | O lado do bairro (DNA, mapa, Saturação/Score, série) entra? | Entra: é o mesmo defeito nas três RPCs irmãs, e o Score usa a média da praça. Seletor próprio no cartão do mapa, separado do seletor do estudo (o estudo guarda os tipos dele). |
| 19/10/2026 | Componente do seletor | Guia §5.4: múltipla escolha **estende o `FilterPopover`** com `multiple`, não monta outro popover. |
| 19/10/2026 | O que é "nenhum tipo"? | Não existe: o seletor não deixa desmarcar o último (motivo no `title`). Na RPC, `p_tipos` NULL = sem recorte, para o front em produção continuar funcionando entre a migration e o deploy. |

## Plano

1. **`supabase/migrations/aplicar_20271019900000_opura_market_media_por_tipo.sql`** —
   as quatro RPCs ganham `p_tipos text[] DEFAULT NULL` (`NULL` = todos). DROP da
   assinatura antiga + CREATE da nova na mesma transação; continuam `SECURITY INVOKER`,
   `LANGUAGE sql`, `STABLE`; `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`.
   **Pronto quando:** aplicada no remoto; `pg_proc` mostra só a assinatura nova de cada
   uma, ACL sem `=X` e sem `anon`; chamada com 3 argumentos nomeados (o front publicado)
   devolve o mesmo número de antes; com `{Apartamento,Casa,Comercial,Outro}` o raio de
   2 km do Centro dá 123 anúncios e R$ 4.947/m².
2. **`utils/opuraMarketTipos.ts`** (novo, puro) — vocabulário dos tipos (o mesmo de
   `tipoDoImovel` na Edge), padrão sem terreno, normalização (descarta desconhecido,
   duplicado e lista vazia → padrão), resumo para o gatilho ("Sem terreno", "Só
   Terreno", "Apartamento, Casa"), leitura dos tipos gravados num estudo.
   **Pronto quando:** `__tests__/opuraMarketTipos.test.ts` verde.
3. **`components/ui/FilterPopover.tsx`** — prop `multiple`: `value`/`onChange` com
   lista, itens `menuitemcheckbox`, clique alterna sem fechar, último marcado não
   desmarca (desligado com o motivo), `resumo` opcional para o gatilho. Uso de escolha
   única inalterado.
   **Pronto quando:** teste de componente cobre alternar, não fechar, último travado e o
   modo único continua fechando ao escolher; `tsc` sem erro nos 12 usos existentes.
4. **`services/opuraMarketService.ts`** — as quatro leituras recebem `tipos` e mandam
   `p_tipos`. **Pronto quando:** `tsc` limpo e os chamadores passam os tipos.
5. **`types/market.ts` + `hooks/useMarketVocacao.ts` + `components/market/MarketEstudosPanel.tsx`**
   — o estudo tem seu seletor "Tipos comparados" (padrão sem terreno); trocar os tipos
   descarta o resultado (precisa nova consulta); os tipos usados vão em
   `radius_stats.tipos` e voltam ao reabrir; estudo salvo antes disto mostra "todos os
   tipos (estudo anterior a 19/10/2026)". O resultado diz quantos anúncios entraram e
   de quais tipos; o aviso de raio vazio cita os tipos.
   **Pronto quando:** na tela, Centro 2 km com o padrão mostra R$ 4.947/m² e 123
   anúncios; marcando Terreno junto volta a R$ 4.218/m² e 147.
6. **`components/OpuraMarketModule.tsx` + `components/market/MarketMapaPanel.tsx` +
   `hooks/useMarketIndicadores.ts` + `components/market/MarketBairroDna.tsx`** — seletor
   "Tipos" no cartão do mapa (`usePersistedState`, padrão sem terreno); DNA, cor do
   mapa, dinâmica (Saturação/Score) e série do bairro leem com esses tipos; o cartão do
   DNA diz quais tipos está mostrando.
   **Pronto quando:** na tela, o DNA do Centro com o padrão difere do "todos os tipos" e
   trocar o seletor recolore o mapa sem recarregar a página.
7. **`utils/opuraMarketRelatorioPdf.ts` + `services/opuraMarketViabilidadeService.ts`** —
   o PDF diz os tipos comparados; a viabilidade do IMOVIB leva o preço já recortado (só
   conferir: ela lê `stats.pricePerM2Avg`).
   **Pronto quando:** PDF gerado mostra a linha dos tipos.

8. **`components/market/MarketEstudosPanel.tsx`** (pedido posterior) — a aba Estudos
   inteira (os dois cartões, para não misturar escalas na mesma vista, §16) no
   vocabulário do guia: cartão `rounded-[10px]`, título `SecaoTitulo` (§30), rótulo §21
   em sentence case, malha §30 (rótulo→campo 6 px, área e raio lado a lado), campos `h-9
   rounded-[6px]` com valor escuro (§32), botões §17 (`Button`; só "Calcular vocação" em
   azul sólido), excluir estudo por `ActionIconButton` (§9.2), vazio/carregando §11/§12.
   **Pronto quando:** `check-ui-standard.sh` limpo e o print da aba sem caixa alta nem
   `rounded-2xl`.

## Estado

- [x] 1 migration — **aplicada no remoto em 19/10/2026**. Provado: `pg_proc` só com as
  assinaturas novas, ACL `{postgres, authenticated, service_role}` (sem PUBLIC/anon),
  `prosecdef = false`; chamadas SEM `p_tipos` devolvem exatamente o mesmo JSON de antes
  nas quatro (raio, DNA, dinâmica, série); com `{Apartamento,Casa,Comercial,Outro}` o raio
  de 2 km do Centro dá 123 anúncios e R$ 4.946,98/m² (antes 147 e R$ 4.218,05); só
  Terreno, 24 e R$ 573,40. DNA do Vila Santo Antônio: R$ 3.831,91 → R$ 5.595,96.
- [x] 2 util de tipos — `__tests__/opuraMarketTipos.test.ts` (9 testes) verde.
- [x] 3 FilterPopover `multiple` — `__tests__/components/FilterPopoverMultiplo.test.tsx`
  (5 testes) verde; `tsc` limpo nos 11 outros usos. O item que não pode ser desmarcado usa
  `aria-disabled` (não `disabled`) para o `title` com o motivo aparecer no hover.
- [x] 4 service — `tsc` limpo (os quatro métodos EXIGEM `tipos`; o compilador aponta todo chamador).
- [x] 5 estudo de vocação — **conferido na tela** (Playwright, dev server da frente,
  agente-leitura, toda escrita REST abortada — nenhuma tentada). Ponto marcado no Centro
  (-22.611951, -46.058049), raio 3 km: padrão "Sem terreno" = 124 anúncios, R$ 4.931,98;
  marcando Terreno = 149, R$ 4.181,92; só Casa = 48, R$ 3.358,86 — os três iguais ao SQL no
  mesmo ponto. Último marcado travado com o motivo no `title`. Reabrir estudo (dois estudos
  falsos injetados só na resposta de leitura): "só Terreno" volta com o seletor em "Só
  Terreno"; estudo sem `tipos` volta neutro com "todos os tipos (estudo salvo antes de
  19/10/2026)". `c:/tmp/pwtest/market_media_por_tipo.js` e `market_tipos_reabrir.js`.
  ⚠️ **Achado no navegador e corrigido:** cada troca de tipos refaz a consulta e, com
  cliques seguidos, uma resposta antiga chegava depois — seletor em "Só Casa", resultado
  de "Casa e Outro". Guarda de consulta mais recente em `analisar` (`consultaAtual`);
  reconferido: após 4 cliques rápidos a tela mostra "Só Casa" e a base "Casa".
  Salvar estudo e gerar PDF NÃO foram exercitados na tela (escrita bloqueada; o PDF só
  ganhou uma linha).
- [x] 6 mapa / DNA / indicadores — **conferido na tela**: gatilho "Tipos · Sem terreno";
  DNA do Centro R$ 6.291/m² e 71 ativos (= SQL); marcando Terreno, R$ 5.982 e 75; a escolha
  persiste em `opuraMarket:tiposDoMercado`; "Restaurar padrão" volta a "Sem terreno". As
  RPCs de DNA, dinâmica e série saem com `p_tipos`.
- [x] 8 aba Estudos no padrão do guia — `check-ui-standard.sh` limpo, travas de cinza
  verdes, prints `c:/tmp/pwtest/market_tipos/3_*.png` e `6_*.png`. Raio com rótulo curto
  ("3 km · influência"): o longo cortava na meia largura.
- [x] 7 PDF / IMOVIB — PDF ganha a linha "Tipos de Imóvel Comparados"; IMOVIB lê
  `stats.pricePerM2Avg`, que já vem recortado (sem mudança). PDF não gerado na tela.

`tsc` do projeto inteiro caiu 2× com 0xC0000005 (instabilidade conhecida da máquina, sem
erro de TS); a prova de tipos foi por `tsconfig` restrito aos arquivos tocados e aos 11
usos do `FilterPopover` (com dependências), exit 0 nos dois. A CI do PR é a prova completa.

## Verificação

- `npx vitest run __tests__/opuraMarketTipos.test.ts __tests__/opuraMarketVocacao.test.ts __tests__/opuraMarketIndicadores.test.ts __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` + o teste do `FilterPopover`.
- `tsc --noEmit` (pelo PowerShell, heap alto) e `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.
- Banco: as consultas do item 1.
- Tela, com Playwright no dev server da frente: itens 5 e 6.
