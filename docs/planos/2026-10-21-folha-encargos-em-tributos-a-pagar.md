# Folha → encargos e retenções como tributos próprios (Tributos a Pagar)

## Pedido original (21/10/2026, literal)

> em recursos humanios > encargos sociais > Encargos Patronais (FGTS / Depósito mensal / Salário bruto / 8,00%): verifique se este imposto esta sendo calculado e lançado em financeiro > tributos a pagar

Respostas do usuário às três perguntas que a verificação levantou:

> 1. FGTS (e o INSS descontado do empregado): devem virar títulos próprios, com o valor certo? E devem aparecer em Tributos a Pagar, para poder agrupar em DARF/guia? Resposta: Sim
> 2. INSS patronal e RAT: devem passar a ser calculados? Resposta: Sim
> Folhas fechadas de abril a junho: devem ser recalculadas no financeiro ou ficar como estão? Resposta: devem ser recalculadas

## O que a verificação achou (banco + código, 21/10/2026)

- **O FGTS é calculado** (rubrica `FGTS`, encargo, 8% truncado — `payrollEngine.ts`), mas **não vira título próprio nem
  aparece em Tributos a Pagar**. Ele entra num título único "Encargos Patronais" (`party_type GOVERNMENT`), que é
  `employer_cost − net` (`payrollService.getWorksiteCostSummary`). Essa conta dá FGTS **+ todos os descontos do
  empregado**: INSS, IRRF, **adiantamento**, contribuição assistencial, **falta**, VR. Ex.: 06/2026 Alpa, FGTS de
  453,36 contra um título "Encargos" de 3.988,90.
- **O adiantamento conta dobrado na distribuição.** O salário sai `net − adiantamento`, mas o `net` já desconta o
  adiantamento. O adiantamento vira título próprio e entra de novo dentro de "Encargos".
- **Há títulos em dobro.** "Lançar no financeiro" (Alocações, `syncEmployeeToFinance`) grava títulos por colaborador
  **ao lado** do agregado da folha, que já contém esse mesmo colaborador. Em 06/2026 isso deu 95,08 + 380,30 de
  encargos e 398,56 de salário, com vencimento vazio.
- **INSS patronal (CPP), RAT e FAP não existem na folha CLT.** Aparecem só no relatório "Encargos de INSS", com 20% e
  3% fixos.
- **Terceiros** (5,8%) ficam no `localStorage` de quem clica e incidem sobre o **bruto**, não sobre a base do INSS.
- **O sync apaga tudo da folha antes de regravar**, inclusive título pago ou conciliado (o CASCADE leva o vínculo da
  conciliação) e membro de DARF. Não confere o erro do delete.
- **Vencimento:** tudo cai no dia 05 do mês seguinte. FGTS, INSS (DCTFWeb) e IRRF vencem no dia 20.
- Nenhum teste cobre o financeiro da folha.

## Decisões

1. **Cada encargo e cada retenção vira um título próprio, por obra e chave contábil** (o mesmo rateio de hoje). Os
   tributos levam `party_type = 'TAX'` e entram em Tributos a Pagar, onde podem ser agrupados em DARF.

   | Linha (`reference_id` …-tipo) | `party_name` (coluna Tributo) | Categoria | Valor | Vencimento |
   |---|---|---|---|---|
   | `salario` | colaboradores | Folha de Pagamento | líquido − proventos individualizados | dia 05 (como hoje) |
   | `inss` | INSS (segurados) | Folha de Pagamento | Σ rubrica INSS (desconto) | dia 20, antecipa |
   | `irrf` | IRRF (folha) | Folha de Pagamento | Σ rubrica IRRF | dia 20, antecipa |
   | `fgts` | FGTS | Encargos Patronais | Σ rubricas FGTS* (encargo) | dia 20, antecipa |
   | `cpp` | INSS patronal (CPP) | Encargos Patronais | base INSS × CPP | dia 20, antecipa |
   | `rat` | RAT/GILRAT | Encargos Patronais | base INSS × RAT × FAP | dia 20, antecipa |
   | `terceiros` | Terceiros (outras entidades) | Contribuições de Terceiros | base INSS × Σ entidades | dia 20, antecipa |
   | `rep-{código}` | nome da rubrica (GOVERNMENT) | Folha de Pagamento | Σ desconto marcado "repasse a terceiro" | dia 05 |
   | `enc-{código}` | nome da rubrica (GOVERNMENT) | Encargos Patronais | outros encargos de rubrica | dia 05 |

   - INSS e IRRF retidos são **custo de salário** (DRE em "Folha de Pagamento"). O que muda é só o credor.
   - Os demais descontos (falta, VR, dedução do 13º, adiantamento) **não geram título**: só reduzem o líquido. A
     exceção é o desconto que o empregador repassa a outra entidade. A rubrica ganha a marca **"Repasse a terceiro"**
     (`rubrics.repasse_terceiros`), já ligada na contribuição assistencial.
   - "Antecipa" = sábado ou domingo recua para sexta. Feriado não é tratado, como em `taxDueDate`.
   - A soma de cada tributo bate **ao centavo** com a soma dos itens da folha: o rateio por obra usa maior resto.
