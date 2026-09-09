# Gestão de Ativos — o formulário do ativo vira drawer

## Pedido original

Sessão de 2026-09-09, mensagem literal do usuário, logo depois de publicada a
frente `ativos-tabela-sem-painel`:

> ao clicar em um ativo inves de abrir Editar Ativo Patrimonial como modal, abrir drawer

## Por que o pedido bate com a regra

`UI_PATTERNS.md` §3 já colocava "Visualizar registro", "Editar registro" e
"Criar registro simples" em **painel lateral**. O modal central de
`OpuraAssetsModule` era legado — a REGRA OBRIGATÓRIA #4 manda reavaliar isso ao
tocar na tela, e clicar numa linha da tabela é exatamente o caso em que o
usuário precisa da lista visível atrás do formulário.

O mesmo bloco de JSX serve criar, editar e duplicar. Os três passam a ser
drawer: separar só a edição criaria dois desenhos para o mesmo formulário.

## O que muda, item por item

### 1. `components/OpuraAssetsModule.tsx` — o modal vira `Sheet`

`{isNewAssetModalOpen && <div className="fixed inset-0 …">}` sai; entra
`<Sheet open={…} size="2xl" dirty={assetFormDirty}>` com
`SheetHeader`/`SheetTitle`/`SheetDescription`, `SheetPanel` (corpo rolável) e
`SheetFooter` (ações fixas). O `<form>` embrulha painel + rodapé com
`flex-1 flex flex-col min-h-0` — sem o `min-h-0` ele estica o flex e o rodapé
sai da área visível.

**Pronto quando:** clicar numa linha abre painel à direita, com a tabela ainda
visível atrás, e o rodapé fixo com o botão de salvar.

### 2. Guarda de saída (`UI_PATTERNS.md` §4.1)

Drawer fecha fácil (ESC, clique fora) — sem guarda, edição perdida. Como este
form não tem funil único de escrita (cada campo chama `setAssetForm` direto), o
dirty-tracking é **diff por snapshot** (a variante que o §25 do guia registra
para exatamente esse caso), não `useUnsavedChanges` instrumentando cada
`onChange`.

- `assetFormSnapshot` guarda o estado no momento da abertura;
- `assetFormDirty` compara e alimenta o `dirty` do `Sheet` (que cobre ESC e backdrop);
- `pedirParaFecharFormularioAtivo()` cobre o X do cabeçalho e o botão do rodapé,
  que **não** passam pelo `requestClose` do `Sheet`.

**Pronto quando:** alterar um campo e apertar ESC mostra "Sair sem salvar?", e
"Continuar editando" mantém o painel aberto.

### 3. Caminho único de abertura — e um bug que ele fecha

`abrirFormularioAtivo(form, modo)` passa a ser a única porta: preenche o form,
grava o snapshot e reseta `editingAssetId`/`isDuplicate`.

Isso corrige um defeito que já existia no modal: **cancelar uma edição não
limpava `editingAssetId`**. Quem cancelasse e em seguida clicasse em "Cadastrar
Ativo" recebia o formulário com os dados do ativo anterior e, ao salvar,
**atualizava aquele ativo em vez de criar um novo** — em silêncio. `fechar…`
agora zera modo, form e snapshot.

**Pronto quando:** editar → Voltar → "Cadastrar Ativo" abre o formulário em
branco, com o título "Cadastrar Ativo Patrimonial".

### 4. Rótulos do formulário (§21 do guia de UI)

Os 11 `<label>` do formulário saem de `text-gray-400 uppercase tracking-widest
text-[9px]` (estilo deprecado) para `text-xs font-semibold text-slate-500`. O
rodapé usa "Voltar" em edição e "Cancelar" em criação (§25).

Só os deste formulário — os outros modais do arquivo (movimentação, reserva,
manutenção, documento) seguem com o estilo antigo, como pendência de propagação
que o próprio §21 registra.

**Pronto quando:** `grep` no bloco do drawer não acha mais o estilo antigo.

## O que NÃO muda

**Salvar continua fechando o painel.** O §25 ("salvar não fecha") é para
formulário multi-aba / edição longa; este é uma página única de 13 campos, e
mudar o comportamento de salvar não foi pedido.

## Verificação

```bash
bash scripts/check-ui-standard.sh components/OpuraAssetsModule.tsx
npx tsc --noEmit -p .
npx vitest run
```

Mais a tela real (Playwright): geometria do painel, guarda de saída e ausência
de erro de console/HTTP.
