# Planta Inteligente › lista: Editar em drawer (nome + empreendimento) e coluna Empreendimento

## Pedido original

Sessão de 21/10/2026 (Claude Code, VS Code), mensagem do usuário, literal:

> incorporacao > planta inteligente:
> 1. O botao editar na tabela atualmente serve para entrar na planta inteligente. Alterar para editar via drawer, nome da planta, empreendimento para vincular uma planta a um empreendimento
> 2. criar coluna empreendimento na tabela

## Contexto levantado antes de mexer

- O vínculo planta ↔ empreendimento já existe no banco: **`empreendimentos.blueprint_study_id`**
  (índice parcial, sem FK, sem UNIQUE, sem gatilho). Até hoje só se escolhia do lado do
  Empreendimento (`EmpreendimentoForm`, select "Estudo de Arquitetura (Planta Inteligente)")
  ou ao criar o estudo de áreas pelo empreendimento (`blueprintEstudoDoEmpreendimento`).
  O editor da Planta lê esse vínculo primeiro (`BlueprintEditor`, `empreendimentoDaCasa`).
- 19/10 o Imovib ganhou o mesmo gesto do lado do estudo (`imovibService.vincularEmpreendimento`
  + `ImovibVinculoEmpreendimento`): um estudo, um empreendimento; empreendimento já ligado a
  OUTRO estudo é recusado (tirar de lá é de quem cuida daquele estudo). Este trabalho copia
  essa regra — a mesma que `blueprintEstudoDoEmpreendimento` já aplica ("sobrescrever o
  vínculo quebraria o envio da massa/loteamento daquele estudo").
- Em 21/10 nenhum dos 19 empreendimentos tinha planta vinculada.

## Itens

1. **`services/blueprintService.ts` — `renameStudy` e `vincularEmpreendimento`.**
   Renomear grava `blueprint_studies.name` (nome vazio recusado; UPDATE barrado pela RLS
   vira erro, não sucesso mudo) e registra `ESTUDO_RENOMEADO` na auditoria da planta.
   Vincular: recusa empreendimento de outra organização ou já ligado a outra planta; desfaz
   o vínculo antigo desta planta; liga o novo; `null` desvincula; registra
   `ESTUDO_VINCULADO_A_EMPREENDIMENTO`/`ESTUDO_DESVINCULADO_DE_EMPREENDIMENTO`.
   *Pronto quando:* `__tests__/blueprintVinculoEmpreendimento.test.ts` passa afirmando o que
   fica GRAVADO no banco falso (troca não deixa dois apontando; recusa não mexe em nada;
   RLS muda vira erro).
2. **`components/blueprint/BlueprintEditarSheet.tsx` (novo) — o drawer.** `Sheet` (§26),
   campos Nome e Empreendimento na malha do §30, rótulo §21, valor escuro §32; empreendimento
   ocupado por outra planta aparece desligado com o motivo no próprio rótulo; botão Salvar
   desligado diz por quê; `dirty` no Sheet guarda a saída.
   *Pronto quando:* o teste de componente abre o drawer pelo lápis, salva nome + empreendimento
   e a linha da tabela mostra os dois novos valores.
3. **`components/blueprint/BlueprintModule.tsx` — lápis abre o drawer; coluna Empreendimento.**
   O lápis deixa de abrir o editor; abrir a planta continua no clique da linha e ganha o
   botão de texto "Abrir" (§9). Coluna "Empreendimento" ordenável, com `block truncate` +
   `title`; a busca também acha pelo nome do empreendimento. A coluna não segura a lista
   (§22, corolário): empreendimentos carregam em paralelo e preenchem depois.
   Salvar atualiza o array local (§22), sem recarregar a tabela.
   *Pronto quando:* teste de componente cobre "lápis não abre o editor" e a coluna;
   `check-ui-standard.sh` limpo nos arquivos tocados; tela vista no navegador.
4. **Verificação geral.** `tsc --noEmit`, suíte inteira, `orgContextGuard`, scripts da REGRA
   #2/#3 nos arquivos tocados.

## Andamento

- 21/10 — item 1 feito: `renameStudy` + `vincularEmpreendimento` em `blueprintService.ts`;
  `__tests__/blueprintVinculoEmpreendimento.test.ts` 9/9 (escrito antes, vermelho, depois verde).
- 21/10 — item 2 feito: `BlueprintEditarSheet.tsx`.
- 21/10 — item 3 feito no código: lápis → drawer, botão "Abrir" (§9), coluna Empreendimento
  ordenável e na busca, estado local atualizado ao salvar (§22). Chave das larguras virou
  `blueprintModuleColWidths:v2` (a antiga podia ter "Ações" com 100px de um autoajuste).
  `__tests__/components/BlueprintModuleEditarEmpreendimento.test.tsx` 5/5; os testes antigos do
  módulo (link direto, aba Mapa Regulatório, atalho) seguem verdes. `check-ui-standard.sh` limpo
  nos dois arquivos. **Falta:** ver a tela no navegador (precisa da senha do usuário de leitura).
- Decisão registrada: empreendimento já ligado a OUTRA planta aparece **desligado** no select,
  com "— vinculado a «nome da planta»" (o Imovib o esconde; aqui mostrar diz por que não dá).
