# Planta Inteligente: o empreendimento vinculado preenche sozinho o que a Planta pede

## Pedido original

Sessão de 21/10/2026 (Claude Code, VS Code), logo depois da PR #79 (vínculo planta ↔
empreendimento pela lista). Mensagem do usuário, literal, com print do drawer "Dados do lote,
zona e topografia":

> Ao vincular uma planta com um empreendimento, carregue automaticamente todas as informaçoes que a planta inteligente tem conexão com empreendimento. Vou te dar so um exemplo e voce pesquisa os demais. Exemplo: Em terreno > dados do lote > drawer Dados do lote, zona e topografia > Zona urbanística > ao selecionar o emprendimento o usuário deve que selecionar o empreendimento manualmente. este é um exemplo onde o app ja pode preencher automaticamente sem necessidade de acao manual. Verifique mais casos como esse e implemente

Regra geral já registrada pelo usuário (10/10/2026): se o app já tem a informação, o formulário
preenche sozinho — sem sobrescrever o que a pessoa escolheu ou digitou, e dizendo que foi automático.

## Levantamento (o que a Planta pede que o empreendimento já sabe)

Causa comum: o editor calculava um único `empreendimentoSugerido` **só pela obra** do estudo
(`blueprint_studies.project_id` ↔ `empreendimentos.project_id`) e ignorava o vínculo direto
`empreendimentos.blueprint_study_id`. Todos os pontos abaixo dependiam dele.

| # | Onde | Hoje | Dado no empreendimento (21/10, 19 cadastrados) |
|---|---|---|---|
| A | Terreno › Dados do lote › Zona urbanística › "Do empreendimento" | "Escolha o empreendimento…" | o vínculo |
| B | Mesma seção › zona | "Escolha a zona…" + Aplicar, mesmo havendo uma só | 2 empreendimentos com zona, **1 zona cada** |
| C | Terreno › "Gravar no empreendimento" (área) | "Escolha o empreendimento acima." | o vínculo (segue A) |
| D | Loteamento › Enviar ao Empreendimento | só pela obra ou pela zona | o vínculo |
| E | Estudo de massa › Enviar ao Empreendimento | "Escolha o empreendimento…" (segue D) | o vínculo |
| F | Criar o lote digitando › Frente × fundo | campos vazios | `terreno_frente`/`terreno_profundidade` em 3 |
| G | Desenhar no mapa › Endereço ou coordenada | campo vazio | endereço do terreno em 1, da obra em 11 |
| H | Casa automática › UF do CUB | produto → cidade da zona → 'MG' fixo | `terreno_state`/`endereco_state` |

Já certos (não mexer): Casa automática › unidades do programa (lê o vínculo primeiro);
Versões › NBR 12721 (`empreendimentoDoEstudo` lê `blueprint_study_id`).

Fora, com o motivo: "Onde fica" (lat/long) — o empreendimento não guarda coordenadas;
"Buscar por cidade" (catálogo) — a cidade do empreendimento é texto livre e o campo exige o id de
`master_cities`; com o empreendimento vinculado o caminho "Do empreendimento" já resolve.

## Itens

1. **Editor — o vínculo vem primeiro.** `empreendimentoVinculado` (o que aponta para o estudo)
   antes da obra no `empreendimentoSugerido`; loteamento/massa usam o vinculado antes da escolha
   da zona. *Pronto quando:* teste do editor/hook mostra o select da zona já no vinculado sem clique,
   e o envio do loteamento/massa mira o vinculado.
2. **Hook da zona — diz que foi automático e aplica a zona única.** Sem contexto salvo e com uma
   só zona no empreendimento, aplica sozinho (uma vez por abertura); com escolha salva, ajuste à
   mão ou várias zonas, não mexe. O painel mostra "Preenchido automaticamente…" sob o campo.
   *Pronto quando:* `__tests__/blueprintZonaAutopreencher.test.tsx` cobre: aplica com 1 zona;
   não aplica com 2; não passa por cima de contexto salvo; escolha manual não é desfeita.
