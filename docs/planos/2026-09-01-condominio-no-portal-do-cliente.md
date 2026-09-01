# Condomínio dentro do Portal do Cliente

## Pedido original

Sessão de 01/09/2026:

```
muitas das vezes o cliente do aluguel é cliente de condominio e nao faz sentido
obrigar o cliente acessar dois portais diferentes.

vamos mudar tudo e implementar no portal do cliente ja existente
```

## Contexto

Hoje existem dois portais públicos por link, cada um com sua identidade:

| | Portal do Cliente | Portal do Condômino |
|---|---|---|
| Rota | `/portal-cliente?token=` | `/portal-condomino?token=` |
| Token | `client_portal_tokens`, **1 por cliente** | `condomino_portal_access`, **1 por ocupação** (pessoa × unidade) |
| Identidade | a pessoa | a pessoa **naquela unidade** |

**A premissa do pedido se confirma na base** (medido em 01/09):

- **6 dos 8** clientes de locação também são condôminos; **6 dos 7** condôminos
  têm locação.
- **A Defensoria Pública de MG já tem os dois links** — a dor está literalmente
  no dado.
- Multi-unidade é a regra: Defensoria tem 6 ocupações em 3 unidades; Reginaldo
  Benedito Nunes, 6 em 3. O token do condômino é **por ocupação**, então essa
  pessoa poderia precisar de vários links para ver o próprio prédio.

**Metade da fusão já está construída, e ninguém percebeu:**

1. `unit_occupancies.client_id → clients` (FK RESTRICT). O condômino **já é** um
   `client` — nenhuma identidade nova precisa ser criada.
2. Os chamados do condômino já gravam em **`client_requests`**, a tabela do
   Portal do Cliente, distinguidos só por `unit_id`.
3. A cobrança condominial grava
   `internal_transactions{direction:'CREDIT', party_id: clientId}`
   (`condominioCobrancaService.ts:222-236`) e o Financeiro de Locação do portal
   do cliente lê exatamente isso (`commercialFinanceService.ts:639-644`), numa
   tabela que já se chama *"Cobranças do Imóvel — Aluguel, **condomínio**, IPTU
   e demais encargos"*. **A cota aparece sozinha assim que um rateio for
   cobrado — zero código.**

Sobram três coisas do portal do condômino sem equivalente no do cliente:
**minhas unidades**, **avisos do prédio** e **documentos do condomínio**
(convenção, regulamento, atas).

## Decisões (respondidas em 01/09)

1. **Uma aba "Condomínio"** reunindo unidades + avisos + documentos. Chamados
   continuam em Manutenção; cota continua em Financeiro. Não se duplica o que já
   funciona.
2. **Os dois portais continuam existindo.** O `/portal-condomino` segue no ar e
   segue sendo emitido — o que acaba é a *obrigação* de usar dois. Sobra o caso
   legítimo do condômino que não é cliente de mais nada (a própria ALPA
   Construtora é um: 1 ocupação, 0 locações).
3. **A aba é habilitada à mão**, como as outras, no configurador "Abas visíveis
   para o cliente".

---

## ⚠️ A armadilha que define o desenho

O Portal do Cliente tem **três** caminhos de entrada, e só um usa token:

| Caminho | Quem é | Como carrega hoje |
|---|---|---|
| Link público `/portal-cliente?token=` | `anon` | RPC `SECURITY DEFINER` por token |
| Login e-mail/senha (`ProfileGroup.CLIENT`) | `authenticated` | serviço normal, pela RLS |
| Admin abrindo o portal por dentro | `authenticated`, membro da org | idem |

Cada aba bifurca `portalToken ? RPC : serviço` (`ClientArea.tsx:220-255`).

**Se a aba Condomínio copiar esse `else` ingenuamente, ela nasce quebrada.**
`unit_occupancies` tem RLS `is_org_member(organization_id)`, e **0 dos 29
clientes com e-mail são membros de organização** (medido). O cliente logado
receberia **0 linhas, sem erro** — a aba diria "você não tem unidades" para um
condômino de verdade. É o padrão de defeito que já me custou caro aqui: erro
engolido virando número plausível, que nem `tsc` nem a suíte enxergam.

**Portanto o caminho autenticado também passa por RPC `SECURITY DEFINER`**, com
autorização explícita dentro (precedente: `fn_planning_for_client`, que usa
`auth.jwt()` / `auth.uid()`).

---

## Itens

### 1. Migration `aplicar_20270901000001_condominio_no_portal_cliente.sql` (nova)

