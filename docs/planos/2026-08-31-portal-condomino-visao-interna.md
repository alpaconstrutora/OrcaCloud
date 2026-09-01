# Portal do Condômino — visão interna (prévia do que o morador vê)

## Pedido original

Sessão de 31/08/2026, transcrito literalmente:

```
2. voce disse que o portal foi implementado, nas nao encontrei
```

E, depois de eu oferecer duas saídas (uma barata — botão "Abrir portal" na linha
da ocupação; outra completa — item em Portais com prévia da visão do morador):

```
mais completa
```

E em 01/09/2026, já com a tela no ar:

```
correcoes no portal do condomiínio: analise os demais portais para manter o mesmo padrao.
1. sem seletor de condomio, a primeira página mostra diretamente os condomínio que o
usuário quer trabalhar e quando clicar abre tela com o conteudo
```

## Por que ele não era encontrável

Não é bug de navegação: é ausência de porta.

1. **É rota por CAMINHO, não view do `AppRouter`.** O guard em `App.tsx:598` lê
   `window.location.pathname === '/portal-condomino'` + `?token=`, **antes** de o
   `<Layout>` montar. Não existe `case` no roteador, então nenhum item de menu
   poderia apontar para lá.
2. **O grupo "Portais" lista cinco e não ele** (`Layout.tsx:1130-1142`): Cliente,
   Investidor, Fornecedor, Parceiros, Corretor. Os cinco têm view interna de
   gestão; o do Condômino só tinha a casca pública.

Consequência prática: para ver o que o morador vê era preciso gerar um link em
Ocupações e abrir noutro navegador.

## A decisão que molda tudo: a prévia é SOMENTE LEITURA

`CondominoPortal` tem duas ações de escrita — `marcarLido` e `abrirChamado` — e
a aba Comunicação conta `leituras` por aviso.

**Prever com token real e comportamento normal corromperia dado:** só de abrir a
prévia, os avisos daquele morador seriam marcados como lidos, e o número que o
síndico usa para saber se a comunicação chegou viraria ficção. Abrir chamado em
nome de outra pessoa é pior ainda.

Por isso a prévia entra em modo `somenteLeitura`, e a tela **diz** isso. Não é
limitação a contornar depois: é o que separa "ver o portal" de "agir como o
condômino".

> ⚠️ Diferente do Investidor e do Fornecedor (§24 do guia de UI), aqui **não há
> fork de vocabulário**: o portal do condômino é a mesma tela nos dois casos, e o
> ponto é justamente mostrar o que o morador vê. O único desvio é desligar a
> escrita.

## Plano

### 1. `components/condominio/CondominoPortal.tsx` (editado)

Prop opcional `somenteLeitura?: boolean` (default `false` — o acesso público
não muda em nada):
- não chama `marcarLido` ao abrir/clicar aviso;
- esconde o botão de abrir chamado;
- mostra uma faixa no topo dizendo que é prévia e que nada será gravado.

**Como sei que terminou:** com a prova ligada, abrir a prévia não cria linha em
`condominio_aviso_leituras` — conferido no banco antes e depois.

### 2. `components/condominio/PortalCondominoAdmin.tsx` (novo)

A tela interna:
- ~~seletor de condomínio (só `EM_OPERACAO`, mesma lista de Condomínios)~~
  **→ substituído em 01/09 pelo item 6: lista → detalhe**;
- tabela dos **acessos** daquele condomínio — unidade, pessoa, estado
  (`Ativo · N dias` / `Expirado` / `Revogado`), reusando `estadoDoPortal`;
- escolher uma linha renderiza `<CondominoPortal token={…} somenteLeitura />`
  ao lado/abaixo, mais o link copiável;
- ocupação sem acesso **aparece** com o motivo e um caminho ("gere o link em
  Ocupações") — some da lista seria mentir sobre a cobertura.

**Como sei que terminou:** escolher dois moradores diferentes mostra unidades
diferentes, e a tabela lista quem ainda não tem link.

### 3. `components/AppRouter.tsx` (editado)

`case 'condomino-portal'`. Nome com hífen ao contrário do caminho público
(`/portal-condomino`) de propósito: são coisas diferentes, e usar a mesma string
convidaria a confundir hash com pathname.

**Como sei que terminou:** `#/condomino-portal` abre a tela; `/portal-condomino?token=`
segue caindo no guard público, sem `<Layout>`.

### 4. `components/Layout.tsx` (editado)

Item **"Portal do Condômino"** no grupo Portais, e a view entra no
`hasActiveChild` do dropdown — senão o grupo não fica destacado quando a tela
está aberta.

**Como sei que terminou:** o item aparece, navega, e o grupo destaca.

### 5. Verificação em runtime

Harness de `feedback_teste_navegador_playwright_pwa`, com contagem de
`condominio_aviso_leituras` antes e depois para provar o somente-leitura.

### 6. Lista → detalhe, como os outros portais (01/09/2026)

O seletor do item 2 era o desvio. Os dois portais que têm gestão interna de
verdade abrem **direto na lista** e afundam num detalhe:

| Portal | Estado que decide | Volta |
|---|---|---|
| Investidor (`InvestorModule.tsx:23-54`) | `selectedInvestor: Investor \| null` | barra com o nome do investidor |
| Fornecedor (`SupplierPortalManager.tsx:100,371`) | `selectedSupplier: Supplier \| null` | "Voltar para Fornecedores" |
| Condomínios (`CondominiosModule` → `CondominioDetail`) | idem | "← Voltar" (§23) |

`PortalCondominoAdmin` passa ao mesmo esqueleto: `aberto: Empreendimento | null`.

- **Primeira tela** — tabela dos condomínios `EM_OPERACAO`: `Código ·
  Condomínio · Cidade · Ações`, busca persistida, `ColumnConfigButton`,
  `SortableHeader`. A linha inteira é clicável; a ação nomeia o destino
  ("Ver acessos"), não repete "abrir".
- **Detalhe** — "← Voltar" (§23, não breadcrumb: um nível só), h1 *"Acessos ao
  portal"*, subtítulo com o nome do condomínio (senão o detalhe fica sem
  identidade depois do clique), e daí para baixo o que já existia: 3 KPIs,
  tabela de acessos e "Ver como o morador".
