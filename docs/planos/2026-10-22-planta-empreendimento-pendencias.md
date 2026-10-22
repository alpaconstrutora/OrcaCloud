# Planta ↔ Empreendimento: as pendências deixadas pelas PRs #79, #81 e #84

## Pedido original

Sessão de 21–22/10/2026 (Claude Code, VS Code). Depois das PRs #79, #81 e #84, o usuário perguntou
"o que falta impl,ementar>" e recebeu a lista de 8 itens abaixo. Resposta literal: **"faça todos"**.

A lista apresentada (resumo fiel):
1. "Desligar" a zona não dura — com uma zona só no empreendimento, reabrir a planta reaplica.
2. O banco não garante "um empreendimento por planta" (`blueprint_study_id` sem UNIQUE).
3. Área da escritura (Quadro de divisas) não conversa com a Área total da ficha.
4. Tipo de terreno (Regular/Irregular) — dá para deduzir do desenho.
5. Sincronização/Curadoria para os campos do terreno do empreendimento.
6. "Buscar por cidade" na zona poderia vir com a cidade da ficha.
7. "Onde fica" (lat/long) — a ficha não guarda coordenadas.
8. Ver na tela a linha "Planta: …" do Terreno do empreendimento com lote real (pedia autorização
   para vincular temporariamente uma planta com lote a um empreendimento real).

## Decisões tomadas ao executar

