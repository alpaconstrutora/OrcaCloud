# Conectar a aba Condomínio (Portal do Cliente) com Comercial › Condomínios

## Pedido original

Sessão de 01/09/2026:

```
conectar a aba condomínio do portal do cliente com comercial < condominio
```

## Contexto

A aba Condomínio já **lê** o módulo (unidades, avisos, documentos vêm de
`unit_occupancies`, `condominio_avisos`, `condominio_documentos`). O que não
existe é o caminho de volta: **o módulo Comercial › Condomínios não sabe que o
Portal do Cliente existe.**

Ele tem exatamente uma noção de portal — a linha de `condomino_portal_access`,
um acesso por ocupação — e ela está escrita em três lugares independentes
(`estadoDoPortal` duplicado em `OcupacoesTab.tsx:77` e
`PortalCondominoAdmin.tsx:66`, mais os textos de UI).

**O estado real da base hoje deixa isso gritante:**

| | |
|---|---|
| Links de condômino **ativos** | **0** (todos revogados/expirados) |
| Pessoas com link do Portal do Cliente | 3 (Defensoria, Dynamis, Filtrelec) |
| Dessas, com a aba Condomínio ligada | **0** |

Ou seja: **nenhum condômino consegue ver conteúdo de condomínio em portal
nenhum**, e a tela de Ocupações diz "Sem acesso" em cinza para todos —
indistinguível de quem de fato não tem nada, inclusive para os 3 que já entram
no sistema todo dia.

### Decisões (respondidas em 01/09)

1. **Enxergar, conceder e medir o alcance** — não é só navegação.
2. **"Gerar link" passa a emitir o link do Portal do Cliente.** O Portal do
   Condômino continua no ar (decisão anterior), mas deixa de ser o que se emite.
3. **Conceder pelo módulo já liga a aba Condomínio** — um gesto, não dois.

---

## ⚠️ Item 0 — uma regressão minha, de hoje, a corrigir antes de tudo

A migration de 01/09 removeu o índice único `(aviso_id, access_id)` e criou
`(aviso_id, client_id)`. Mas **`condomino_portal_marcar_lido` não foi
reescrita** e continua com `ON CONFLICT (aviso_id, access_id)`.

Conferido no banco agora: índice antigo = **0**, RPC com o `ON CONFLICT` órfão =
**1**. Marcar aviso como lido pelo Portal do Condômino levanta `42P10` desde
hoje. Não apareceu porque há 0 links ativos e 0 avisos cadastrados — ou seja,
**a suíte inteira e a verificação em tela passaram por cima disso**.

Migration `aplicar_20270901000002_marcar_lido_condomino.sql`:
- a RPC passa a gravar **`client_id` também** (vem de `condomino_portal_access.client_id`),
  com `ON CONFLICT (aviso_id, client_id)`;
- ganha a validação de que o aviso pertence ao condomínio do acesso — o buraco
  que a RPC irmã já fecha e que esta nunca teve;
- ⚠️ **sem `client_id`, `NULL` não colide** no índice único novo: a mesma pessoa
  marcaria N leituras e inflaria o KPI do síndico. Não basta trocar o
  `ON CONFLICT`.

**Como sei que terminou:** ensaio com `ROLLBACK` — cria aviso, marca duas vezes
pelo token de condômino, confere **1 linha** com `client_id` preenchido.

---

## Itens

### 1. `utils/acessoAoCondominio.ts` (novo) — fonte única do estado

Hoje `estadoDoPortal` é duplicado em dois arquivos e só conhece um portal.
Uma função pura decide, a partir dos dois insumos:

```
PORTAL_CLIENTE   link de cliente ativo E aba 'condominio' ligada  → "Portal do Cliente · N dias"
AGUARDA_ABA      link de cliente ativo, aba desligada             → "Link ativo, aba desligada"
LINK_CONDOMINO   acesso de condômino ativo (legado)               → "Link de condômino · N dias"
EXPIRADO / REVOGADO / SEM_ACESSO                                  → como hoje
```

**A precedência importa e é o coração do item:** quem tem Portal do Cliente
usa esse; o link de condômino só decide quando não há o outro. `AGUARDA_ABA`
existe separado de propósito — é o estado dos 3 clientes de hoje, e chamá-lo de
"sem acesso" é exatamente a mentira que este plano corrige.

Reusa `ehCondominio`/`presetDeAbas` de `utils/clientCategory.ts` onde couber.

**Como sei que terminou:** testes cobrindo a precedência e o caso `AGUARDA_ABA`.

### 2. `services/condominioAcessoService.ts` (novo) — os dois insumos numa consulta

