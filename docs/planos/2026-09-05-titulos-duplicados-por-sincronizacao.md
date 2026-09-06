# Títulos pendentes duplicados: três origens, três causas

## Pedido original

> **corrigir: Uma pendência de fora do escopo continua registrada e não foi tocada: há
> títulos pendentes duplicados, 49 grupos vindos do comercial, 28 de boletos e 14 da folha.
> O sync gera a mesma parcela mais de uma vez, e isso corrói a unicidade de que a
> conciliação automática depende.**
> Sessão de 05/09/2026, depois do relato de status do plano de conciliação bancária.

## Correção do diagnóstico

O parágrafo citado no pedido estava **errado em parte**, e a investigação desfez a
generalização. Não é um sync só, e uma das três origens nem é defeito.

| Origem | Grupos | O que realmente é |
|---|---|---|
| COMMERCIAL | 49 | **Defeito de código.** A série de parcelas é regravada inteira a cada sync, com identificadores novos, e concatenada sem conferência. |
| BOLETO | 28 | **Quase tudo legítimo.** São boletos diferentes com mesmo valor e vencimento, de pagadores distintos do mesmo condomínio. O defeito real é outro e maior: a deduplicação olha o arquivo, não o título. |
| LABOR | 14 | **Não é sync.** Uma folha foi apagada e seus lançamentos ficaram órfãos em Contas a Pagar. |

## Como cada uma foi apurada

**COMMERCIAL.** As linhas repetem descrição, valor e mês, com `reference_id` diferente e
todas criadas no mesmo dia. Exemplo real: "Fatura Contrato 005 (1) - junho de 2026",
R$ 600, cinco vezes, com vencimento alternando entre dia 10 e dia 20.
`contractService.syncRecurringToFinance` monta a série com `crypto.randomUUID()` por
parcela e chama `financialService.addTransactionBatch`, que fazia
`[...novas, ...existentes]` sem verificar nada, nas duas gravações. O espelho leva isso
para `internal_transactions` como COMMERCIAL.

**BOLETO.** Dos 76 títulos nos grupos, 67 têm linha digitável distinta: são boletos
diferentes de verdade. Mas, olhando a tabela inteira, 78 linhas digitáveis se repetem,
somando 83 boletos excedentes e R$ 117.911,57. A causa: `boletoService.uploadEProcessar`
deduplica por `documento_hash`, que é o SHA-256 do **arquivo**. O mesmo boleto baixado de
novo, rescaneado ou salvo com outro nome vira outro arquivo, outro hash, e passa. A coluna
`duplicado_de` existe e nunca foi preenchida; não há índice nenhum em `linha_digitavel`.

**LABOR.** O `reference_id` é `labor-{id da folha}-...`, e há dois ids distintos para a
mesma competência de abril de 2026, criados em dias seguidos. A primeira leitura foi
"fecharam a folha duas vezes", e estava errada: consultando `payroll_runs`, **só um dos dois
ids existe**. O outro foi apagado e deixou os lançamentos para trás. Ao todo, 16 títulos
órfãos de 2 folhas apagadas. Ver a correção 3.

## O que foi corrigido

### 1. Comercial: a gravação virou idempotente
**Arquivo:** `services/financialService.ts`.
- Novas funções puras `chaveNaturalDaTransacao` e `transacoesAindaNaoGravadas`. A identidade
  de uma parcela é data do vencimento, descrição, valor e tipo, porque o `id` é sorteado a
  cada regeração e nunca se repete.
- As duas gravações (cofre "Gestão Comercial" e JSON do projeto) passam a inserir só o que
  falta, e relatam quantas já existiam.
- **Pronto quando:** sincronizar o mesmo contrato três vezes seguidas deixa uma cópia de cada
  parcela. Coberto por `__tests__/titulosDuplicadosSync.test.ts`, 12 casos, incluindo o caso
  real das cinco faturas e o de contrato prorrogado, em que só a parcela nova entra.

### 2. Boleto: a identidade passou a ser a linha digitável
**Arquivo:** `services/boletoService.ts`.
- Segunda barreira depois da extração e antes da inserção: se já existe boleto na organização
  com a mesma linha digitável, devolve o existente como duplicata e apaga o arquivo recém-subido,
  para não deixar órfão no Storage.
- Fica depois da extração por necessidade: a linha digitável só existe depois de ler o PDF.
- **Pronto quando:** subir o mesmo boleto salvo com outro nome devolve o registro original em
  vez de criar um segundo.

### 3. Folha apagada não deixa mais título órfão
**Arquivo:** `services/payrollService.ts`.

A investigação corrigiu de novo o diagnóstico: **não houve fechamento duplo**. Das duas
execuções de folha citadas, só uma existe em `payroll_runs`; a outra foi apagada e seus
lançamentos ficaram. `deleteRun` removia itens, resultados e eventos, mas não os títulos
em Contas a Pagar. Resultado: 16 títulos órfãos, R$ 6.814,90, sem origem que os explicasse,
concorrendo por conciliação.