Aplicada à mão pelo usuário no SQL Editor — **nunca `supabase db push`**
(histórico de migrations furado).

**a) Leitura de aviso deixa de depender do acesso do condômino.**
`condominio_aviso_leituras` hoje é `(aviso_id, access_id)`, e `access_id` é FK
para `condomino_portal_access` — que o leitor vindo do portal do cliente não
tem. Acrescentar `client_id UUID`, tornar `access_id` anulável, backfill a
partir do acesso, e trocar a chave única para `(aviso_id, client_id)`.

> Efeito colateral a declarar ao usuário, não esconder: hoje duas ocupações da
> mesma pessoa no mesmo prédio contam **duas** leituras. Com a chave por
> pessoa, contam **uma**. O KPI "CONFIRMAÇÕES DE LEITURA" do síndico
> (`ComunicacaoTab.tsx:227-230`) pode cair. É a contagem mais correta ("a
> pessoa leu"), e é o que impede leitura dobrada agora que existem dois
> caminhos para o mesmo aviso.

**b) `client_portal_get_condominio(p_token TEXT) → JSON`**, `SECURITY DEFINER`,
`SET search_path`, `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO anon,
authenticated`. Molde: `fn_portal_get_contracts` (`20270825000020`).
Resolve o token em `client_portal_tokens` (`is_active AND expires_at > NOW()`),
atualiza `last_used_at`, e devolve para o `client_id` do token:
- `unidades[]` — ocupações vigentes (`ended_at IS NULL`) →
  `empreendimento_units → empreendimento_towers → empreendimentos` com
  `status = 'EM_OPERACAO'`; nome do condomínio, torre, unidade, pavimento,
  tipologia, área privativa, fração ideal, **papéis** da pessoa naquela unidade,
  e quem mais consta (**só papel e nome** — o portal não expõe documento nem
  contato de terceiro, decisão já vigente no portal do condômino);
- `avisos[]` — dos empreendimentos dessas unidades, `valido_ate IS NULL OR >=
  CURRENT_DATE`, com `lido` por `client_id`;
- `documentos[]` — `visivel_portal = true`.

**c) `client_portal_get_condominio_for_client(p_client_id UUID) → JSON`** — o
mesmo payload para os caminhos autenticados, com autorização **dentro** da
função: `is_org_member` da org do cliente (admin) **ou**
`lower(auth.jwt()->>'email') = lower(clients.email)` (cliente logado). Sem
isso, um usuário autenticado qualquer leria o condomínio de outro. `GRANT
EXECUTE TO authenticated` apenas.

**d) `client_portal_marcar_aviso_lido(p_token TEXT, p_aviso_id UUID)`** —
grava `(aviso_id, client_id)` com `ON CONFLICT DO NOTHING`. **Valida que o aviso
pertence a um condomínio onde o cliente tem ocupação vigente** — o
`condomino_portal_marcar_lido` atual não valida (`migration 000023:362-364`), e
não vale copiar o buraco para uma função nova.

**e) Chamados por unidade** — `fn_portal_get_requests` devolve `unit_id` e o
nome da unidade; `fn_portal_create_request` aceita `p_unit_id UUID DEFAULT NULL`
e o grava. Assinatura com default para não quebrar as chamadas existentes.

**Como sei que terminou:** bloco de conferência no fim da migration
(`col_client_id=1, uidx_aviso_cliente=1, rpcs=4, grants_anon=2`), e o resultado
colado pelo usuário.

### 2. `services/clientPortalService.ts` (editado)

`getCondominioByToken(token)` e `getCondominioForClient(clientId)`, seguindo o
formato dos vizinhos (`getContractsByToken`, `getPlanningByToken`) —
`supabase.rpc(...)`, log no `catch`, `[]`/`null` no erro. Mais
`marcarAvisoLido(token, avisoId)`.

**Como sei que terminou:** as duas devolvem as 3 unidades da Defensoria.

### 3. `components/client/CondominioTab.tsx` (novo)

O conteúdo da aba. **Arquivo novo, não dentro de `ClientArea.tsx`** — o
monolito já tem 4592 linhas, e o Portal do Cliente é o único portal que ainda
não foi fatiado (investidor e fornecedor já têm `components/*/portal/*`).

Três blocos, na ordem em que a pergunta do morador aparece:
1. **Minhas unidades** — um card por unidade (condomínio, torre, unidade,
   pavimento, área, fração ideal em % com 4 casas, papéis) e quem mais consta.
   Com **mais de um condomínio**, agrupar por condomínio — Defensoria e
   Reginaldo têm 3 unidades cada, então o plural é o caso comum, não a exceção.
