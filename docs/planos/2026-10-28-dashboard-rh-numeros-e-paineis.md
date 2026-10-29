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

Depois do passo 2:

> comece

Depois do passo 3:

> Seguir para o passo 4

Depois do passo 4, à pergunta "Quer que eu inclua também o bug de Férias e Ausências…?":

> Sim

Depois da correção de Férias e Ausências:

> pode comecar

Depois do passo 5:

> pode comecar

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
| 2 | shape | consolidar os 4 painéis de RH; limiar único de turnover | ✅ PR #243 (`813334c`), 28/10 |
| 3 | harden | custo do mês = folha da competência + apontamento | ✅ PR #245 (`44b9ab6`) + #248 (`92fcb33`, fuso), 28/10 |
| 4 | clarify | textos e estados (não medido, vencidos com nomes, link na sub-aba; BI "Headcount atual" = última foto; Custo por Obra em "Todas" mostra `[a2c4b292]` no lugar do nome da org) | ✅ PR #250 (`399ed33`), 29/10 |
| 5 | layout | KpiCard destaque + ação, `<h2>`, alertas zerados fora da grade | ✅ PR #253 (`280c128`), 29/10 |
| 6 | polish | teclado, contraste, `role="img"`, função por `role_id`, esqueleto | ✅ PR #257 (`3302381`), 29/10 |

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
- [x] BI Analytics RH em produção (Alpa): histórico até ago/26 já pela conta nova
      (HC 9→9, 0 adm/0 dem, 0%). ~~Mostra 5,3% em out/26~~ — reescrito: não há foto
      de out/26 gravada (só o botão "Snapshot do mês" gera, e ele grava; não cliquei).
      A foto de out/26 no ensaio deu 5,3% = Dashboard RH.

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
- [x] Menu "Visão Geral" do RH com 2 itens; `#/labor-dashboard` abre o Dashboard RH
      (item ativo no menu; o texto do endereço não é reescrito — mesmo comportamento
      do redirecionamento de Treinamentos).
- [x] Alpa sem meta cadastrada: Turnover e Absenteísmo mostram "Definir meta" e
      nenhum veredito; "Todas": nenhum veredito.
- [x] `tsc` 0 erros; `check-ui-standard.sh` limpo nos 4 `.tsx`; testes de
      laborService/org/segurança/prefixo verdes.

**Conferido em produção (28/10/2026, `813334c`).** Achado para o passo 4: no BI
Analytics, "Headcount atual 9" é o número da ÚLTIMA FOTO (ago/26), não de hoje (10).

## Passo 3 — custo pela folha, horas pelo apontamento

Fatos do banco (28/10/2026) que decidiram o desenho:
- **Não há folha de outubro**: a mais recente é set/26 (Alpa e SPE, `PROCESSANDO`).
  A folha de um mês só é calculada no seguinte → "custo do mês corrente" pela folha
  quase nunca existe. (A crítica disse "4 folhas em outubro" — errado.)
- Status que existem: `FECHADO` e `PROCESSANDO`. O Custo por Obra filtrava
  `FECHADO`/`RASCUNHO` → as folhas da Alpa (jul–set, todas `PROCESSANDO`) sumiam; e
  deixava passar `adiantamento`, cujo custo está na mensal.
- A folha não tem evento de hora extra; `time_entries` (apontamento) tem 0 linhas.
- `payroll_results.employer_cost` não inclui CPP/RAT/terceiros; o Custo por Obra
  (`getWorksiteCostSummary` → `custoPorDestino`) inclui. Uma conta só = a dele.

Decisões tomadas por padrão (avisadas ao usuário): competência = **a última com
folha mensal** até hoje, com o rótulo "folha de set/26 · em processamento"; folha
`PROCESSANDO` entra (com o rótulo), porque é o único custo que existe.

### 3.1 Regra das folhas — `utils/folhaDaCompetencia.ts`

**O que muda:** `ehFolhaComCusto` (mensal + FECHADO/PROCESSANDO) e
`folhasDaCompetencia` (última competência ≤ referência; uma folha por org, FECHADA
vence). Usada pelo Dashboard RH e pelo Custo por Obra.

