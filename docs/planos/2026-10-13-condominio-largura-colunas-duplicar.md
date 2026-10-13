# Condomínio: botão Duplicar em Ativos + ajuste de largura de colunas nas tabelas

## Pedido original

Sessão `b1a5373a`, 13/10/2026:

> 1. em Ativos do edifício, coluna acoes, incluir botao duplicar (sempre visivel)
> 2. acrescentar botao de ajuste de largura de colunas em todas as tabelas (abas Frações ideais, Ativos do edifício, Manutenção predial, Financeiro)

## Itens

### 1. Duplicar equipamento ✅
`AtivosTab.tsx`: `ActionIconButton kind="duplicate"` ao lado do editar, na coluna Ações (sempre visível, §9/§9.2).
Abre o drawer "Duplicar equipamento" (`Cópia de <código>`) com os dados do original e **nº de série vazio**
(é único por aparelho); salvar é um `create` comum. A cópia não vira rascunho do próximo "Novo equipamento".
**Pronto quando:** a linha tem o botão sem hover; o drawer vem preenchido; salvar gera 2 linhas; "Novo
equipamento" seguinte abre vazio. → verificado no app em 13/10 (equipamento de teste, apagado depois).

### 2. Ajuste de largura (§6.1 / §6.1.1 / §6.1.2) ✅
Tabelas que ganharam `useResizableColumns` + alça de arrastar + espaçador antes de "Ações" + botão
`MoveHorizontal` ("Ajustar largura das colunas ao conteúdo") na toolbar:
- Frações ideais (1) · Ativos do edifício (1) · Manutenção predial: Plano, Ordens e Chamados (3) ·
  Financeiro › Rateios (1).
- Já tinham: Financeiro › Despesas (`useResizableColumns` + botão) e as tabelas de cota/despesa dos
  drawers (`StandardTable`, que traz o botão).
- Helper comum `components/condominio/larguraTabela.ts` (soma das colunas visíveis).
- Larguras iniciais com soma ≈ contêiner de 1600px com a barra lateral aberta (Ativos 1285, Rateios
  1260), para "Ações" nascer visível; com o padrão antigo estourava e escondia a coluna.
**Pronto quando:** cada tabela tem o botão; `<col>` = `<th>`; sem scroll horizontal ao abrir; autoajuste
muda as larguras. → verificado no app em 13/10. Chamados e Despesas estavam vazios no condomínio de
teste: só o botão foi conferido, não a tabela renderizada.
