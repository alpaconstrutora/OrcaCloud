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
| LABOR | 14 | **Não é sync.** A folha de abril de 2026 foi fechada duas vezes, em 17/05 e 18/05, gerando dois lotes de encargos. |

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
mesma competência de abril de 2026, criados em dias seguidos. Cada fechamento gerou seu
lote de salários, INSS, INCRA e Salário Educação.

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

## O que NÃO foi feito, e por quê

- **Limpeza dos dados existentes.** São 61 linhas excedentes no comercial, 83 boletos
  excedentes e 14 títulos de folha. Mexer nisso é apagar ou fundir registro financeiro, e
  alguns podem estar aprovados ou vinculados. Precisa de decisão explícita e de um roteiro
  que preserve o que já foi conciliado. As correções acima impedem que o problema cresça,
  mas não desfazem o passado.
- **Índice único em `linha_digitavel`.** Só pode ser criado depois da limpeza, senão falha
  contra as 78 linhas repetidas que já existem. É a trava definitiva, no banco, e deve vir
  junto do item acima.
- **Folha fechada duas vezes.** A correção pertence ao módulo de folha: impedir dois
  fechamentos abertos para a mesma competência, ou exigir estorno do primeiro. Não toquei
  porque está fora do que foi investigado aqui e o remédio é de outro domínio.

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
