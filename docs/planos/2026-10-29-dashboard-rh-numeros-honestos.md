# Dashboard RH — números honestos e visão da diretoria

Continuação de `docs/planos/2026-10-28-dashboard-rh-numeros-e-paineis.md` (13/40 → 25/40).

## Pedido original

Sessão `e7407c56`, 29/10/2026. Depois da segunda `/impeccable critique` do Dashboard RH
(25/40, registro em `.impeccable/critique/2026-10-29T15-36-33Z__components-laborrhdashboard-tsx.md`),
respostas do usuário, transcritas:

> "… Por onde sigo?"="Números honestos (Recomendado)"
>
> "Qual escopo para essa próxima rodada?"="Os 5 prioritários"

E, sobre o plano de ação apresentado:

> pode comecar

## Passos (um de cada vez, na ordem)

| # | Comando | Assunto | Estado |
|---|---|---|---|
| 1 | harden | absenteísmo com medição ("—" sem lançamento) | em andamento |
| 2 | harden | headcount honesto (admissão até hoje, terceiro à parte, pendência de cadastro) | pendente |
| 3 | clarify | folha sem obra vira pendência; erro da folha com estado próprio | pendente |
| 4 | harden | pendências de EPI (CA vencido, mínimo não definido, nome) e desligados fora | pendente |
| 5 | shape → layout | visão da diretoria (mês, série 6 meses, quebra por organização) | pendente |
| 6 | polish | nome acessível da pendência, contagem perto do rótulo, barras no celular, link único | pendente |

## Passo 1 — absenteísmo com medição

**Achado (conferido no banco em 29/10/2026):** a tabela `absences` tem 3 linhas no total —
FALTA 29/05 (SOLICITADO), FALTA 29/05 (APROVADO), FALTA 15/06 (CANCELADO). Nenhuma falta,
atestado ou licença médica desde maio, e o cartão afirma "Absenteísmo 0% · dentro da meta
(5%)". É zero afirmado sobre o que não foi medido (§28.5) — o mesmo que a tela já evita
nas horas extras. (Na crítica eu escrevi "última em 15/06": é a CANCELADA; a última
válida é 29/05.)

**Regra:** absenteísmo é "medido" quando há falta, atestado ou licença médica **não
cancelada nem rejeitada** com início nos últimos 90 dias. Sem isso, a tela não dá número
nem veredito.

**O que muda:**
- Migration: `rh_kpis_calcular` devolve em `qualidade` também `lancamentos_90d` (contagem
  pela regra acima) e `ultimo_lancamento` (data de início do mais recente, de qualquer época).
- Dashboard RH: com `lancamentos_90d = 0`, Absenteísmo mostra "—", legenda "nenhuma falta
  ou atestado lançado desde mai/26" (ou "ainda"), tom neutro, sem "dentro da meta", e a
  ação "Lançar ausências" → Férias e Ausências.

**Como sei que terminou:**
- [x] Migration `20271030300000` aplicada (ensaio desfeito antes); ACL fechada.
      ~~Alpa → `ultimo_lancamento = 2026-05-29`~~ — corrigido: as 3 faltas são do Rogério,
      registrado na **Garden SPE** (o lançamento tem outra org gravada; a conta usa a org de
      registro, como a folha). Alpa → `lancamentos_90d 0`, `ultimo_lancamento null` ("ainda");
      Garden hoje → `0`, `2026-05-29`; Garden em 10/06 → `2` (medido).
- [x] `tsc` 0; `check-ui-standard.sh` limpo; `impeccable detect` 0; testes de RH (22 arquivos, 140) verdes.
- [ ] Produção: Alpa → Absenteísmo "—" · "não medido · nenhuma falta ou atestado lançado
      ainda" · "Lançar ausências"; Todas → "… desde mai/26"; sem "dentro da meta".
