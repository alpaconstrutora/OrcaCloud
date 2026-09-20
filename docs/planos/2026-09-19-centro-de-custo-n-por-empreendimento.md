# Centro de custo: N por empreendimento (fim do 1:1)

## Pedido original

Sessão de 2026-09-19 (~22h), na sequência de "incluir campo para alterar
organizacao em Editar centro de custo". O usuário tentou cadastrar um centro
de custo apontando para o empreendimento "011 - Garden Cambuhy" e a opção
veio desabilitada com "já vinculado a 005". Perguntou o que significava; a
resposta explicou o índice único e a premissa "cada empreendimento só pode
ter um centro de custo". Resposta do usuário, literal:

> essa premissa ( e cada empreendimento só pode ter um centro de custo) nao esta correta.
> um emprendimento pode ter mais de um centro de custo.

## De onde vinha o 1:1

`aplicar_20270905000024_condominio_rateio.sql` (Condomínios, 14/08/2026): "a
âncora é o centro de custo — um por condomínio: dois seriam duas verdades
sobre o mesmo caixa, e a despesa cairia num sem que o rateio do outro a
enxergasse". Foi a regra de um módulo (rateio condominial) que vazou como
regra do cadastro inteiro.

## Regra nova

- `cost_centers_v2.empreendimento_id` é **N:1**: vários centros de custo
  podem apontar para o mesmo empreendimento. Cada centro de custo continua
  apontando para no máximo um.
- **Rateio condominial soma as despesas de TODOS os centros de custo do
  condomínio.** Um centro de custo a mais não pode fazer despesa sumir do
  rateio em silêncio (é exatamente o risco que o comentário da migration
  descrevia — a resposta é somar, não proibir).
- `condominio_rateios.cost_center_id` (coluna única) guarda o primeiro por
  código — é rótulo, não filtro: a prévia já recebe a lista.

## Itens (um por arquivo) — como sei que terminou

| # | Arquivo | O que muda | Pronto quando |
|---|---|---|---|
| 1 | `supabase/migrations/20270919000030_cost_center_n_por_empreendimento.sql` | `DROP INDEX uidx_cost_center_por_empreendimento`; COMMENT da coluna reescrito | aplicada com `db query -f`; `\d`-equivalente no banco não lista mais o índice |
| 2 | `services/condominioRateioService.ts` | `getCentroDeCusto` → `getCentrosDeCusto` (lista por código); `previa` recebe `costCenterIds[]` (`.in`); `salvar` guarda o primeiro; `vincular` sem a tradução do índice | tsc limpo; teste unitário da prévia com 2 CCs somando |
| 3 | `components/condominio/FinanceiroTab.tsx` | estado `centros[]`; painel "Despesas vêm de" lista todos com Desvincular por linha; KPI/rodapé citam os códigos | tela compila; prova visual |
| 4 | `components/financeiro/LancarNoCondominioSheet.tsx` | `Grupo.costCenterIds[]` — títulos de 2 CCs do mesmo condomínio entram no mesmo rateio | tsc limpo |
| 5 | `components/CostCenterModule.tsx` | select Empreendimento sem "ocupado/já vinculado"; some `donoPorEmpreendimento`; textos | prova Playwright: opção do Garden habilitada |
| 6 | `services/costCenterService.ts` | comentários; `duplicate` passa a copiar `empreendimento_id` | tsc |
| 7 | `services/empreendimentoLinksService.ts` | comentários; sem tradução do índice único | tsc |
| 8 | `components/empreendimento/VinculacoesTab.tsx` | botões Criar/Vincular sempre visíveis na seção Centro de Custo (não só quando vazia) | tela compila |
| 9 | `types/financial.ts` | comentário do campo | — |
| 10 | `__tests__/condominioRateioNCentros.test.ts` | prévia com 2 CCs soma as despesas dos dois; `getCentrosDeCusto` ordena por código | vitest verde |

## Achado colateral (corrigido no item 2)

O fim da competência era `new Date('YYYY-MM-01')` + `setMonth(+1)` +
`toISOString()`: em America/Sao_Paulo dava `YYYY-MM+1-02`, então despesa
lançada no dia 1º do mês seguinte entrava no rateio do mês anterior. Trocado
por aritmética de string; coberto pelo teste (`t4` e caso de dezembro).

## Estado — 2026-09-19: 10 de 10

- Migration aplicada no banco remoto via `db query -f` e provada de fora
  (`pg_indexes` sem `uidx_cost_center_por_empreendimento`; COMMENT novo).
- `tsc` limpo; `check-ui-standard` limpo nos 3 componentes; testes:
  `condominioRateioNCentros` (7), `condominioRateio`, `costCenterMoveToOrganization`,
  `segurancaMigrations`, `orgContextGuard` verdes.
- Prova Playwright (escritas bloqueadas): select Empreendimento com 15 opções,
  0 desabilitadas, "011 - Garden Cambuhy" selecionável.
- Não provado visualmente: Condomínio › Financeiro com 2 centros de custo
  (nenhum condomínio em produção tem dois ainda) — coberto pelo teste unitário
  da prévia.
