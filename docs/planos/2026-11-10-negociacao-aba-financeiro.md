# Negociação › aba Financeiro — correções da crítica de design

## Pedido original

> `/impeccable` + print da aba Financeiro de "Gerenciar Negociação" (Lote Vale do Sol)
>
> "comercial < venda de ativos > aba financeiro."
>
> `/impeccable critique financeiro da negociação`
>
> Sessão: d3e313ef-9762-4a65-a196-87c950d401a4 · 10/11/2026

Depois da crítica (nota 20/40, 3 problemas P1), o usuário respondeu às perguntas e pediu:

> "um de cada vez" — 10/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 10/11/2026 | Qual frente atacar primeiro? | Proteger o plano (harden) |
| 10/11/2026 | Montador × tabela "Plano de pagamento" | **Editar na própria tabela** — o montador separado deixa de existir |
| 10/11/2026 | Escopo | Tudo, inclusive os menores |
| 10/11/2026 | Ritmo | Um comando de cada vez |
| 10/11/2026 | "Forma de pagamento" com dois sentidos (clarify) | **Topo vira "Condição de pagamento"**; "Forma de pagamento" fica só para o meio (PIX/TED/Dinheiro/Cheque), como em Suprimentos e no Financeiro |
| 10/11/2026 | Venda: "Gerar parcelas" × "Lançar no Financeiro" (distill) | **Manter os dois** — "Lançar" é o principal da aba Parcelas; "Gerar parcelas" secundário |
| 10/11/2026 | "Data do 1º Pagamento" repete a 1ª data da série (distill) | **Só sem série** — com série, a data fica na linha da tabela |

Crítica completa: `.impeccable/critique/2026-11-10T14-26-00Z__components-dealmodal-tsx.md`
(não versionada; frente `design/negociacao-financeiro`).

## Plano

Um item por comando, na ordem pedida. Todos em `components/DealModal.tsx`, salvo indicação.

### 1. `/impeccable harden` — proteger o plano

- **1a. Alterações não salvas (§25).** Dirty por diff contra o último estado salvo/carregado
  (variante do `ProjectModal`); ajustes do próprio sistema após abrir (plano do cofre, total
  semeado, organização, código regerado, status de assinatura) entram no snapshot via
  `ajustarDoSistema`. `SaveStatus` no rodapé (edição); "Cancelar" vira "Voltar" em edição;
  seta do cabeçalho, fundo e Voltar/Cancelar perguntam (`CONFIRMAR_SAIDA`); menu, voltar do
  navegador e fechar a aba também (`registrarPendencia`, só com o modal aberto).
  **Pronto quando:** abrir uma negociação existente não mostra "Alterações não salvas";
  mudar um campo mostra; "Voltar" pergunta; salvar mostra "Salvo" e "Voltar" sai direto.
- **1b. "Lançar no Financeiro" com pendência** vira "Salvar e lançar no Financeiro": salva
  antes e só lança se gravou. Negociação nova (sem id): botão desligado com o motivo escrito.
  **Pronto quando:** com campo alterado, o rótulo e a confirmação dizem "Salvar e lançar"; sem
  alteração, "Lançar no Financeiro" como antes.
- **1c. Enter num campo não envia o formulário** (`onKeyDown` no `<form>`, só campos dele).
  **Pronto quando:** Enter no Nº de parcelas não salva a negociação.
- **1d. Montador zera a cada abertura e nasce do plano gravado** — `serieDoPlanoGravado`
  (`utils/paymentPlan.ts`, testada em `__tests__/paymentPlan.test.ts`): entrada = sinal;
  nº, periodicidade e 1º vencimento = a série principal. O digitado prevalece.
  **Pronto quando:** num plano sinal + 60, o montador abre com entrada do sinal e 60 parcelas,
  e "Vai gerar" descreve o plano atual. (Provisório: o item 2 tira o montador.)

