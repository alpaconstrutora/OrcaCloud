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

- (preenchido conforme o trabalho anda)
