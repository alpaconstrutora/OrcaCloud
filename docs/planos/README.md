# Planos de implementação

Todo plano de implementação deste projeto mora aqui, versionado no git junto com o
código que ele gerou.

## Por que esta pasta existe

Até 2026-08-03 os planos ficavam em `~/.claude/plans/`, fora do repositório, com nomes
gerados automaticamente (`com-esse-entendimento-voce-rippling-shell.md`). Três problemas:

1. **O pedido que originou o plano se perdia.** O plano descrevia a solução, mas não
   guardava o que o usuário tinha pedido — então, sessões depois, não dava para conferir
   se o que foi entregue era o que foi pedido.
2. **Não era versionado.** Ficava fora do git, invisível para quem lê o repositório.
3. **Nome ilegível.** Impossível achar o plano de um assunto sem abrir um por um.

O caso que motivou a mudança: um pedido claro ("permita criar quando estiver selecionado
todas as organizações") virou um plano que, ao ser executado, deixou 5 das 9 telas de
fora — e a fase foi reportada como concluída. Sem o pedido original ao lado do plano, a
divergência só apareceu quando o usuário testou na tela.

## Regra

**Todo plano de implementação começa com o PEDIDO ORIGINAL, transcrito literalmente.**

Ver `CLAUDE.md` › REGRA OBRIGATÓRIA #6.

## Nomenclatura

```
AAAA-MM-DD-assunto-em-kebab-case.md
```

A data é a do pedido, não a da última edição.

## Estrutura mínima

```markdown
# <Título>

## Pedido original
> Transcrição LITERAL da mensagem do usuário que originou o plano.
> Sessão: <id> · <data/hora>
(+ pedidos posteriores que mudaram o rumo, cada um com data)

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |

## Plano
Um item por arquivo. Cada item: **o que muda** e **como sei que terminou**.
Item sem critério verificável não é item de plano — é intenção.

## Estado
- [x] feito — com o commit
- [ ] pendente

## Verificação
Como testar de ponta a ponta.
```

## Regra de atualização

O plano é **vivo**: atualiza-se conforme o trabalho avança, no mesmo arquivo.

- **Nunca** criar um arquivo novo "que substitui" outro. Se o rumo mudou, registre a
  mudança dentro do arquivo existente, com data e motivo.
- **Nunca** apagar o que já foi decidido — o histórico do plano é o que permite conferir,
  meses depois, se a entrega bateu com o pedido.