2. **Alíquotas por organização, no banco** (`payroll_encargos_config`): CPP, RAT, FAP e entidades de terceiros.
   - Sem linha gravada, o padrão vem do regime da empresa matriz:
     - Simples fora do Anexo IV: 0 (a CPP está no DAS);
     - CPRB: CPP de 10% (transição da Lei 14.973/2024 para 2026), com aviso para conferir;
     - demais regimes: 20%.
   - RAT padrão de 3% (construção civil, grau 3); FAP 1,0000.
   - Terceiros: FPAS 507 (Sal.-Educação 2,5 + INCRA 0,2 + SENAI 1,0 + SESI 1,5 + SEBRAE 0,6 = 5,8%).
   - Editável em RH › Encargos Sociais, aba Contribuições Sociais. A tabela de "referência só leitura" vira
     configuração. O `localStorage` sai; quando há valor salvo nele, a tela usa esse valor para preencher o
     formulário.
   - Lucro Presumido nas duas organizações atuais, então CPP de 20%.
3. **O sync não apaga nem regrava título preservado**: pago, conciliado, cancelado à mão ou agrupado em DARF (a mesma
   regra de `tributoPreservado`). Quando o novo cálculo diverge do valor preservado, o retorno avisa. O erro do delete
   e do upsert vira mensagem. Linha antiga (`-encargos`, `-terceiros-{código}`, por colaborador) que não estiver
   preservada é apagada.
4. **"Lançar no financeiro" do colaborador** salva a alocação e recalcula **a folha inteira**. `syncEmployeeToFinance`
   sai: era ele que duplicava.
5. **DARF não mistura FGTS com os demais**: o FGTS é recolhido pela guia do FGTS Digital (GFD), não por DARF. O
   bloqueio fica na validação da seleção.
6. **Tributos a Pagar com linha da folha**:
   - Origem = "Folha mm/aaaa";
   - Empreendimento = a obra da linha;
   - a exclusão é recusada com a mensagem "vem da folha — reprocesse a folha".
7. **Folhas fechadas de 04 a 06/2026** (Alpa 04, 05, 06 e Garden 05):
   - antes, cópia de todas as linhas `labor-{folha}-%` numa tabela de reversão (`bkp_folha_financeiro_20271021`,
     que **não pode ser apagada**);
   - depois, re-sincronização pelo app já publicado;
   - o adiantamento conciliado da Garden 05/2026 é preservado pela regra 3;
   - nenhum desses meses está fechado no Fechamento Mensal nem no Fechamento por CC (conferido em 21/10).
   - A folha 04/2026 da Garden está **PROCESSANDO** com títulos antigos. Fica fora do pedido ("fechadas") e é
     registrada no relatório.

