# Massa: identificar cada unidade de cada pavimento (27/10/2026)

## Pedido original

> "Quando terminar implemente também a identificação além do pavimento que já foi feito mas também de cada unidade
> em Cada pavimento"

(Seguimento das PRs #203, pavimento clicável, e #204/#205, blocos seguindo as Torres e Unidades.)

## Decisões do usuário

- **Onde:** o 3D mostra cada pavimento dividido nas unidades dele, e cada unidade é clicável. O painel mostra a
  unidade do Empreendimento correspondente, e o pavimento escolhido lista as unidades dele.
- **Fonte:** as unidades do Empreendimento naquele andar (quantidade e área privativa de cada uma), não o Produto.

## Mudança

1. `estruturaDaTorre`:
   - cada piso traz `unidades` (id, nome, tipologia, área privativa, dormitórios, vagas, orientação, posição,
     situação), na ordem da aba (`sort_order`, depois o nome numérico);
   - `chaveDaUnidade` é o id, ou o nome quando não há id; o 3D e o painel combinam por ela.
2. `PapelDoBloco.pisos`: os pisos do Empreendimento em cada bloco da pilha (torre, térreo empilhado, garagens).
3. `fatiasPorArea(anel, pesos)` (puro, novo):
   - o contorno fatiado ao longo do lado maior, na proporção das áreas;
   - com 4 ou mais unidades e o lado menor de pelo menos 10 m, em duas fileiras;
   - peso nulo vale a média (área comum, estacionamento);
   - é identificação, não projeto: quem projeta o andar é o "Pavimento tipo".
4. **3D:**
   - `massa3dPorUnidade` troca o prisma do piso por uma fatia por unidade (`piso`, `unidade`);
   - o clique diz a unidade;
   - a unidade escolhida fica âmbar e o piso dela azul-escuro.
5. **Painel do bloco:** a seção Pavimento lista "Unidades deste pavimento (N)" e a escolhida mostra nome,
   tipologia, área, dormitórios, vagas, sol, posição e situação (`UNIT_STATUS_LABEL`).
6. **Hook:** a planta com blocos lê as unidades sempre (o 3D precisa); abrir uma tela continua relendo
   (`recarga`).

## Verificação

- Testes: `blueprintUnidadesNoPavimento` (6), `blueprintEstruturaDaTorre` (+1), painel (+2). Massa, 3D e gerador
  verdes; tsc; check-ui-standard; `BlueprintEditor.test.tsx` sozinho; CI.
- Produção: na "Planta 26/10/2026", depois de "Ajustar ao Empreendimento", a Torre B mostra 4 unidades por andar
  no 3D; clicar numa mostra "Unidade 105 · Tipo 5 · 108,00 m²".
