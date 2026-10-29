# O arrasto das unidades não permanecia na planta (29/10/2026)

## Pedido original

> "na planta estou arrastando uma unidade para a posicao que quero mas não esta permanecendo"

O pedido veio com um print da Torre A do Garden, andar 1, no meio de um arrasto: a 101 em âmbar sobre a 102 em azul.

## Causa

- **O banco estava certo.** As duas torres do Garden estavam em `ARRASTO`, e 36 unidades tinham `vaga_na_planta`.
  Na Torre A, andar 1: 102→0, 103→1, 101→2, 104→3, que é a troca 101↔102 pedida.
- **A leitura estava errada.** `estruturaDaTorre` (PR #242) reconhecia só `SETAS` e mandava qualquer outro valor para
  `POSICAO`. O `ARRASTO`, criado depois no PR #249, nunca chegava à Planta.
- **Efeito:**
  - Depois de gravar, a Planta relia as unidades e redesenhava **pela posição**, e o arrasto parecia sumir.
  - Cada arrasto novo partia de novo do arranjo pela posição. Por isso, no banco ficou só o último arrasto de cada
    pavimento ou coluna.

## Mudança

- `utils/blueprintEstruturaDaTorre.ts` passa a aceitar as três escolhas da torre: `POSICAO`, `SETAS` e `ARRASTO`.
  Outra coisa, ou nada, continua valendo `POSICAO`.

## Verificação

- **Testes:**
  - `blueprintEstruturaDaTorre`: a torre em `ARRASTO` continua `ARRASTO`, e a vaga gravada chega ao piso.
  - `blueprintArrastoDasUnidades`, "da torre gravada à fatia desenhada": da torre como está no banco até a vaga
    desenhada. **Falha sem a correção e passa com ela.**
  - Suítes vizinhas: 76/76.
- **Mecânicas:** tsc.
