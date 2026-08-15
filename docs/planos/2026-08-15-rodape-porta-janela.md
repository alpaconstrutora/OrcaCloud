# Rodapé — porta-janela deixa de contar rodapé onde não há parede

## Pedido original

Sessão de 2026-08-15. Perguntado qual era o próximo passo do plano, listei a
fila do roteiro do módulo e um achado fora dela. O usuário respondeu:

> porta-janela

Ou seja: corrigir o defeito, e não seguir a fila.

## O defeito

O comprimento de rodapé descontava do perímetro os vãos que **eram do tipo
porta**:

```ts
(o) => o.kind === 'door' || (o.kind === 'passage' && o.sillMm === 0)
```

Uma **porta-janela** — janela com peitoril zero, que se atravessa a pé — não
passava por esse filtro. O orçamento comprava rodapé ao longo de um vão onde não
existe parede para pregá-lo. O desenho na tela estava certo o tempo todo; só o
número saía errado, calado.

O achado veio de dentro do trabalho do vão livre (mesma função, mesma linha) e
ficou registrado lá como decisão consciente de não mexer. O usuário decidiu
mexer.

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/quantities.ts` | filtro passa a ser `o.sillMm === 0` — o vão que chega ao PISO, sem olhar o tipo | 4 casos (2 kernel, 2 orçamento) |
| `utils/blueprintKernel/quantities.ts` | `POLITICA_PADRAO.version` 1.0.0 → **1.1.0** | caso novo que trava o bump |
| `__tests__/blueprintQuantities.test.ts` | caso que quebra se alguém mudar fórmula sem subir a versão | roda |

### A regra nova cobre os três tipos sem enumerá-los

| | Peitoril | Interrompe rodapé? |
|---|---|---|
| Porta | 0 | sim (como antes) |
| **Porta-janela** | **0** | **sim — era o defeito** |
| Janela comum | 900 | não (como antes) |
| Vão livre / passagem | 0 | sim (como antes) |
| Passa-prato | >0 | não (como antes) |

### O BUMP DA VERSÃO É METADE DA CORREÇÃO

`computeAndStoreQuantities` (`services/blueprintService.ts:405`) é idempotente
por `(snapshot, policy.version)`: com a mesma versão ele **devolve o registro
gravado e não recalcula**. Corrigir a fórmula sem subir a versão deixaria todo
estudo já quantificado servindo o número velho para sempre — pior do que não ter
corrigido, porque a tela afirmaria que está atual.

Trocar a versão cria um registro novo e **preserva o antigo**, que é o que
mantém auditável o número que um orçamento já citou. É o mecanismo que o próprio
comentário do serviço descreve; ele só não tinha sido exercitado ainda.

Um caso de teste agora trava isso: ele afirma a versão em vigor e quebra quando
alguém mexer na conta e esquecer o bump.

## Consequência prática, para quem usa

- Estudo **ainda não quantificado**: sai com o número certo na primeira geração.
- Estudo **já quantificado** sob `quant-1.0.0`: o registro antigo continua lá,
  intacto e auditável. Ao gerar de novo, nasce um registro `quant-1.1.0` com o
  número corrigido. **Nada é reescrito por baixo.**
- Só muda o número de plantas que tenham **porta-janela** (janela com peitoril
  zero). Planta sem porta-janela produz exatamente o mesmo rodapé de antes.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 12 arquivos de blueprint → **332 passando** (20 pulados,
  os de banco que já eram). Nenhum teste existente dependia da regra antiga.
- **Kernel** (2 casos): porta-janela dá o **mesmo** rodapé que uma porta da
  mesma largura, e menor que o perímetro; janela com peitoril 900 **não**
  interrompe — o rodapé continua igual ao perímetro.
- **Orçamento** (2 casos), que é onde o número vira dinheiro: com porta-janela o
  lançamento sai com **13,10 m** em vez dos 14,00 de antes — 90 cm que estavam
  sendo comprados a mais; janela comum segue em 14,00.
- **Política** (1 caso): trava o `quant-1.1.0` e explica no próprio teste o que
  fazer ao mudar fórmula de propósito.

## Fora do escopo

- Regerar quantitativo dos estudos existentes — é ação do usuário, por estudo, e
  o registro antigo é preservado de propósito.
- Marcar porta-janela como um tipo próprio na interface. Ela continua sendo
  "Janela" com peitoril zero, e agora a conta trata isso corretamente sem
  precisar de tipo novo.