Para uma lista de `client_id`, devolve `{ temLinkCliente, expiraEm, abaLigada }`
lendo `client_portal_tokens` + `clients.portal_tabs`. Duas consultas, não N+1
(mesmo princípio de `unitOccupancyService.listByEmpreendimento`).

⚠️ Sem RPC nova: as duas tabelas já são legíveis por membro da organização
(`is_org_member`), e quem abre esta tela é membro. RPC aqui seria peso morto.

### 3. `conceder acesso` — o gesto único

Ação em `OcupacoesTab` e em `PortalCondominoAdmin`:

1. **Se já existe link de cliente ativo, NÃO gera outro.** `client_portal_generate_token`
   faz upsert e **invalida o anterior** — gerar de novo derrubaria o acesso que a
   pessoa já usa para contratos e cobranças. Só reusa.
2. Marca `condominio` em `clients.portal_tabs` (`clientService.saveClient`),
   preservando as abas que já estavam lá.
3. Copia o link `/portal-cliente?token=` (`clientPortalService.buildPortalUrl`),
   com o mesmo fallback de clipboard que `gerarLinkPortal` já tem.

O "Gerar link do Portal do Condômino" sai do lugar de ação primária. **Revogar
continua**, para os acessos que existirem.

**Como sei que terminou:** conceder para quem já tem link mantém o MESMO token
(conferido no banco antes e depois) e liga a aba; conceder para quem não tem
cria um.

### 4. Coluna "Portal" e KPIs param de mentir

- `OcupacoesTab` — a coluna passa a dizer **por qual caminho** a pessoa entra.
- `PortalCondominoAdmin` — `sem` deixa de ser resíduo aritmético
  (`total - ativos`) e passa a contar quem não tem **nenhum** dos dois. O card
  editorial "COMO O CONDÔMINO ENTRA / Link com token / Sem login e sem senha"
  deixou de ser verdade única e é reescrito.

### 5. Comunicação: alcance ANTES de publicar, e textos honestos

- No Sheet de publicação e no cabeçalho: quantas ocupações o aviso alcança e
  quantas ficam de fora, com atalho para conceder.
- Textos a corrigir, hoje falsos:
  - `ComunicacaoTab.tsx:401` — *"portal de todos os condôminos **com link
    ativo**"*: com 0 links de condômino ativos, isso diz "ninguém".
  - `OcupacoesTab.tsx:457,498` — *"o link atual PARA de funcionar — quem
    estiver com ele perde o acesso"*: revogar o link de condômino **não** tira
    mais o acesso; a pessoa continua vendo tudo pela aba do Portal do Cliente.
  - `ComunicacaoTab.tsx:166` — *"lido por N condômino(s)"*: o número já mistura
    os dois portais (a contagem nunca olhou `access_id` — é o único ponto do
    módulo que acidentalmente já enxerga o portal novo).
- ⚠️ O toggle `visivel_portal` do documento **hoje comanda os dois portais** (a
  RPC nova filtra pelo mesmo campo) e a tela não avisa. Avisos não têm flag
  nenhuma: publicar é publicar nos dois.

### 6. Navegação de ida e volta

- Ocupações → *"Ver no Portal do Cliente"*, com `navigateToFocus('client-properties', clientId, 'CLIENTE_CONDOMINIO')`.
- `ClientList`/`ClientArea` **não consomem `viewFocus` hoje** — o consumidor
  precisa ser escrito, no mesmo molde de `CondominiosModule.tsx:104-112`.
- ⚠️ Esperar o `loading` terminar antes do `find`, senão o foco é limpo e o
  clique não faz nada — foi exatamente o defeito do botão morto de ontem.

---

## O que este plano NÃO faz

- **Não desliga o Portal do Condômino** — decisão anterior mantida. Ele para de
  ser emitido, não de existir.
- **Não cria visão de síndico** (chamados do prédio inteiro, publicar aviso,
  inadimplência do rateio). É funcionalidade nova.
- **Não leva a cota ao módulo como "coisa de portal"** — ela já aparece no
  Financeiro do Portal do Cliente sozinha.
- **Não unifica `client_requests` na aba Manutenção do módulo.** Os chamados
  abertos pelo portal não têm superfície nenhuma dentro de Condomínios hoje;
  isso é um segundo trabalho, e está anotado como pendência.

## Estado — implementado e verificado em 01/09/2026

