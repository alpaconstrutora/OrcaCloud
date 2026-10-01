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
| 01/10/2026 | D-4 PDFs do CBMMG | **Envio depois.** D1 fica bloqueada até eles chegarem (registrado aqui e na memória). **Chegaram no mesmo dia:** as 45 ITs, em `C:\D\ORÇACLOUD\Instruções Técnicas`. |
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
- **D1:** desbloqueada (PDFs entregues em 01/10); em execução por partes (D1.1 → D1.2 …).
- **D2:** adiada por decisão do usuário.
- **E1:** aguarda confirmar a escrita com o usuário de leitura e a obra de prova.

## Estado

- [x] A7 — iluminação: folga de 10 cm e teste sem duplicada (e8f37182); dado em produção
  verificado: nada a limpar
- [x] **Fase A — 7 de 7** (01/10/2026, frente `incendio-fase-a`):
  - [x] A1 — `__tests__/propostasIdempotentes.test.ts`: 5 motores × 4 cenários (retângulo, meio
    mm, L, L estreito) + 2 sem solução (sem porta, salão de 70 m com uma porta) + os casos
    pontuais.
    - **Antes de corrigir, 7 falhas**, que eram os riscos da auditoria:
      - a capacidade reprovada nos 4 cenários;
      - o extintor sem agente;
      - a detecção no L estreito;
      - o acionador relançado no salão de 70 m.
  - [x] A2 — extintores:
    - o centro arredondado antes de medir;
    - o existente só desconta a unidade se combate TODAS as classes do ambiente (sem agente = A,
      como na análise; só os da disciplina de incêndio);
    - candidatos também nos pontos descobertos (30 cm para dentro), porque o braço do L ficava sem
      posição;
    - `capacidadeDoRisco`: a capacidade lançada sobe para a mínima do risco (médio: `3-A:40-B:C`,
      sem carga declarada). O teste antigo que AFIRMAVA a reprovação passou a afirmar o atendimento.
  - [x] A3 — alarme:
    - detectores cobrem os MESMOS pontos da análise, descontando os existentes (guloso sobre
      posições arredondadas: a malha e os pontos descobertos);
    - acionadores descontam o que os existentes alcançam;
    - o que nenhuma posição cobre fica dito, não relançado.
  - [x] A4 — `distribuirSprinklers` recusa o ambiente que já tem sprinkler ("apague-os para
    redistribuir"). A gaveta mostra o motivo e desliga o botão; vale também para o gerador.
  - [x] A5 — pontos de louça e o elétrico do componente: "já lançado" também na posição de nascer
    (a face, 50 mm). Reproduzido antes (box de 1,20 m, evaporadora afastada) e corrigido.
  - [x] A6 — marca `INCENDIO_DUPLICADA` (mesmo tipo, mesmo pavimento, < 1 cm), em toda peça de
    incêndio.
  - Suíte com 6.826 testes: 6.793 + 33 pulados (a 1ª rodada caiu no worker). Build ok (a 1ª
    tentativa foi a queda do Node 24; a 2ª passou).
- [x] **Fase B — 4 de 4** (01/10/2026, frente `incendio-fase-b`, sem migration). As premissas novas
  `bombeamento.alimentacao`/`.reserva` ficam no JSONB do estudo, e o banco antigo lê o padrão.
  - [x] B1 — `utils/blueprintCasaDeBombas.ts · proporFonte`:
    - **Com bomba:** no ambiente "Casa de bombas" (ou junto da bomba já lançada) entram a principal,
      a jockey LIGADA a ela (trecho + `bombaPrincipalId`) e um pressostato por bomba SOBRE o
      barrilete. A reserva própria entra ao lado, ligada pela sucção.
    - **Sem lugar:** o relatório pede (D-1).
    - **Sem catálogo:** a bomba entra sem curva e o relatório diz o ponto de projeto (D-2). Com
      catálogo, `proporReserva` escolhe a que atende (`bombasQueAtendem`) e aplica a curva.
    - **Gravidade:** a caixa elevada própria vai no ambiente "Reservatório / Caixa d'água /
      Barrilete" do pavimento mais alto.
    - ⚠️ Os tubos da casa de bombas NÃO nascem sugeridos: o relançamento da rede os apagaria.
  - [x] B2 — `proporRecalque`: 1 m para fora da porta da rua do pavimento de descarga, a −0,30 m,
    ligado ao nó da rede mais perto.
  - [x] B3 — `proporReserva`, nos **quatro arranjos** (D-3):
    - o volume exigido (vazão × autonomia) no módulo comercial acima (até 5.000 L de 500 em 500,
      depois de 1.000 em 1.000; convenção, CONFERIR com o fornecedor);
    - na parcela, a caixa CRESCE para manter o consumo que já tinha.
    - O cálculo e a rede de hidrantes passaram a reconhecer a caixa de água fria COM parcela de
      incêndio como fonte por gravidade.
    - ⚠️ A parcela provisória (posta para a caixa virar fonte antes do cálculo) comia o consumo; o
      teste pegou, e agora ela soma à caixa.
  - [x] B4 — o gerador encadeia sprinklers → **fonte** → rede → **recalque** → DN → **reserva e
    curva**.
    - No teste de 8 pavimentos, a lista de faltas ficou **só com o percurso** (o modelo de prova não
      tem escada).
    - Os 4 arranjos atendem a reserva e "toda peça recebe água".
    - Gerar de novo não lança peça.
    - A gaveta ganhou os seletores de alimentação e reserva e o aviso do catálogo.
  - Suíte com 6.841 testes: 6.808 + 33 pulados. Build ok.
- [x] **C1** (01/10/2026, frente `incendio-fase-c`):
  - **Leitura:** `lerIncendioParametrico` traz o `Pset_OpuraIncendio` de cada peça, numa varredura
    só das `IfcRelDefinesByProperties`.
  - **Tradução:** `especificacaoDoPset` traduz só o `_Declarado`, pela MESMA regra do kernel.
    - Valor fora da regra vira aviso, e a peça entra sem ele.
    - "—" (ausente) não é inválido.
    - `_Derivado` e `_Calculada` ficam de fora.
  - **Prova:** a ida e volta pelo web-ifc dá `porTerminal` por especificação IGUAL ao original.
  - Suíte com 6.828 testes: 6.795 + 33 pulados. Build ok.
- [ ] **D1 — em partes** (frente `incendio-d1`) · D2 (⏸ adiada — só MG agora)
  - [x] D1.1 — as EXIGÊNCIAS pela IT 01 (10ª ed., Portaria 84/2026), Anexo A, Tabelas 1 a 18:
    - lidas pela IMAGEM de cada página (o texto do PDF embaralha as colunas) e transcritas em
      `docs/normas/incendio-mg/it01-anexo-a-tabelas.txt`;
    - o teste relê esse texto e confere `blueprintIncendioTabelasMG.ts` célula a célula (24 blocos,
      325 linhas);
    - as notas viram regras (`blueprintIncendioExigenciasMG.ts`):
      - área, divisão e "térrea" são avaliadas;
      - população, condomínio com arruamento interno e risco do evento ficam no estado novo
        **CONDICIONAL**, com a condição escrita — o gerador não lança; o relatório põe em
        NAO_DECIDIDO;
    - também: A-1 isenta (A.4.1 a); iluminação na térrea ≤ 200 m² (A.4.5); "Plano de intervenção"
      entrou como medida (fora do desenho); tipos por altura da IT 08, Tabela 1 (eram 6 de
      memória — são 4); risco pela carga da IT 09, item 5.10 (conferido, igual);
    - **o rascunho de memória estava errado** em pontos que mudam projeto:
      - o corte era "750 m² / 12 m", e são as faixas de altura 12 / 30 / 54 m;
      - hidrante no A-2 de até 12 m só acima de 1.200 m²;
      - alarme no A-2 só acima de 30 m;
    - o gerador não traz mais "transcrito de memória" (teste do E10 atualizado);
  - [ ] D1.2 — os parâmetros de cada medida, uma IT por publicação:
    - [x] IT 17 (hidrantes) — `blueprintIncendioHidrantesMG.ts`, transcrição em
      `docs/normas/incendio-mg/it17-tabelas.txt` (relida pelo teste):
      - o TIPO do sistema e a RESERVA saem da Tabela 4 (área × divisão × carga); a reserva
        exigida no cálculo passa a ser o VOLUME DA TABELA (5.9.2), não vazão × autonomia (com
        sprinklers, o maior dos dois);
      - a Tabela 2 dá vazão, mangueira e esguicho; o grupo A no mangotinho é 80 LPM;
      - a cobertura desconsidera o jato (5.8.2): o padrão `alcanceDoJatoM` foi de 10 m para 0;
      - a IT não fixa pressão no esguicho: a do hidrante sai do requinte (fórmula do orifício,
        Cd 0,98 — física, conferir com o catálogo);
      - no painel de cálculo: o sistema da IT 17, o que diverge nas premissas e o botão "Usar os
        valores da IT 17"; o gerador só acusa o que diverge;
      - **a lei A1 pegou um defeito** que o jato escondia: o salão em L de 30 m (um ambiente só)
        recebia UM candidato (a face do centro) e ficava sem solução. Agora todo ambiente com
        ponto descoberto oferece os pontos amostrados como candidatos (antes, só os corredores);
      - fica para depois: 5.8.8 (pressão no esguicho ≤ 3× a do mais desfavorável; ≤ 50 mca sem
        brigada intermediária) pede o cenário do hidrante MAIS FAVORÁVEL, que o cálculo não monta
        hoje; e a distância no mesmo ambiente é em linha reta (a mangueira, no L, contorna o canto);
    - [x] IT 08 (saídas) — `blueprintIncendioSaidasMG.ts`, transcrição em
      `docs/normas/incendio-mg/it08-tabelas.txt` (relida pelo teste):
      - população e capacidade por DIVISÃO (Tabela 4), com a área sem sanitários, escadas e
        corredores (nota E) e a sala como dormitório até 2 dormitórios (nota C);
      - mínimo de 3 UP na H-2 e H-3 (5.4.2.1); a porta pela luz da 5.5.4.3 (0,80 m para 1 UP);
      - tipo de escada e NÚMERO de saídas pela Tabela 6 (com a nota F);
      - percurso pela Tabela 5 POR AMBIENTE (X/Y/Z, térreo × demais, uma × mais saídas, detecção,
        chuveiros, −30% sem leiaute, +50% com controle de fumaça), medido até o LOCAL SEGURO — o
        exterior ou a escada (5.5.2.1); na A-2, da porta da unidade (5.5.2.2: dentro da unidade
        não se mede). A rota desenhada continua indo até a rua (iluminação e sinalização usam);
      - premissas novas no painel de saídas: características construtivas (não declarada = X, o
        mais restritivo, e o relatório pede), sem leiaute, controle de fumaça;
      - o rascunho ERRAVA: C era 5 m²/pessoa (é 3), a escada de C/D/E era 75 por UP (é 60), a porta
        de 1 UP era 0,55 m (é 0,80), H-1 a 8 m pedia EP (é NE), o percurso era um número por grupo;
    - [x] IT 18 (chuveiros) — a IT ADOTA a NBR 10897 para risco, área de operação e tabelas
      (5.2); a NBR não está entre os textos fornecidos, e esses valores seguem CONFERIR. O que a
      IT acrescenta (`blueprintIncendioChuveirosMG.ts`, transcrição `it18-itens.txt`):
      - 5.11: com hidrantes e chuveiros, as reservas SE SOMAM (Tabela 4 da IT 17 + vazão ×
        duração dos chuveiros) — corrige o "maior dos dois" da publicação da IT 17;
      - 5.13: hidrante depois da VGA é FALTA na conferência (mangotinho: admitido se protege outra
        área — fica para o responsável);
      - 5.12: recalque dos chuveiros a 0,60–1,00 m na fachada; em caixa no passeio, só se a
        fachada for impossível (5.12.2) — a conferência diz;
      - 5.9, 5.19, 5.22 no memorial descritivo;
    - [x] IT 16 (extintores) — `blueprintExtintores.ts`, transcrição `it16-tabelas.txt`:
      - a distância é POR CLASSE (Tabelas 4 a 6): A 20 m, B 15 m, C 20 m; no risco alto, o
        extintor mais forte alcança mais (4-A: 20 m; 80-B: 15 m) — o rascunho tinha 25/20/15 m
        por risco; abaixo da mínima do risco, o extintor não conta como unidade da classe;
      - 5.2.2.9: um extintor a até 10 m da entrada do pavimento (porta para fora ou chegada da
        escada) — análise e proposta (a proposta põe um junto da entrada; a lei A1 segue fechando);
      - 6.2.1: unidade de pó ABC (ou A + BC) por pavimento; 6.2.1.2 (ABC em garagem e sem
        brigada) como aviso;
    - [x] IT 15 (sinalização) — `blueprintSinalizacao.ts`, transcrição `it15-itens.txt`:
      - os códigos do Anexo B: o rascunho usava E9 no recalque (E9 é o hidrante FORA do abrigo; o
        recalque não tem código — a tampa "INCÊNDIO" da IT 17 o identifica) e S3 nas setas da rota
        (S3 é a placa acima da porta; as setas são S1) — S3 segue no catálogo para as placas já
        desenhadas;
      - placas novas: VGA (E11), acionador (E2), avisador (E1) — o gerador as lança no kit;
      - na rota, além das curvas e da saída, uma placa a no máximo 15 m de qualquer ponto
        (6.1.3 b); o térreo de percurso curto e reto fica isento (6.1.3.5);
    - [x] IT 13 (iluminação) — a IT ADOTA a NBR 10898 (2.2; autonomia segue CONFERIR); o que
      ela fixa (`it13-itens.txt`): 15 m entre pontos de aclaramento (5.4, já era o padrão) e,
      abaixo de 2,5 m, luminária de 30 V — ou DR 30 mA + disjuntor de 10 A no circuito comum
      (5.5/5.5.1) — conferido no circuito do ponto de alimentação (F6);
      - ⚠️ corrigido junto: a publicação da IT 15 fazia as placas de 15 m e a isenção do térreo
        valerem também para a ILUMINAÇÃO (que reaproveita os pontos da rota) — a placa de 15 m não
        é ponto de luminária, e a isenção da placa não isenta a luz; teste de regressão;
    - [ ] IT 14 (alarme);
  - [ ] D1.3 — a Tabela A.1 da IT 09 como catálogo de ATIVIDADES (divisão + carga).
- [ ] E1 (⏸ confirmar a escrita com o usuário de leitura antes de rodar)
- [x] **Fase F — 6 de 6** (frente `incendio-fase-f`):
  - [x] **Kernel 0.89.0** (um bump para os dois tipos novos; goldens 7/7 antes, 6 hashes e 22 pinos
    depois; bundle da planta-api regenerado): `MANOMETRO` (sobre o trecho) e `DETECTOR_CHAMA` (do
    laço). Cada um tem ficha, símbolo, numeração (MN, DC), família da prancha, IFC
    (`IfcFlowInstrument .PRESSUREGAUGE.` / `IfcSensor .FIRESENSOR.` — o IFC4 não tem
    "FLAMESENSOR") e a importação de volta. O antipânico (F5) NÃO precisou de bump: a marca
    `ANTIPANICO` da porta existe desde a 0.84.0.
  - [x] F1 — `utils/blueprintKitsIncendio.ts · kitDaPeca`:
    - a placa do equipamento e, na VGA, o manômetro de montante, o de jusante (a 30 cm) e o
      registro de bloqueio (a 60 cm), sobre os tubos que chegam nela, num lote só;
    - a VGA fora da rede ganha o aviso;
    - a inserção à mão no editor usa o MESMO kit (o hidrante à mão agora vem com a placa);
    - a casa de bombas ganha o manômetro do barrilete, e o detalhe típico da VGA conta os
      manômetros.
    - **Desvio, dito:** o dreno da VGA NÃO entra como peça (seria uma ponta aberta que a
      verificação acusaria); fica no detalhe típico.
  - [x] F4 — detector de chama:
    - cobertura por CONE (`detectorCobre`: alcance de 15 m, abertura de 90°, CONFERIR NA NBR 17240 /
      fabricante), a MESMA função na análise e na proposta;
    - a sala com "inflamáveis / combustível / diesel / gerador" no nome pede o de chama;
    - a proposta o põe nas quinas, olhando para o centro.
    - ⚠️ **A lei da Fase A pegou um defeito do alarme:** os detectores lançados criavam o laço no
      pavimento, e o avisador que o laço exige só vinha na 2ª proposta. Agora vem no mesmo lote.
  - Suíte com 6.853 testes: 6.820 + 33 pulados. Build ok. (Publicado em 38fa4908.)
  - [x] F3 — `utils/blueprintLacoDeAlarme.ts · proporEletrodutoDoLaco`:
    - eletrodutos ELÉTRICOS "Laço de alarme" (20 mm, sugeridos), da central a cada dispositivo,
      em cadeia pelo mais perto;
    - a PRUMADA na posição da central para os outros pavimentos, e a cadeia de lá parte do pé (ou
      do topo) dela;
    - idempotente (dispositivo já alcançado não ganha outro).
    - Lançado no MESMO lote da proposta de alarme (gaveta e gerador). O quantitativo conta o
      eletroduto.
  - [x] F5 — `utils/blueprintAntipanico.ts`:
    - a porta de abrir por onde a ROTA passa (o centro do vão = o portal do grafo) pede a barra
      quando o grupo é F ou o pavimento tem ≥ 50 pessoas (CONFERIR NA IT / NBR 11785);
    - a proposta acrescenta a marca `ANTIPANICO`, mantendo as outras;
    - a conferência da emissão ganhou "Barra antipânico nas portas da rota", e o gerador ganhou a
      etapa.
  - [x] F6 — `alimentacaoDasLuminarias` (no kit da peça): a luminária de emergência entra com o
    ponto de ALIMENTAÇÃO no circuito de iluminação do local (ponto elétrico de iluminação, 10 W,
    CONFERIR com o fabricante), e os circuitos automáticos o põem num circuito de ILUMINAÇÃO, sem
    regra nova no motor elétrico. Vale na gaveta de iluminação e no gerador.
  - Suíte com 6.857 testes: 6.824 + 33 pulados. Build ok.
  - [x] F2 — kits de inserção da organização:
    - migration `aplicar_20271001000060_blueprint_kits_de_insercao.sql`. Nasceu como 050, colidiu
      com outra frente e foi renomeada ANTES de aplicar. Aplicada em 01/10 (o atraso foi o incidente
      de latência da Supabase). Conferência: tabela=1, com_rls=1, policies=4, anon_grants=0;
    - RLS provada como na E9.2: o membro grava e lê (1); outra organização recusada (42501); sem
      login vê 0; `anon` recusado (42501). A prova foi desfeita, e a tabela ficou vazia;
    - `utils/blueprintKitsDeInsercao.ts`:
      - `itensDoKit` não confia no JSONB: só passam as props da lista, nunca id de outra peça;
      - também tem `comandosDoKit` (gira com a peça) e `kitDaSelecao`;
    - `kitDaPeca(model, comandos, kits)` soma os kits da organização ao kit padrão:
      - as peças do kit também ganham a placa;
      - kit recusado pelo kernel fica de fora inteiro, com aviso;
      - não há recursão;
    - aba Incêndio → "Kits de inserção" (`PainelKitsDeInsercao`): lista, "salvar a seleção como
      kit" (a 1ª selecionada é a principal) e apagar. A inserção à mão (hidráulica, incêndio e
      elétrica) usa os kits;
    - suíte com 6.874 testes: 6.841 + 33 pulados. Build ok.

## Verificação

- Fase A: o arquivo da lei (A1) roda verde com os cenários de borda, e a suíte inteira fecha.
- Fase B: o teste de 8 pavimentos da E10 com a lista exata de faltas reduzida ao que o modelo não
  tem.
- Fase C: ida e volta pelo web-ifc com especificações e quantitativo iguais.
- Fase D: linhas transcritas conferidas uma a uma; zero "CONFERIR" nas linhas conferidas.
- Fase E: teste de integração verde e banco limpo depois.
