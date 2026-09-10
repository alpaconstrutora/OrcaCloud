# "Colunas visíveis" vira modal — o painel saía pela borda da janela

**Frente:** `colunas-visiveis-modal`
**Data do pedido:** 10/09/2026

---

## Pedido original

Mensagem do usuário (com print da aba Documentos do Portal do Parceiro, o painel
"COLUNAS VISÍVEIS" cortado no pé da janela, o último item — Status — só meio
visível), transcrita literalmente:

> veja esse problema, onde a lista coluna visiveis acaba sendo cortada pela tela e como sao pouco documentos nao existe barra de rolagem.
> seria melhor abrir um modal ao clicar no botao de colunas visiveis

---

## Causa

`ColumnConfigButton` (`components/ui/TableUtils.tsx`) já era um portal `fixed`
ancorado logo abaixo do botão — a lista tinha `max-h-[60vh]`. Esse teto não
sabia **em que altura o botão estava**: com a toolbar a meio caminho da tela,
`top + 60vh + rodapé` passa da janela. E como a página tinha poucas linhas,
não havia rolagem para chegar ao que sobrou embaixo. O componente é
compartilhado por **102 telas** — o defeito era de todas, só aparecia onde a
toolbar ficava baixa e a tabela curta.

## Decisão

Modal centralizado, como o usuário sugeriu — e como `UI_PATTERNS.md` §2 manda
para "pouco conteúdo + decisão pontual". A primitiva `Modal` já rola o corpo
dentro de `90vh`, então nunca depende de onde o botão está.

Duas coisas do painel antigo foram preservadas de propósito:
- **portal em `document.body`** — toolbars vivem dentro de card
  `overflow-hidden` (§5.2) e algumas cascas usam `transform`, que viram
  containing block de um `fixed` e o recortariam;
- **camada `z-[10001]`** — acima da pré-visualização "Visualizar como Parceiro"
  (`z-[10000]`), que também tem tabelas com este botão.

---

## Itens

### 1. `components/ui/TableUtils.tsx` — `ColumnConfigButton`

**O que muda:** o painel `fixed` (com cálculo de posição, listeners de
scroll/resize/clique-fora) vira `<Modal size="sm">` com header (título +
"N de M na tabela. A mudança vale na hora."), corpo com a lista de checkboxes
e rodapé com "Restaurar padrão" à esquerda (`mr-auto`, §25), "Salvar como
padrão" quando existe, e "Fechar". A API do componente não muda — as 102 telas
não são tocadas.

**Como sei que terminou**
- [x] `tsc` exit 0; `check-ui-standard.sh` limpo.
- [x] `__tests__/components/ColumnConfigButtonModal.test.tsx` — 6 casos. O
      primeiro é o que importa: o dialog é montado em `document.body` mesmo
      com ancestral `overflow:hidden` + `transform`.
- [x] Suíte: 233 arquivos / 3471 testes antes do teste novo, 0 falhas.
- [x] **Na tela real, no cenário do print** (janela de 690px, portal do
      parceiro › Documentos, 5 documentos, sem rolagem; servidor novo em 3192,
      PID 233592 provado):

      | | antes (print) | depois |
      |---|---|---|
      | caixa do modal | saía pela borda | **top 55 → bottom 635** (janela 690) |
      | "Status" (último item) | cortado | **visível e clicável** — alterna a coluna (12 → 11) |
      | Esc / Fechar | — | fecham |

      Zero erros de console.
- [x] Também numa tela interna (Contas a Pagar, toolbar em card
      `overflow-hidden`): modal aberto, 10 itens, cabe na janela, Esc fecha.

### Uma armadilha que a verificação pegou

`ModalFooter` já traz `justify-end`; escrevi `justify-between` por cima e
"Restaurar padrão" continuou à direita. Com as duas classes na string, vence a
que sai por último **no CSS gerado**, não a escrita por último. Resolvido com
`mr-auto` no botão — o mesmo rodapé canônico do §25.

---

## Observação fora de escopo

O `Sheet` (ex.: "Meus dados" no portal do parceiro) fica montado com
`role="dialog"` mesmo fechado (`pointer-events-none`, para a animação). Uma
sonda por `getByRole('dialog')` acha dois diálogos com um só aberto. É do
`Sheet`, não deste componente; não mexi.
