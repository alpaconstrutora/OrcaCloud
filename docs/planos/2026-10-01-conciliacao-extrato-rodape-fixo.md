# Conciliação › Extrato: rodapé de paginação sempre visível

## Pedido original
> na aba Extrato o docker com paginacao, manter sempre visível

Sessão df7b7923 · 2026-10-01.

## Decisão do usuário
Com linha marcada, o dock de seleção (fixo em `bottom-6`, como no guia) cobria o seletor
"por página". Escolha: **esconder o rodapé enquanto houver seleção**; ao desmarcar, ele volta.

## Mudança (`components/BankReconciliation.tsx`)
- Rodapé do Extrato: `sticky -bottom-4 md:-bottom-6 z-20 bg-white`. O `bottom` negativo é o
  padding do `<main>` (p-4 / md:p-6), que é quem rola: sem ele o rodapé parava 24 px acima do
  pé da tela e as linhas passavam por baixo.
- Card acoplado: `overflow-hidden` → `overflow-clip` (corta os cantos igual, mas não vira
  contêiner de rolagem — com `hidden` o `sticky` grudava no card).
- `hidden` no rodapé com `selectedBankTxIds.size > 0`.

## Verificação (navegador, Sicredi da Alpa, escritas bloqueadas)
- 1440×900: rodapé em y=843–900 com a página no topo, no meio e no fim da rolagem, por cima
  das linhas. 1366×768: y=711–768 nas três posições.
- Marcar uma linha: dock aparece, rodapé some; desmarcar: rodapé volta. "Próxima" pagina
  (1–100 → 101–200 de 5.803).