### 2. `/impeccable shape` — editar o plano na própria tabela

Planejar a troca do montador pela edição inline do bloco ("Parcelas 2–60": nº, valor,
periodicidade), onde ficam entrada e juros (Price/SAC, preço sem juros) e a primeira montagem
de uma venda sem plano. **Pronto quando:** o desenho estiver registrado neste arquivo e aprovado.

Decisões do usuário (10/11/2026, rodada do shape):

| Pergunta | Resposta |
|---|---|
| Mudar o nº da série na linha | **Recalcula e fecha** — a série principal fecha a conta; sobra do arredondamento na última |
| Onde ficam os juros | **Faixa acima da tabela** (taxa a.m. · Price/SAC · preço sem juros) |
| Plano de vendas / aviso do rodapé | **Conferir o plano ao vivo** contra a política; o aviso fixo do rodapé sai |

#### Brief — aprovado pelo usuário em 10/11/2026 ("Aprovar e implementar")

1. **Quem e quando.** Corretor/comercial interno, no computador, montando ou ajustando o plano
   de uma venda, muitas vezes com o cliente na frente ("e em 48×?"). Modo Operate: a resposta
   tem de aparecer na hora, sem perder o que já está combinado (sinal, chaves, reforços).
2. **Uma tabela, um plano.** O painel "Montar plano de pagamento" sai. A tabela "Plano de
   pagamento" é o único lugar onde o plano é montado e lido, de cima para baixo:
   - **Faixa de juros** (só venda) acima da tabela: taxa a.m., sistema (Price/SAC, só com
     taxa > 0), preço sem juros. Sugestão do Plano de vendas como hoje ("Do plano de vendas X").
   - **Tabela**: Sinal · séries · reforços · chaves. Edição **na linha**: nº de parcelas,
     periodicidade e 1º vencimento da série; valor das linhas que não são a série principal.
   - **Série principal** (a de maior subtotal — `serieDoPlanoGravado`) é a que **fecha**: seu
     valor é calculado = (total − sinal − demais linhas) ÷ nº, sobra na última; mostra-se como
     calculado (sem campo de valor editável), com o motivo em texto de apoio.
   - **Saldo**: uma linha só no rodapé da tabela ("Total R$ 80.000,00 · fechado"), não duas faixas.
   - **Conferência com a política** (venda com Plano de vendas ativo), logo abaixo:
     "Entrada 37,5% · mínimo 20% ✓ · 60 parcelas · máximo 48 ✗ …" — o servidor decide
     (`fn_validate_sales_simulation`); o front só mostra. Item fora da política diz o limite e
     o que mudar. O aviso fixo "Aprovação sistêmica…" do rodapé é removido.
   - **Gaveta "Adicionar/Editar pagamento"** continua para incluir reforço/chaves/avulsa e para
     o detalhe (forma de pagamento, observação).
3. **Primeira montagem (venda sem plano).** A tabela vazia mostra uma linha de partida — entrada,
   nº de parcelas, periodicidade, 1º vencimento — preenchida pelo Plano de vendas quando houver
   (entrada mínima %, máximo de parcelas) e senão pelo padrão (sem entrada, 12× mensal). Um
   "Montar" cria Sinal + série; dali em diante é a tabela.
4. **Locação.** Mesma tabela, sem faixa de juros e sem conferência de política (Plano de vendas
   é de venda). A série não "fecha" um total: o valor é o aluguel; mudar o nº muda o fim do contrato.
5. **Estados e limites.** Plano de 1 a ~120 parcelas e até ~10 linhas (sinal, série, 2–6 reforços,
   chaves); SAC = valores decrescentes na série (a linha mostra "1ª R$ X → última R$ Y");
   plano que excede o total (série chegaria a ≤ 0) bloqueia o recálculo e diz quanto sobra;
   Plano de vendas indisponível → conferência some, plano funciona igual.
