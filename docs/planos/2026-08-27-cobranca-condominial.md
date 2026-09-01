# Cobrança condominial — do rateio fechado ao boleto/PIX

> Fatia 2 do financeiro condominial. A fatia 1 (o rateio) está em
> `2026-08-13-opura-condominios-avaliacao.md`, seção 💰.

## Pedido original

Sessão de 27/08/2026, transcrito literalmente:

```
vamos com a fatia de cobranca e convencao
```

Precedido, na mesma sessão, por *"qual a proxima etapa?"* — e a resposta foi a
recomendação de atacar a fatia de cobrança, com a ressalva de que emitir de
verdade no piloto espera a convenção.

## Decisões tomadas com o usuário (27/08/2026)

| Pergunta | Resposta |
|---|---|
| Quem recebe a cobrança do rateio EXTRAORDINÁRIO, já que obra é do proprietário? | **"opção para o usuário escolher entre proprietario e responsavel"** — não é regra fixa: é escolha no momento de gerar |
| Data de vencimento das cotas | **Escolhida na hora de gerar** (sem coluna nova, sem dia fixo) |
| Multa e juros no boleto | **Sim, configurável por condomínio** — padrão 2% + 1%/mês (teto do Código Civil), guardado por condomínio |

Escolha minha, por não mudar decisão de produto: **BOLETO como padrão** de
`billing_type`. `clientChargeService.resend` registra que segunda via por e-mail
só existe para boleto — PIX fica disponível na tela, mas não é o default.

## O que a investigação achou antes de qualquer código

### 1. A cobrança é emitida sobre um RECEBÍVEL, não sobre o rateio

`supabase/functions/asaas-charge/index.ts` lê `internal_transactions`
(`id, organization_id, amount, description, party_id, party_name, party_email,
due_date, project_id, reference_id`), resolve o cliente e cria o pagamento.
`clientChargeService.emit(orgId, transactionId, billingType, {fine, interest})`
recebe um **transaction_id**.

Logo existe um elo que ninguém escreveu: **materializar cada cota do rateio
fechado como recebível**. Não é "chamar o emit" — é criar `internal_transactions`
por cota e só então emitir. É a maior parte do trabalho desta fatia.

### 2. Só 2 de 10 responsáveis financeiros têm CPF/CNPJ

A edge function devolve **422** — *"Cliente sem CPF/CNPJ cadastrado. O Asaas
exige documento para emitir cobrança."* No `010 - Galeria Altavista`, hoje:

| Responsável | Unidades | CPF/CNPJ | E-mail |
|---|---|---|---|
| Ivana Braga Demier | Sala 304 | ✅ | ❌ |
| Filtrelec Comercio e Importação | Sala 305 | ✅ | ❌ |
| Reginaldo Benedito Nunes | Lojas 101, 102, 103 | ❌ | ✅ |
| Defensoria Pública de Minas Gerais | Salas 201, 202, 203 | ❌ | ❌ |
| Murilo Lessa Braga | Sala 302 | ❌ | ❌ |
| Dynamis consultoria e corretagem | Loja 204 | ❌ | ❌ |

**Consequência de desenho, não só de dado:** a tela tem de dizer **antes** quais
cotas não podem virar cobrança e por quê, em vez de falhar uma a uma no Asaas.
Emitir 10 e receber 8 erros é a pior versão disso.

### 3. O rateio ignora o TIPO ao decidir quem paga

`condominioRateioService` monta o mapa `responsavel` filtrando
`role = 'RESPONSAVEL_FINANCEIRO'` e usa esse `client_id` em toda cota, seja o
rateio ordinário ou extraordinário. A separação ordinário × extraordinário
existe desde a migration 24 justamente porque obra é do proprietário — mas ela
nunca chegou até o pagador. É o que a decisão 1 do usuário resolve.

### 4. `reference_id` é COMPOSTO, e o descuido aqui é silencioso

O formato é `{origem}-p{vencimento}`. `.eq()`/`.in()` com UUID puro **não casam
e não dão erro** — foi assim que a inadimplência de Locações ficou zerada por
meses sem ninguém notar. Usar `lib/receivableRef.ts` (`refPrefixOrFilter`,
`originIdFromRef`, `refBelongsTo`), nunca comparação crua.

### 5. Regras da casa que incidem

- **REGRA #2 (escrita):** `project_id` do recebível condominial é **NULL**.
  Cota de condomínio não tem obra.
