# Minhas Tarefas (mobile): correções da crítica de design

## Pedido original

> /impeccable critique:  tarefas versão mobile (print)

Sessão: 915296fb-82d6-4ef8-b9d9-a0746509fa7a · 2026-10-27

Depois da crítica (nota 16/40, gravada em `.impeccable/critique/`), o usuário respondeu:

| Pergunta | Resposta |
|---|---|
| Por qual frente começo? | Lista que não mente (Recomendado) |
| A faixa de dias no topo deve continuar existindo? | Calendário de verdade |
| Quanto quer atacar agora? | Tudo |

E, sobre o plano de ação (harden → layout → colorize → audit → polish):

> todos de uma vez

Fora do escopo escolhido: a frente de identidade (mostrar o módulo de origem da tarefa,
levar até ele, "Adiar").

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-27 | Prioridade | Lista que não mente |
| 2026-10-27 | Faixa de dias | Calendário de verdade (mês funciona, navega qualquer data) |
| 2026-10-27 | Escopo | Tudo, incluindo observações menores |

## Plano

### `utils/tasksMobileAgenda.ts` (novo) + `__tests__/tasksMobileAgenda.test.ts`
**O que muda:** lógica pura da agenda, fora do componente: "hoje" calculado na hora
(não no carregamento do módulo), seções Atrasadas · Hoje · Próximos 7 dias · Depois ·
Sem prazo, rótulo de prazo ("Venceu há N d", "Vence hoje", "Até 03/11", com ano quando
não é o ano corrente), semana de qualquer data, filtro por dia.
**Pronto quando:** a suíte do arquivo passa, cobrindo tarefa com prazo daqui a 15 dias
aparecendo em "Depois" (o defeito P0) e a virada da meia-noite.

### `components/TasksMobileApp.tsx`
1. **[P0] Lista honesta.** "Todas" mostra todas as tarefas, em seções. Tocar num dia vira
   filtro explícito com chip "✕"; os contadores das abas contam o que está na tela.
   **Pronto quando:** uma tarefa com prazo fora da semana visível aparece em "Depois".
2. **Calendário de verdade.** Semana de 7 dias com setas (qualquer semana), rótulo do mês
   acompanha a semana, toque no mês abre o calendário do mês com ponto nos dias com
   tarefa, botão "Hoje". **Pronto quando:** dá para ir a dezembro e filtrar um dia de lá.
3. **[P1] Concluir.** Área de toque 44px, check visível antes de sair, aviso "Concluída ·
   Desfazer" por 5 s, `status_id` do status concluído da org (igual ao desktop), erro
   devolve a tarefa e avisa. **Pronto quando:** concluir + Desfazer devolve a tarefa à lista
   e ao status aberto.
4. **[P1] Criar.** Herda espaço/pasta do recorte (chip "em Espaço › Pasta"), prioridade
   em 4 segmentos (não grava mais Urgente por "Alta"), organização pela REGRA #5
   (espaço → org dele; senão `resolveWriteOrg('single')`, nunca `org_id` nulo), prazo
   pré-preenchido com o dia filtrado, inclui a tarefa no array local (§22).
   **Pronto quando:** tarefa criada dentro de uma pasta aparece na pasta.
5. **[P1] Espaços.** Lista via `taskSpaceService.listSpaces` (contagem por espaço da
   org), linha "Sem pasta" em cada espaço, "Entrada" recarrega a lista.
   **Pronto quando:** tarefa com espaço e sem pasta é alcançável.
6. **Erro de carga.** Estado de erro com "Tentar de novo" em vez de lista vazia; erros de
   gravação em texto claro. **Pronto quando:** falha de rede não mostra "Sem tarefas".
7. **Casca.** Dentro do Layout no celular (anula o gutter, sem ☰ morto e sem avatar "EU"
   fixo — o cabeçalho do app já tem os dois, §18); prévia com `previa` e respiro do notch;
   `dvh`/safe-area no rodapé; "+" vai para o centro da barra inferior (não cobre mais os
   círculos). **Pronto quando:** prévia e celular mostram a lista inteira sem corte.
8. **Contraste e cor.** Metadados e itens inativos ≥ 4,5:1 (slate-500/600); atraso em
   texto vermelho; prioridade Urgente/Alta com rótulo escrito (a cor deixa de ser o único
   sinal). **Pronto quando:** nenhum texto de conteúdo em slate-300/400.
9. **Acessibilidade.** Cartão abre por teclado (botão), `aria-label` nos botões só-ícone,
   abas com `role="tab"`, gavetas `role="dialog"` com Esc, dias com rótulo completo e
   `aria-pressed`, sem `select-none`. **Pronto quando:** varredura sem botão só-ícone sem
   nome.
10. **Menores.** Sem `autoFocus` ao editar; Enter no título não salva o formulário;
    responsáveis filtrados pela org da tarefa (mesma regra do desktop); aviso quando a
    lista bate o limite; nomes de obra buscados só para as tarefas da tela.

### `components/TasksModule.tsx`
**O que muda:** passa `previa` para o `TasksMobileApp` dentro do `MobilePreviewFrame`.
**Pronto quando:** a prévia não fica com o título sob o notch.

## Verificação
- `npx tsc --noEmit -p .`, suíte do utilitário, `orgContextGuard`, `valorDeCampoSemCinzaGuard`
- `bash scripts/check-ui-standard.sh components/TasksMobileApp.tsx`
- Conferência visual na prévia mobile (390px)

## Estado (2026-10-27)

Conferido na prévia mobile e num iframe de 390px dentro do Layout, com os dados reais
da conta, SEM gravar nada (concluir/criar escrevem em produção).

- [x] utilitário — 14 testes passam
- [x] 1 Lista honesta — seções Atrasadas 3 / Sem prazo 4 na tela; "Todas 7" bate com a lista
- [x] 2 Calendário — semana seguinte mostra "Novembro 2026" + "Hoje"; calendário do mês abre; "Ver todas" tira o filtro
- [~] 3 Concluir — código e tipos prontos; **concluir + Desfazer NÃO exercitado no navegador** (gravaria em produção)
- [~] 4 Criar — chip "Em OBRAS › 006 - CORONEL LAMBERT" e 4 segmentos conferidos; **gravação não exercitada**
- [x] 5 Espaços — lista com contagem; espaço abre com "Sem pasta" + pastas; "Entrada" recarrega (7 tarefas de volta)
- [~] 6 Erro de carga — estado de erro escrito; falha de rede não simulada
- [x] 7 Casca — prévia sem título sob o notch; celular dentro do Layout com cabeçalho do app e barra inferior inteira
- [x] 8 Contraste e cor — texto de conteúdo em slate-500/600/700; "Venceu há N d" em red-700; Urgente/Alta escritos
- [x] 9 Acessibilidade — aria-label nos botões só-ícone, tabs/dialog/radiogroup, Esc fecha a gaveta (conferido)
- [x] 10 Menores
- [x] TasksModule — `previa` passado
