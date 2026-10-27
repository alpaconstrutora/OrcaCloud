# Massa: clicar no pavimento e ver os dados dele em Propriedades (27/10/2026)

## Pedido original

> "permitir clicar em cada pavimento e identificar em propriedades"

(Logo depois da PR #201, que desenhou a divisão dos pavimentos na massa do 3D.)

## O que já existia

- O 3D monta um prisma por pavimento (`massa3d`, chave `${blocoId}-${indice}`). O clique em qualquer um deles
  seleciona o BLOCO inteiro.
- O painel `PainelBlocoSelecionado` mostra o bloco (nome, uso, pavimentos, piso a piso, cota) e a conferência do
  bloco todo. Não dizia qual pavimento foi clicado.
- O motor (`medirBloco`) já calcula cada piso (`PisoDoBloco`): cotas, subsolo, ordem no gabarito, se cabe no
  envelope, área fora e se está acima do gabarito.

## Mudança

1. **Puro:** `resumoDoPiso(medida, indice)` em `utils/blueprintMassa.ts`. Devolve título, linhas (cotas e área,
   ordem no gabarito quando difere do índice, envelope, gabarito) e `problema`.
2. **3D** (`Blueprint3DViewer`):
   - `usarCliqueDePeca` aceita um `aoClicar` opcional, chamado no mesmo clique que seleciona (respeita o arraste).
   - O prisma da massa avisa `onPisoDaMassa(blocoId, indice)`.
   - O piso em destaque (`pisoDaMassa`, a chave) fica azul-escuro.
3. **Editor:** `pisoDaMassa` é estado de sessão `{ blocoId, indice }` e só vale enquanto o bloco é a seleção.
   Trocar a seleção o esquece sem efeito.
4. **Painel:**
   - Seção "Pavimento" com um botão por piso (1º…N; os com problema em vermelho).
   - Escolher pelo painel também destaca no 3D; clicar no escolhido desmarca.
   - Mostra o resumo do piso.

## Verificação

- `__tests__/blueprintMassaResumoDoPiso.test.ts` (5) e `__tests__/components/PainelBlocoSelecionadoPavimento.test.tsx`
  (3).
- tsc; testes da massa e do 3D; `BlueprintEditor.test.tsx` sozinho; check-ui-standard do painel.
- Produção: no Chrome do usuário, clicar no 3º pavimento da Torre A → painel "Torre A · 3º pavimento de 6", piso
  azul-escuro no 3D.
