# Gestão de Ativos — coluna de Ações com o CRUD visível

## Pedido original

Sessão de 2026-09-09, mensagem literal do usuário:

> na tabela de gestao de ativos crie uma coluna chamada acoes (ultima coluna) com botões CRUD

### Estado antes do pedido

A coluna "Ações" **já existia** como última coluna (frente
`ativos-tabela-sem-painel`, publicada horas antes), mas mostrava só o ícone
Movimentar + o menu ⋮ com Reservar, Manutenção, Anexar documento, QR Code,
Duplicar e Excluir. Editar era o clique na linha, e não havia "Ver".

### Decisões complementares (mesma sessão)

Perguntado como queria os botões, o usuário escolheu:

> **"Ver · Editar · Duplicar · Excluir visíveis"** — os quatro botões-ícone do
> CRUD sempre à vista, mais Movimentar. Reservar, Manutenção, Anexar documento e
> QR Code continuam no ⋮ — são operação, não CRUD.

E sobre o "Ver", que não existia:

> **"Drawer só-leitura"** — mesmo painel lateral, campos desabilitados e sem
> botão de salvar, com um "Editar" no rodapé que destrava.

## O que muda, item por item

### 1. Coluna de Ações — cinco botões + kebab

`ActionIconButton` para `view` · `edit` · `duplicate` · `delete` · `move`, e
`InlineDisclosureMenu` (`showDelete={false}`) com as quatro ações de operação.

Excluir saiu do `showDelete` do menu (que confirmava inline) e virou botão
visível: a confirmação volta a ser `useConfirm()` (§14) e o bloqueio de ativo em
obra vira `disabled` + motivo no `title`.

**Pronto quando:** a última coluna mostra os seis controles, e o botão de
excluir de um ativo `em_uso` está desabilitado com o motivo no tooltip.

### 2. Largura — `actions` de 110 para 250

Cinco botões (28px) + kebab (32px) + cinco vãos de 6px + o `px-6` do §6.6. As
onze colunas de dado encolheram junto (soma 1355) para o total ficar em 1605 e
caber em 1920 sem rolagem lateral.

**Pronto quando:** medido no navegador, `scrollWidth === clientWidth` do
container da tabela em viewport de 1920.

### 3. Modo "Ver" — o mesmo drawer, travado

`assetFormReadOnly` + `<fieldset disabled>` em volta dos campos. Fieldset, e não
`disabled` campo a campo: trava também o campo que alguém acrescentar amanhã.
Título vira "Ativo Patrimonial", rodapé vira "Fechar" + "Editar".

`formularioDoAtivo(asset)` passa a ser o mapeamento único que Ver, Editar e
Duplicar consomem — antes o mesmo objeto estava escrito duas vezes.

**Pronto quando:** os 12 campos casam `:disabled` e o rodapé não tem botão de
salvar.

### 4. O bug que o teste de tela achou — e que só a tela acharia

O botão "Editar" do rodapé, com `type="button"`, **salvava o ativo**. Medido no
navegador: alert `"Ativo patrimonial updated com sucesso!"` disparado a partir do
modo LEITURA.

Mecanismo: React reaproveita o mesmo nó DOM nos dois ramos do ternário do
rodapé. `onClick` é evento discreto, então o re-render é síncrono — o `type` do
botão já virou `submit` quando o navegador executa a ação padrão do clique. O
HTML estava certo (`type="button"` no DOM inspecionado) e ainda assim submetia.

Duas travas, porque uma só não explica a outra para quem ler depois:

- `key` diferente em cada ramo → React troca o nó em vez de mutá-lo;
- `e.preventDefault()` no handler → mata a ação padrão de qualquer jeito;
- e uma terceira, de rede: `handleCreateAsset` retorna cedo se
  `assetFormReadOnly` — ver é ver, venha o submit de onde vier.

**Pronto quando:** clicar "Editar" no modo leitura destrava o formulário, o
título vira "Editar Ativo Patrimonial" e **nenhum** alert de gravação aparece.

## Custo aceito

As colunas de dado ficaram mais estreitas para a coluna de Ações caber, então
"Camionete Ranger" e "Alicate Desemcapador…" truncam mais que antes. O ⚙
(esconder coluna) e o ↔ (autofit) continuam disponíveis para quem quiser
rebalancear.

## Verificação

```bash
bash scripts/check-ui-standard.sh components/OpuraAssetsModule.tsx
npx tsc --noEmit -p .
npx vitest run
```

Mais a tela real (Playwright): largura sem rolagem, os seis controles da coluna,
o drawer travado, o destrave sem gravação e a confirmação de exclusão.
