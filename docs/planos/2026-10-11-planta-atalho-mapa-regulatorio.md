# Planta Inteligente — atalho para o Mapa Regulatório de dentro do editor

## Pedido original

Sessão de 10–11/10/2026. Depois de o Mapa Regulatório virar aba da lista de plantas
(`docs/planos/2026-10-10-mapa-regulatorio-dentro-da-planta.md`), o usuário mandou um print
do seletor de vista do editor:

> veja print nao encontrei em Plantas e Mapa Regulatório.

Expliquei que as abas ficam na lista, antes de abrir a planta, e ofereci duas formas de
levar o acesso para dentro do editor — (1) botão no painel de zona da aba Lote, (2) item no
ribbon —, recomendando a primeira. Resposta, 11/10/2026:

> encontrei o mapa regulatorio.
> faça a primeira melhoria

## Decisões

- **Botão no painel "Zona urbanística"** (aba Lote): *Abrir Mapa Regulatório*. Com um
  mapa da cidade escolhido em "Buscar por cidade", abre **esse** mapa; sem mapa escolhido,
  abre a lista de mapas.
- **"Voltar" do mapa devolve à planta** de onde se saiu — o caminho de ida e volta é o
  motivo do atalho. Aberto pela lista (sem vir do editor), o "Voltar" segue indo à lista.
- **Sair do editor grava o que está pendente.** Achado ao ler o autosave: ele espera
  1,5 s depois da última alteração e, ao desmontar, o temporizador é CANCELADO, não
  executado — quem edita e sai em menos de 1,5 s perde a última alteração. Valia já para a
  seta ← do editor; o atalho seria uma segunda saída com o mesmo buraco. As duas passam a
  gravar antes de sair; se a gravação falhar, o editor fica aberto e mostra "Falha ao salvar".
- O aviso "Este mapa não tem zona cadastrada" vira o próprio atalho (e corrige o texto
  "Cadastre em a aba", que saiu com erro na frente anterior).

## Itens

1. **`useBlueprintEditor.salvarPendente()`** — grava o rascunho que está no debounce e
   devolve `true`/`false`. *Pronto quando:* teste prova que alteração feita e editor
   fechado antes de 1,5 s chega ao `saveDraft`; e que falha devolve `false`.
2. **Saídas do editor usam o item 1** — seta ← e o atalho. *Pronto quando:* com
   gravação falhando, clicar na seta não fecha o editor.
3. **Botão no `PainelZonaUrbanistica`** + prop `onAbrirMapaRegulatorio(mapaId | null)` no
   `BlueprintEditor`. *Pronto quando:* teste do painel: com mapa escolhido chama com o id;
   sem, com `null`; sem a prop, o botão não aparece.
4. **`BlueprintModule` + `RegulatoryMapModule`** — fecha o editor, abre a aba Mapa
   Regulatório e o detalhe do mapa; "Voltar" do detalhe reabre a mesma planta (mesmo ramo).
   *Pronto quando:* teste de componente do caminho ida e volta.
5. **Verificação** — `check-ui-standard`, typecheck, suíte inteira com a conta fechando,
   `verificar:build`, publicar, domínio e CI conferidos.

6. **O painel lembra a escolha em andamento** (cidade, mapa, origem) de cada estudo
   enquanto a aba do navegador estiver aberta — achado ao desenhar a volta: o editor
   desmonta, e só o que foi APLICADO vinha do banco; voltar do cadastro (onde se acabou
   de criar a zona) trazia o painel zerado. Só guarda depois que a pessoa mexe: guardar
   na montagem gravaria os padrões e eles passariam por cima da zona aplicada.
   *Pronto quando:* teste prova as duas metades.

## Estado

- Itens 1–4 e 6: feitos.
  - `__tests__/blueprintSalvarPendente.test.ts` (3): grava o pendente na hora e
    desmontar depois não grava de novo; sem pendente libera; falha segura a saída com
    "rede caiu" em `lastError`.
  - `__tests__/components/BlueprintAtalhoMapaRegulatorio.test.tsx` (7): com mapa abre o
    detalhe e "Voltar para a planta" reabre a mesma planta/ramo (aba volta a Plantas);
    sem mapa abre a lista com o voltar; trocar de aba à mão encerra o ida e volta; sem
    permissão o editor não recebe o atalho; painel: rótulos, aviso clicável, sem prop
    sem atalho.
  - `__tests__/blueprintZonaEscolhaEmAndamento.test.ts` (3): escolha volta ao reabrir;
    abrir/fechar sem mexer não passa por cima do salvo (reprova a 1ª versão, que gravava
    na montagem); cada estudo tem a sua.
  - Harness `docs/spikes/atalho-mapa-regulatorio/` (8/8), painel real em 320 e 448 px. A
    foto pegou o que a 1ª medida não media: com "Abrir Mapa Regulatório" o TÍTULO
    "Zona urbanística" quebrava em 2 linhas a 320 px. Rótulo virou "Mapa Regulatório ↗"
    (o `title` diz "Abrir o cadastro…"), título `whitespace-nowrap`, e o portão passou a
    medir o título também.
  - `check-ui-standard` limpo nos 4 componentes; `orgContextGuard` 14/14; typecheck exit 0.
- Item 5: em andamento.
