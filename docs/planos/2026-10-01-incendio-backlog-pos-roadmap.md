# Incêndio — backlog pós-roadmap e o defeito de borda das propostas automáticas

## Pedido original

> faça um plano para corrigir os backlogs e o defeito antigo que o gerador revelou: a proposta automática de iluminação de emergência (E7.3) punha a luminária exatamente no limite do alcance. Com o arredondamento, ela caía meio milímetro fora. A análise continuava acusando falta, e cada nova proposta empilhava outra luminária no mesmo ponto. Isso afetava o botão de iluminação que já existia; agora ela fica 10 cm para dentro, e o teste confere que não há luminária duplicada.

Sessão `c6b98893-3359-47d8-854f-f618a31c7b1e` · 01/10/2026, logo depois da E10 (e8f37182).

**Respostas às decisões em aberto (01/10/2026, mesma sessão), literais:**

> 1. relatorio pede
> 2. lança a bomba
> 3. os dois
> 4. envio depois. salve.
> 5. MG. salve para atualizar os demais estados posteriormente
> 6. agente-leitura@alpaconstrutora.com.br; Senha = [omitida — não se registra senha]
> 7. entra
>
> Posso publicar o plano e começar pela fase A? sim

"Os backlogs" é a lista do relatório final do roadmap
(`2026-09-29-incendio-benchmark-altoqi-e-roadmap.md`, seção da E10):
- motor de bomba e de reserva técnica;
- recalque e pressostato junto da bomba;
- presets dos outros estados;
- o texto das ITs do CBMMG, que tira os "CONFERIR";
- especificações das peças na importação de IFC.

## O que foi levantado antes de planejar (01/10/2026)

1. **O defeito da iluminação já está corrigido para propostas novas.** Foi na E10 (e8f37182): a
   luminária fica `FOLGA_DO_RAIO_MM = 100` para dentro do raio.
   - Faltava saber se algum desenho JÁ tinha luminárias empilhadas. Consulta de leitura no banco:
     **nenhum** dos 62 rascunhos (`blueprint_branches.draft_payload`) nem das 8 versões publicadas
     (`blueprint_snapshots.payload`) tem conteúdo de incêndio.
   - **Não há dado a limpar.**
2. **O defeito é de CLASSE, não da iluminação.** A auditoria dos outros motores de proposta foi
   lida em `origin/main`, e os achados de 2.1–2.3 foram conferidos no código.
   - **Raiz comum:** o kernel arredonda a posição ao milímetro no `AddTerminal`
     (`commands.ts:3498`). Toda checagem de cobertura feita no ponto NÃO arredondado pode errar em
     até ~0,7 mm.
   - **2.1 — Extintores (em risco):**
     - O candidato do CENTRO do ambiente não é arredondado antes da cobertura, e pode cair a ~0,7 mm
       fora do limite, exatamente como a luminária.
     - O extintor SEM agente vale para todas as classes na proposta (`blueprintExtintores.ts:384`)
       e só para a classe A na análise (`:297`). Uma cozinha ao lado dele segue reprovada, e a
       proposta nunca lança outro.
     - A proposta usa sempre a capacidade padrão `2-A:20-B:C`, que a própria análise reprova no
       risco médio (3-A). O teste `blueprintExtintores.test.ts:124` AFIRMA essa reprovação.
   - **2.2 — Detecção e alarme (em risco de empilhar):**
     - A malha de detectores entra INTEIRA em todo ambiente reprovado, sem descontar os detectores
       que já estão lá (`blueprintDeteccaoAlarme.ts:168-171`).
     - Os acionadores não descontam os existentes.
     - Ambiente em L, ou com ponto inalcançável, segue reprovado. Cada nova proposta lança a mesma
       malha nas mesmas coordenadas.
     - A malha não tem folga: o lado da célula é `raio·√2`.
   - **2.3 — Sprinklers no editor:** o "Lançar" da gaveta não pula o ambiente que já tem sprinkler
     (o gerador pula). Dois cliques dão a mesma malha duas vezes.
   - **2.4 — Pontos de louça e elétricos por componente** (fora do incêndio, caso de borda): a
     checagem de "já lançado" é pelo CENTRO da peça (600 mm), mas o ponto vai na FACE da parede.
     Num chuveiro grande, o ponto é duplicado.
   - **Seguros pela auditoria:** sinalização, hidrantes por cobertura, iluminação (depois da
     correção) e a malha de luminárias de teto.
   - **Nenhum teste roda a proposta duas vezes e espera lote vazio.** É o buraco por onde o defeito
     passou.
