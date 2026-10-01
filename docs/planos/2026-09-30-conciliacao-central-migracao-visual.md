# Conciliação › Central: migração visual para o padrão de UI

## Pedido original

> seguir com a próxima na fila da Conciliação é a migração visual da Central para o padrão.

Sessão df7b7923 · 2026-09-30. Esse item foi separado de propósito no plano
`2026-09-30-conciliacao-regras-absorvidas-pela-central.md` (decisão: "Plano separado").

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 30/09 | Sugestões: cartões lado a lado ou tabela? | **Cartões no padrão.** Mantém a comparação Sistema \| score \| Extrato, na escala compacta |

## Contexto

O `check-ui-standard.sh` passa limpo nos dois arquivos, mas a tela está fora do guia em
pontos que ele não pega:
- caixa alta + `font-black` nos títulos ("CENTRAL INTELIGENTE", "AGRUPAMENTOS SUGERIDOS",
  "SISTEMA", "EXTRATO") — §21;
- `rounded-2xl` nos cartões — §16;
- score e motivos em pílula `rounded-full` — §8;
- filtro de confiança em fileira de pílulas acima da lista — §5.4;
- botões fora do §17 (roxo, verde e índigo sólidos);
- Tolerâncias em modal central — REGRA #4.

Também cabem aqui **três defeitos de comportamento** achados na leitura:
1. **Tolerâncias com o topo em "Todas":** lê e grava com a `organizationId` crua, que vem vazia
   nesse caso. A leitura falha e cai no padrão sem avisar; a gravação falha.
2. **Agrupamentos sugeridos em "Todas":** `if (!organizationId) return` esconde o painel
   (REGRA #5).
3. **"Conciliar alta confiança"** concilia tudo de uma vez **sem confirmação** (§14).

## Plano

### 1. `components/SmartReconciliationCenter.tsx`
- Sai o `<h4>` "CENTRAL INTELIGENTE": o `<h1>` "Central de Conciliação" do pai já diz onde o
  usuário está (§18).
- Sugestões num card com **toolbar acoplada** (§5.2). À esquerda, o filtro "Confiança" em
  `FilterPopover` (§5.4, opções com contagem) e a linha de última execução. À direita,
  Reprocessar, Regras (N), Tolerâncias e a ação primária **Conciliar alta confiança (N)**
  (§17, azul sólido único), agora com `useConfirm`.
- Cartões: `rounded-[10px]`; rótulos Sistema/Extrato em `text-xs font-semibold text-gray-500`
  (§21); score como texto colorido sem pílula (§8); motivos em texto corrido `text-xs`, sem
  pílulas; o fundo em gradiente roxo do centro vira neutro. Descartar/Conciliar compactos
  (§17, `h-8` dentro do cartão), Conciliar em contorno azul para não competir com a primária.
- Estado vazio §12 dentro do card.
- **Pronto quando:** visto no navegador (print) e `check-ui-standard` 0.

### 2. Tolerâncias — de `Modal` para `Sheet`, no mesmo arquivo
- Painel lateral (REGRA #4), malha §30, rótulos §21, inputs `h-9`.
- Lê e grava na **organização da conta** (`orgDaConta`, já resolvida para as Regras).
- **Pronto quando:** abre no navegador com o topo em "Todas" mostrando os valores reais da
  organização da conta, não o padrão. Salvar não é clicado (escrita).

### 3. `components/GroupMatchPanel.tsx`
- Mesmo tratamento: título de seção §30, contador em texto, cartões `rounded-[10px]`,
  rótulos §21 e botão "Conciliar grupo" compacto.
- Organização resolvida pela conta (`resolverOrganizacaoDaConta`) no lugar do guard: o painel
  passa a aparecer em "Todas".
- **Pronto quando:** visto no navegador em "Todas" e `check-ui-standard` 0.

## Estado (30/09/2026)

- [x] 1. Central: sem título repetido, toolbar acoplada (filtro Confiança em `FilterPopover`,
  última execução, Reprocessar, Regras, Tolerâncias e a primária azul), cartões no padrão,
  estado vazio §12, e "Conciliar alta confiança" com `useConfirm`.
- [x] 2. Tolerâncias num `Sheet` (malha §30), lidas e gravadas na organização da conta. O erro
  de leitura agora aparece. Em "Todas" abre sem erro e com os valores reais (a tabela
  `reconciliation_settings` está vazia em produção: todas as organizações usam o padrão).
- [x] 3. Agrupamentos: título de seção, cartões e botão no padrão. Organização resolvida pela
  conta (visto em "Todas": 16 grupos; antes sumia), e o erro de carga aparece no painel.

## Achados fora do escopo (registrados para frente própria)

**A Central às vezes mostra 0 sugestões, com 741 no banco (conta Sicredi da Alpa).** Medido no
navegador. Não é visual nem foi causado por esta migração:
- `loadTransactions` (pai) pede as sugestões em **lotes de 100 extratos, todos em paralelo**
  (58 a 64 requisições, `select *` + embed do título). Com o banco calmo, cada lote levou
  **mediana de 16,4 s e máximo de 17,3 s**, colado no limite de 20 s do cliente. Com o banco
  ocupado, tudo aborta (`signal is aborted`) e a tela fica com 0.
- Lote com erro é descartado em silêncio (`.filter(r => !r.error)`): a tela mostra um número
  plausível e menor.
- Trocar de conta no meio deixa a resposta da conta anterior chegar depois e sobrescrever a
  da nova (corrida; 55 de 64 lotes abortados na troca).
- Caminho provável: uma consulta só por conta (join no banco, ou RPC que devolve a melhor
  sugestão por extrato), descarte de resposta obsoleta e erro visível.

## Verificação executada

- `tsc` 0. `check-ui-standard` 0 nos 2 arquivos. `orgContextGuard` verde.
- Suíte: 6.511 passaram + 33 pulados = 6.544, exit 0. Uma primeira rodada gravou o JSON com 162
  testes ainda rodando (aviso do próprio vitest) e foi descartada.
- Navegador (conta de leitura, escritas bloqueadas = 0, erros = 0):
  - em "Todas": barra acoplada, Regras (2), Agrupamentos com 16 grupos, Tolerâncias sem erro;
  - na Alpa: cartões migrados com a primária "Conciliar alta confiança (37)" (print).
- **Não visto:** os cliques que gravam (Conciliar, Descartar, Conciliar grupo, Salvar
  tolerâncias, a confirmação do Conciliar alta confiança).

## Verificação
`tsc`, `check-ui-standard.sh` nos 2 arquivos, suíte completa (conta fechando),
`orgContextGuard.test.ts`, e navegador com escritas bloqueadas, com o topo em "Todas" e
numa organização.
