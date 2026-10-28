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

Depois do passo 1:

> siga para o passo 2

Respostas do passo 2 (shape), transcritas:

> "O RH tem quatro painéis … Que papel cada um deve ter?"="3 painéis, cada um 1 pergunta (Recomendado)"
>
> "Hoje o turnover tem três fórmulas … Qual deve ser a fonte única?"="Cadastro do colaborador (Recomendado)"
>
> "O limite que marca o turnover como 'acima do ideal' … Como deve funcionar?"="Meta editável, sem julgar sem meta (Recomendado)"
>
> (brief) "Está certo para eu gravar no plano e implementar?"="Confirmar e implementar"

## Passos (um de cada vez, na ordem)

| # | Comando | Assunto | Estado |
|---|---|---|---|
| 1 | harden | `rh_kpis`: "Todas", pertencimento, alertas vencidos, turnover, absenteísmo | ✅ PR #240 (`41e0ac9`), 28/10 |
| 2 | shape | consolidar os 4 painéis de RH; limiar único de turnover | em andamento (brief confirmado 28/10) |
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

(Nasceu `20271028300000`, colidiu com `aplicar_20271028300000_conciliacao_status_unico.sql` — o `grep` de prefixo olhou só nomes que começam com dígito. Renomeada e reaplicada; o `migrationsPrefixo.test.ts` pegou antes do commit.)

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
- [x] Aplicada no banco (`db query -f`); `pg_get_functiondef` mostra as fórmulas novas.
- [x] ACL de `rh_kpis` sem `=X` (PUBLIC) e sem `anon`.
- [x] Simulando a sessão do desenvolvedor@: `rh_kpis(NULL)` ≠ zeros e = soma das orgs;
      `rh_kpis(<org de que não é membro>)` levanta "Acesso negado".
- [x] Alpa em 28/10/2026: `ferias_vencidas = 1`, `ferias_vencendo = 0`.
- [x] `fn_bi_executive(NULL)->'rh'` igual a `rh_kpis(NULL)`.
- [x] `segurancaMigrations.test.ts` e `migrationsPrefixo.test.ts` verdes.

### 1.2 Tela (`LaborRHDashboard.tsx`, `services/laborService.ts`)

**O que muda:**
- Tipo `RhKpis` com os campos novos.
- Alertas vencidos aparecem primeiro, em vermelho, quando > 0 (a apresentação
  definitiva — nomes, datas, sub-aba — é o passo 4).
- Legendas de Turnover e Absenteísmo dizem a fórmula nova.
- "Colaboradores por Função" conta cada colaborador uma vez, na organização em que
  é registrado (era: compartilhados de outra org entravam — 12 × 10 ativos).

**Como sei que terminou:**
- [x] Em produção, com "Todas": KPIs ≠ 0 e Total = soma das orgs.
- [x] Alpa: alerta "Férias vencidas: 1" visível, em primeiro.
- [x] Alpa: total do gráfico por função = Ativos.
- [x] `tsc`, suíte e `check-ui-standard.sh` no arquivo tocado. (Suíte local caiu por worker do Node 24; suíte verde na CI do PR #240.)

**Conferido em produção (28/10/2026, `41e0ac9`):** "Todas" → 12 colaboradores,
turnover 4,8%, "Férias vencidas (pagamento em dobro): 1" em primeiro, gráfico por
função soma 12. Alpa → 10 colaboradores, turnover 5,3%, gráfico soma 10 (era 12).
Ficou para o passo 2: o limiar de 5% fixo no JSX marca a Alpa "Acima do ideal".

## Passo 2 — um painel por pergunta, uma fonte por número

### Brief (confirmado em 28/10/2026)

| Painel | Pergunta | Fonte |
|---|---|---|
| **Dashboard RH** (entrada do RH) | Como está o mês e o que exige ação? | `rh_kpis` |
| **Custo por Obra** | Quanto custou a mão de obra, por obra/SPE? | folha da competência + alocações (passo 3 traz o apontamento) |
| **BI Analytics RH** | Como evoluiu em 12–24 meses? | fotos mensais pela **mesma** conta da `rh_kpis` |

- O "Dashboard" (Gestão de Mão de Obra: 4 KPIs + 26 atalhos) **sai**; `labor-dashboard`
  cai no Dashboard RH. "Pontos aguardando aprovação" vira alerta; "Equipes" sai.
- Turnover tem **uma** fonte: cadastro do colaborador (datas). `hr_turnover_events`
  fica só como detalhe voluntária × involuntária.
- Limite = **meta da organização** (`hr_targets`, editada no BI › Metas). Sem meta:
  "Definir meta", sem veredito. Em "Todas": sem veredito.

Fora deste passo: custo (3), textos/nomes/sub-aba (4), KpiCard de painel (5),
teclado/contraste (6).

### 2.1 Migration `20271028770000_rh_turnover_fonte_unica_e_fotos_mensais.sql`

**O que muda:**
- `rh_kpis_calcular(orgs[], data)` = a conta (extraída da `rh_kpis` por
  transformação de texto, não redigitada); sem autorização própria → `REVOKE` de
  PUBLIC, anon **e authenticated**.
- `rh_kpis` = autoriza (membro / "Todas") e chama a conta.
- `generate_hr_monthly_snapshot`: checa `is_org_member` (era SECURITY DEFINER que
  gravava sem checar); grava a foto pela conta, inclusive absenteísmo (nunca
  preenchido antes); desligamentos do cadastro, motivo dos eventos.
- As 26 fotos gravadas recalculadas.

**Como sei que terminou:**
- [x] Ensaio desfeito com a sessão do desenvolvedor@: `rh_kpis` igual ao passo 1
      (Todas 4,8%, Alpa 5,3%); foto da Alpa out/26 = 5,3%; `rh_kpis_calcular` →
      "permission denied"; foto de org alheia → "Acesso negado".
- [x] Aplicada; ACL de `rh_kpis_calcular` = `{postgres, service_role}`; 26 fotos com
      `dias_uteis` preenchido.
- [ ] BI Analytics RH em produção mostra turnover 5,3% em out/26 para a Alpa.

### 2.2 Tela

**O que muda:**
- `Layout.tsx`: sai o item "Dashboard"; "Dashboard RH" primeiro; ícone do RH com o
  menu recolhido abre o Dashboard RH.
- `AppRouter.tsx`: `labor-dashboard` → `labor-rh-dashboard`.
- `LaborModule.tsx`: sai `LaborDashboardTab`; aba padrão = `rh_dashboard`; passa
  `pontosPendentes`.
- `LaborRHDashboard.tsx`: veredito de turnover e absenteísmo pela meta
  (`hr-target`, mesma chave de cache do BI); "Definir meta" leva ao BI; sem
  setas ▲/▼; horas extras sem veredito (a meta é % sobre horas trabalhadas — volta
  no passo 3); alerta de pontos pendentes.

**Como sei que terminou:**
- [ ] Menu "Visão Geral" do RH com 2 itens; `#/labor-dashboard` abre o Dashboard RH.
- [ ] Alpa sem meta cadastrada: Turnover e Absenteísmo mostram "Definir meta" e
      nenhum veredito; "Todas": nenhum veredito.
- [x] `tsc` 0 erros; `check-ui-standard.sh` limpo nos 4 `.tsx`; testes de
      laborService/org/segurança/prefixo verdes.