3. **Bomba:** o catálogo de tipos da organização tem 4 tipos de terminal e **nenhuma bomba de
   incêndio** (nenhuma com curva). Um motor que só "escolhe do catálogo" não teria o que escolher.
4. **ITs do CBMMG:** os PDFs não estão em `c:\D\ORÇACLOUD`. Os únicos PDFs lá são `ALLAN.pdf`,
   `nbr_5410_Extracted.pdf` e um projeto de regularização.
5. **IFC:** o importador não lê Pset nenhum. O visualizador já lê
   (`ifcViewerService.lerElemento`, `IFCRELDEFINESBYPROPERTIES`), e dá para reaproveitar.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 01/10/2026 | D-1 Casa de bombas sem lugar no desenho | **O relatório pede.** O gerador não posiciona a casa de bombas; diz que falta o lugar. |
| 01/10/2026 | D-2 Sem bomba no catálogo | **Lança a bomba** "de projeto", com o ponto Q × H e sem curva. O relatório diz "curva a escolher". |
| 01/10/2026 | D-3 Arranjo da reserva técnica | **Os dois**: reservatório próprio OU parcela da caixa de água fria, por gravidade OU com bomba. É premissa do estudo, e cada arranjo é suportado e testado. |
| 01/10/2026 | D-4 PDFs do CBMMG | **Envio depois.** D1 fica bloqueada até eles chegarem (registrado aqui e na memória). |
| 01/10/2026 | D-5 Estados | **Só MG agora.** Os demais estados ficam para depois (registrado; D2 fora do escopo atual). |
| 01/10/2026 | D-6 Credencial de teste | `agente-leitura@alpaconstrutora.com.br` (perfil Membro). A senha **não** é registrada (decisão de 05/08: pedir a cada sessão). ⚠️ Pela mesma decisão, esse usuário é **só de leitura**, e o teste de E1 GRAVA (cria estudo, aplica num orçamento de obra, apaga). **Confirmar com o usuário antes de rodar E1**, e qual obra de prova usar. |
| 01/10/2026 | D-7 Backlog anterior | **Entra** — vira a Fase F. |
| 01/10/2026 | Publicar o plano e começar a Fase A | **Sim.** |

## Plano

Ordem: **A** (correção, sem dependência) → **C** (independente) → **B** (decisões tomadas) →
**F** (backlog anterior) → **D1** (quando os PDFs chegarem) → **E** (depois de confirmar a escrita). Uma fase por push, ritual completo,
com o "pronto quando" provado em teste.

### Fase A — "A proposta zera a própria análise" (o defeito, como classe)

- **A1 · A lei, em teste, para todo motor de proposta**
  - **O que muda:** um arquivo de teste (`__tests__/propostasIdempotentes.test.ts`) roda, para
    extintores, hidrantes, sinalização, iluminação, detecção/alarme, sprinklers e o gerador de PPCI:
    1. propor → aplicar → analisar ⇒ **zero falta**, ou cada falta restante dita com motivo
       ("sem solução");
    2. **propor de novo ⇒ lote vazio**;
    3. **nenhum par de peças do mesmo tipo no mesmo ponto**.
  - Cenários: o retângulo; o ambiente em **L**; o ambiente sem porta (inalcançável); e coordenadas
    com **meio milímetro** (centro em x.5), que é o caso do arredondamento.
  - **Pronto quando:** o teste existe, falha HOJE nos casos 2.1–2.3 (provado antes de corrigir) e
    passa depois de A2–A4.