2. **Avisos** — categoria, data, marcador de não-lido; clicar marca lido.
3. **Documentos** — convenção, regulamento, atas (`<a target="_blank">`; a URL é
   texto livre, não Storage).

Padrão visual: o do **app** (§4 `KpiCard`, §6.2 sentence case, §8 status como
texto colorido, §12 estado vazio), identidade **indigo/azul** do Portal do
Cliente. **§24 não se aplica** — a exceção coral cobre só Investidor e
Fornecedor; `ClientArea` não importa `PortalKit`.

Estado vazio explícito para cliente sem ocupação: a aba é habilitada à mão, logo
ela pode estar ligada para quem não tem unidade, e isso precisa dizer o que é —
não uma tela em branco.

**Como sei que terminou:** `bash scripts/check-ui-standard.sh` limpo no arquivo.

### 4. `components/ClientArea.tsx` (editado)

- `ALL_TABS` (`:3599-3612`): `{ id: 'condominio', label: 'Condomínio', icon: <Building2 …/> }`, depois de Manutenção.
- **Não** entra em `CATEGORY_TAB_PRESETS` (`:3614-3618`) — a decisão foi
  habilitar à mão; pôr no preset de Locação seria automático pela porta dos
  fundos.
- Carregamento junto dos irmãos (`:213-260`), com a bifurcação **correta**:
  `portalToken ? getCondominioByToken(portalToken) : getCondominioForClient(clientProfile.id)`
  — as duas por RPC, pela razão da seção "armadilha".
- Render despachando para `<CondominioTab />`.

**Como sei que terminou:** a aba aparece no configurador, liga/desliga e
persiste em `clients.portal_tabs`.

### 5. Manutenção mostra a unidade (editado, mesmo arquivo)

Coluna/rótulo da unidade nos chamados e, para quem tem ocupação, escolher a
unidade ao abrir chamado. É o que faz o chamado aberto pelo portal do condômino
aparecer no portal do cliente com sentido — hoje `fn_portal_get_requests`
ignora `unit_id`.

**Como sei que terminou:** chamado aberto pela aba Manutenção com unidade
escolhida nasce com `unit_id` preenchido.

### 6. `components/ClientList.tsx` (editado, pequeno)

No modal de acesso, quando o cliente tem ocupação vigente, uma linha dizendo que
este link também dá acesso ao condomínio. Sem isso, quem gera o link não tem
como saber que a aba existe.

---

## O que este plano NÃO faz

- **Não desliga o Portal do Condômino** (decisão 2). Rota, `CondominoPortal` e
  `PortalCondominoAdmin` ficam como estão, e "Gerar link" em Ocupações continua
  emitindo o link por ocupação.
- **Não cria login para o condômino.** Segue token em link público.
- **Não move a cota para a aba Condomínio** — ela já vive em Financeiro, e dois
  caminhos para a mesma cobrança é como nasce divergência.
- **Não mexe no vocabulário §24.** O Portal do Cliente está fora daquela
  exceção e continua com o padrão do app.
- **Não fatia o resto do `ClientArea.tsx`.** Só o código novo nasce fora.

## Estado — implementado e verificado em 01/09/2026

- [x] Migration aplicada (8 de 8 na conferência)
- [x] Serviço + tipos
- [x] `components/client/CondominioTab.tsx`
- [x] Aba no catálogo, carregamento e render
- [x] Chamado com unidade
- [x] Aviso no modal de acesso
- [x] 9 testes novos

### Três defeitos que o processo pegou antes de virarem bug

1. **Reescrevi `fn_portal_get_requests` do zero e ia quebrar a aba Manutenção.**
   O contrato real é `{valid, data}` na leitura e **`{success, error}`** na
   escrita — fui ler a função em produção em vez de confiar na memória. Com
   `{ok}`, a aba ficaria vazia **sem erro nenhum**.
2. **`CREATE OR REPLACE` com um parâmetro a mais cria SOBRECARGA, não
   substitui.** A chamada de 5 argumentos nomeados passaria a casar com as duas
   funções: `42725` a cada chamado aberto. Exigiu `DROP` explícito.
3. **O ensaio acusou `anon` com EXECUTE numa RPC concedida só a
   `authenticated`.** No Supabase, `REVOKE ALL FROM PUBLIC` **não** desfaz o
   grant direto ao papel `anon` dado por default privileges — é preciso
   `REVOKE ... FROM PUBLIC, anon`. Sem isso, a RPC por `client_id` ficava aberta
   ao link público, e nada na tela denunciaria.

