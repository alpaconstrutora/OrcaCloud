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

- [ ] Item 1 — migration
- [ ] Item 2 — `condominioCobrancaService`
- [ ] Item 3 — `condominioRateioService` (pagador por papel)
- [ ] Item 4 — `FinanceiroTab` (ação + Sheet + coluna)
- [ ] Item 5 — Ficha (multa/juros)
- [ ] Item 6 — verificação em runtime