- **A2 · Extintores**
  - **O que muda:**
    - candidato arredondado antes de medir a cobertura, com a mesma folga de 10 cm da iluminação;
    - a MESMA regra para o extintor sem agente nos dois lados (vale A, a regra da análise);
    - o filtro de disciplina igual nos dois lados;
    - a capacidade da proposta passa a ser a **mínima do risco** que a análise exige (a tabela já
      está na análise, marcada CONFERIR), e não um padrão fixo.
  - **Pronto quando:** A1 passa para extintores nos 3 riscos. O teste de `:124` muda para "a
    proposta atende a capacidade do risco", e o gerador num prédio de risco médio não traz
    "Capacidade extintora" na lista de faltas.
- **A3 · Detecção e alarme**
  - **O que muda:**
    - a malha de detectores só preenche as células DESCOBERTAS, descontando os existentes;
    - os acionadores descontam os existentes;
    - malha com folga (`(raio − 10 cm)·√2`);
    - a célula do L sem ponto interno que a cubra vira "sem solução" dita, não um lote que se
      repete.
  - **Pronto quando:** A1 passa para alarme, inclusive no L e no ambiente sem porta.
- **A4 · Sprinklers no editor**
  - **O que muda:** o "Lançar" da gaveta pula o ambiente que já tem sprinkler (a regra do gerador,
    extraída para uma função só) e diz isso na tela.
  - **Pronto quando:** teste de componente: dois cliques não duplicam (2ª vez, botão desligado com o
    motivo ou lote vazio).
- **A5 · Pontos de louça e elétricos por componente** (o caso de fora do incêndio)
  - **O que muda:** "já lançado" passa a ser medido na POSIÇÃO DO PONTO (a face da parede), não no
    centro da peça.
  - **Pronto quando:** teste com chuveiro de 1,20 m afastado da parede: rodar duas vezes dá o mesmo
    número de pontos.
- **A6 · A marca que deixa o empilhamento VISÍVEL**
  - **O que muda:** o diagnóstico do lançamento (`marcasDoLancamentoDeIncendio`) ganha "peça
    duplicada": mesmo tipo, mesmo pavimento, a menos de 1 cm. Qualquer defeito futuro da mesma
    classe aparece no desenho, em vez de sumir na contagem.
  - **Pronto quando:** teste com duas luminárias no mesmo ponto dá a marca; uma só, não.
- **A7 · Iluminação (o defeito do pedido)**
  - **Estado:** ✅ corrigido em e8f37182 (folga de 10 cm, teste sem duplicada); sem dado em
    produção para limpar (levantamento 1).
  - **Pronto quando:** coberto também pela lei de A1 (a 2ª proposta dá lote vazio).

### Fase B — Casa de bombas e reserva técnica (o que o gerador hoje "não decide")

- **B1 · Bomba principal, jockey e pressostatos**
  - **O que muda:** `proporCasaDeBombas` lança, no lugar que o DESENHO disser (ambiente chamado
    "casa de bombas" ou bomba já lançada). Sem lugar, **não posiciona**: o relatório pede (D-1).
    Lança:
    - a bomba principal com o **ponto de projeto** (Q × H do cálculo);
    - a jockey;
    - um pressostato por bomba no barrilete;
    - o trecho que liga a casa de bombas à rede.
  - Com bomba no catálogo da organização, escolhe pela curva (`bombasQueAtendem`, a de menor folga
    positiva). Sem catálogo, **a bomba entra assim mesmo**, sem curva, com o ponto de projeto, e o
    relatório diz "curva a escolher" (D-2).
  - Conferir também se a tela de tipos já cadastra a curva (`curvaBomba`) e, se não, acrescentar.
  - **Pronto quando:** no prédio de 8 pavimentos do teste da E10, "Bomba jockey ligada",
    "Pressostatos" e (com catálogo) "Bomba atende o ponto de projeto" saem da lista de faltas.