8. **Achado durante a implementação: o espelho da obra regravava a folha.**
   - O que acontece: `financialSyncService.syncFinancialData` faz upsert de `projects.settings.financialInfo.transactions`
     em `internal_transactions` pelo **mesmo `reference_id`**, com `source_system = 'PROJECT'`. Ele roda na
     Conciliação, que varre todas as obras, e ao salvar o financeiro da obra. O sync da folha mantém nesse espelho
     uma cópia de cada título por obra.
   - Efeitos medidos:
     - a folha **04/2026 inteira virou `PROJECT`**, sem credor nem tipo;
     - **2 títulos `PROJECT` (R$ 4.369,68, em aberto)** são de uma folha que já não existe (`71c98678…`). Ficam como
       estão e são relatados; apagar é decisão do usuário.
     - Com os tributos em Tributos a Pagar, esse upsert tiraria o `TAX` deles e ressuscitaria título apagado.
   - Correção:
     - o código deixa de materializar `labor-…`;
     - o gatilho `trg_folha_espelho_nao_materializa` ignora no banco qualquer gravação `PROJECT` com `labor-…`. Isso
       vale também para bundle antigo em cache, e já foi aplicado;
     - o sync da folha reconhece os seus títulos (`labor-{folha}-…`) mesmo quando estão como `PROJECT`;
     - o espelho também limpa as obras que deixaram de ter linha.
   - O espelho continua porque a tela financeira da obra o exibe.

## Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 | Migration: `payroll_encargos_config` (RLS org, REVOKE PUBLIC/anon) + `rubrics.repasse_terceiros` com backfill | consultas de verificação ok; `segurancaMigrations` + `migrationsPrefixo` verdes |
| 2 | `utils/folhaFinanceiro.ts` (puro): linhas da folha, vencimento dia 20, padrão das alíquotas | `folhaFinanceiro.test.ts` verde (totais ao centavo, adiantamento não dobra, falta sem título, rateio, preservação) |
| 3 | `payrollService`: `getWorksiteCostSummary` e `syncPayrollToFinance` sobre o util; preservação; erros visíveis; sai `syncEmployeeToFinance` e o `localStorage` | `folhaSyncPreserva.test.ts` verde; `tsc` pela CI |
| 4 | Telas: Encargos Sociais (config), Encargos de INSS (alíquotas da config), Rubricas ("Repasse a terceiro"), Alocações, Ciclos (alerta), Tributos (origem/obra/exclusão), DARF (FGTS) | `check-ui-standard` nos .tsx; teste de componente; prints no navegador |
| 5 | Após o merge: backup + re-sincronização das 4 folhas + conferência por SQL (Σ tributos = Σ itens) | números no relatório |

## Complemento (22/10/2026): pró-labore

Pergunta do usuário (literal): *"falta incluir os tributo de recursos humanos > encargos sociais?"* Resposta: faltavam
os do **pró-labore**. À proposta abaixo, o usuário respondeu *"sim"*.

**Achados no banco (Alpa, um sócio):**
- O envio ao financeiro gravava só o **líquido** do sócio. O INSS descontado dele nunca virava título. A cota patronal
  entrava sem `party_type` (fora de Tributos) e sem vencimento, e os terceiros gravavam o mesmo `reference_id` da
  patronal.
- 06 (aprovado) e 07/2026 (enviado) foram calculados em 03–04/07, antes da regra do pró-labore:
  - INSS de 501,51 pela tabela do empregado, em vez de 11% = 550,00;
  - cota patronal 0, em vez de 20% = 1.000,00.
- 05/2026 tinha terceiros de 190,00 (5,8%), mas terceiros não incidem sobre pró-labore: o sócio é contribuinte
  individual.

**Mudança:**
- `utils/folhaFinanceiro.tributosDoProlabore` (puro): monta INSS (pró-labore), INSS patronal (pró-labore) e IRRF
  (pró-labore). Os títulos são `party_type 'TAX'` com vencimento no dia 20, e a competência é a da folha do mês, então
  podem ir no mesmo DARF.
- `remuneracaoSocietariaService.syncTributosDoProlabore`, chamado no envio ao financeiro:
  - upsert pelo `reference_id` `prolabore-{folha}-{tipo}`;
  - preserva o que estiver pago, conciliado ou em DARF;
  - apaga as linhas do formato antigo que estiverem em aberto.
- `calculateProlabore` sem terceiros. Telas: sai a coluna "Contrib. terceiros", e o KPI passa a ser "IRRF Retido".

**Dados:** o script `prolabore_tributos_recalculo_05_07.sql` é rodado pelo usuário, porque o modo automático bloqueia a
gravação. Ele faz o seguinte:
- 05/2026: terceiros zerados;
- 06 e 07/2026: INSS 550,00, cota patronal 1.000,00, líquido 4.450,00;
- 07/2026, já enviado: líquido ajustado no razão e em `invoices`, e criados os 2 tributos (vencimento 20/08/2026);
- reversão em `bkp_prolabore_20271022_*`.