- **REGRA #5:** a org sai do empreendimento aberto, nunca do seletor do topo.
- **REGRA #1:** `check-ui-standard.sh` nos arquivos tocados.

---

## Plano

### 1. `supabase/migrations/aplicar_2027xxxx_condominio_cobranca.sql` (novo)

- `empreendimentos`: `cobranca_multa_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00`
  e `cobranca_juros_mes_percent NUMERIC(5,2) NOT NULL DEFAULT 1.00`, com CHECK
  `>= 0 AND <= 10` (acima disso é erro de digitação, não política).
- `condominio_rateio_itens`: `transaction_id UUID` + FK para
  `internal_transactions` **ON DELETE SET NULL** (apagar o recebível não apaga a
  memória de quanto aquela unidade devia) + índice único parcial
  `WHERE transaction_id IS NOT NULL` — a mesma cota não vira dois recebíveis.
- `condominio_rateios`: `cobranca_gerada_em TIMESTAMPTZ` — distingue "fechado" de
  "fechado e já cobrado" sem inventar mais um status.
- Bloco de conferência no fim, no molde das migrations 17–24.

**Como sei que terminou:** o bloco devolve `cols_empreendimento=2, col_item=1,
fk=1, uidx=1, col_rateio=1`, e `__tests__/migrationsPrefixo.test.ts` passa.

### 2. `services/condominioCobrancaService.ts` (novo)

- `previa(rateioId, { pagador })` → uma linha por cota com unidade, valor,
  **quem paga** (resolvido pelo modo escolhido) e `bloqueio?: string` quando a
  cota não pode virar cobrança. Os bloqueios são três, reportados **juntos**, não
  um por vez: *sem responsável/proprietário definido*, *pessoa sem CPF/CNPJ*,
  *cota já gerada*.
- `gerar(rateioId, { vencimento, pagador })` → cria um `internal_transactions`
  CREDIT por cota cobrável (`project_id: null`, `cost_center_id` do condomínio,
  `party_id` do pagador, `reference_id` no padrão composto da casa), grava
  `transaction_id` no item e carimba `cobranca_gerada_em`.
- `emitir(rateioId, { billingType })` → para cada recebível gerado, chama
  `clientChargeService.emit` com a multa/juros do condomínio. Devolve sucessos e
  falhas **separados**, sem abortar o lote no primeiro erro.

**Como sei que terminou:** `previa` de um rateio do `010` devolve 10 cotas, 8
com o bloqueio "sem CPF/CNPJ" **nomeando a pessoa**; `gerar` roda duas vezes e a
segunda cria ZERO (o índice único é a trava, não a intenção).

### 3. `services/condominioRateioService.ts` (editado)

`previa()` ganha `pagador: 'RESPONSAVEL' | 'PROPRIETARIO'` (default
`RESPONSAVEL`), resolvendo `client_id` pelo papel escolhido, com fallback
explícito e **reportado** quando o papel pedido não existe na unidade — nunca
silencioso.

**Como sei que terminou:** rateio EXTRAORDINÁRIO com `pagador: 'PROPRIETARIO'`
aponta para o dono onde há ocupação PROPRIETARIO, e marca as demais com o motivo.

### 4. `components/condominio/FinanceiroTab.tsx` (editado)

- Ação **"Gerar cobrança"** na linha do rateio, só em `FECHADO` e sem
  `cobranca_gerada_em` (§9: ícone secundário; a dominante segue "Ver despesas").
- Sheet: **vencimento** (obrigatório) + **de quem cobrar** (Responsável
  financeiro / Proprietário, com o default seguindo o tipo do rateio) → prévia
  cota a cota, com os bloqueios em âmbar e o total cobrável em destaque → gerar.
- Coluna **Cobrança** na tabela: `—`, `Gerada`, `N de M emitidas`.
- §22: costura no array local, sem recarregar a aba.

**Como sei que terminou:** `check-ui-standard.sh` limpo; a Sheet mostra as 8
cotas bloqueadas com o nome de quem falta documento **antes** de qualquer
chamada ao Asaas.

### 5. `components/condominio/CondominioDetail.tsx` — Ficha (editado)

Seção "Cobrança" com multa (%) e juros ao mês (%), pré-preenchidos com 2 e 1, e
uma linha dizendo que é o teto do Código Civil para condomínio.

**Como sei que terminou:** salvar e reabrir mantém os valores; a emissão usa o
que está na Ficha, não o default do código.