- **B2 · Registro de recalque**
  - **O que muda:** o recalque vai no passeio, na divisa de FRENTE mais próxima da coluna (sem
    divisa marcada, no pavimento de descarga junto à porta da rua), ligado à rede.
  - **Pronto quando:** "Registro de recalque ligado à rede" sai da lista de faltas.
- **B3 · Reserva técnica**
  - **O que muda:** o volume exigido (vazão × autonomia do cálculo), arredondado para o módulo
    comercial acima, nos **dois arranjos** (D-3), escolhidos por premissa do estudo:
    - reservatório próprio de incêndio, ou a parcela `volumeRtiL` da caixa de água fria;
    - por gravidade (a caixa elevada como fonte) ou com bomba.
  - **Pronto quando:** "Reserva técnica de incêndio" sai da lista de faltas nos quatro arranjos
    (próprio/parcela × gravidade/bomba), um teste cada.
- **B4 · O gerador chama B1–B3**
  - **O que muda:** as pendências "O gerador não decide" de bomba e reserva saem do relatório e dão
    lugar às decisões que ainda forem do projeto (por exemplo, "curva a escolher").
  - **Pronto quando:** no teste de 8 pavimentos, a lista de faltas fica só com o que o modelo de
    prova não tem (o percurso, sem escada). O teste confere a lista exata.

### Fase C — Especificações na importação de IFC

- **C1 · Ler o `Pset_OpuraIncendio`**
  - **O que muda:** a leitura de Pset do visualizador vira função compartilhada. O importador de
    incêndio traz o `_Declarado` (fator K, posição, agente, carga, capacidade, código da placa,
    autonomia). O `_Derivado` e o `_Calculada` são ignorados de propósito: são refeitos pelo desenho.
  - **Pronto quando:** a ida e volta pelo web-ifc preserva as especificações, e o `porTerminal` do
    quantitativo (com a `especificacao` da quant-1.24.0) é IGUAL antes e depois.

### Fase D — Norma: ITs do CBMMG e os outros estados

- **D1 · O texto do CBMMG**
  - **O que muda:** transcrever, do texto vigente que o usuário fornecer (D-4):
    - a tabela de exigências do Decreto/ITs por ocupação × altura × área;
    - os valores de hidrantes, saídas, extintores, sinalização, iluminação e chuveiros.
  - Cada linha conferida sai de `rascunho: true` e perde o "CONFERIR NA IT", com a fonte (IT, item,
    tabela).
  - **Pronto quando:** um teste por tabela transcrita confere linhas contra o texto. O gerador não
    traz CONFERIR das linhas conferidas, e o "SEM_TABELA" só sobra no que o texto não cobre.
