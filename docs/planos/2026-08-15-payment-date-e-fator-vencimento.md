# `payment_date` que nunca chega e o fator de vencimento ambíguo

## Pedido original

Sessão `6d6cee0a-c071-43a3-b7eb-6a233ebb378b` · 2026-08-15 (terceiro plano da mesma
sessão; vem de `2026-08-15-boleto-para-contas-a-pagar-4-defeitos.md`, seção "Achados
de dados durante a conferência")

Os dois achados foram apresentados ao usuário assim:

> **Seis títulos `CONCILIATED` sem `payment_date`** — liquidados sem data de pagamento.
> O suspeito é `financialService.ts:81`, que grava o status sem a data. Quebra relatório
> por data de pagamento.
>
> **O parser FEBRABAN desambigua por proximidade de `new Date()`**. O mesmo boleto pode
> render vencimentos diferentes conforme quando é importado. Você acabou de provar que
> o sistema recebe documentos de 2017, então a faixa ambígua (fator 1000–1666) não é
> hipotética.
>
> Quer que eu ataque algum dos dois?

Resposta:

> ataque os dois

## Frente 1 — `payment_date` nulo em título liquidado

### Diagnóstico

Oito lugares gravam `status='CONCILIATED'`. **Só dois preenchem `payment_date`:**

| Produtor | `payment_date`? |
|---|---|
| `bankReconciliationService:727` | ✅ |
| `boletoService:520` | ✅ |
| `divergenceService:167` | ❌ |
| `financialService:81` | ❌ |
| `financialSyncService:80,105` | ❌ |
| `payableService:66` | ❌ |
| `receivableService:58` | ❌ |
| `taxPayableService:302` | ❌ |

O caso mais grave é o `payableService`: é o "Marcar como pago" do **Contas a Pagar**,
que virou o caminho principal depois de `20270909000000`. Ou seja, o fluxo mais usado
é justamente um dos que não gravam a data.

É o mesmo formato de defeito de `20270909000000`: muitos produtores, um leitor, e a
correção certa é no ponto por onde todos passam — não em seis chamadores.

### Item 1.1 — `supabase/migrations/20270909000002_payment_date_na_baixa.sql` (novo)

**O que muda:** trigger BEFORE UPDATE em `internal_transactions` que preenche
`payment_date = CURRENT_DATE` quando a linha passa a `CONCILIATED` (ou
`business_status` vira `PAGO`/`RECEBIDO`) **e `payment_date` está nulo**. Só preenche
quando está vazio — quem sabe a data certa (conciliação bancária) continua mandando.

**Como sei que terminou:** marcar PAGO em Contas a Pagar deixa `payment_date`
preenchido; um UPDATE que já traz `payment_date` não é sobrescrito.

**Sobre os 6 registros herdados:** o backfill fica **comentado** na migration. Não há
de onde tirar a data real — `updated_at` é aproximação, não fato. Preencher com
aproximação é pior do que o nulo, porque o nulo é honesto sobre não saber. A decisão
fica com o usuário.

## Frente 2 — fator de vencimento ambíguo

### Diagnóstico

`fatorVencimentoToDate` (`utils/febrabanRules.ts:95`) monta duas candidatas e fica com
**a mais próxima de `new Date()`**. As duas faixas são disjuntas por construção: ciclo
antigo (base 1997-10-07) termina em 2025-02-21; ciclo novo (base 2025-02-22, fator
1000) começa no dia seguinte.

Dois problemas:

1. **Não é determinístico.** O default é `new Date()`, então reprocessar o mesmo boleto
   meses depois pode devolver outro vencimento.
2. **Na faixa de fator ~1000–1666, o ciclo antigo perde sempre.** Com referência em
   2026, a candidata antiga cai em 2000–2002 (~24 anos atrás) e a nova em 2025–2026
   (meses). Proximidade escolhe a nova **toda vez** — um boleto real de 2001 é lido
   como vencendo agora. O comentário do próprio código já admitia a faixa ambígua.

O que motivou olhar: três boletos com vencimento 2017 foram investigados nesta sessão
e **não** eram bug — `pdf_text`, `confidence_score=100`, `checksum_valido=true`, fator
~7141 resolvendo certo pelo ciclo antigo. Mas provaram que o sistema recebe documentos
de 9 anos atrás, o que tira a faixa ambígua do terreno hipotético.

### A restrição que decide o desenho

`boletoService.ts:160-161`:

```ts
checksum_valido: ext.erros.length === 0,
erros_validacao: ext.erros.length ? ext.erros : null,
```

**Empurrar a ambiguidade para `erros` marcaria `checksum_valido = false`** — falso, e
justamente o campo que serviu de evidência no diagnóstico dos boletos de 2017.
Ambiguidade precisa de canal próprio: `avisos`.

### Item 2.1 — `utils/febrabanRules.ts` (editado)

**O que muda:** nova `resolverFatorVencimento(fator, opts)` devolvendo
`{ vencimento, ciclo: 'antigo'|'novo', ambiguo, alternativa }`.
- Com `dataDocumento` conhecida, o ciclo é escolhido por ela (≥ 2025-02-22 → novo) e
  `ambiguo=false`. É a regra determinística.
- Sem ela, mantém a proximidade, mas marca `ambiguo=true` quando **as duas** candidatas
  caem numa janela plausível em torno da referência (−25 anos a +5 anos).

`fatorVencimentoToDate` passa a delegar e **mantém a assinatura e o resultado atuais** —
a ambiguidade só acrescenta aviso, nunca muda a data escolhida, para não alterar
comportamento existente.

`LinhaDigitavelParsed` ganha `avisos: string[]`; `parseBoletoBancario` empurra o aviso
de ciclo ambíguo para lá, nunca para `erros`.

**Como sei que terminou:** os 3 testes atuais de `fatorVencimentoToDate` continuam
verdes sem edição; fator 1566 com referência em 2026 devolve a data nova **e**
`ambiguo=true`; fator 7141 devolve a antiga com `ambiguo=false`.

### Item 2.2 — `utils/boletoParser.ts` (editado)

**O que muda:** propaga `avisos` do `parseLinhaDigitavel` para o resultado da extração,
ao lado de `erros`.

**Como sei que terminou:** extração de linha com fator ambíguo devolve `avisos` não
vazio e `erros` vazio.

### Item 2.3 — `services/boletoService.ts` (editado)

**O que muda:** `erros_validacao` passa a receber `erros + avisos`; `checksum_valido`
continua olhando **só** `erros`.

**Como sei que terminou:** boleto com fator ambíguo entra com `checksum_valido=true` e
o aviso visível em `erros_validacao` (o `BoletoFormModal` já renderiza essa lista).

### Item 2.4 — `__tests__/febrabanRules.test.ts` (editado)

**O que muda:** casos novos para a faixa ambígua, para o desempate por `dataDocumento`
e para a não-regressão dos 3 existentes.

## Estado

Implementado em 2026-08-15. A migration **não foi aplicada** — não tenho credencial de
escrita no banco.

- [x] Item 1.1 — `20270909000002_payment_date_na_baixa.sql` **escrita, não aplicada**
- [x] Item 2.1 — `resolverFatorVencimento` + `avisos` em `LinhaDigitavelParsed`
- [x] Item 2.2 — `boletoParser` propaga `avisos`
- [x] Item 2.3 — `boletoService`: `erros_validacao = erros + avisos`, `checksum_valido`
      inalterado
- [x] Item 2.4 — 5 casos novos; os 3 antigos passam **sem edição**

### O que foi verificado

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | passa |
| `npm run build` | passa |
| `febrabanRules.test.ts` | 25/25 |
| Suíte completa | 1338 passam, **1 falha alheia** (ver abaixo) |
| `migrationsPrefixo` | 3/3 |

**A falha da suíte não é desta tarefa.** `viewSecurityGuard` reprova
`aplicar_20270905000027_rental_sale_numbering_por_unidade.sql` (view
`vw_unit_property_map` sem `REVOKE ... FROM anon`), que veio do commit `945fe74`, de
outra frente, e já era ancestral do `c9fcaa0`. As views desta sessão
(`20270909000000`) passam no guard. **Fica registrado como dívida a cobrar de quem a
criou** — a view está exposta a `anon` hoje.

Erro meu no caminho: escrevi as datas esperadas dos testes de cabeça e errei por um dia
(fator 1566 no ciclo novo é 2026-09-11, não 09-10). Calculado e corrigido.

### O que NÃO foi verificado

Nada no navegador. A trigger de `payment_date` não rodou. O aviso de fator ambíguo não
foi visto na tela do `BoletoFormModal` — só provado por teste unitário.

## Verificação de ponta a ponta

1. Marcar PAGO em Contas a Pagar → `payment_date` preenchido no banco.
2. Conciliar pelo extrato → `payment_date` continua o que a conciliação mandou.
3. Importar boleto com fator na faixa 1000–1666 → entra com aviso visível e
   `checksum_valido=true`.
4. Importar boleto com fator alto (ex. 7141) → sem aviso, data do ciclo antigo.
