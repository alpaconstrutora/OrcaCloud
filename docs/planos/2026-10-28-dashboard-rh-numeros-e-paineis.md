# Dashboard RH — números certos, depois os painéis

## Pedido original

Sessão `e7407c56`, 28/10/2026, ~18h (horário de Brasília):

> /impeccable critique: recursos humanos > Dashboard RH

A crítica deu **13/40** (registro em `.impeccable/critique/` da frente
`critica-dashboard-rh`). Respostas do usuário às perguntas que fecharam a crítica,
transcritas:

> "O Dashboard RH tem dois tipos de problema: …. Por qual frente começo?"="Números primeiro (Recomendado)"
>
> "… Qual deve ser a fonte do 'Custo MO do mês'?"="Folha + apontamento"
>
> "Existem quatro painéis de RH … O que faço com essa sobreposição?"="Consolidar painéis"

E, sobre a ordem do plano de ação:

> um de cada vez

## Passos (um de cada vez, na ordem)

| # | Comando | Assunto | Estado |
|---|---|---|---|
| 1 | harden | `rh_kpis`: "Todas", pertencimento, alertas vencidos, turnover, absenteísmo | em andamento |
| 2 | shape | consolidar os 4 painéis de RH; limiar único de turnover | pendente |
| 3 | harden | custo do mês = folha da competência + apontamento | pendente |
| 4 | clarify | textos e estados (não medido, vencidos com nomes, link na sub-aba) | pendente |
| 5 | layout | KpiCard destaque + ação, `<h2>`, alertas zerados fora da grade | pendente |
| 6 | polish | teclado, contraste, `role="img"`, função por `role_id`, esqueleto | pendente |

## Passo 1 — números da `rh_kpis`

Achados que este passo fecha (todos conferidos no banco em 28/10/2026):

- `rh_kpis(NULL)` filtra `org_id = NULL` e devolve tudo zero — "Todas as
  organizações" mostra "0 colaboradores, turnover 0% Estável".
- `rh_kpis` é `SECURITY DEFINER`, `EXECUTE` para `authenticated` (e PUBLIC), sem
  checar se quem chama é membro da organização: qualquer conta lê o RH de qualquer
  org pelo UUID.
- Alertas "vencendo em N dias" não têm limite inferior: férias vencidas em
  15/10/2026 (pagamento em dobro) apareciam como "vencendo em 60 dias".
- Turnover = desligados ÷ não-desligados de hoje (denominador já sem quem saiu).
- Absenteísmo soma dias corridos contra ativos × 22 úteis, com afastamento INSS
  no numerador — pode passar de 100%.

### 1.1 Migration `20271028740000_rh_kpis_todas_e_formulas.sql`

**O que muda:**
- `rh_kpis(NULL)` = organizações de que o usuário é membro (mesma regra de
  `is_org_member`: `organization_members` + `broker_profiles`, igual ao
  `fn_bi_executive`); org informada fora dessa lista → exceção "Acesso negado".
- `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT … TO authenticated` (REGRA #7).
- Alertas: `*_vencendo` passa a ser só o futuro (`ref ≤ data ≤ ref+N`); novos
  `treinamentos_vencidos`, `docs_vencidos`, `ferias_vencidas` (`data < ref`).
- Turnover = ((admissões + desligamentos) ÷ 2) ÷ headcount médio
  ((início do mês + fim do mês) ÷ 2) × 100. Devolve `headcount_inicio`/`headcount_fim`.
- Absenteísmo = dias úteis (seg–sex, sem feriado) de ATESTADO, FALTA e
  LICENCA_MEDICA aprovados, de 1º do mês até a data de referência ÷ (ativos × dias
  úteis do mesmo intervalo). Afastamento INSS e licenças legais fora. Devolve `dias_uteis`.
- `fn_bi_executive`: o bloco de RH deixa de somar `rh_kpis` org a org e
  recalcular turnover (fórmula velha) e absenteísmo (média de percentuais) —
  chama `rh_kpis(p_organization_id)` uma vez. Uma fórmula só nos dois painéis.

**Como sei que terminou:**
- [ ] Aplicada no banco (`db query -f`); `pg_get_functiondef` mostra as fórmulas novas.
- [ ] ACL de `rh_kpis` sem `=X` (PUBLIC) e sem `anon`.
- [ ] Simulando a sessão do desenvolvedor@: `rh_kpis(NULL)` ≠ zeros e = soma das orgs;
      `rh_kpis(<org de que não é membro>)` levanta "Acesso negado".
- [ ] Alpa em 28/10/2026: `ferias_vencidas = 1`, `ferias_vencendo = 0`.
- [ ] `fn_bi_executive(NULL)->'rh'` igual a `rh_kpis(NULL)`.
- [ ] `segurancaMigrations.test.ts` e `migrationsPrefixo.test.ts` verdes.

### 1.2 Tela (`LaborRHDashboard.tsx`, `services/laborService.ts`)

**O que muda:**
- Tipo `RhKpis` com os campos novos.
- Alertas vencidos aparecem primeiro, em vermelho, quando > 0 (a apresentação
  definitiva — nomes, datas, sub-aba — é o passo 4).
- Legendas de Turnover e Absenteísmo dizem a fórmula nova.
- "Colaboradores por Função" conta cada colaborador uma vez, na organização em que
  é registrado (era: compartilhados de outra org entravam — 12 × 10 ativos).

**Como sei que terminou:**
- [ ] Em produção, com "Todas": KPIs ≠ 0 e Total = soma das orgs.
- [ ] Alpa: alerta "Férias vencidas: 1" visível, em primeiro.
- [ ] Alpa: total do gráfico por função = Ativos.
- [ ] `tsc`, suíte e `check-ui-standard.sh` no arquivo tocado.