### 6. Verificação em runtime

Com dado real no `010`, harness de `feedback_teste_navegador_playwright_pwa`.
**A emissão real no Asaas fica para depois da conferência com o usuário** — é
dinheiro saindo para um gateway, não um rascunho reversível.

---

## O que ESTE plano não faz

- **Inadimplência, acordos e prestação de contas** seguem fora. Multa e juros
  entram no boleto porque o Asaas calcula sozinho — isso é parâmetro de emissão,
  não régua de inadimplência.
- **Portal do Condômino continua sem dado financeiro.** Emitir boleto não põe
  nada no portal; a decisão sobre login real só volta quando o condômino for
  **ver** sua posição lá dentro.

## ⛔ Pré-condições que não dependem de código

1. **A convenção do `010`** — `fracao_ideal_decimal` é nula nas 12 unidades. Sem
   ela o rateio só sai por área privativa ou valor igual, e a cota condominial
   segue a fração da convenção registrada. A aba Frações está pronta e verificada
   (27/08); falta o documento.
2. **CPF/CNPJ dos 8 responsáveis** sem documento. Sem isso o Asaas recusa.

Nenhuma das duas trava a implementação — travam a **emissão real no piloto**.

## Estado

- [x] Item 1 — migration `aplicar_20270914000012_condominio_cobranca.sql` (escrita; **NÃO aplicada** — `aplicar_*` roda à mão no SQL Editor)
- [x] Item 2 — `condominioCobrancaService`
- [x] Item 3 — `condominioRateioService` (pagador por papel)
- [x] Item 4 — `FinanceiroTab` (ação + Sheet + coluna Cobrança)
- [x] Item 5 — Ficha (multa/juros)
- [x] Item 6 — **verificação em runtime FEITA em 27/08/2026** (ver abaixo)

## Migration aplicada e conferida (27/08/2026)

O usuário rodou o BLOCO 6 e os oito contadores bateram:
`cols_empreendimento=2, chk_percentuais=1, col_item=1, fk=1, fk_on_delete='n'
(SET NULL), uidx=1, col_rateio=1, idx_pendente=1`.

## Verificação em runtime — o fluxo até a prévia

No `010 - Galeria Altavista`, competência **08/2026** (R$ 1.260,45 reais no
centro de custo), critério **área privativa**, 12 unidades. Roteiro em
`c:/tmp/pwtest/cobranca.js`, com rota de escrita em `internal_transactions`
**abortada** no harness — nenhum recebível podia nascer sem eu mandar.

| Verificação | Resultado |
|---|---|
| Rateio fecha e ganha número | ✅ `RAT-010-0001` |
| Coluna **Cobrança** distingue os estados | ✅ `Pendente` no fechado, `—` no cancelado |
| Ação "Gerar cobrança" só em FECHADO não cobrado | ✅ presente; some depois de cancelar |
| Prévia conta o que dá para cobrar | ✅ *"Cotas cobráveis 2 de 12 · Total a cobrar R$ 223,09"* |
| Multa/juros vêm da Ficha | ✅ *"Multa 2% e juros 1%/mês, da Ficha do condomínio."* |
| Bloqueio por documento, **nomeando a pessoa** | ✅ 8 cotas, cada uma dizendo de quem é |
| Bloqueio por papel ausente, nomeando o outro papel | ✅ *"Sem responsável financeiro nesta unidade. Quem consta é ALPA Construtora e Incorporadora, em outro papel."* (Sala 301) |
| Botão travado sem vencimento | ✅ `Gerar 2 recebível(is)` desabilitado |
| Trocar para **Proprietário** refaz a prévia | ✅ passa de 10 para **11** bloqueadas — o `010` tem uma só ocupação PROPRIETARIO em 12 unidades, e a tela diz isso em vez de cair no responsável em silêncio |

**Zero erro de console.** Nenhum recebível foi criado
(`internal_transactions` com `source_system='CONDOMINIO_RATEIO'` segue vazia), e
o rateio de teste foi cancelado.

🔎 **Um defeito que só o print revelou, e o log não:** a linha bloqueada
repetia o nome — *"Reginaldo Benedito Nunes · Reginaldo Benedito Nunes está sem
CPF/CNPJ"* —, porque a célula já mostra `clientNome` antes do motivo. A
mensagem passou a ser só *"Sem CPF/CNPJ cadastrado. O Asaas exige documento para
emitir."* ⚠️ Esta correção é posterior ao print e **não foi reexecutada na
tela** — é troca de string com `tsc` limpo, e não valia mais um rateio de teste
descartado só para reconferir.