6. **Fora deste passo.** Contas a Receber/"Lançar" (item 4), rótulos e textos (item 3),
   acessibilidade/contraste (item 5). Nada muda em como o plano é gravado
   (`down_payment` + `custom_installments`, `montarPlanoNoNegocio`).

### 3. `/impeccable clarify`

(Achado no item 2: as mensagens da política vêm do servidor sem acento — "Plano draft (nao
ativo)", "Parcela abaixo do minimo de R$ 1000.00." — `fn_validate_sales_simulation`.)


Proposta × cobranças; vazio da aba Parcelas orienta e oferece "Lançar"; ponto da aba com texto;
"Data Efetiva abaixo" (gaveta do sinal); DOC fora da lista; os três sentidos de "Forma de pagamento".

### 4. `/impeccable distill`

Só "Salvar alterações" sólido; "Lançar" vira ação principal da aba Parcelas; sai "Ver plano de
pagamento"; datas reduzidas. ("Total do plano" + "Plano fechado" numa linha: feito no item 2.)

### 5. `/impeccable audit`

`id`/`htmlFor` nos campos; abas `tablist` + `aria-selected` + setas; `size="sm"` em CC e Plano
de Contas; contraste AA (prefixos, placeholders, dicas, âmbar). (Aviso do rodapé: removido no
item 2 — a conferência com o Plano de vendas o substitui.)

### 6. `/impeccable polish`

"R$" no lugar de "BRL"; "Nº de parcelas"; "ANÁLISE DE CRÉDITO" sem caixa alta; foco azul nos
seletores; fonte de 11 px; fecha a crítica.

## Estado

- [x] 1. harden — PR #313, `0cf12197`; conferido na tela (dev local, escritas bloqueadas) e em
  produção (`conferir-producao.sh`: domínio serve `0cf1219` com "Salvar e lançar no Financeiro").
  Não exercitado de ponta a ponta (gravaria em produção): salvar → "Salvo" e "Salvar e lançar" completo.
- [x] 2. shape + implementação — brief aprovado; tabela nova em `components/DealModal.tsx`;
  `agruparSeries`/`indiceDaSeriePrincipal` (`utils/paymentPlan.ts`) e `replanejarSerie`
  (`utils/jurosParcelamento.ts`), testados. Conferido no dev local com escritas bloqueadas:
  nº 60→48 fecha; sinal 30→20 mil a série sobe; juros 1% Price e SAC (uma linha só);
  descrição da série sobrevive ao recálculo; sinal acima do total é recusado com aviso e o
  campo volta; Chaves pela gaveta → a série encolhe e fecha; conferência com o Plano de vendas
  chamando o servidor de verdade (lista simulada como ativa só na aba: o único plano do banco,
  o do Vale do Sol, está em RASCUNHO — em produção a conferência só aparece com plano ativo).
  Publicado: PR #319, `6931d40c`; `conferir-producao.sh` provou o domínio servindo `6931d40`
  com "Taxa do plano de vendas" e "Forma de pagamento da série".