**Como sei que terminou:**
- [x] `__tests__/folhaDaCompetencia.test.ts` 8/8 (escrito antes da implementação).

### 3.2 Serviço — `payrollService.custoDaFolhaDaCompetencia(org, ref)`

**O que muda:** escolhe as folhas pela regra e soma `getWorksiteCostSummary` de
cada uma (total, por obra, não alocado). Sem folha → `null`.

**Como sei que terminou:**
- [x] Testes da folha (22 arquivos, 179 testes) verdes.
- [x] Em produção, Alpa: "Custo da folha" R$ 11.544 = Custo por Obra set/26 R$ 11.544,14.

### 3.3 Migration `20271028790000_rh_kpis_horas_do_apontamento.sql`

**O que muda:** `rh_kpis_calcular` devolve também `horas_trabalhadas` e
`apontamentos` (aprovados no mês).

**Como sei que terminou:**
- [x] Aplicada; Alpa → `apontamentos 0`, turnover 5,3% inalterado; ACL fechada.

### 3.4 Tela

**O que muda:**
- Dashboard RH: "Custo MO Aprovado (horas aprovadas)" → **"Custo da folha"**
  (folha de set/26 · em processamento · N organizações em "Todas"), leva ao Custo por
  Obra. Gráfico "Custo da folha por obra — set/26" (+ "Administrativo / sem obra").
  Horas extras: "—" e "sem apontamento aprovado no mês" quando não há apontamento;
  com apontamento, "% de Nh trabalhadas" e veredito pela meta `horas_extras_max_pct`.
- Custo por Obra: mesma regra de folhas (entram as `PROCESSANDO`, sai adiantamento),
  "(em processamento)" no seletor.

**Como sei que terminou:**
- [x] Produção: "Todas" R$ 14.309 "folha de set/26 · em processamento · 2
      organizações"; Alpa R$ 11.544; Horas extras "—" "sem apontamento aprovado no
      mês"; gráfico só "Administrativo / sem obra" (a folha de set/26 não tem
      alocação em obra).
- [x] Produção: Custo por Obra lista as folhas em processamento da Alpa — mas com o
      MÊS ERRADO (ver 3.5).
- [x] `tsc` 0; `check-ui-standard.sh` limpo nos 3 `.tsx`.

### 3.5 Fuso horário (achado ao conferir em produção)

**O que muda:**
- Custo por Obra: o seletor mostrava cada folha com o **mês anterior**
  (`new Date('2026-09-01')` = meia-noite UTC = 31/08 em Brasília) — já era assim
  antes deste plano. Agora meio-dia local.
- Dashboard RH: data de referência era `toISOString()` (UTC) — depois das 21h já é
  amanhã (a tela mostrou "21 dias úteis" na noite de 28/10); no último dia do mês, à
  noite, o painel inteiro pulava para o mês seguinte. Agora `hojeLocal()`.

**Como sei que terminou:**
- [x] `tsc` 0; `check-ui-standard.sh` limpo nos 2 `.tsx`.
- [x] Produção (`92fcb33`): seletor do Custo por Obra começa em "setembro de 2026 (em
      processamento)"; julho/26 da SPE (FECHADO) sem o rótulo.

## Passo 4 — textos e estados

### 4.1 Migration `20271029200000_rh_kpis_vencidos_com_nome.sql`

**O que muda:** `rh_kpis_calcular` devolve `vencidos` — até 3 por alerta (férias,
documentos, treinamentos), o mais atrasado primeiro, com nome, data e detalhe
(dias a gozar / título do documento / nome do curso).

**Como sei que terminou:**
- [x] Ensaio e aplicada: Alpa → férias `Claudinei da Costa Vieira, 2026-10-15, 30
      dias a gozar`; ACL fechada.

### 4.2 Tela