## ⏳ O que falta para o primeiro boleto real

~~1. Emitir de verdade~~ · ~~2. A convenção do `010`~~ · ~~3. CPF/CNPJ de 8
responsáveis~~ — **os três caíram em 31/08/2026.** Ver abaixo.

## Item 7 — a emissão ligada na tela (31/08/2026)

Faltava o gesto: `emitir()` existia no service e não era chamado por ninguém.

| Item | O que muda | Como sei que terminou |
|---|---|---|
| `condominioCobrancaService.contarEmitidas(rateioIds)` | Conta cotas com boleto por rateio em **2 consultas**, não uma por linha — a coluna mostra "N de M" e N cresce todo mês. Conta COTAS com boleto, não boletos: um recebível pode ter segunda via, e "11 de 10" ninguém entenderia | Coluna preenche sem N+1 |
| Ação **Emitir boletos** | Só aparece depois de GERAR e enquanto houver cota sem boleto. Tom `attention`, não o neutro das outras — é a ação que sai do sistema. Confirmação `danger` avisando que **não se desfaz** | Presente na linha gerada, ausente na já completa |
| Painel **Resultado da emissão** | Existe por causa do sucesso PARCIAL: o service não aborta no primeiro erro. Mostra quantas saíram e lista **cada falha nomeada** com o motivo | Lote misto 6/6 exibiu as 6 unidades e o motivo de cada |
| Coluna **Cobrança** | `—` · `Pendente` · `Gerada` · `N de M emitidas` (âmbar enquanto incompleto, verde ao fechar) | `6 de 12 emitidas` em âmbar |
| `FracoesTab` — placeholder | `0,0000` → **`8,3333`** | ver o achado de UX abaixo |

**Verificação (31/08/2026):** `tsc` limpo, `check-ui-standard.sh` 0 violações,
**2097 testes passando**, e o fluxo exercitado na tela com a edge function
`asaas-charge` interceptada respondendo 200/422 alternados — 12 chamadas, 6 e 6.
Zero erro de console. **Nenhuma chamada real ao Asaas e nenhuma escrita.**

🔴 **Um bug MEU que o próprio teste pegou.** A primeira versão da atualização
otimista fazia `total: prev?.total ?? res.emitidas`. Numa emissão parcial isso
mostrava **"6 de 6 emitidas" em verde** — quando 6 haviam falhado. É exatamente
a classe de defeito que a varredura de 30/08 encontrou duas vezes: número
plausível escondendo problema. O total correto é `emitidas + falhas.length`, que
é o que foi de fato TENTADO. Só apareceu porque o teste forçou lote misto; com
lote 100% verde teria passado despercebido.

🔎 **Achado de UX que veio do uso real.** O usuário digitou a fração em decimal
(`0,0833`) num campo rotulado `Fração ideal (%)`, que espera `8,3333` — **duas
vezes seguidas**, em condomínios diferentes, somando 1% em vez de 100%. Duas
vezes é padrão, não descuido: o placeholder era `0,0000`, que parece decimal.
Trocado para `8,3333`, que só faz sentido como percentual.

## ⛔ Pré-condições — TODAS resolvidas

1. ~~A convenção do `010`~~ — ✅ **12 de 12, soma 100,0000%, origem CONVENÇÃO**
   (transcrita pelo usuário em 31/08). Falta só preencher o campo "Documento de
   origem", hoje nulo.
2. ~~CPF/CNPJ~~ — ✅ **10 de 10 responsáveis** com documento.

**O que resta para o primeiro boleto real:** autorização explícita para chamar o
Asaas de verdade, num rateio nomeado. As 2 cotas que seguem bloqueadas são as
unidades sem responsável financeiro (Sala 301 e 303), não documento.

⚠️ **Pendência de dado noutro condomínio:** as 8 unidades do `007 - Bella Vista`
ficaram com o mesmo erro de escala (0,125% cada, somando 1%). Lá não há
ocupações, então não vira boleto — mas o número está errado no sistema.

**Mecânica (27/08/2026):** `npx tsc --noEmit` limpo · `check-ui-standard.sh` 0
violações em `FinanceiroTab` e `CondominioDetail` · 25 testes passando
(`condominioRateio`, `orgContextGuard`, `migrationsPrefixo`).