- [x] Item 0 — regressão do `ON CONFLICT` (migration escrita; **falta aplicar**)
- [x] Item 1 — `utils/acessoAoCondominio.ts` + 11 testes
- [x] Item 2 — `services/condominioAcessoService.ts`
- [x] Item 3 — "Conceder acesso", o gesto único
- [x] Item 4 — coluna e KPIs param de mentir
- [x] Item 5 — alcance antes de publicar, e textos honestos
- [x] Item 6 — ida de Ocupações para o Portal do Cliente

### A regressão, reproduzida e consertada

`42P10 there is no unique or exclusion constraint matching the ON CONFLICT
specification` — reproduzido no banco, não deduzido. O conserto, em ensaio com
`ROLLBACK`: marcar duas vezes grava **1 linha**, com `client_id` e a
procedência.

### Na tela (condomínio 010, `serviceWorkers:'block'`)

| Verificação | Antes | Depois |
|---|---|---|
| Coluna Portal | 18 linhas dizendo "Sem acesso" | **7** "Link ativo · aba desligada", 9 "Sem acesso" |
| Ação oferecida | "Gerar link do Portal do Condômino" | 7 "Ligar a aba", 10 "Conceder acesso" |
| KPIs | 17 · 0 ativos · 17 sem | 17 · 0 vê · **7 falta aba** · 10 sem (soma fecha) |
| Card editorial | "Link com token" | "Portal do Cliente · um link por pessoa" |

**Conceder para a Defensoria — a prova que importa:** token
`1f90613c-3a4…` e vencimento `2026-10-29` **idênticos antes e depois**;
`portal_tabs` passou de `[dashboard, financeiro, contratos, documentos]` para
`[…, condominio]`, preservando as quatro. A linha virou *"Portal do Cliente ·
58 dias"*, e o link REAL dela passou a mostrar as 3 salas — sem stub nenhum.

**Ponte de ida:** "Ver no Portal do Cliente" abre o cliente certo já na aba
Condomínio.

⚠️ **A primeira versão da ponte era um clique morto para quem não é admin.** Eu
tinha posto o consumidor de `viewFocus` no `ClientList`, que só renderiza com
`isAdmin && !clientProfile` — um colaborador clicava, o hash mudava e ele caía
na "Área do Cliente" genérica. O consumidor mudou para a `ClientArea`, que só
depende de poder LER o cliente. Pego na verificação, não no código.

Zero erro de console. Os 500 de `fn_reconciliation_divergences` /
`fn_approval_*` são o ruído conhecido da Central de Controle, alheio a isto.

## Verificação

**Mecânica:** `npx tsc --noEmit` · `check-ui-standard.sh` nos arquivos tocados ·
`npx vitest run` (2230 hoje) · `orgContextGuard`.

**Testes novos** — a precedência entre os dois caminhos, `AGUARDA_ABA`, e o
"conceder não regenera token de quem já tem".

**No banco, ensaio com `ROLLBACK`:** a RPC corrigida do item 0 grava 1 linha e
é idempotente.

**Na tela** (harness com `serviceWorkers:'block'`), contra o condomínio 010:

1. Antes de conceder: a coluna Portal distingue *"Link ativo, aba desligada"*
   (Defensoria, Dynamis, Filtrelec) de *"Sem acesso"* — hoje as duas dizem a
   mesma coisa.
2. Conceder para a Defensoria: **o token não muda**, a aba liga, o link é
   copiado, e abrir esse link mostra a aba Condomínio com as 3 salas.
3. Os KPIs de `PortalCondominoAdmin` refletem os dois caminhos.
4. A Comunicação diz o alcance antes de publicar, e o número bate com a
   contagem feita direto no banco.
5. Ida e volta entre as telas, sem clique morto.

Zero erro de console e nenhum 4xx/5xx do PostgREST — aqui um `42501` aparece
como coluna vazia, não como erro.

## O que segue pendente

- **Aplicar a migration do item 0** (`aplicar_20270901000002_marcar_lido_condomino.sql`).
  Sem ela, marcar aviso como lido pelo Portal do Condômino continua estourando
  `42P10` — sem efeito prático hoje (0 links ativos, 0 avisos), mas é dívida
  aberta.
- **Ligar a aba para os outros 6** que estão em "Link ativo · aba desligada".
  Só a Defensoria foi concedida, para provar que o token não muda.
- **Nenhum aviso ou documento cadastrado** ainda: o KPI "ALCANÇA HOJE" já
  funciona, mas não há o que alcançar.
- **Chamados do portal não aparecem no módulo.** `client_requests` com
  `unit_id` não tem superfície em Condomínios — a aba Manutenção é plano NBR
  5674 e OS. É um segundo trabalho.
- **Visão de síndico** segue não existindo (a categoria é só um rótulo).
