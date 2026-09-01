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
- seletor de condomínio (só `EM_OPERACAO`, mesma lista de Condomínios);
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

## O que segue pendente

- **Não há login** — o portal continua por token em link público (decisão da F3).
- **Gerar e revogar acesso** seguem em Ocupações, de propósito.