3. **Lote digitado — frente e profundidade da ficha.** Só sem lote existente, com aviso de onde
   veio. *Pronto quando:* teste do `PainelLoteDigitado` com a sugestão.
4. **Mapa do lote — endereço da ficha já na busca, procurado ao abrir.** *Pronto quando:* teste
   do `PainelMapaDoLote` mostra o campo preenchido e a busca chamada uma vez.
5. **Casa — UF do empreendimento antes do 'MG' fixo.**
6. **Verificação geral:** suíte, `tsc`, `check-ui-standard.sh` nos .tsx tocados, conferência na tela.

## Andamento

- 21/10 — item 1 feito: `empreendimentoVinculado` no `BlueprintEditor` (vem antes da obra no
  `empreendimentoSugerido`; loteamento, massa e Casa usam o vinculado primeiro).
- 21/10 — item 2 feito: o hook expõe `empreendimentoAutomatico` e `zonaAplicadaAutomaticamente`,
  e aplica sozinho a zona única (só sem contexto salvo, caminho do empreendimento, lista já deste
  empreendimento, uma vez por abertura; "Aplicar" à mão e "Desligar" encerram). O painel mostra
  "Preenchido automaticamente…" sob o empreendimento e "Zona aplicada automaticamente…" sob a zona.
  `__tests__/blueprintZonaAutopreencher.test.ts` 6/6; `blueprintZonaEscolhaEmAndamento` segue verde.
- 21/10 — itens 3, 4 e 5 feitos: `utils/blueprintDadosDoEmpreendimento.ts` (puro, 6/6) monta
  frente × profundidade (profundidade, ou as duas laterais quando iguais), endereço (terreno antes
  de divulgação) e UF; `PainelLoteDigitado.sugestaoDaFicha` e `PainelMapaDoLote.buscaInicial`
  (procura sozinho só sem "Onde fica"); UF na Casa antes do 'MG'. Testes de componente em
  `__tests__/components/BlueprintFichaDoEmpreendimento.test.tsx` (6); os antigos do lote digitado,
  do mapa e do atalho do Mapa Regulatório seguem verdes.
- `check-ui-standard.sh` limpo nos três painéis tocados.
- ⚠️ `BlueprintEditor.test.tsx` não completa nesta máquina: o worker do Vitest cai por dentro do
  V8 (`Check failed`) — inclusive no código SEM esta mudança (frente anterior, mesmo arquivo), em
  pontos diferentes a cada vez. Fica com a CI. `tsc` completo e parcial com segfault recorrente; a
  rodada parcial que terminou só acusou o `toHaveTextContent` sem o setup do jest-dom (falso).
- 21/10 — conferido na tela (dev server da frente, usuário de leitura) com a planta REAL "Garden",
  vinculada ao 011 - Garden Cambuhy (indicada pelo usuário): `c:/tmp/pwtest/conferencia-planta-ficha.cjs`,
  8/8 portões, zero erro. Lista mostra o empreendimento; na zona, empreendimento e "ZEPEC 2 ·
  Urbanização Consolidada" vieram sozinhos com os dois avisos; lote digitado 18,00 × 71,00
  (1278 m²) com aviso; mapa com "Praça Coronel Justiniano, 120, Centro, Cambuí - MG" e já
  centrado lá. Única escrita: a zona aplicada sozinha — **apagada em seguida por SQL** (a planta
  voltou a 0 contexto, rascunho nulo, 3 auditorias, vínculo mantido); depois de publicado, ela se
  aplica na primeira abertura.
- 21/10 — CI da PR #81 (0aa8fcb3): todos os testes passaram (10.575 + 76 pulados = 10.651,
  `BlueprintEditor` e `blueprintCasaAutomatica` inclusos), mas caiu com 2 "Unhandled Rejection"
  (`window is not defined`) vindas do código da PR #79: `BlueprintModule` gravava estado com a
  resposta dos empreendimentos chegando depois de o teste desmontar. Corrigido em 33d0975b (o
  efeito ignora resposta tardia; os 3 testes que montam o módulo simulam o serviço).
