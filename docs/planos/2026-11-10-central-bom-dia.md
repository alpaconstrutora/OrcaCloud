# Central de Controle → tela "Bom dia"

## Pedido original

> assista este video para criarmos nosssa tela de bom dia ao usuário: https://www.instagram.com/reel/DfQBn-BBG1Y/?utm_source=ig_web_copy_link&xtok=NTc4MTIwNjQ2YQ==
>
> Sessão: 0def919a-cb9d-4de6-b7d1-efd5d79d3424 · 10/11/2026

Pedidos posteriores na mesma sessão:

> "use skill impecable" (10/11/2026): o desenho passou a ser conduzido pelo skill
> impeccable (`shape`).
>
> "Confirmado" (10/11/2026): confirma o brief abaixo, inclusive tirar o botão "+ Novo".

## O vídeo (referência)

Reel do dashboard "Overview" do CarePath AI (legenda "Your morning, sorted."): saudação
grande "Good morning, Sarah" + frase-resumo com números ("37 referrals need you before
noon. 9 payer clocks are past day 5."); filtros em pílula; grade de cartões brancos
arredondados sobre fundo cinza-claro: **My queue** (próximo item travado em destaque,
barra de etapas "2 of 5 gates", lista por etapa com contadores), **Referral flow**
(número grande + barras por estágio, "Blocked" hachurado), **Authorizations** (medidor
semicircular 54 = on track/near deadline/blocked + "Review 19 blocked"), **Referrals
received** (linha + Δ%), **Loops closed** (único cartão azul cheio, 71%); "Your day: 12
of 37 closed" na lateral. Animação: câmera entra pela saudação, cartões aparecem,
números sobem.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 10/11 | Onde entra a tela? | **Redesenhar a Central de Controle** (a tela após o login vira "Bom dia") |
| 10/11 | O que conta como "itens que precisam de você hoje"? | **Aprovações + Minhas tarefas com prazo + Contas vencendo hoje + Alertas de alta prioridade** |
| 10/11 | Como carregar os dados? | **Abordagem A**: bloco `meu_dia` dentro do `fn_central_controle_bootstrap` (uma chamada só) |
| 10/11 | Mapeamento dos cartões | aprovado (tabela abaixo) |
| 10/11 | Aprovações "esperam por mim"? | Só as que eu posso aprovar → depende de **alçada por usuário**, que não existia; plano irmão `2026-11-10-alcada-aprovacao-por-usuario.md` (vem ANTES) |
| 10/11 | Saudação | **Exceção ao §20**: maior (~40px) e peso médio, ainda solta (sem card/hero); documentar no guia |
| 10/11 | Permissão por cartão | **Mesma regra do menu lateral**: o cartão aparece se o módulo para onde leva aparece no menu (visibilidade do módulo na org; desenvolvedor@ vê tudo). As chaves por usuário (`canViewFinancial`…) não são aplicadas em tela nenhuma hoje |
| 10/11 | Botão escuro "+ Novo" do vídeo | **Sai** (a tela é de triagem) |

## Brief (confirmado em 10/11/2026)

- **Modo** Operate. Equipe interna (ADMIN/USER) no começo do expediente: "o que
  precisa de mim hoje" e "a operação está saudável" em 10 s. Todo número leva à ação
  (PRODUCT.md, princípio 5).
- **Mundo**: o do guia unificado (`docs/ui_ux_guia_unificado.md`), sem mudança de
  identidade; Escuro Total funcionando (§33). Um só cartão em cor cheia (% conciliado).
- **Ordem**: saudação → frase-resumo → barra "Seu dia" → pílulas de filtro → grade.

| Bloco | Conteúdo | Leva a |
|---|---|---|
| Saudação | "Bom dia/Boa tarde/Boa noite, {apelido ou primeiro nome}" | — |
| Frase-resumo | "{X} itens precisam de você hoje." + só as partes ≠ 0 | — |
| Seu dia | `SegmentedProgress` (§29) "N de X concluídos" = aprovações dadas por mim hoje + tarefas concluídas hoje + contas baixadas hoje; alertas só pendentes | — |
| Minha fila | Destaque (vencido > vence hoje > parado há mais tempo) com origem, valor, dias parado, aprovar/rejeitar; grupos Aprovações (`pode_aprovar`) · Tarefas · Contas de hoje · Alertas; "ver as N da organização" | fila / tela de origem |
| Obras | total ativo + barras OK/Atenção/Em risco (`scorecards.risco`) | BI Executivo |
| Contas a pagar · 7 dias | medidor semicircular em dia/perto/atrasadas + "Revisar N atrasadas" | Contas a Pagar filtrado |
| Caixa projetado | linha 30/60/90 (já existe) + saldo final em número grande | Inteligência Financeira |
| % conciliado | cartão azul cheio, % + variação | Conciliação Bancária |

Reajustes de contrato, gargalos de processo e divergências viram **Alertas** na Minha
fila: nenhum dado da Central atual some.

- **Estados**: saudação aparece sem esperar o banco; esqueleto por cartão; fonte com
  erro só no seu cartão ("não carregou · tentar de novo"); dia zerado = "Nada esperando
  por você hoje" + barra cheia; sem permissão o cartão some e a grade se reorganiza;
  "Todas as organizações" soma, não esconde.
- **Layout**: 3 colunas no desktop, fila ocupando 2 linhas; abaixo de `lg` uma coluna
  (fila → contas → caixa → obras → conciliado).
- **Movimento**: saudação entra curta, números sobem até o valor **uma vez** no
  primeiro carregamento; nada no "atualizar" nem com `prefers-reduced-motion`.
- **Ações**: aprovar/rejeitar reaproveita o `ApproveRejectModal` e atualiza o estado
  local (§22); concluir tarefa pelo fluxo do `MyTasksWidget`. Teclado completo, foco
  visível, grupos com `aria-expanded`.

## Plano

Começa depois do PR da alçada (plano irmão). Um item por arquivo.

1. `supabase/migrations/aplicar_<prefixo>_central_meu_dia.sql`. **Muda**: bloco
   `meu_dia` no `fn_central_controle_bootstrap` (com o próprio `BEGIN … EXCEPTION`):
   pendentes e concluídos hoje por fonte, contas a pagar 7 dias por situação, %
   conciliado. Continua sem `SECURITY DEFINER`; `REVOKE` mantido (REGRA #7). **Pronto
   quando**: aplicada com `db query -f`; a consulta de conferência devolve o bloco para
   um usuário real.
2. `services/centralControleService.ts`. **Muda**: tipo e leitura do `meu_dia`.
   **Pronto quando**: typecheck + teste do `comoSettled` com o bloco novo.
3. `utils/meuDia.ts` (novo). **Muda**: saudação por hora, frase-resumo (só partes ≠ 0),
   escolha do item em destaque, contagem "N de X". **Pronto quando**:
   `__tests__/meuDia.test.ts` verde (manhã/tarde/noite, dia zerado, prioridade).
4. `components/central/*` (novos: `Saudacao`, `MinhaFila`, `CartaoObras`,
   `CartaoContasSemana`, `CartaoCaixa`, `CartaoConciliado`). **Muda**: os cartões da
   tabela acima. **Pronto quando**: `check-ui-standard.sh` em cada arquivo sem achado.
5. `components/CentralControle.tsx`. **Muda**: vira a composição da tela Bom dia
   (mesmo `case 'central'`, mesma carga única). **Pronto quando**: conferido no
   navegador em 1440×900 e 390×844, claro e Escuro Total, com dado real.
6. `docs/ui_ux_guia_unificado.md`. **Muda**: exceção da saudação no §20 (e o que mais
   o guia não cobrir: medidor semicircular). **Pronto quando**: seção escrita.
7. `__tests__/components/CentralControle.test.tsx`. **Muda**: estados (carregando,
   erro por fonte, dia zerado, sem permissão). **Pronto quando**: verde.

## Estado

- [ ] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6 · [ ] 7

## Verificação

`npm run ci` verde; tela conferida no navegador (os estados acima, claro/escuro,
desktop/celular); checklist do topo do guia listado item a item no relatório (REGRA #1).
