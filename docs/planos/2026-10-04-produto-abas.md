# Tela Produto em duas abas

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03–04/10/2026, logo depois de o Estudo de massa ganhar abas. Pergunta do
usuário, literal:

> a tela Produto tambem seria uma boa ideia agrupar assuntos em abas?

A recomendação foi deixar como está (formulário curto, preenchido em sequência — §30) ou, no máximo, três abas. A
resposta do usuário, literal:

> duas abas
> 1. Produto + tipologia
> 2. hipoteses

## O que foi feito

- `TelaProduto` ganhou a `TabsBar` (§19.1): **Produto e tipologias** (o cartão do produto — semente, nome, padrão CUB,
  meta — e a tabela de tipologias, com o preço/m² que alimenta o VGV) e **Hipóteses** (pavimento e financeiro, lado a
  lado como antes).
- A aba escolhida fica guardada neste navegador (`usePersistedState`, `blueprint:produto:aba`).
- Nenhum campo, cálculo ou gravação mudou.

## Verificação

- O teste da tela Produto passou a conferir as duas abas, o que cada uma mostra e a aba lembrada ao reabrir.
- Prints das duas abas no app real.