### Autorização — os quatro cenários, no banco

| Quem | Resultado |
|---|---|
| Sem sessão (anon) chamando a RPC por id | ✅ *"Não autenticado."* |
| Autenticado sem vínculo nenhum | ✅ *"Sem permissão para ver este cadastro."* |
| Membro da organização (admin por dentro) | ✅ **3 unidades** |
| O próprio cliente (e-mail do cadastro) | ✅ **3 unidades** |
| O mesmo cliente tentando ler OUTRO cadastro | ✅ *"Sem permissão"* |
| Link da Defensoria vendo a sala da Ivana | ✅ **0** — vê só 201, 202, 203 |

⚠️ Dois testes meus deram falso alarme antes de eu achar a causa, e a causa foi
sempre o **teste**: (a) sob o papel `authenticated`, a RLS escondia o cliente do
subquery que buscava o `id`, e eu passava `NULL` para a função; (b)
`is_org_member` prefere `user_id = auth.uid()` quando preenchido, então um `sub`
inventado nunca passa. Corrigidos, os quatro cenários batem.

### Marcar aviso como lido (ensaio com `ROLLBACK`, nada persistido)

Marcar duas vezes grava **1 linha**, com `client_id` preenchido e `access_id`
nulo. Aviso de outro condomínio e token inválido são recusados com motivo.

⚠️ Contar linhas no MESMO `SELECT` que chama a função deu `0` por snapshot — o
número parecia dizer "não gravou". Em instrução separada: 1. Vale a regra de
sempre: número plausível não é prova.

### Na tela (link público real da Defensoria, `serviceWorkers:'block'`)

| Verificação | Resultado |
|---|---|
| Aba "Condomínio" no menu | ✅ |
| Condomínio e as 3 salas | ✅ 3 de 3 |
| Fração ideal | ✅ `8,3333%` |
| Um cabeçalho por prédio, não um por unidade | ✅ *"010 - Galeria Altavista · 3 unidades"* |
| Papéis somados numa linha por unidade | ✅ Reginaldo: `[INQUILINO, RESPONSAVEL_FINANCEIRO]`, 1 linha |
| Avisos e documentos | ✅ renderizam, com marcador de não lido |
| Estados vazios (as tabelas estão zeradas) | ✅ dizem o que é, não ficam em branco |
| Aba aberta SEM cliente escolhido | ✅ estado vazio, tela de pé |
| Escritas tentadas | ✅ nenhuma |
| Erros de console | ✅ nenhum |

O único stub foi a **lista de abas** (`clients.portal_tabs`), porque a decisão
foi habilitar à mão e não cabia escrever no banco para testar. Todo o dado do
condomínio veio da RPC real. Avisos e documentos foram simulados numa segunda
rodada porque as tabelas têm 0 linhas — as unidades continuaram reais.

## Verificação

**Mecânica:** `npx tsc --noEmit` · `bash scripts/check-ui-standard.sh` nos
arquivos tocados · `npx vitest run` (suíte inteira, hoje 2164) ·
`npx vitest run __tests__/orgContextGuard.test.ts`.

**Testes novos** (`__tests__/condominioPortalCliente.test.ts`): agrupamento por
condomínio com múltiplas unidades, papéis somados na mesma unidade, e o estado
vazio — as três coisas que o caso Defensoria (3 unidades, 2 papéis cada) exercita.

**No banco**, antes e depois: contagem de `condominio_aviso_leituras` para provar
que abrir a aba não marca lido sozinho, e que clicar marca **uma** linha.

**No navegador** (harness de `feedback_teste_navegador_playwright_pwa` —
`serviceWorkers:'block'` obrigatório, senão o PWA engole o `page.route`), nos
**três** caminhos, que é onde este trabalho pode mentir:

1. **Link público** — abrir `/portal-cliente?token=` de um cliente condômino e
   conferir as 3 unidades, avisos e documentos.
2. **Cliente logado** — o caminho que a RLS silenciaria. Provar que traz as
   mesmas unidades, e não uma lista vazia plausível.
3. **Admin por dentro** — Portais › Portal do Cliente › escolher o cliente.

Em todos: zero erro de console, e nenhum 4xx/5xx do PostgREST — um `42501`
(permissão) aqui aparece como aba vazia, não como erro na tela.

**Prova de que o link de um cliente não vê o condomínio de outro:** chamar
`client_portal_get_condominio` com o token da Defensoria e conferir que não
vem unidade da Ivana.