- `deleteRun` passa a chamar `cancelarTitulosDaFolha` antes de apagar a folha.
- Cancela, não apaga: título já conciliado é preservado e reportado, porque desfazer a
  conciliação é decisão de quem apaga a folha, não efeito colateral.
- **Pronto quando:** apagar uma folha deixa zero títulos `PENDING` apontando para ela.

## Limpeza do que já estava gravado

Migration `aplicar_20270919000018_limpeza_titulos_duplicados.sql`, aplicada em 06/09/2026.
**Nada foi apagado**: título vira `CANCELLED`, boleto vira `cancelado` com `duplicado_de`
apontando para o original. A única remoção é dentro do JSON do cofre comercial, e é
obrigatória: o espelho recria o título a partir dali, então cancelar sem limpar o JSON não
resolveria. Backup do JSON guardado antes.

A migration aborta se qualquer excedente estiver conciliado ou pago.

| Conferência | Antes | Depois |
|---|---|---|
| Grupos duplicados no comercial | 49 | 0 |
| Transações no JSON do cofre principal | 479 | 418 |
| Títulos de folha órfãos | 16 | 0 |
| Boletos com linha digitável repetida entre ativos | 63 grupos | 0 |
| Boletos marcados como duplicata | 0 | 68 |
| Títulos cancelados nesta limpeza | — | 112 |
| Títulos pendentes no total | 1.760 | 1.648 |
| Títulos cancelados que tivessem vínculo | — | 0 |

**Trava definitiva:** índice único parcial `boletos_org_linha_digitavel_uq` em
`(organization_id, linha_digitavel)`, restrito a `duplicado_de IS NULL`. Assim as duplicatas
já reconhecidas continuam existindo e qualquer inserção nova esbarra na trava.

**20 grupos de boleto continuam aparecendo** num agrupamento ingênuo por valor e data. Foram
conferidos um a um: todos têm linha digitável distinta. São boletos legítimos de pagadores
diferentes, e devem permanecer.

## O que exige decisão humana

**8 boletos duplicados estão marcados como PAGOS.** Ganharam `duplicado_de` mas o status foi
preservado de propósito. São 7 mensalidades da Softplan de 2017 e 2018, cada uma subida duas
vezes com nomes de arquivo diferentes, mais um boleto de R$ 6.892,63. Em cada par, as duas
cópias estão como pagas. Ou houve pagamento em duplicidade, ou a baixa caiu nas duas. Só a
conferência do extrato responde, e por isso a migration não decidiu sozinha.

Consulta para listá-los:

```sql
SELECT b.id, b.valor, b.vencimento, b.beneficiario_nome, b.documento_nome, b.duplicado_de
  FROM boletos b WHERE b.duplicado_de IS NOT NULL AND b.status = 'pago'
 ORDER BY b.vencimento;
```

## Estado

**CONCLUÍDO em 06/09/2026.** Commits `e4fd443` (causas do comercial e do boleto) e `75803b0`
(folha, limpeza e trava), publicados em `main` e conferidos no que o domínio entrega.
Migration `aplicar_20270919000018_limpeza_titulos_duplicados.sql` aplicada.

- [x] Causa 1 — comercial: gravação idempotente (`chaveNaturalDaTransacao`, `transacoesAindaNaoGravadas`)
- [x] Causa 2 — boleto: identidade pela linha digitável, não pelo hash do arquivo
- [x] Causa 3 — folha: `deleteRun` cancela os títulos antes de apagar a folha
- [x] Limpeza do que já estava gravado (112 títulos cancelados, 68 boletos marcados)
- [x] Trava definitiva: índice único parcial `boletos_org_linha_digitavel_uq`
- [ ] **Conferência humana dos 8 boletos pagos em duplicidade** — única pendência

Conferido no banco em 06/09/2026, depois de tudo aplicado:

| Indicador | Valor |
|---|---|
| Títulos de folha órfãos | 0 |
| Boletos com linha digitável repetida entre ativos | 0 |
| Boletos marcados como duplicata | 68 |
| Boletos duplicados ainda marcados como pagos | 8 |
| Títulos cancelados com vínculo de conciliação | 0 |
| Grupos que parecem duplicados por valor e data | 20, todos legítimos |

## Verificação

- `npx vitest run __tests__/titulosDuplicadosSync.test.ts` e a suíte completa.
- Consulta de acompanhamento, somente leitura, para ver se o excedente parou de crescer:

```sql
SELECT source_system, count(*) grupos, sum(n-1) excedentes
  FROM (SELECT source_system, count(*) n FROM internal_transactions
         WHERE status='PENDING'
         GROUP BY organization_id, source_system, amount, direction, transaction_date, description
        HAVING count(*)>1) s
 GROUP BY 1 ORDER BY 3 DESC;
```

Medida em 05/09/2026, antes da correção: COMMERCIAL 49 grupos e 61 excedentes,
BOLETO 28 e 48, LABOR 14 e 14.