- **D2 · Presets SP, BA, PR, MT, RJ** — ⏸ **adiado** por decisão do usuário (D-5: "MG. salve para
  atualizar os demais estados posteriormente").
  - **O que muda:** a estrutura existe desde a E0.3; cada estado é um preset preenchido do
    regulamento DELE, um por frente.
  - **Pronto quando:** por estado, as mesmas provas de D1.
  - **Bloqueado** até o usuário dizer quais estados e fornecer os textos (D-5).

### Fase E — O que ficou sem exercício real

- **E1 · Composição por peça num orçamento de obra real** (E9.2)
  - **O que muda:** rodar `__tests__/blueprintE0.integration.test.ts` (estendido com a composição)
    contra o Supabase real: estudo de prova → publicar → prévia → aplicar → conferir as 7 linhas do
    hidrante → apagar o estudo.
  - **Pronto quando:** o teste roda verde com credencial (`BLUEPRINT_E2E`) e o estudo de prova
    não fica no banco.
  - **Bloqueado** até haver credencial de teste (D-6).

### Fase F — O backlog anterior (nomeado nas etapas E1–E7; entrou por D-7)

- **F1 · Kit VGA + manômetros**
  - **O que muda:** a VGA inserida ou proposta traz os dois manômetros (montante e jusante) e o
    dreno, no lote dela, como o kit hidrante + placa.
  - **Pronto quando:** inserir a VGA cria as peças do kit num lote só (um Ctrl+Z), e o detalhe
    típico da E8.3 as conta.
- **F2 · Kits de inserção por organização** (migration — mostrar o SQL antes de aplicar)
  - **O que muda:** tabela da organização no molde de `blueprint_element_types`: um kit é uma peça
    e N peças com deslocamento. A paleta mostra os kits da organização.
  - **Pronto quando:** RLS provada como na E9.2 (membro grava e lê, outra organização é recusada,
    sem login não se vê nada); um kit cadastrado é inserido num lote só.
- **F3 · Eletroduto do laço de alarme pela elétrica**
  - **O que muda:** o laço (`centralAlarmeId`) ganha caminho físico: eletroduto da disciplina
    elétrica ligando central → dispositivos, pelo traçado automático da elétrica.
  - **Pronto quando:** o quantitativo conta o eletroduto do laço, e o 3D/corte o mostram.
- **F4 · Detector de chama**
  - **O que muda:** tipo novo (`DETECTOR_CHAMA`, bump do kernel com o ritual dos goldens), com
    ficha, símbolo, IFC `IfcSensor .FLAMESENSOR.` e cobertura por cone (CONFERIR NA NBR 17240).
  - **Pronto quando:** goldens 7/7 na versão nova; ida e volta IFC; a análise de detecção o
    reconhece.
- **F5 · Antipânico**
  - **O que muda:** `Opening` ganha "barra antipânico". A análise de saídas exige-a nas portas da
    rota pela ocupação/população (valor CONFERIR NA IT até D1), e a proposta a marca.
  - **Pronto quando:** a porta da rota sem barra vira falta na conferência e a proposta a resolve
    (a lei de A1).
- **F6 · Luminária de emergência em circuito elétrico**
  - **O que muda:** a luminária de emergência entra no circuito de iluminação (tomada da bateria) e
    o quadro de cargas a conta.
  - **Pronto quando:** os circuitos automáticos a incluem, e o quadro de cargas e o unifilar a
    mostram.

## Decisões em aberto

Todas respondidas em 01/10/2026 (tabela acima). Restam bloqueios externos:
- **D1:** aguarda os PDFs do CBMMG.
- **D2:** adiada por decisão do usuário.
- **E1:** aguarda confirmar a escrita com o usuário de leitura e a obra de prova.

## Estado

- [x] A7 — iluminação: folga de 10 cm e teste sem duplicada (e8f37182); dado em produção
  verificado: nada a limpar
- [ ] A1 · A2 · A3 · A4 · A5 · A6
- [ ] B1 · B2 · B3 · B4 (dependem de D-1, D-2, D-3)
- [ ] C1
- [ ] D1 (⏸ aguarda os PDFs do CBMMG) · D2 (⏸ adiada — só MG agora)
- [ ] E1 (⏸ confirmar a escrita com o usuário de leitura antes de rodar)
- [ ] F1 · F2 · F3 · F4 · F5 · F6

## Verificação

- Fase A: o arquivo da lei (A1) roda verde com os cenários de borda, e a suíte inteira fecha.
- Fase B: o teste de 8 pavimentos da E10 com a lista exata de faltas reduzida ao que o modelo não
  tem.
- Fase C: ida e volta pelo web-ifc com especificações e quantitativo iguais.
- Fase D: linhas transcritas conferidas uma a uma; zero "CONFERIR" nas linhas conferidas.
- Fase E: teste de integração verde e banco limpo depois.
