# Planta Inteligente × Empreendimento — as três etapas que ficaram de fora do #175

## Pedido original

> foi tudo implementado ou ainda tem alguma etapa para implementar?

(resposta: três itens ficaram fora do escopo de propósito: Gerar massa limitado pelas torres e pavimentos do
Empreendimento; uma casa por lote do loteamento; orientação e coordenadas do lote na ficha.)

> Ficou de fora de propósito, e pode virar próxima etapa se você quiser: implementar os 3

Sessão: 31b737ae-236b-4eef-9b15-3842d0f3affa · 26/10/2026. Antecessor:
`docs/planos/2026-10-25-planta-construir-pelo-empreendimento.md` (PR #175).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 26/10/2026 | Casas do loteamento: onde fica cada casa? | **Uma planta por lote** (a planta do loteamento não muda; cada casa abre e edita como hoje) |
| 26/10/2026 | Casas do loteamento: qual programa? | **Um programa para todos** (o da tela). Dormitórios, suítes, banheiros e vagas cadastrados na unidade do lote valem para ela. A área da unidade é ignorada, porque no loteamento ela é a área do LOTE. |

Decisões minhas (sem pergunta, reversíveis):

- **Etapa 1:** torres com pavimentos diferentes usam o maior como teto e o menor como piso, com aviso.
- **Etapa 3:** a frente é informada como azimute em graus (0 = norte, 90 = leste), com rótulo do ponto cardeal ao lado.

## Etapa 3 — orientação e coordenadas na ficha (PR próprio, 1º)

1. **Migration** `aplicar_2027102620xxxx_empreendimento_terreno_orientacao.sql`: `ADD COLUMN IF NOT EXISTS`
   `terreno_frente_azimute numeric`, `terreno_latitude numeric` e `terreno_longitude numeric`, sem FK, sem
   default e sem view (o DDL do módulo já deadlockou com FK e view).
   - **Pronto quando:** está aplicada no banco (`db query`), e uma consulta a `information_schema` lista as três colunas.
2. **`types/empreendimento.ts` + `services/empreendimentoService.ts` (EMPREENDIMENTO_COLS)** com as três colunas.
   - **Pronto quando:** o typecheck passa, e `getById` devolve os campos.
3. **`components/empreendimento/TowerEditor.tsx` (Torres & Unidades › Terreno)**:
   - três campos novos: "Frente voltada para (°)" com o ponto cardeal, e latitude e longitude;
   - validação: azimute 0–360, latitude −90–90, longitude −180–180;
   - o "Duplicar" do `EmpreendimentoForm` copia os três.
   - **Pronto quando:** o teste de componente grava os três campos.
4. **`utils/blueprintDadosDoEmpreendimento.ts`**: devolve `frenteVoltadaPara` (azimute) e `coordenadas`.
   - **Pronto quando:** os testes de `blueprintDadosDoEmpreendimento` cobrem os campos.
5. **`utils/blueprintCasaPeloEmpreendimento.ts` + `PainelLoteDigitado`**:
   - o lote da ficha sai virado para o azimute;
   - o painel abre com "Frente voltada para" preenchido;
   - o passo LOTE deixa de pedir a conferência quando há azimute;
   - com coordenadas, o "Construir" grava `SetGeorreferencia` só quando o desenho ainda não tem georreferência
     (nunca sobrescreve).
   - **Pronto quando:** um teste mostra que a frente do lote lançado aponta para o azimute, e outro que a
     georreferência é gravada só se estiver vazia.

## Etapa 1 — Gerar massa seguindo o Empreendimento (PR próprio, 2º)

6. **`utils/blueprintGeradorDeMassa.ts`**: `RestricoesDaMassa.doEmpreendimento?: { torres: number; pavimentosMin: number | null; pavimentosMax: number | null } | null`.
   - O número de torres filtra as implantações:
     - 1 torre: TORRE, LÂMINA, L, U, H e EMBASAMENTO+TORRE;
     - 2 torres: DUAS_TORRES e BLOCOS_PARALELOS com 2 blocos;
     - 3 ou mais: BLOCOS_PARALELOS com exatamente N blocos.
   - BLOCOS_PARALELOS passa a usar `k = N` quando cabe (senão a implantação é descartada, com o motivo).
   - Os pavimentos ficam fixos no intervalo [mín, máx] da grade, e o recozimento também não sai dele.
   - O motivo de descarte novo é "fora das torres/pavimentos do Empreendimento".
   - **Pronto quando:** os testes em `blueprintGeradorDeMassa.test.ts` mostram 1 torre × 10 pav (só implantações de
     1 bloco, todas com 10 pav), 3 torres (blocos paralelos com 3) e pavimentos diferentes (entre o mín e o máx).
7. **`utils/blueprintMassaDoEmpreendimento.ts`** (novo, puro): torres do Empreendimento → `{ torres, pavimentosMin, pavimentosMax, avisos }`.
   Ficam fora as torres de quadra (loteamento) e as da própria massa (`blueprint_bloco_uid`).
   - **Pronto quando:** tem testes.
8. **`TelaGeradorDeMassa.tsx` + editor**:
   - caixa "Seguir o Empreendimento «X»: N torres × P pavimentos" (ligada por padrão quando o Empreendimento tem
     torres próprias), com o motivo quando está desligada;
   - a conversa da massa continua mexendo só no que já mexia.
   - **Pronto quando:** o teste de componente e a conferência no app passam.

## Etapa 2 — Casas do loteamento: uma planta por lote (PR próprio, 3º)

9. **`utils/blueprintCasasDoLoteamento.ts`** (novo, puro):
   - **Lote do modelo → `LoteFechado`:**
     - o anel é `lote.pontos`, transladado para perto da origem (o limite de ±1 km do kernel);
     - os papéis vêm de `medirLote(...).lados`, com `FUNDO` traduzido para `FUNDOS`;
     - o lote de esquina fica com uma FRENTE só: a mais longa entre as frentes.
   - **Lotes elegíveis:** só os de tipo LOTE; ficam fora os encravados e os remanescentes, com o motivo.
   - **Programa por lote:** é o curto da tela, sobrescrito por dormitórios, suítes, banheiros e vagas da unidade
     ligada (`blueprint_lote_uid`). A área da unidade é ignorada.
   - **Pronto quando:** os testes mostram o lote retangular e o de esquina, com a FRENTE certa e
     `motivoParaNaoGerar` nulo depois de lançado, e o programa por unidade.
10. **`services/blueprintCasasDoLoteamentoService.ts`**, para cada lote escolhido:
    - `createStudy` com o nome "«loteamento» · Quadra X · Lote N — Casa";
    - modelo: térreo + divisas do lote, com a georreferência do loteamento transladada quando houver;
    - copia o contexto urbano (zona) do estudo do loteamento;
    - grava as premissas da casa (programa do lote) e o rascunho com a casa lançada.
    - Se falhar no meio, arquiva o estudo daquele lote e segue para os outros, dizendo quais falharam.
    - A casa é gerada no worker, uma por vez.
    - **Pronto quando:** o teste com os serviços simulados mostra a ordem das gravações e o arquivamento na falha.
11. **Tela "Casas dos lotes"** (no loteamento):
    - a lista dos lotes com a quadra, o número, a área, a unidade ligada e a situação (pronta, falhou com o motivo,
      ou já tem planta);
    - o programa comum, igual ao da Casa;
    - o botão "Gerar casas" (escolhidos ou todos), com o progresso lote a lote e o link para abrir cada planta.
    - Lote que já tem planta (achado pelo nome ou pelo vínculo guardado) não é gerado de novo sem pedir.
    - **Pronto quando:** o teste de componente passa e a conferência no app gera 2 lotes, abre a planta de um, e
      depois apaga tudo.

## Mudança de rumo (26/10/2026)

As etapas 3 e 1 foram juntas num PR só, em vez de dois, para economizar um ciclo de CI de cerca de 17 min. A etapa 2
continua num PR próprio.

## Estado

- [x] 1 — migration `aplicar_20271026200000_empreendimento_terreno_orientacao.sql` APLICADA em 26/10, com as 3 colunas
  conferidas em `information_schema`, ANTES do código que as lê.
- [x] 2 — tipos e `EMPREENDIMENTO_COLS`; também o Duplicar do `EmpreendimentoForm` e os rótulos do Histórico.
- [x] 3 — Torres & Unidades › Terreno: os 3 campos com faixa e o ponto cardeal (`TowerEditorTerrenoLocalizacao.test.tsx`, 4 testes).
- [x] 4 — `dadosDoEmpreendimentoParaPlanta`: `lote.frenteVoltadaPara` e `coordenadas`.
- [x] 5 — o lote sai virado para o azimute (teste com 0/90/180/225°); o passo novo **Local** grava a
  georreferência só quando o desenho não tem; o lote digitado abre com "Frente voltada para" preenchido.
- [x] 6 — `RestricoesDaMassa.doEmpreendimento` + `implantacoesComTorres`; BLOCOS_PARALELOS com exatamente N; faixa de
  pavimentos na grade e no recozimento (5 testes novos no gerador).
- [x] 7 — `utils/blueprintMassaDoEmpreendimento.ts` + 5 testes.
- [x] 8 — caixa "Seguir o Empreendimento" (`TelaGeradorDeMassaEmpreendimento.test.tsx`, 3 testes).
- [ ] 9 · [ ] 10 · [ ] 11 (Etapa 2)

### Conferência no app real (26/10/2026, dev server da frente, descartáveis apagados)

- **Casa** (`c:/tmp/pwtest/conferencia-pelo-emp.cjs`, ficha com azimute 90 e coordenadas): os 16 portões passaram.
  O passo do lote diz "Frente voltada para o Leste (90°)"; o passo Local mostra "o botão faz" e, depois, "feito"
  (desenho georreferenciado). Sem erro de página e com a limpeza conferida no banco.
- **Massa** (`c:/tmp/pwtest/conferencia-massa-emp.cjs`, 2 torres de 6 pavimentos, lote 40 × 60): os 8 portões passaram.
  A caixa mostra "2 torres × 6 pavimentos", ligada. Saíram só "Duas torres · 6 pav" e "Blocos paralelos · 6 pav".
  A decisão diz que seguiu o Empreendimento, e a limpeza foi conferida no banco.

## Verificação

Por etapa:

1. Testes novos e tocados.
2. `tsc` sem erros.
3. `check-ui-standard.sh` nas telas tocadas.
4. Conferência no app real, com Empreendimento e planta descartáveis apagados no fim (autorização de 25/10:
   "Sim, crie e apague").
5. PR de rascunho → CI verde → merge → `conferir-producao.sh` + CI de `main`.