- ⚠️ A ordenação por **Cidade** precisa de mapa explícito — a coluna se chama
  `cidade` e o campo é `endereco_city`. `SortableHeader` ordenaria por uma
  chave inexistente, calado, e a tabela ficaria "quase ordenada".

**Como sei que terminou:** entrar no menu cai na lista, sem `<select>` na tela;
clicar num condomínio abre os acessos DELE; Voltar retorna à lista.

## O que este plano NÃO faz

- **Não cria login para o condômino.** Segue token em link público — a decisão
  "token agora, login depois" da F3 não muda aqui.
- **Não duplica a administração.** Publicar aviso e documento continua só na aba
  **Comunicação**; esta tela é espelho, não editor.
- **Não gera acesso.** Gerar e revogar link seguem em Ocupações, onde a ocupação
  mora. Duas portas para o mesmo gesto é como nasce divergência.

## Estado

- [x] Item 1 — `somenteLeitura` no portal
- [x] Item 2 — `PortalCondominoAdmin`
- [x] Item 3 — rota `condomino-portal`
- [x] Item 4 — menu, em Portais
- [x] Item 5 — verificação em runtime
- [x] Item 6 — lista → detalhe (01/09)

## Verificação (31/08/2026)

**Mecânica:** `tsc` limpo · `check-ui-standard.sh` 0 violações nos 4 arquivos ·
**2106 testes passando**.

**Na tela**, harness com as duas RPCs de escrita do portal instrumentadas:

| Verificação | Resultado |
|---|---|
| Item em Portais › Portal do Condômino | ✅ presente e navega |
| Seletor lista só os `EM_OPERACAO` | ✅ `007 - Bella Vista`, `010 - Galeria Altavista` |
| Tabela de acessos | ✅ 17 linhas, colunas `Unidade · Pessoa · Papel · Acesso · Ações` |
| Ocupação sem link **aparece**, com o caminho | ✅ *"Sem acesso"* + *"Gere o link em Ocupações"* |
| Prévia abre o portal de verdade | ✅ 4 de 4 abas, avisos e unidade do morador escolhido |
| Faixa de prévia | ✅ *"Prévia da visão do condômino. Nada é gravado…"* |
| Botão "Abrir chamado" escondido | ✅ |
| **RPCs de escrita chamadas** | ✅ **nenhuma** — `marcar_lido` e `abrir_chamado` instrumentadas, zero disparos |

Zero erro de console.

🔎 **Duas armadilhas de harness que custaram uma rodada cada** (valem para a
próxima verificação deste tipo):

1. **Stub na leitura da lista não engana a RPC.** Flipar `is_active` na resposta
   de `condomino_portal_access` faz a tela admin mostrar "Ativo", mas
   `condomino_portal_get_data` valida o token contra a linha REAL — e os 2
   acessos do piloto estão revogados desde 27/08. A prévia mostrou
   *"Link inválido ou expirado"*, que é o **comportamento correto**: o defeito
   estava no teste.
2. **Playwright dá precedência à rota registrada por ÚLTIMO.** Uma
   `page.route('**/rest/v1/rpc/condomino_portal_get_data')` registrada ANTES de
   `page.route('**/rest/v1/**')` nunca dispara — a genérica engole. Tratar o
   caso dentro da genérica resolve.

## Verificação do item 6 (01/09/2026)

**Mecânica:** `tsc` limpo · `check-ui-standard.sh` 0 violações · **2132 testes
passando**.

**Na tela** (`c:/tmp/pwtest/portal-lista.js`), com as duas RPCs de escrita ainda
instrumentadas:

| Verificação | Resultado |
|---|---|
| Primeira tela é a lista | ✅ `Código · Condomínio · Cidade · Ações`, 2 linhas |
| **Nenhum `<select>` na tela** | ✅ `false` — o seletor sumiu |
| Clicar na linha abre o detalhe | ✅ h1 *"Acessos ao portal"*, subtítulo *"010 - Galeria Altavista · quem já tem link…"* |
| Botão "← Voltar" | ✅ presente |
| Tabela de acessos do condomínio aberto | ✅ 17 linhas, `Unidade · Pessoa · Papel · Acesso · Ações` |
| KPIs | ✅ 17 ocupações · 2 com acesso · 15 sem acesso, com o caminho ("Gere o link na aba Ocupações") |
| Prévia segue somente leitura | ✅ faixa presente, 4 de 4 abas |
| Voltar retorna à lista | ✅ h1 volta a *"Portal do Condômino"* |
| **RPCs de escrita chamadas** | ✅ **nenhuma** |

Zero erro de console.

## O que segue pendente

- **Não há login** — o portal continua por token em link público (decisão da F3).
- **Gerar e revogar acesso** seguem em Ocupações, de propósito.
