# Centro de Custo: conta bancária vinculada + grupo não recebe lançamento

## Pedido original

> Minha organizacao >centro de custo:
> 1. criar campo para conectar conta bancaria caso o usuário desejar.
> 2. Impedir fazer lançamentos no grupo do centro de custo
>
> Sessão: d1ce2148-2732-4260-9259-3cc600b3b241 · 09/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 09/11/2026 | O que a conta vinculada faz além de aparecer no cadastro? | **Preencher sozinha** a conta do lançamento ao escolher o centro de custo, sem sobrescrever escolha manual. |
| 09/11/2026 | Grupos SEM filho usados direto em lançamentos ("Movimentação" 2.525 linhas de extrato; "007 - Bella Vista", "010 - Galeria Altavista") | **Converter em centro de custo** (passam a ficar dentro de um grupo) antes de travar. |
| 09/11/2026 | Grupo que recebe "Movimentação" | Grupo novo **"Financeiro"** em cada organização (proposto no plano, aprovado). |

## Estado do banco antes (09/11/2026)

- Grupo = `cost_centers_v2.parent_id IS NULL`. Nada impedia escolher grupo.
- Grupos sem filho com lançamento: Movimentação (Alpa 1.643 refs, Altair 1.435), 010 - Galeria Altavista (94), 007 - Bella Vista (34), Condomínios da Alpa (6).
- Grupos com filho com lançamento antigo: Administrativo, Obra, Comercial (Alpa), Condomínios (Galeria) — ficam como histórico.
- Nenhuma regra de conciliação aponta para grupo; 6 linhas de memória de classificação apontavam.

## Plano

1. **Migration** `supabase/migrations/aplicar_20271109500000_centro_de_custo_conta_e_trava_de_grupo.sql`
   - coluna `cost_centers_v2.payment_account_id` (FK `payment_accounts`, `on delete set null`);
   - conversão dos 4 grupos sem filho (backup `bkp_cc_grupos_conversao_20261109`); "Condomínios" da Alpa fica grupo (é o que `garantirGrupoCondominios` procura);
   - memória de classificação que sugeria grupo fica sem centro de custo (backup `bkp_cc_memoria_grupo_20261109`);
   - gatilho `trg_cc_bloquear_lancamento_em_grupo` em 13 tabelas de lançamento (INSERT ou troca de `cost_center_id`);
   - `sindico_portal_financeiro`: cada centro leva `paymentAccountId`.
   - **Pronto quando:** ensaio com rollback mostra trava recusando, edição de lançamento antigo passando, 2.525 linhas de Movimentação intactas; depois de aplicada, a coluna e os 13 gatilhos existem.
2. **Cadastro** `components/CostCenterModule.tsx`, `services/costCenterService.ts`, `types/financial.ts`
   - campo "Conta bancária (opcional)" (só centro de custo), coluna "Conta bancária" na tabela; editar centro de custo não vira grupo (botão desligado com motivo).
   - **Pronto quando:** criar/editar grava a conta e a coluna mostra; `check-ui-standard.sh` limpo.
3. **Seletor** `components/CostCenterSelect.tsx`
   - grupo (`parent_id === null`) não escolhível por padrão; `permitirGrupo` para filtros/relatórios.
   - **Pronto quando:** teste de `costCenterSelectItems` cobre os dois modos; cada uso classificado (lançamento × filtro).
4. **Conta preenchida pelo centro** `lib/contaPeloCentroDeCusto.ts` + PagamentoAvulsoSheet, ContractModal, LancarContaSheet, LancarReceitaSheet.
   - **Pronto quando:** teste do helper (vazio→preenche; manual→mantém; fora da lista→não preenche; auto→troca) e conferência na tela.

## Estado

- [x] 1. Migration escrita e ensaiada com rollback (09/11): trava recusou a troca para grupo, edição de lançamento antigo passou, 2.525 linhas de Movimentação intactas, só "Condomínios" da Alpa sobra como grupo sem filho com lançamento. **Aplicação pendente de autorização do usuário** (o auto mode barrou o `db query -f`). ⚠️ O front lê `payment_account_id` — **não fazer merge antes de aplicar**, ou a tela de Centro de Custo quebra.
- [x] 2. Cadastro — campo, coluna, "Grupo" desligado ao editar centro de custo; `check-ui-standard.sh` limpo.
- [x] 3. Seletor — `costCenterSelectItems` + teste (`__tests__/costCenterSelectItems.test.ts`). Os 31 usos de `<CostCenterSelect>` gravam centro de custo (nenhum é filtro: os filtros, ex. Fechamento, usam `<select>` próprio) → todos ficam com a trava; `permitirGrupo` fica disponível para filtro futuro. Síndico: centro padrão = `centroPadraoDoCondominio`.
- [x] 4. Conta preenchida pelo centro — helper + teste; ligado em Pagamento Avulso, Contrato (só contrato de saída, onde o campo aparece), Síndico › Lançar conta e Lançar receita.
- [ ] 5. Conferência na tela (depende da migration aplicada).

## Verificação

- `npm run ci` na frente.
- Banco: consulta de grupos sem filho com lançamento (só "Condomínios" da Alpa); contagem de Movimentação igual; gatilho recusa troca para grupo.
- Tela: centro de custo com conta → coluna; Pagamento Avulso preenche a conta; conta manual não é trocada; grupo só abre/fecha no drawer; filtro do Fechamento por Centro de Custo ainda aceita grupo; Portal do Síndico abre com o centro do condomínio.