**O que muda:**
- Dashboard RH:
  - Alerta vencido mostra até 3 nomes ("Fulano — venceu em 15/10/2026 · 30 dias a
    gozar") e "e mais N".
  - Alertas de férias (vencidas e vencendo) abrem direto em **Saldo de Férias**
    (`#/labor-absences?aba=saldos`, lido pelo `LaborAbsences` uma vez, padrão do
    `RentalsModule`). Antes caíam em Solicitações.
  - Erro: "Não foi possível carregar os números do RH" + motivo que a tela sabe
    ("Você não é membro da organização selecionada…") ou "Verifique a conexão…" —
    antes: "A função RPC pode ainda estar sendo criada… Execute a migration".
  - "Outubro De 2026" → "Outubro de 2026" (o `capitalize` do CSS subia o "De").
  - Legendas sem repetição: Total "todos, menos os desligados" (era "10 ativos", =
    cartão seguinte); Ativos "trabalhando hoje"; "Em Férias · no mês atual" → "Férias
    no mês · com algum dia de férias neste mês"; Admissões/Desligamentos sem o "+1"/"1".
  - "Documentos (ASO/NR) vencendo" → "… vencendo em 30 dias" (como os outros).
- BI Analytics RH: "Headcount atual"/"Turnover mês" → "Headcount — ago/26" /
  "Turnover — ago/26" (é a ÚLTIMA FOTO, não hoje).
- Custo por Obra em "Todas": nome da organização no seletor (era `[a2c4b292]`).

Achado resolvido sem mudança: a crítica supôs que `employee_trainings` fosse fonte
obsoleta (a gestão foi para a Academia). Não é — a tabela tem `origem`,
`enrollment_id` e `academy_certificate_id`; a Academia grava nela.

**Como sei que terminou:**
- [x] `tsc` 0; `check-ui-standard.sh` limpo nos 4 `.tsx`; testes das telas de RH
      (24 arquivos, 162 testes) verdes.
- [x] Produção (`399ed33`, em "Todas"): alerta "Férias vencidas" com "Claudinei da Costa
      Vieira — venceu em 15/10/2026 · 30 dias a gozar"; clique abre Férias e Ausências em
      Saldo de Férias (aba selecionada) e o endereço volta a `#/labor-absences`.
- [x] Produção: BI "Headcount — ago/26" / "Turnover — ago/26"; Custo por Obra em
      "Todas" com o nome de cada organização.

**Achado ao conferir (fora do Dashboard RH, mesma classe do P1 da crítica):** Férias e
Ausências tem cálculo PRÓPRIO no front e diz "1 período de férias vencendo em 60 dias —
risco de pagamento em dobro — Claudinei da Costa Vieira (vence 2026-10-15)": o período
já VENCEU, e a data sai em ISO.

### 4.3 Férias e Ausências — vencido ≠ vencendo (pedido "Sim", 29/10)

Feito como correção à parte, antes do passo 5 (é número, como o passo 1).

**O que muda:**
- `getVacationAlerts` traz, de propósito, as que vencem em 60 dias E as já vencidas
  com saldo; a faixa chamava tudo de "vencendo". Agora duas faixas: **vencido —
  pagamento em dobro (CLT art. 137)** em vermelho, e **vencendo em 60 dias — conceda
  antes do vencimento** em âmbar.
- Datas em dd/mm/aaaa (`formatDate`) na faixa, na tabela de saldos, no seletor de
  período e nas mensagens de validação — antes ISO (`2026-10-15`).
- "Hoje" e a janela de 60 dias pelo dia LOCAL (`hojeLocal`) na tela e no serviço
  (`getVacationAlerts`/`getVacationReady`) — antes `toISOString()` (UTC).

**Como sei que terminou:**
- [x] `tsc` 0; `check-ui-standard.sh` limpo; testes de ausências/laborService (20
      arquivos, 135 testes) verdes.
- [x] Produção (`4b73311`, PR #251, Todas): faixa vermelha "1 período de férias vencido —
      pagamento em dobro (CLT art. 137) — Claudinei da Costa Vieira (venceu em
      15/10/2026)"; nenhuma faixa âmbar; "vence 14/08/2027" na faixa de disponíveis.

## Passo 5 — layout

Tese: a entrada do RH responde "o que exige ação e como está o mês". Modelo: guia
§4.5 / §4.5.1 e `components/FinancialDashboard.tsx`.

**O que muda (`LaborRHDashboard.tsx`, reescrito na estrutura; dados iguais aos passos 1–4):**
- Três `<section>` com `<h2>` (§4.5.1), 24px entre faixas e 12px dentro de cada uma:
  1. **Pendências**: só as que existem, o vencido primeiro. Uma lista (`ul`), não
     uma grade de cartões; cada linha é um botão com o texto da ação ("Ver saldo de
     férias", "Aprovar pontos"…). Sem nenhuma: "Nada vencido nem vencendo…". Saem os 4
     cartões zerados a 50% de opacidade.
  2. **O mês** (título = "Outubro de 2026"): 4 `KpiCard destaque` — Colaboradores,
     Turnover, Absenteísmo, Custo da folha. Cor só por `tom` = acima da meta
     (`TOM_ACIMA_DA_META = 'atencao'`, constante com nome). `acao` só quando há o que
     fazer: "Definir meta" (sem meta), "Ver desligamentos" (desligados > 0), "Ver faltas
     e atestados" (absenteísmo > 0), "Ver afastados", "Ver custo por obra" / "Abrir a
     folha". Faixa de apoio neutra (`size="sm" color="gray"`): Admissões,
     Desligamentos, Férias no mês, Afastados, Horas extras.
  3. **Distribuição**: barras horizontais no cromo da §28 (`rounded-[10px]
     border-gray-100`, `h3` + base do dado, azul único, valor escrito na ponta), "Outros
     (N)" acima de 8 itens.
- Esqueleto por faixa e falha por faixa ("Não foi possível carregar… Tentar de
  novo"), no lugar do spinner de tela cheia e da tela de erro inteira.
- Saem o wrapper com cor por KPI, as classes montadas por interpolação
  (`bg-${color}-50`, frágeis no Tailwind v4) e os rótulos cinza em caixa alta.
- Custo por Obra: barra em gradiente índigo (apontada pelo hook de design) → azul
  sólido.

**Como sei que terminou:**
- [x] `tsc` 0; `check-ui-standard.sh` limpo; `impeccable detect` 0 achados nos 2 `.tsx`.
- [x] Produção (`ca54a77`, contém `280c128`): "Todas" → h2 Pendências · 2 tipos /
      Outubro de 2026 / Distribuição; pendências = férias vencida (Claudinei, 15/10) e EPIs,
      zerados ausentes. Alpa → Turnover 5,3% "sem meta definida" + "Definir meta";
      Absenteísmo idem; Custo da folha R$ 11.544 + "Ver custo por obra".
- [x] Produção: Tab = Atualizar → 2 pendências → "Ver custo por obra" → "Custo por obra
      completo"; anel de foco azul visível com a tecla Tab; iframe de 390px: scrollWidth
      390 = clientWidth (sem rolagem horizontal).

Vistos no print, para o passo 6: rótulo "Administrativo / sem obra" cortado (coluna de
9rem no gráfico) e "Outubro de 2026" repetido no subtítulo e no `h2` da faixa.

## Passo 6 — acabamento

Itens da crítica já resolvidos nos passos 4–5 (conferidos, sem mudança aqui): teclado
nos cartões clicáveis (agora `acao` = `<button>`), foco visível, `<h2>` por faixa,
esqueleto por faixa, setas ▲/▼, `sort` no lugar do cache, classes por interpolação.

**O que muda:**
- **Função pelo cargo**: o gráfico usava o texto livre `employees.role`. Trocar só
  por `role_id` pioraria (7 dos 12 ativos sem vínculo → "sem cargo"), e o texto
  diverge do cargo vinculado (um "Pedreiro" está no cargo **"Pedreiro 3"**). Regra:
  nome do cargo (`org_roles.nome`, via `laborService.nomesDosCargos`) quando há
  `role_id`; o texto livre só sem vínculo; "Sem função informada" sem nenhum.
- **Rótulo do gráfico quebra** em vez de cortar (coluna 9 → 11rem,
  `overflow-wrap:anywhere`): "Administrativo / sem obra" saía "Administrativo / sem …".
- **Mês uma vez só**: o subtítulo não repete "Outubro de 2026" (está no `h2` da faixa).
- **Barras**: a lista ganhou `aria-label` = título do gráfico. Não `role="img"`: é uma
  lista com os valores escritos, e `role="img"` a esconderia do leitor de tela.
- Contraste: nenhum texto em gray/slate-400 sobrou na tela (só a seta decorativa
  `aria-hidden`).
- Prop `organizations` sem uso removida do Dashboard RH e do `LaborModule`.

**Como sei que terminou:**
- [x] `tsc` 0; `check-ui-standard.sh` limpo; `impeccable detect` 0; testes do RH (21
      arquivos, 149 testes) verdes.
- [x] Produção (`e0d2bc2`, contém `3302381`, Todas): gráfico por função com "Pedreiro 3";
      "Administrativo / sem obra — R$ 14.446" inteiro; subtítulo "O que precisa de ação,
      como está o mês e onde está a mão de obra."

## Fechamento — 29/10/2026

**6 de 6 passos concluídos e conferidos em produção**, mais duas correções que
nasceram das conferências: fuso horário (PR #248) e Férias e Ausências vencido ≠
vencendo (PR #251). PRs: #240, #243, #245, #248, #250, #251, #253, #257.

Migrations aplicadas: `20271028740000`, `20271028770000`, `20271028790000`,
`20271029200000`.

Fica para depois (não pedido neste plano):
- `fn_bi_executive` executável por `anon` (é de invoker e, sem sessão, não vê
  organização nenhuma — anterior a este plano).
- Cabeçalho do modal "Nova ausência" em gradiente índigo (apontado pelo hook de
  design; fora do Dashboard RH).
- Nova `/impeccable critique` do Dashboard RH para medir contra os 13/40 iniciais.

## Depois do fechamento — 29/10/2026

Pedido do usuário, transcrito:

> Ficou anotado no plano, sem fazer, porque não foi pedido:
> 1. O fn_bi_executive continua executável por usuário anônimo. … Resposta: Corrigir
> 2. O cabeçalho do modal "Nova ausência" continua com o gradiente índigo … Resposta: Corrigir
> Três coisas que posso fazer agora:
> 1. Rodar /impeccable critique de novo … Resposta: sim
> 2. Fechar as frentes. … Resposta: sim
> 3. Cadastrar uma meta de turnover para a Alpa … Resposta: sim

Metas escolhidas pelo usuário: turnover 8% ao mês, absenteísmo 5%, horas extras 10%.

- [x] **Metas da Alpa 2026** gravadas em `hr_targets` (8 / 5 / 10).
- [x] **`fn_bi_executive` e `fn_bi_trend` sem anon** — migration `20271030100000`
      aplicada; ACL `{postgres, authenticated, service_role}`; sonda com a chave anon em
      `/rest/v1/rpc/fn_bi_trend` → **401** `permission denied for function fn_bi_trend`.
      A `fn_bi_trend` tinha o mesmo defeito (mesma migration de origem) e entrou junto.
- [x] **Modais de Férias e Ausências**: cabeçalho do guia §21 (branco, `h3` slate-800,
      fechar com `aria-label` e foco visível) no "Nova ausência" (era gradiente índigo) e
      no "Novo período aquisitivo" (era gradiente esmeralda, mesmo arquivo).
- [ ] Produção: modal "Nova ausência" com cabeçalho branco; Dashboard RH (Alpa) com
      "dentro da meta (8%)" no Turnover.
- [ ] Nova `/impeccable critique` do Dashboard RH (comparar com 13/40).
- [ ] Frentes `rh-kpis-numeros` e `critica-dashboard-rh` fechadas.
