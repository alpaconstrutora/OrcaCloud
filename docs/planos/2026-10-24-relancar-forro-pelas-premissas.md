# Planta — rede antiga no forro relança pelas premissas da casa (não fica bloqueada)

## Pedido original

Sessão `9e26b316`, 24/10/2026 (noite), depois do PR #149 (eletrodutos relançam quando uma escolha muda) estar no main.
O usuário trocou a preferência de caixas de passagem na planta "Garden" e o botão de relançar os eletrodutos não ficou
disponível:

> *"então verifique pois alterei e não ficou disponível para relançamento"*

## Diagnóstico (com a planta real do usuário, sem gravar nada no banco)

- A Garden tem dados da Casa Automática (`blueprint_study_casa`, `forro.lancar: true`). A rede elétrica está NO FORRO:
  152 trechos horizontais a 2755 mm, com teto em 2800 — a faixa elétrica do forro (45 mm abaixo da laje). A rede foi
  lançada antes do PR #149, então não tem `registrosDeLancamento`.
- Em `utils/blueprintEscolhasDoEletroduto.ts`, `redeNoForroSemRegistro` dá `true`; `motivoParaNaoRelancar` devolve
  "Rede no forro lançada antes do registro — relançar aqui a tiraria do forro." e `botaoDeLancarEletrodutos` sai
  `{modo:'LANCAR', rotulo:'Lançar em todos (0)', motivo: <esse>, quadros: []}` — com caixas e sem caixas.
- A proteção acertou o diagnóstico (relançar sem as hipóteses do forro tiraria a rede do forro), mas a saída escolhida —
  desligar o botão — contraria o pedido do usuário (PR #149: qualquer troca de preferência deixa o motor disponível).

## Correção

O editor já carrega as premissas da Casa Automática do estudo (`useBlueprintCasa`), e a casa monta o forro elétrico a
partir delas. Usamos a MESMA conta, sem copiar valores:

1. `utils/blueprintCasaAutomatica.ts`: o grupo do forro completo virou `hipotesesDoForroDaCasa` (o que `planejarCasa` já
   fazia inline) e nasceu `forroEletricoDaCasa(hipParcial)` → `{ faixa: forro.eletrica, folgaSobAVigaMm }`, ou `null` com
   o forro desligado. A própria casa usa o mesmo par (`forroDaEletrica`) ao lançar os eletrodutos.
2. `utils/blueprintEscolhasDoEletroduto.ts`: parâmetro opcional `forroDaCasa` (tipo `ForroDaCasa`, o mesmo de `noForro`):
   - `hipotesesDoQuadro`: o forro do REGISTRO tem prioridade; sem registro, rede no forro sem registro + `forroDaCasa` →
     `{ ...hip, noForro: forroDaCasa }`;
   - `motivoParaNaoRelancar`: bloqueia SÓ rede no forro sem registro E sem `forroDaCasa`;
   - propagado por `escolhasAtuaisDoQuadro`, `planejarEletrodutosPorQuadro`, `diferencasDoEletroduto`,
     `botaoDeLancarEletrodutos`, `comandosDeLancarEletrodutos`, `comandosDeRefazerEletrodutos`, `redesARefazer` e
     `comandosAoMoverClimatizacao` (`utils/blueprintMoverClimatizacao.ts`).
   - Depois do relançamento o lote grava o registro COM o forro (como já fazia com `hip.noForro`); dali em diante vale o
     registro, sem precisar das premissas.
3. `components/blueprint/BlueprintEditor.tsx`: `useBlueprintCasa` subiu para junto do painel dos eletrodutos;
   `forroDaCasa` = `forroEletricoDaCasa(hipotesesDasPremissas(premissas))`, memoizado, só quando o estudo tem casa
   gravada (não carregando, não vazio, com persistência) e o forro está ligado. Passado a todas as chamadas do painel
   dos eletrodutos e do mover climatização.

## Testes

- `blueprintCasaAutomatica` (bloco F14b): casa com forro, registro apagado (`ApagarRegistroDeLancamento`) — sem
  `forroDaCasa` continua bloqueado; com `forroDaCasa` o botão sai `RELANCAR`, ligado e sem motivo; refazer deixa todo
  horizontal elétrico do pleno na faixa (nenhuma cota nova); o lote grava o registro com o forro.
- `blueprintEscolhasDoEletroduto`: o teste do bloqueio ganhou o contrato novo (com `forroDaCasa` relança no forro; o
  forro do registro tem prioridade sobre o das premissas).
- Prova com a planta real (script descartável, fora do commit): Garden antes → desligado com o motivo; depois →
  "Relançar com as escolhas atuais", ligado, quadro QDC; refazer mantém todos os horizontais do pleno a 2755 mm e grava o
  registro com `forroAbaixoDoTetoMm: 45`, `forroFolgaSobAVigaMm: 50`.

## Estado

- [x] Correção e testes (24/10/2026).
- [ ] Publicar (PR) e conferir na Garden no app.