- [x] 3. clarify — "Condição de pagamento" (topo) e opção "Parcelado direto"/"Mensalidade";
  DOC fora das 3 listas (0 registros com DOC no banco, conferido); gaveta do sinal sem o
  "abaixo" errado; ponto de cada aba com o motivo (title + leitor de tela) e o da aba Parcelas
  agora = "plano ainda não lançado"; vazio da aba Parcelas diz quantas parcelas faltam lançar e
  oferece "Lançar no Financeiro" (o texto antigo citava "Parcela avulsa", botão que saiu em
  02/08); frases da política montadas pela regra (`utils/politicaDeVendasTexto.ts`, testada),
  com acento, R$/% brasileiros e o que fazer. Conferido no dev local com escritas bloqueadas.
  Simulação do corretor (pedido do usuário, 10/11/2026: "Na sequência corrigir simulação do
  corretor"): `BrokerProposalSimulator` usa `textoDaRegra(c, 'corretor')` — mesmos números, ação
  no vocabulário da Simulação ("escolha outro plano", "aumente a entrada", "reduza o desconto").
  Não conferida na tela: só abre no Portal do Corretor e nenhum plano de vendas está ativo.
- [x] 4. distill — só "Salvar alterações" em azul sólido (Adicionar pagamento, Montar plano,
  Lançar e Gerar parcelas viram `BOTAO_SECUNDARIO`); "Lançar no Financeiro" saiu da aba Financeiro
  (lá fica a situação + "Lançar pela aba Parcelas") e é a ação da aba Parcelas (estado vazio; no
  cabeçalho quando a venda já tem cobranças); "Ver plano de pagamento" removido (só trocava de aba,
  comentário desatualizado); "Data do 1º Pagamento" só sem série. Teste do aviso de Receita
  Financeira passou a abrir na aba Parcelas. Conferido no dev local com escritas bloqueadas;
  não visto: o "Lançar" do cabeçalho (exige venda já lançada).
  Fora do escopo, anotado: a aba Contrato ainda tem 2 azuis sólidos ("Gerar Documento do
  Contrato", "Gerar Contrato").
- [x] 5. audit — relatório (o audit DOCUMENTA; as correções vão para o item 6). Nota 13/20
  (A11y 2 · Desempenho 3 · Tema 3 · Responsivo 3 · Integridade 2), medido no dev local:
  - P1: 4 campos sem nome acessível (valor da unidade na Composição, Valor Total, Condição de
    pagamento, Data Efetiva — `<label>` sem `htmlFor`); abas sem `role="tablist"/"tab"`,
    `aria-selected` nem setas; contraste < 4,5 — prefixos "R$" 2,60 e "BRL" 2,49, "Nenhum centro de
    custo/Nenhuma conta vinculada" 2,48, "Total do contrato · 1 unidade" 4,44, "Análise de Crédito"
    2,60; valor da unidade (Composição) sem indicador de foco.
  - P2: CC e Plano de Contas no tamanho `md` (54px, `rounded-2xl`, borda quase invisível — §7.1.1
    pede `size="sm"`); placeholder "0" dos juros 3,42; "BRL" × "R$"; em 390px o rodapé corta
    "Salvar alterações" (termina em 416px numa tela de 386px — app interno é de computador).
  - P3: "ANÁLISE DE CRÉDITO" em caixa alta/`font-black` (§21) e seta 1,47; `text-[11px]` em 2
    lugares fora da aba (dica do lote em cinza-claro, status do contrato); H1 → H3 sem H2.
  - Detector: 14 avisos de tamanho de fonte — 12× `text-[13px]` são falso positivo (o guia do app
    prescreve 13px em botões; o DESIGN.md lido é o do Portal do Colaborador), 2× 11px reais (P3).
  - Bom: tabela nova toda nomeada (aria-label), foco visível nas demais paradas, ordem de Tab
    lógica, sem `dark:` (§33), tabela rola dentro do contêiner em 390px, conferência com espera.
- [ ] 6. polish

## Desvios registrados

- §25 pede "Salvar" desligado sem pendência. **Não aplicado no item 1:** o salvar desta tela
  reexecuta efeitos próprios (status do imóvel, tributos da venda —
  `services/commercialService.ts`, `saveDeal`), e desligar o botão sem mapear quem depende de
  "salvar de novo" arrisca botão morto. Reavaliar no item 6.

## Verificação

`npx vitest run __tests__/paymentPlan.test.ts`; `npm run typecheck`;
`bash scripts/check-ui-standard.sh components/DealModal.tsx`; tela no navegador (dev local,
negociação de venda com plano): abrir sem "não salvo", mudar campo, Voltar pergunta, Enter não
salva, montador com o plano atual, "Salvar e lançar" só com pendência.