- **7 não é feito**: a ficha não tem coordenadas; geocodificar o endereço (ou usar o centro da
  cidade em `master_cities`) daria um ponto aproximado que viraria a ORIGEM do desenho e das
  curvas de nível. "Desenhar no mapa" já procura o endereço sozinho (PR #81). Registrado, não feito.
- **8**: o "faça todos" vale como a autorização pedida. Planta descartável com lote vinculada
  TEMPORARIAMENTE ao 004 - Alcino Salomon (ficha vazia, sem planta); só a tela do empreendimento é
  aberta (o editor da planta NÃO, para o preenchimento automático não gravar na ficha); vínculo
  desfeito e planta arquivada no fim, conferido no banco.
- **5**: card próprio "Terreno" na aba Sincronização (o card "Loteamento" some em estudo de massa).
  Mesmo motor: vazio na ficha → preenche direto; divergente → proposta na Curadoria. Fonte = versão
  PUBLICADA, como toda a sincronização. Origem `blueprint`, entidade `empreendimento`.
- **3**: a escritura da Planta nasce da ficha (é o número da matrícula); só preenche o VAZIO, uma vez
  por abertura, num comando só (Ctrl+Z desfaz), e só com planta VINCULADA. Medida por lado só quando
  há exatamente um lado com aquele papel.
- **4**: Regular = 4 lados e os 4 ângulos a 90° (± 0,5°); senão Irregular. Os mesmos rótulos do
  select da ficha. Entra na comparação dos dois lados e no "Levar à ficha".

## Itens

1. **Desligar persiste** — migration `aplicar_20271022100000_planta_empreendimento_pendencias.sql`
   cria `blueprint_study_urban_context.zona_desligada_em`; desligar grava a linha ZERADA com a data
   (em vez de apagar); aplicar zona limpa a data. *Pronto quando:* teste do hook — desligar e
   reabrir não reaplica a zona única.
2. **Um empreendimento por planta no banco** — mesma migration: índice UNIQUE parcial em
   `empreendimentos(blueprint_study_id) WHERE NOT NULL`. *Pronto quando:* índice no banco e
   `vincularEmpreendimento` traduz a violação em mensagem legível (teste).
3. **Escritura ← ficha** — editor. *Pronto quando:* teste de função pura do que entra na escritura.
4. **Tipo de terreno** — `utils/blueprintTerrenoDaFicha.ts`. *Pronto quando:* testes da função e da
   comparação.
5. **Sincronização do terreno** — registry/planner/applier/proposal/Curadoria + card. *Pronto
   quando:* teste do plano (fill × conflito × igual) e da aprovação para entidade `empreendimento`.
6. **Cidade da ficha na zona** — *Pronto quando:* teste do hook: catálogo sem cidade recebe a cidade
   única que casa nome + UF; ambígua não chuta.
7. **Não feito** (motivo acima).
8. **Conferência na tela** — roteiro Playwright; banco conferido antes/depois.

## Andamento

- 22/10 — migration aplicada no banco (`db query -f`) e conferida: coluna `zona_desligada_em` e índice
  `empreendimentos_blueprint_study_unico` existem; havia 1 vínculo, sem repetição.
- Item 1 feito: `desligar` grava a linha ZERADA com `zona_desligada_em` (não apaga); aplicar limpa.
  Teste no `blueprintZonaAutopreencher` (desligar + reabrir = zona não volta).
- Item 2 feito: índice único; `empreendimentoService.update` e `vincularEmpreendimento` traduzem o 23505;
  o `EmpreendimentoForm` desliga, com "— vinculada a «X»", a planta já ligada a outro empreendimento
  (sem isso a trava nova viraria erro cru ao salvar). Teste da recusa em `blueprintVinculoEmpreendimento`.
- Item 3 feito: `comandosDaEscrituraPelaFicha` (puro, 3 testes) e, no editor, no MESMO efeito de abertura,
  ANTES do preenchimento ficha←desenho (senão a escritura copiaria o desenho); `runBatch` = um Ctrl+Z.
  Aviso junto do bloco da ficha. Não visto na tela (precisaria abrir a planta Garden, que gravaria no
  rascunho real dela) — coberto pelo teste da regra.
- Item 4 feito: `tipoDoTerreno` (esquadro ± 0,5°) em `MedidasDaPlanta.tipo`; comparação, "Levar à ficha",
  linha do TowerEditor e confirmação tratam texto. Testes atualizados.
- Item 5 feito: `empreendimentoFields` no lado canônico; specs `TERRENO_DO_EMPREENDIMENTO` (origem
  blueprint); planner/applier/proposal para a entidade `empreendimento`; `services/terrenoEmpreendimentoSync.ts`
  (versão publicada, destino sem torres para não acusar órfãos); card "Terreno → Empreendimento" na
  Sincronização; Curadoria agrupa em "Terreno" e mostra a origem "Planta Inteligente". Testes:
  `syncTerrenoEmpreendimento` (3), `curadoriaTerrenoEmpreendimento` (2), `SyncCenterTabArquitetura` (+2).
- Item 6 feito: `dadosDoEmpreendimentoParaPlanta().cidade` (cidade e UF do MESMO endereço); o hook busca em
  `master_cities` e só preenche com UMA cidade casando nome (sem acento/caixa) e UF; aviso no painel.
  Testes no hook (2) e na função (1).
- Item 7 não feito (motivo no topo).
- Verificação: 143 testes dos arquivos afetados verdes em dois grupos; `check-ui-standard.sh` limpo em 6 .tsx.
- Item 8 feito (22/10, `c:/tmp/pwtest/conferencia-pendencias-planta.cjs`, dev server da frente, usuário de
  leitura): planta descartável 12 × 30 publicada e vinculada ao 004 - Alcino Salomon. Torres & Unidades ›
  Terreno: "Planta vinculada: ZZ TESTE Pendências", vazios no FORM com 360 / 12 / 12 / 30 e tipo "Regular
  (Retangular)", "Da Planta — confira e salve", Salvar ligado e NÃO clicado. Sincronização: card "Terreno →
  Empreendimento" com 7 campos a preencher, 0 para a Curadoria, "Trazer o terreno" ligado e NÃO clicado.
  Editor da planta não aberto (gravaria na ficha). Zero erro. Banco depois: ficha do Alcino toda NULL, sem
  vínculo, `last_synced_at` NULL, 0 propostas; planta ARQUIVADO. Único rastro: `updated_at` do Alcino
  (gatilho do vínculo/desvínculo). Um portão do roteiro acusou "FALHA" por contar as gravações do PRÓPRIO
  vínculo de teste (só `blueprint_study_id`) — defeito do portão, não da tela.
