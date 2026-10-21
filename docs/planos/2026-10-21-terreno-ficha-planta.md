# Terreno: ficha do Empreendimento ↔ Planta Inteligente (Dados do lote)

## Pedido original

Sessão de 21/10/2026 (Claude Code, VS Code), depois da PR #81, com print de
Empreendimento › Torres & Unidades › Terreno do 011 - Garden Cambuhy. Literal:

> em empreendimento > torres e unidades > terreno: existem as seguintes infornmações (Área total (m²);
> Testada / frente (m); Fundos (m); Profundidade (m)) e devem ser sincronizadas com planta inteligente > terreno > dados do lote. Verifique

Decisões do usuário (perguntadas no plan mode, mesma sessão):
1. **Quem manda:** "Os dois mostram, usuário escolhe" — cada tela mostra o número da outra; automático
   só preenche campo VAZIO, nunca sobrescreve.
2. **Qual número da Planta:** "Sempre o desenhado" (o que o botão "Gravar área" já levava).
3. **Profundidade de lote irregular:** "Média das laterais" — (lateral direita + esquerda) / 2.

## O que existia (origin/main 0ed7f382)

- Planta → ficha: o "Gravar área" de Dados do lote (`PainelTerreno` → `gravarAreaNoEmpreendimento`) já
  gravava área + frente + fundos + laterais do desenho, com confirmação — mas **não a profundidade**, e
  o rótulo/linha "Hoje:" só falavam de área. Alvo = empreendimento escolhido na zona.
- Ficha → Planta: só o lote digitado (PR #81).
- Nenhuma das duas telas mostrava o número da outra.
- Sincronização/Curadoria só tratam torre/unidade; fica fora daqui.

## Itens

1. **`utils/blueprintTerrenoDaFicha.ts`** — `medidasDaPlantaParaFicha` (desenhado; profundidade = média
   das laterais) e `compararComFicha` (situação por campo, tolerância 0,01).
   *Pronto quando:* `__tests__/blueprintTerrenoDaFicha.test.ts` cobre retângulo, irregular, lado sem
   papel, contorno aberto e as cinco situações.
2. **Planta › Dados do lote** — bloco "Ficha do empreendimento": tabela Planta × Ficha × situação,
   "Levar à ficha" (grava também a profundidade), alvo = vinculado; vazio da ficha preenchido sozinho
   com aviso. *Pronto quando:* teste do `PainelTerreno` e conferência na tela.
3. **Empreendimento › Terreno** — `services/blueprintTerrenoDaPlanta.ts` lê o rascunho do ramo
   principal da planta vinculada; `TowerEditor` mostra "Planta: …" por campo, preenche no FORM o
   que está vazio (não grava sozinho) e tem "Usar valores da Planta". Histórico com rótulos.
   *Pronto quando:* teste do serviço (banco falso) e do `TowerEditor`; conferência na tela.
4. **Verificação geral** — UI standard, guards, suíte/CI.

## Andamento

- 21/10 — item 1 feito: `utils/blueprintTerrenoDaFicha.ts` (`medidasDaPlantaParaFicha`, `compararComFicha`,
  `patchDaPlantaParaFicha` SO_VAZIOS|TUDO, `ROTULO_DA_COLUNA`); teste 7/7.
- 21/10 — item 2 feito: `components/blueprint/FichaDoTerrenoNaPlanta.tsx` no `PainelTerreno` (também sem
  lote); `gravarAreaNoEmpreendimento` reescrita sobre o patch (agora com profundidade), alvo = vinculado
  (sem vínculo, o da zona); preenchimento do vazio só para o VINCULADO e só na abertura (contorno fechado
  no meio do desenho não vira número da ficha). `PainelTerrenoFicha.test.tsx` 3/3; 4 testes antigos do
  painel verdes. Sem empreendimento nenhum, sobra o bloco antigo ("Escolha o empreendimento acima").
- 21/10 — item 3 feito: `services/blueprintTerrenoDaPlanta.ts` (rascunho do ramo principal, 1º pavimento
  com lote, blindagem de org, motivo dito) 2/2; `TowerEditor` com "Planta: …", vazio no FORM sem gravar,
  "Usar valores da Planta", grade `items-start`; efeito com `vivo` (lição da CI da #81) e comparação
  amarrada aos VALORES salvos (campo apagado de propósito não volta). `TowerEditorTerrenoDaPlanta` 3/3.
  `HistoricoTab` com rótulos.
- 21/10 — conferido na tela (`c:/tmp/pwtest/conferencia-terreno-ficha.cjs`, 11/11, zero erro): planta
  Garden (sem lote) mostra a ficha 1.229 / 18 / 11 / 71 como "Só na ficha" e "Levar à ficha" desligado com
  o motivo; Empreendimento 011 › Terreno diz "A planta Garden ainda não tem desenho."; planta descartável
  12 × 30 com 004 - Alcino Salomon escolhido na zona: 360,00 m² / 12 / 12 / 30 "Só na planta", botão
  ligado (não clicado), nada preenchido sozinho (sem vínculo). Nenhuma escrita em `empreendimentos`
  (conferido no banco: as duas fichas com o mesmo `updated_at`). Descartável arquivada.
  Não visto na tela: a linha "Planta: …" do TowerEditor com lote real (exigiria vincular uma planta com
  lote a um empreendimento real) — coberto pelo teste de componente.
