# Condomínio — Assembleias e votações (híbrida, voto pelo Portal do Cliente, ata gerada)

## Pedido original

Sessão `bef90ec4-4d31-470b-a193-71ce97673653` · 25/11/2026.

> comercial > condomínio: verifique se esta implementado aseembleias e votacoes

(Resposta: não existe — só a categoria "Assembleia" de aviso, a categoria "Ata" de
documento e a votação do Portal do Investidor, que é outro domínio.)

> Começcepelo plano.
> As perguntas a decidir primeiro:
> 1. por onde se vota: Portal do Cliente > Condomino
> 2. Cada Condômino vota por unidadepor unidade
> 3. Sai ata gerada pelo sistema.

> O que encontrei e pesa no desenho:
> 1. ok
> 2. Vou cadastrar os que faltam no condominios.
> 3.  exigir login para votar
> 5. ok
> 6. Seguir a leu
>
> Pergunta: existe uma assembleia real puxando esse pedido? Sim
> Em qual condomínio e para quando? Condom;inio Bella Vista. Prazo para este mês.
> Vesão: ainda nao temos. Pode sugerir um texto.

> Híbrida

> Va de A, faça plano paça implementar B e escreva o desenho com as regras

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/11 | Por onde o condômino vota? | **Portal do Cliente › Condomínio** |
| 25/11 | Unidade de voto | **Uma cédula por unidade** (quem tem 3 unidades vota 3 vezes) |
| 25/11 | Ata | **Gerada pelo sistema**, gravada em Documentos › Ata |
| 25/11 | Unidade sem proprietário cadastrado | O usuário **cadastra os que faltam** (não é código) |
| 25/11 | Link sem senha pode ser repassado | **Exigir login para votar** |
| 25/11 | Peso do voto / inadimplente | **Seguir a lei** (CC 1.352 par. único: fração ideal, salvo convenção; CC 1.335 III: só vota quem está quite) |
| 25/11 | Caso real | **Condomínio Bella Vista, assembleia neste mês** |
| 25/11 | Convenção | **Ainda não há**; pediu sugestão de texto (Anexo A) |
| 25/11 | Formato | **Híbrida**: portal + presencial lançado pelo gestor |
| 25/11 | Quem conduz | **A** = gestor pelo app agora; **B** = síndico pelo Portal do Síndico, planejado como fase seguinte |
| 25/11 | Data e pauta do Bella Vista | **A agendar quando o app estiver funcionando** — sem prazo; a fase A entra inteira |
| 25/11 | Jurídico antes ou em paralelo? | **Construir com as regras propostas; o jurídico revisa em paralelo** |
| 25/11 | Voto antecipado conta como presença? | Usuário pediu recomendação → **sim** (R5/R6). Se o jurídico vetar: aceitar voto só em INSTALADA — muda uma checagem e o edital, não a estrutura |
| 25/11 | Presencial × portal | Usuário pediu recomendação → **vale o último, nos dois sentidos**, com confirmação do gestor ao substituir (R7) |
| 26/11 | Inadimplência: nenhum rateio do app tem cobrança gerada hoje | **Aviso + marcar à mão** (Task A10) |
| 26/11 | Condomínio de teste da A9 não pode ser excluído (trava) | **Apagar por script**, desligando a trava só nessa operação |
| 26/11 | Aplicar e publicar a fase A | **Sim**, após as correções da revisão final e a A10 |
| 26/11 | Fase B: envio de ata/procuração pelo síndico (o único envio do Portal do Síndico grava no armazenamento do Financeiro) | **Função nova e própria de documentos do condomínio pelo síndico** (`sindico-portal-documentos`), mesma checagem de login/mandato |

## Por que existe

O Bella Vista vai realizar uma assembleia real assim que o app estiver pronto, e o app não
tem como convocar, colher voto, apurar nem lavrar ata. Hoje isso seria feito fora do
sistema (papel, WhatsApp), sem registro de quem votou nem prova de convocação.

**Pronto = a assembleia do Bella Vista acontecer pelo caminho do usuário**: gestor
convoca no app → condôminos veem e votam no Portal do Cliente com login → na reunião o
gestor lança presença e votos de quem está na sala → encerra → ata em PDF aparece em
Documentos e no portal. Teste com dado fictício não fecha o pedido.

## Estado atual medido (25/11/2026, banco de produção e `origin/main` 171632c1d)

- **Bella Vista**: 9 unidades. As 8 residenciais (11, 12, 21, 22, 31, 32, 41, 42) têm
  um PROPRIETARIO cada e fração ideal `0,00125` com origem `CONVENCAO`; a unidade
  "Estacionamento" não tem fração nem ocupante. Soma das frações = 0,01 (não 1).
- **Síndica**: Gabriela Guimenti (`empreendimentos.sindico_client_id`), também
  proprietária da 42.
- **Login**: 4 dos 8 proprietários têm e-mail no cadastro; **nenhum tem conta**.
  O convite existe (`supabase/functions/portal-invite-user`, portal `cliente`, envio
  pelo Resend, botão em `ClientPortalLinkModal`).
- Nenhum documento do Bella Vista em `condominio_documentos`.
- Peças existentes que este desenho reaproveita:
  - mural `condominio_avisos` (categoria `ASSEMBLEIA`) + `condominio_aviso_leituras`
    (confirmação de leitura por cliente) — prova de que a convocação chegou;
  - `condominio_documentos` + bucket privado `condominio-documentos`
    (`{org}/{empreendimento}/{uuid}.{ext}`), categoria `ATA`, `visivel_portal`;
  - Portal do Cliente › Condomínio (`components/client/CondominioTab.tsx`, sub-abas
    `PortalTabs`), entrada autenticada por RPC `SECURITY DEFINER` que casa
    `auth.jwt()->>'email'` com `clients.email`
    (`client_portal_get_condominio_for_client`, `aplicar_20270901000001`);
  - regra de "cota paga" `utils/situacaoDaCota.tituloEstaPago` (a mesma de Contas a
    Receber) e a situação `VENCIDA`;
  - PDF no navegador com jsPDF por `import()` dinâmico (`services/relatorioRateioPdf.ts`);
  - Portal do Síndico com porta única `fn_sindico_resolver(token, client, modo)` e modo
    `sessao` (exige login) — base da fase B.

## Objetivos

1. Gestor cria a assembleia (AGO ou AGE) com pauta, datas e local, e **convoca**.
2. Condômino logado vê a assembleia e **vota por unidade** no Portal do Cliente, da
   convocação até o encerramento, podendo trocar o voto até lá.
3. Na reunião, o gestor **instala** (1ª ou 2ª convocação), registra a **presença** e
   **lança os votos presenciais** (inclusive por procurador).
4. A **apuração** segue o Código Civil: peso pela fração ideal, quórum por item,
   inadimplente impedido.
5. Ao **encerrar**, o resultado congela e a **ata em PDF** é gerada e gravada em
   Documentos › Ata, visível no portal.
6. Fase B: a síndica conduz o mesmo fluxo pelo Portal do Síndico.

## Não-objetivos (agora)

- Videoconferência dentro do app — a convocação leva um **link de transmissão** (campo
  livre: Meet, Zoom, WhatsApp).
- Assinatura eletrônica da ata (o app tem assinatura interna; ligar depois).
- Procurador votando pelo portal com conta própria — procuração entra **pelo gestor**,
  na reunião.
- Sessão permanente (CC 1.353 §§1º–4º) e quórum de 3/4 do condômino antissocial
  (CC 1.337).
- Critério de peso diferente de fração ideal (só quando uma convenção exigir).
- Envio de e-mail/WhatsApp da convocação pelo app — a convocação vai para o mural e o
  gestor baixa o **edital em PDF** para distribuir.
- Assembleia no Portal do Condômino antigo (`/portal-condomino`).

## Anti-objetivos (falha mesmo se "funcionar")

- Alguém que não é o proprietário votar pela unidade — inclusive **o gestor abrindo o
  portal por dentro** (a RPC de leitura aceita membro da org; a de voto **não**).
- Voto ou resultado mudar depois do encerramento, ou ata divergir do que foi apurado.
- Apuração "aprovado" com quórum que a lei não admite.
- Unidade inadimplente votando sem que o sistema avise.
- Instalar assembleia sem registro de que todas as unidades foram convocadas
  (CC 1.354: não pode deliberar se todos não forem convocados) — ver R4.

---

## Regras (Código Civil, com Lei 14.309/2022)

> Base legal citada: arts. 1.335, 1.341–1.343, 1.349–1.355 e 1.354-A do CC. **Revisar
> com o jurídico antes do uso real** — as interpretações marcadas "proposta" são
> escolhas minhas onde a lei admite leitura.

### R1 — Quem participa e com que peso
- Entram na assembleia as **unidades do condomínio com fração ideal preenchida**. A
  lista e a fração de cada uma são **congeladas na convocação** (cadastro alterado
  depois não muda a assembleia em curso).
- Unidade **sem fração** fica fora e aparece listada na tela de convocação como
  "fora da assembleia: sem fração ideal" (no Bella Vista: Estacionamento).
  *(proposta)*
- **Peso = fração ideal** (CC 1.352 par. único). O total de referência é a **soma das
  frações das unidades participantes** — no Bella Vista a soma é 0,01, então cada
  unidade pesa 1/8. A tela mostra o peso em **%** e a contagem de unidades ao lado.

### R2 — Quem vota pela unidade
- Pelo portal: o cliente com ocupação **PROPRIETARIO vigente** (`ended_at IS NULL`)
  naquela unidade, **logado**, cujo e-mail da sessão é o `clients.email` do cadastro.
- Inquilino, morador e responsável financeiro **não** votam pelo portal; podem votar
  **como procurador**, lançado pelo gestor (R7). *(proposta — Lei 4.591/64 art. 24 §4º
  admite o locatário em despesa ordinária na ausência do locador; fica para depois)*
- Unidade com **dois ou mais proprietários**: vale o voto de qualquer um; o último
  registrado substitui o anterior, e o portal mostra "votado por <nome> em <data>".
  (Hoje são 0 casos.) *(proposta)*

### R3 — Inadimplente não vota (CC 1.335 III)
- A unidade está **impedida** se tiver cota condominial **VENCIDA** (mesma regra de
  `situacaoDaCota`: título lançado, não pago, vencimento antes de hoje) no momento do
  voto.
- A checagem é feita **no banco, a cada voto** (portal e presencial). Pagou antes da
  reunião → vota.
- O portal mostra o motivo ("cota de 10/2026 vencida"); o gestor vê a unidade
  "impedida" na lista de presença; a ata lista as unidades impedidas no encerramento.
- Impedida **não conta como presente** para quórum. *(proposta)*
- **Momento da checagem** *(proposta)*: vale a situação **no instante de cada ação**
  (voto, registro de presença, instalação), e ela é gravada junto. Voto dado quite
  **continua valendo** mesmo que uma cota vença depois. Unidade impedida que paga
  durante a reunião passa a votar e a contar como presente a partir daí, mas o
  **quórum da instalação**, calculado e gravado no instante de Instalar, não é
  refeito. A ata lista as unidades que estavam impedidas na instalação.

### R4 — Convocação (CC 1.354, 1.354-A §1º)
- Só se convoca com pauta de **pelo menos 1 item** e **data da 1ª convocação futura**.
- Convocar publica um aviso `ASSEMBLEIA` no mural com: tipo, data/hora da 1ª e 2ª
  convocação, local, link de transmissão, a pauta, e as instruções do voto pelo portal
  (texto fixo do sistema, exigido pelo §1º).
- A tela mostra a **antecedência em dias** e quantas unidades já **leram** o aviso
  (confirmação de leitura existente). O sistema não impõe prazo mínimo — sem
  convenção, a lei não fixa. *(proposta)*
- **Edital em PDF** baixável a qualquer momento depois de convocar.
- **Prova de convocação de todas as unidades** *(proposta)*: o aviso publicado é
  automático, mas leitura não pode ser exigida (sem conta ninguém confirma). Por isso
  **Instalar** pede ao gestor marcar "Confirmo que o edital foi entregue a todas as
  unidades", gravado com autor e data e impresso na ata. As leituras do aviso aparecem
  como informação, nunca como trava.
- Depois de convocada, **a pauta não muda** (mudar pauta = cancelar e convocar outra).

### R5 — Janela de voto
- O voto pelo portal abre na **convocação** e fecha no **encerramento**. O edital diz
  isso (CC 1.354-A §4º: a assembleia segue o que o edital prevê).
- O condômino **pode trocar o voto até o encerramento**; vale o último. Todo voto e
  troca fica no histórico (quem, quando, por onde). *(proposta — preserva o efeito do
  debate da reunião, CC 1.354-A II)*

### R6 — Instalação (CC 1.352 e 1.353)
- Na hora da reunião, o gestor clica **Instalar** e informa presidente e secretário
  (nomes livres).
- Conta como **presente**: unidade marcada presente na sala (pessoalmente ou por
  procurador) **ou** que votou ao menos um item pelo portal, e que não está impedida.
- **1ª convocação** só pode ser escolhida se os presentes somarem **≥ 50% das
  frações**. Abaixo disso o sistema só oferece **2ª convocação**, e só a partir do
  horário marcado para ela.
- Presença pode continuar sendo registrada depois de instalada (quem chega atrasado).

### R7 — Voto presencial e procuração
- O gestor lança, por unidade e por item, o voto de quem está na sala. Fica gravado
  **quem lançou** e a origem `PRESENCIAL`.
- **Procurador**: o gestor marca a presença "por procurador", com o nome do procurador
  e o **arquivo da procuração** (obrigatório). A procuração vai para o bucket do
  condomínio e é listada na ata.
- **Vale o último voto da unidade, venha de onde vier.** Presencial depois do portal
  substitui o do portal; portal depois do presencial substitui o presencial (é a
  vontade mais recente do condômino). Ao lançar sobre um voto do portal, a tela do
  gestor mostra "esta unidade votou <opção> pelo portal em <data>" e pede
  confirmação. O histórico guarda todos, e a ata registra a origem do voto que valeu.
  *(decidido 25/11 por recomendação)*

### R8 — Tipos de item e quórum
Cada item da pauta tem um **tipo de votação** e um **quórum**:

| Tipo | Opções na cédula |
|---|---|
| Aprovação | Sim · Não · Abstenção |
| Escolha (ex.: eleição de síndico) | as opções cadastradas no item · Abstenção |

| Quórum | Base legal | Aprovado quando |
|---|---|---|
| Maioria dos presentes (padrão) | 1.352 / 1.353 | fração do SIM > fração do NÃO, entre os presentes que votaram; abstenção não entra *(proposta)*. Escolha: a opção com mais fração vence; empate = "sem decisão" |
| Maioria absoluta | 1.341 II (obras úteis), 1.349 (destituir síndico) | fração do SIM > 50% do **total** |
| 2/3 dos condôminos | 1.341 I (obras voluptuárias), 1.342 (acréscimos), 1.351 (alterar convenção, mudar destinação) | fração do SIM ≥ 2/3 do **total** |
| Unanimidade | 1.343 (novo pavimento/edifício no solo comum) | **todas** as unidades participantes votaram SIM |

- "Total" = soma das frações de **todas** as unidades participantes, inclusive
  impedidas e ausentes. *(proposta — nunca facilita aprovação)*
- Ao criar o item, o gestor pode escolher um **assunto comum** que já sugere o quórum
  (Aprovar contas, Orçamento, Eleger síndico → maioria dos presentes; Obra útil →
  maioria absoluta; Obra voluptuária, Alterar convenção → 2/3; Novo pavimento →
  unanimidade) ou "Outro assunto" e escolher o quórum à mão.

### R9 — Encerramento e ata (CC 1.354-A §3º)
- **Encerrar** exige assembleia instalada. Antes, o gestor pode escrever uma
  **deliberação/observação por item** e uma observação geral.
- Ao encerrar, o banco **soma os votos, calcula o resultado de cada item e grava um
  retrato** (presença, impedidas, votos por unidade, resultado por item). Depois disso
  **nada da assembleia muda** — trava no banco, não só na tela.
- A **ata em PDF** é gerada no navegador a partir desse retrato e gravada em
  `condominio_documentos` (categoria `ATA`, visível no portal). Se o envio falhar,
  "Gerar ata novamente" refaz do mesmo retrato — o resultado não depende do PDF.
- Conteúdo da ata: condomínio (nome, CNPJ), tipo, data/hora, local, link, convocação
  em que se instalou, presidente e secretário, lista de presença (unidade, nome,
  forma: portal / sala / procurador + nome), unidades ausentes e impedidas, ordem do
  dia, e por item: quórum exigido, fração e nº de unidades por opção, resultado
  (aprovado / rejeitado / quórum não atingido / sem decisão) e deliberação;
  encerramento e linhas de assinatura do presidente e do secretário.
  **Anexo**: voto de cada unidade por item.
- O resultado aparece também no portal (cada condômino vê o resultado e o próprio
  voto; o voto das outras unidades fica na ata).

### R10 — Estados

```
RASCUNHO ──Convocar──▶ CONVOCADA ──Instalar──▶ INSTALADA ──Encerrar──▶ ENCERRADA
    │                     │
    └──── Excluir         └──Cancelar──▶ CANCELADA (aviso de cancelamento no mural)
```
- RASCUNHO: tudo editável, invisível no portal.
- CONVOCADA: pauta travada; portal vota.
- INSTALADA: portal vota; gestor lança presença e votos presenciais.
- ENCERRADA / CANCELADA: somente leitura.

---

## Abordagens consideradas

| | Abordagem | Por que sim / não |
|---|---|---|
| ✅ | **Tabelas próprias de assembleia** + RPCs `SECURITY DEFINER` para cada transição + convocação reaproveitando o mural de avisos + ata no bucket de Documentos | Encaixa no que existe; a regra (quórum, impedimento, trava) fica no banco, onde o portal e, na fase B, o síndico passam pela mesma porta |
| ✗ | Reaproveitar a votação do Portal do Investidor (`investor_announcements`) | Outro público e outra org; não tem unidade, fração, quórum nem presença |
| ✗ | Pendurar voto no aviso `ASSEMBLEIA` | Aviso não tem itens de pauta nem estados; viraria duas coisas numa tabela |

**Quem conduz** (decidido): **A** — gestor pelo app agora. **B** — síndico pelo
Portal do Síndico depois, usando as **mesmas RPCs** (só ganham a porta do síndico).

---

## Desenho

### Dados (migration nova, aplicada à mão com `db query -f`, nunca `db push`)

- `condominio_assembleias` — org, empreendimento, tipo (`AGO`|`AGE`), título, local,
  link de transmissão, data/hora 1ª e 2ª convocação, status (R10), aviso da
  convocação (FK `condominio_avisos`), instalada em / convocação (1|2), presidente,
  secretário, observação geral, encerrada em/por, **retrato do resultado (jsonb)**,
  ata (FK `condominio_documentos`), autoria de cada transição.
- `condominio_assembleia_itens` — assembleia, ordem, título, descrição, tipo
  (`APROVACAO`|`ESCOLHA`), opções (para escolha), quórum (R8), deliberação.
- `condominio_assembleia_unidades` — assembleia, unidade, **fração congelada**,
  presença (`PRESENCIAL`|`PROCURADOR`|nula), nome do procurador, arquivo da procuração,
  quem registrou. Nasce na convocação (R1).
- `condominio_assembleia_votos` — item, unidade, voto (opção), origem
  (`PORTAL`|`PRESENCIAL`), cliente que votou ou usuário que lançou, data. Único por
  (item, unidade).
- `condominio_assembleia_votos_historico` — toda inclusão/troca (gatilho).
- `condominio_assembleia_eventos` — autoria de cada transição, presença e voto
  lançado (quem, papel `GESTOR`|`SINDICO`, quando, detalhe). É o que permite à fase B
  registrar síndico × gestor sem coluna nova.
- Gatilho de **trava**: itens só mudam em RASCUNHO; votos e presença só em
  CONVOCADA/INSTALADA; nada muda em ENCERRADA/CANCELADA (vale para todo papel,
  inclusive `postgres` via RPC).
- RLS do lado do app pelo padrão de conjunto
  (`organization_id IN (SELECT minhas_orgs_membro())`); **sem policy para `anon`**; o
  portal entra só por RPC. REVOKE explícito de `PUBLIC`/`anon` em toda RPC nova e
  `TRUNCATE` revogado (REGRA #7).

### RPCs

- App (membro da org dona do condomínio): `convocar`, `cancelar`, `instalar`,
  `registrar_presenca`, `lancar_voto`, `encerrar`. Rascunho e itens se editam pela
  tabela (RLS). Cada RPC confere estado, R3 e R6–R9 **no banco**.
- Portal: `client_portal_assembleias_for_client(client)` (leitura — mesmo par de
  autorizações da leitura do condomínio) e `client_portal_assembleia_votar(item,
  unidade, voto)` que **só** aceita a sessão do próprio cliente (e-mail do JWT =
  `clients.email`, proprietário vigente da unidade) — **sem** a perna "membro da org".
  Pelo link com token, a aba mostra a pauta e "Entre com e-mail e senha para votar".

### Telas

**App — Comercial › Condomínios › ficha › aba nova "Assembleias"** (entre Financeiro e
Comunicação; padrão `docs/ui_ux_guia_unificado.md`, REGRA #1):
- Lista (StandardTable): título, tipo, data, status, presentes/participantes,
  resultado. Ação primária no título: "Nova assembleia" (Sheet).
- Sheet de criar/editar rascunho: dados + itens da pauta (assunto comum → quórum).
- **Tela** da assembleia (retorno antecipado, como o detalhe do rateio), com a ação do
  estado no título (Convocar / Instalar / Encerrar / Gerar ata) e seções:
  Pauta · Unidades (presença, impedidas, leitura do aviso, procuração) · Apuração ao
  vivo por item · Edital/Ata. Nada abaixo de tabela (§6.14).

**Portal do Cliente › Condomínio › sub-aba nova "Assembleias"** (entre Avisos e
Documentos, vocabulário coral §24):
- Lista das assembleias convocadas/instaladas/encerradas dos condomínios das unidades
  do cliente.
- Abrir uma: dados, link de transmissão, pauta, e **uma cédula por unidade** do
  cliente (R2). Botão desligado sempre diz o motivo (sem login, impedida, encerrada).
- Encerrada: resultado por item, o voto da unidade e "Baixar ata".

### PDFs
- `services/assembleiaPdf.ts` (molde `relatorioRateioPdf.ts`, `import()` dinâmico):
  edital e ata. Modelo puro em `utils/` montado do retrato, testado por Vitest.

---

## Fase B — síndico conduz pelo Portal do Síndico

**O que muda**
- As RPCs do app ganham uma segunda porta: `fn_sindico_resolver(token, client,
  'sessao')` — síndico **com login** e mandato vigente daquele condomínio. A perna
  "membro da org" continua para o gestor. Nenhuma regra de R1–R10 é duplicada.
- Portal do Síndico ganha a aba "Assembleias" com as mesmas ações (criar rascunho,
  convocar, instalar, presença, lançar voto presencial, encerrar, gerar ata).
- Autoria registra **síndico** ou **gestor**. Os dois podem agir na mesma
  assembleia; a trava de estado do banco resolve concorrência (a segunda transição
  recebe "já foi instalada/encerrada").
- A síndica continua votando **pela própria unidade** no Portal do Cliente, como
  condômina.

**Pré-requisito**: síndica com login no Portal do Síndico (convite `sindico` já
existe em `portal-invite-user`).

**Pronto**: a síndica do Bella Vista, logada, cria, convoca, instala e encerra uma
assembleia de teste pelo Portal do Síndico, e a ata sai igual à da fase A.

---

## Pré-requisitos operacionais do Bella Vista (usuário, fora do código)

1. Cadastrar e-mail de Marcos Juliano Forster (11), Napoleão da Costa Azevedo (12),
   João do Carmo de Souza (22) e José Roberto Gomes (41).
2. Convidar os 8 proprietários para o Portal do Cliente (botão de convite) e habilitar
   a aba Condomínio para eles.
3. Conferir cotas vencidas — essas unidades ficarão impedidas (R3).
4. Definir data, local, pauta e se a assembleia é AGO ou AGE — **depois** que a fase A
   estiver no ar (decidido 25/11). A assembleia real é a prova final da fase A.

---

## O que fica para quem constrói

- Nomes finais de colunas, funções e componentes; divisão em PRs.
- Equivalente SQL da regra `tituloEstaPago`/`VENCIDA` (o Portal do Síndico já calcula
  situação de cota no `fn_sindico_payload` — reaproveitar, não reescrever).
- Layout exato das seções, seguindo o guia de UI.
- Teste: Vitest para a apuração (modelo puro, todos os quóruns, empate, impedida,
  troca de voto) + script SQL de prova das RPCs e da trava (padrão
  `scripts/teste-*.sql`).

---

## Anexo A — Sugestão de texto (convenção ou regimento interno)

> **Sugestão para revisão do jurídico.** Sem convenção, a assembleia eletrônica e a
> híbrida já são permitidas (CC 1.354-A, I: basta não serem vedadas); normas
> complementares podem ir ao **regimento interno**, aprovadas por maioria simples dos
> presentes em assembleia convocada para isso (CC 1.354-A §5º). Na convenção, a
> inclusão depende de 2/3 (CC 1.351).

**Das assembleias eletrônicas e híbridas**

Art. X. As assembleias gerais, ordinárias ou extraordinárias, poderão ser convocadas,
realizadas e deliberadas de forma presencial, eletrônica ou híbrida, preservados aos
condôminos os direitos de voz, de debate e de voto.

§1º O edital de convocação indicará a forma da assembleia, o local da reunião
presencial, se houver, o endereço da transmissão, as instruções de acesso ao sistema
eletrônico de votação e o período em que os votos serão recebidos.

§2º O voto eletrônico será exercido por unidade autônoma, pelo condômino cadastrado
como proprietário, mediante acesso pessoal com usuário e senha, sendo vedado o
compartilhamento da credencial. Havendo mais de um proprietário da mesma unidade,
prevalecerá o último voto registrado.

§3º Os votos serão proporcionais às frações ideais das unidades, e somente poderá
votar o condômino quite com as contribuições condominiais vencidas até a data do
voto.

§4º O condômino poderá alterar o voto eletrônico até o encerramento da assembleia,
prevalecendo o último registrado; o voto presencial, pessoal ou por procurador com
instrumento de mandato apresentado à mesa, substitui o voto eletrônico anterior da
mesma unidade.

§5º A administração não responde por falhas de equipamento ou de conexão dos
condôminos ou de seus representantes, nem por situações fora de seu controle.

§6º Encerrada a votação e divulgado o resultado, será lavrada ata eletrônica, que
ficará disponível a todos os condôminos no portal do condomínio.

---

## Plano

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos em `- [ ]`.

**Objetivo:** assembleia híbrida do condomínio — gestor conduz no app, condômino logado
vota por unidade no Portal do Cliente, banco apura pela lei e congela o resultado, ata
em PDF vai para Documentos (fase A); síndico conduz pelo Portal do Síndico (fase B).

**Arquitetura:** a regra mora no banco. Funções-núcleo `_assembleia_*` (sem GRANT a
ninguém) fazem cada transição; invólucros finos autorizam o ator (gestor na A, síndico
na B) e chamam o núcleo. A apuração é UMA função SQL (`fn_assembleia_apurar`) usada ao
vivo e no encerramento. O TS só monta textos (convocação, edital, ata) a partir do que
o banco devolve, e desenha o PDF no navegador.

**Tecnologia:** Postgres/Supabase (plpgsql `SECURITY DEFINER`, RLS), React + TS,
jsPDF/autotable por `import()` dinâmico, Vitest.

**Desenho:** as seções acima deste arquivo (R1–R10, Dados, RPCs, Telas, Fase B).

### Restrições globais

- Banco: **nunca `supabase db push`**. Ensaio com `scripts/montar-ensaio.sh`; aplicar com
  `npx supabase db query --linked -f <arquivo>` só depois do ensaio dar `TUDO OK`.
- Prefixo de migration único conferido contra **todos** os nomes
  (`ls supabase/migrations | grep -c 2027112586` = 0 antes de criar); se outra frente
  ocupou, subir o número.
- REGRA #7: toda função nova `REVOKE ALL … FROM PUBLIC, anon`; núcleo `_assembleia_*`
  revogado também de `authenticated`; `REVOKE TRUNCATE` nas tabelas novas; policy pelo
  conjunto `organization_id IN (SELECT public.minhas_orgs_membro())`; nenhuma policy
  para `anon`.
- Org da operação = `fn_org_do_condominio(empreendimento)` no banco e
  `orgDoCondominio(e)` no TS (catraca `__tests__/orgDoCondominioGuard.test.ts`).
- Hora: `timestamptz`; "agora" e "hoje" em `America/Sao_Paulo`.
- UI: `docs/ui_ux_guia_unificado.md` (REGRA #1) e `bash scripts/check-ui-standard.sh
  <arquivo>` = 0 em todo `.tsx` novo/alterado; campo `h-9`; rótulo sem caixa alta;
  botão desligado diz o motivo; nada abaixo de tabela; portal no vocabulário coral §24.
- Todo texto de tela, erro e PDF em português.
- **Nunca convocar no Bella Vista para testar** (convocar publica aviso a pessoas
  reais). Prova de ponta a ponta em condomínio de teste (Tarefa A9).
- Publicação: PR, **todos** os jobs verdes, merge feito por mim (`gh pr merge`).

### Foco de revisão (o que nenhum teste "natural" pega)

1. **Proprietário logado que entrou pelo link com token** — a sessão existe na
   chamada, então o voto tem de valer (A3: teste `votar com token + sessão`).
2. **Gestor espiando o portal do cliente** — botão de voto desligado com motivo, e a
   RPC recusa membro da org que não é o proprietário (A3: teste `membro não vota`).
3. **Unidade impedida que paga durante a reunião** — passa a votar; o quórum da
   instalação gravado não muda (A2: teste `pagou durante a reunião`).
4. **Fuso** — 19h de Brasília não pode virar 22h nem o dia anterior no aviso, no edital
   e na trava "instalar antes do horário" (A2 e A5: testes com `-03:00`).
5. **Duplo clique / dois gestores** em Instalar ou Encerrar — `SELECT … FOR UPDATE` no
   núcleo; a segunda chamada recebe "já foi encerrada" (A2: teste `encerrar duas vezes`).

---

### Task A1: Estrutura: tabelas, trava e RLS

**Arquivos**
- Criar: `supabase/migrations/aplicar_20271125860000_condominio_assembleias.sql`
- Teste: `scripts/teste-condominio-assembleias-estrutura.sql`

**Produz** (nomes fixos, usados pelas tarefas seguintes)
- `condominio_assembleias`: `id, organization_id, empreendimento_id, tipo ('AGO'|'AGE'),
  titulo, local, link_transmissao, primeira_convocacao_em, segunda_convocacao_em
  (CHECK > primeira), status ('RASCUNHO'|'CONVOCADA'|'INSTALADA'|'ENCERRADA'|'CANCELADA',
  default RASCUNHO), convocada_em, aviso_id → condominio_avisos SET NULL,
  edital_entregue_em, instalada_em, instalada_convocacao (1|2), quorum_instalacao jsonb,
  presidente_nome, secretario_nome, observacao_geral, encerrada_em, retrato jsonb,
  ata_documento_id → condominio_documentos SET NULL, cancelada_em, motivo_cancelamento,
  created_by, created_at, updated_at`. Gatilho BEFORE INSERT preenche
  `organization_id = fn_org_do_condominio(empreendimento_id)`.
- `condominio_assembleia_itens`: `id, assembleia_id CASCADE, ordem, titulo, descricao,
  tipo ('APROVACAO'|'ESCOLHA'), opcoes text[], quorum ('MAIORIA_PRESENTES'|
  'MAIORIA_ABSOLUTA'|'DOIS_TERCOS'|'UNANIMIDADE'), assunto, deliberacao`; UNIQUE
  `(assembleia_id, ordem)`; CHECK: ESCOLHA ⇒ `cardinality(opcoes) >= 2` e quórum
  `MAIORIA_PRESENTES`; APROVACAO ⇒ `opcoes IS NULL`.
- `condominio_assembleia_unidades`: `id, assembleia_id CASCADE, unit_id, fracao numeric
  NOT NULL, unidade_rotulo, proprietario_nome, presenca ('PRESENCIAL'|'PROCURADOR'|NULL),
  procurador_nome, procuracao_documento_id → condominio_documentos, presenca_em,
  impedida_na_instalacao boolean`; UNIQUE `(assembleia_id, unit_id)`; CHECK PROCURADOR ⇒
  nome e documento preenchidos.
- `condominio_assembleia_votos`: `id, assembleia_id, item_id CASCADE, unit_id, opcao,
  origem ('PORTAL'|'PRESENCIAL'), client_id, lancado_por, votado_em`; UNIQUE
  `(item_id, unit_id)`.
- `condominio_assembleia_votos_historico` (gatilho AFTER INSERT OR UPDATE em votos
  copia a linha nova).
- `condominio_assembleia_eventos`: `id, assembleia_id CASCADE, evento, ator uuid,
  papel ('GESTOR'|'SINDICO'|'CONDOMINO'), unit_id, detalhe jsonb, em`.
- Gatilho de trava `trg_condominio_assembleia_trava` (assembleias, itens, unidades,
  votos): recusa com `23514`, HINT `assembleia_travada`, quando —
  troca de `status` sem `current_setting('app.assembleia_transicao', true) = 'on'`;
  **qualquer UPDATE de `condominio_assembleias` fora de RASCUNHO sem essa marca** (datas,
  local e título fazem parte do edital: depois de convocar só mudam pelas RPCs);
  qualquer mudança com status ENCERRADA/CANCELADA (exceto `ata_documento_id` em
  ENCERRADA, também só com a marca); itens fora de RASCUNHO (exceto `deliberacao` em
  INSTALADA); unidades e
  votos fora de CONVOCADA/INSTALADA; DELETE de assembleia fora de RASCUNHO; DELETE de
  voto sempre.
- RLS: assembleias e itens — SELECT/INSERT/UPDATE/DELETE por conjunto; unidades, votos,
  histórico, eventos — **só SELECT** por conjunto (escrita só pelas RPCs).

- [ ] **1. Escrever o teste** com `pg_temp.confere` (molde
  `scripts/teste-tarefas-visibilidade.sql`), em `BEGIN … ROLLBACK`, num empreendimento
  criado no próprio teste. Casos: `rascunho editável por membro`; `anon não lê nenhuma
  das 6 tabelas`; `não-membro não lê`; `UPDATE de status direto recusado
  (assembleia_travada)`; `item não muda depois de CONVOCADA`; `ENCERRADA não muda, só
  ata_documento_id`; `DELETE de voto recusado`; `ESCOLHA com 1 opção recusada pelo
  CHECK`; `histórico ganha linha ao trocar voto`; `organization_id vem de
  fn_org_do_condominio`. Linha final `TUDO OK`.
- [ ] **2. Ensaio sem a migration** → falha (tabela inexistente).
- [ ] **3. Escrever a migration** (blocos com `SET lock_timeout = '5s'`, idempotente).
- [ ] **4. Ensaio com a migration** → `TUDO OK`.
- [ ] **5. Commit** `feat(condominio): estrutura de assembleias (tabelas, trava, RLS)`.

**Pronto quando:** ensaio `TUDO OK`.

### Task A2: Conduzir: impedimento, apuração e transições do gestor

**Arquivos**
- Criar: `supabase/migrations/aplicar_20271125860100_condominio_assembleias_conduzir.sql`
- Teste: `scripts/teste-condominio-assembleias-conduzir.sql`

**Consome:** tabelas da A1.

**Produz**
- `fn_assembleia_unidade_impedida(p_unit_id uuid) RETURNS text` — NULL = quite; senão
  `'Cota de MM/AAAA vencida em DD/MM/AAAA'` (a mais antiga). Regra: item de
  `condominio_rateio_itens` com `transaction_id`, rateio ≠ CANCELADO, título
  `status <> 'CANCELLED'`, **não** pago (`status = 'CONCILIATED'` ou
  `business_status IN ('RECEBIDO','PAGO')` = pago, espelho de `tituloEstaPago`),
  `due_date < hoje em Brasília`.
- `fn_assembleia_apurar(p_assembleia uuid) RETURNS jsonb` —
  `{ total, presentesFracao, presentesUnidades, itens: [{ itemId, ordem, titulo, tipo,
  quorum, porOpcao: { <opcao>: { fracao, unidades } }, resultado, vencedora }] }`.
  Presente = `presenca IS NOT NULL` ou tem voto PORTAL. `total` = soma de `fracao` de
  todas as unidades da assembleia. Resultado (`APROVADO|REJEITADO|QUORUM_NAO_ATINGIDO|
  SEM_DECISAO`), comparações em `numeric` exato:
  - MAIORIA_PRESENTES/APROVACAO: SIM = NÃO = 0 → SEM_DECISAO; SIM > NÃO → APROVADO;
    senão REJEITADO. ESCOLHA: opção (≠ ABSTENCAO) de maior fração, única → APROVADO
    com `vencedora`; empate ou nenhuma → SEM_DECISAO.
  - MAIORIA_ABSOLUTA: `2·SIM > total` → APROVADO; `2·NÃO >= total` → REJEITADO; senão
    QUORUM_NAO_ATINGIDO.
  - DOIS_TERCOS: `3·SIM >= 2·total` → APROVADO; `3·NÃO > total` → REJEITADO; senão
    QUORUM_NAO_ATINGIDO.
  - UNANIMIDADE: SIM em todas as unidades → APROVADO; algum NÃO → REJEITADO; senão
    QUORUM_NAO_ATINGIDO.
- Núcleo (revogado de todos), cada um com `SELECT … FOR UPDATE` da assembleia, liga
  `app.assembleia_transicao` só na própria transação e grava em `_eventos`:
  - `_assembleia_convocar(p_assembleia uuid, p_corpo_aviso text, p_ator uuid, p_papel text) RETURNS jsonb`
    — exige RASCUNHO, ≥ 1 item, 1ª convocação > agora; cria as unidades (toda unidade
    do condomínio com `fracao_ideal_decimal` não nula; `unidade_rotulo` = torre + nome;
    `proprietario_nome` = nomes dos PROPRIETARIO vigentes); publica aviso ASSEMBLEIA
    (`titulo` = 'Convocação: ' || titulo, `corpo` = `p_corpo_aviso`, `valido_ate` = dia
    da 2ª convocação); devolve `{ unidades, fora: [rotulo] }`.
  - `_assembleia_cancelar(p_assembleia, p_motivo text, p_corpo_aviso text, p_ator, p_papel)`
    — só CONVOCADA; publica aviso 'Cancelada: …'.
  - `_assembleia_registrar_presenca(p_assembleia, p_unit uuid, p_presenca text, p_procurador text, p_procuracao uuid, p_ator, p_papel)`
    — CONVOCADA/INSTALADA; `p_presenca` NULL remove; procuração tem de ser documento do
    mesmo empreendimento; impedida → erro HINT `unidade_impedida`, DETAIL = motivo.
  - `_assembleia_instalar(p_assembleia, p_convocacao smallint, p_presidente text, p_secretario text, p_edital_entregue boolean, p_ator, p_papel)`
    — CONVOCADA; `p_edital_entregue` obrigatório; 1 ⇒ agora ≥ 1ª e `2·presentes
    não-impedidos ≥ total`, senão HINT `sem_quorum_primeira`; 2 ⇒ agora ≥ 2ª, senão HINT
    `antes_do_horario`; grava `quorum_instalacao` e `impedida_na_instalacao`.
  - `_assembleia_lancar_voto(p_item uuid, p_unit uuid, p_opcao text, p_ator, p_papel)`
    — INSTALADA; unidade com presença; não impedida (HINT `unidade_impedida`); opção
    válida para o item (HINT `opcao_invalida`); upsert com origem PRESENCIAL.
  - `_assembleia_encerrar(p_assembleia, p_deliberacoes jsonb, p_observacao text, p_ator, p_papel)`
    — INSTALADA; grava `deliberacao` por item (`{itemId: texto}`), `retrato` =
    `fn_assembleia_apurar` + presença por unidade + voto por unidade/item (com origem)
    + impedidas na instalação + cabeçalho; status ENCERRADA.
  - `_assembleia_vincular_ata(p_assembleia, p_documento uuid, p_ator, p_papel)` —
    ENCERRADA; documento do mesmo empreendimento e categoria ATA.
- Invólucros do gestor (GRANT `authenticated`): `condominio_assembleia_convocar(p_assembleia, p_corpo_aviso)`,
  `_cancelar(p_assembleia, p_motivo, p_corpo_aviso)`, `_registrar_presenca(p_assembleia, p_unit, p_presenca, p_procurador, p_procuracao)`,
  `_instalar(p_assembleia, p_convocacao, p_presidente, p_secretario, p_edital_entregue)`,
  `_lancar_voto(p_item, p_unit, p_opcao)`, `_encerrar(p_assembleia, p_deliberacoes, p_observacao)`,
  `_vincular_ata(p_assembleia, p_documento)`, `_apuracao(p_assembleia) RETURNS jsonb`.
  Cada um: `fn_org_do_condominio(emp) IN (SELECT minhas_orgs_membro())`, senão `42501`;
  chama o núcleo com `auth.uid(), 'GESTOR'`.

**Ordem dentro do núcleo (por causa da trava da A1):** convocar troca o status para
CONVOCADA **antes** de inserir as unidades; encerrar grava as `deliberacao` dos itens
**com o status ainda INSTALADA**, depois calcula o retrato e só então troca para
ENCERRADA. **Hora nos testes:** nada de "relógio falso" no código de produção; o teste
(que roda como `postgres`) convoca com datas futuras e depois desloca
`primeira/segunda_convocacao_em` para o passado com a marca
`app.assembleia_transicao = 'on'` ligada pelo próprio teste.

- [ ] **1. Escrever o teste.** Fixture: 4 unidades com frações 0,1 / 0,2 / 0,3 / 0,4
  (total 1,0) + 1 sem fração, títulos de cota fabricados no teste. Casos com os
  números: `convocar cria 4 unidades e devolve 1 fora`; `convocar publica aviso
  ASSEMBLEIA com valido_ate = dia da 2ª`; `não convoca sem item`; `1ª recusada com
  presentes 0,4 (sem_quorum_primeira)`; `1ª aceita com presentes 0,5`; `2ª recusada
  antes do horário — 1ª às 19:00-03:00, 2ª às 19:30-03:00, agora 19:10-03:00`;
  `impedida não registra presença`; `pagou durante a reunião` (marca o título
  `business_status='RECEBIDO'` → registra e vota; `quorum_instalacao` igual);
  `MAIORIA_PRESENTES: SIM 0,3 × NÃO 0,2 → APROVADO`; `empate 0,3 × 0,3 → REJEITADO`;
  `MAIORIA_ABSOLUTA: SIM 0,5 → QUORUM_NAO_ATINGIDO; SIM 0,6 → APROVADO`;
  `DOIS_TERCOS: SIM 0,6 → QUORUM_NAO_ATINGIDO; SIM 0,7 → APROVADO; NÃO 0,4 →
  REJEITADO`; `UNANIMIDADE: 3 SIM + 1 ausente → QUORUM_NAO_ATINGIDO`;
  `ESCOLHA empate → SEM_DECISAO`; `lançar voto sobre voto PORTAL troca origem e
  histórico tem 2 linhas`; `encerrar duas vezes → 2ª recebe assembleia_travada ou
  estado`; `retrato idêntico a fn_assembleia_apurar no instante`; `não-membro recebe
  42501 em todos os invólucros`; `anon/authenticated não executam _assembleia_*`.
- [ ] **2. Ensaio sem esta migration** (só a A1) → falha.
- [ ] **3. Escrever a migration.**
- [ ] **4. Ensaio A1 + A2** → `TUDO OK`.
- [ ] **5. Commit** `feat(condominio): apuração e condução de assembleia pelo gestor`.

**Pronto quando:** ensaio `TUDO OK`.

### Task A3: Portal: leitura e voto do condômino

**Arquivos**
- Criar: `supabase/migrations/aplicar_20271125860200_condominio_assembleias_portal.sql`
- Teste: `scripts/teste-condominio-assembleias-portal.sql`

**Consome:** A1, A2 (`fn_assembleia_unidade_impedida`, `fn_assembleia_apurar`).

**Produz**
- `fn_assembleias_payload_for_client(p_client_id uuid) RETURNS jsonb` (revogada de
  todos) — assembleias CONVOCADA/INSTALADA/ENCERRADA dos condomínios onde o cliente tem
  ocupação vigente: `[{ id, condominioNome, tipo, titulo, local, linkTransmissao,
  primeiraConvocacaoEm, segundaConvocacaoEm, status, itens: [{ id, ordem, titulo,
  descricao, tipo, opcoes, quorum }], sessaoValida, minhasUnidades: [{ unitId, rotulo,
  impedida, votos: { <itemId>: { opcao, origem, votadoEm } } }], resultado: <itens do
  retrato> | null, ataDocumentoId }]`. `minhasUnidades` = unidades da assembleia em que
  o cliente é PROPRIETARIO vigente. `sessaoValida` = `auth.uid()` não nulo e e-mail do
  JWT = `clients.email`. **Sem voto de outras unidades.**
- `client_portal_get_assembleias(p_token text) RETURNS jsonb` — resolve o token como
  `client_portal_get_condominio`; GRANT `anon, authenticated`.
- `client_portal_get_assembleias_for_client(p_client_id uuid) RETURNS jsonb` — mesma
  autorização de `client_portal_get_condominio_for_client`; GRANT `authenticated`.
- `client_portal_assembleia_votar(p_item uuid, p_unit uuid, p_opcao text) RETURNS jsonb`
  — sem token e sem client_id: identidade só pelo JWT (cliente com e-mail igual e
  PROPRIETARIO vigente de `p_unit`), senão `42501` HINT `sem_direito_de_voto`;
  assembleia CONVOCADA/INSTALADA; unidade na assembleia; não impedida; opção válida;
  upsert origem PORTAL, `client_id`; evento com papel `CONDOMINO`. GRANT só `authenticated`.

- [ ] **1. Escrever o teste** com claims de usuário real (`pg_temp.claims`). Casos:
  `proprietário logado vota`; `votar com token + sessão` (lê por token e vota pela
  sessão); `anon não vota`; `membro não vota` (membro da org, e-mail diferente do
  proprietário → `sem_direito_de_voto`); `inquilino não vota`; `troca de voto até
  encerrar vale o último`; `voto PORTAL depois de PRESENCIAL substitui`; `impedida
  recebe unidade_impedida`; `RASCUNHO não aparece no payload`; `payload não traz voto
  de outra unidade`; `ENCERRADA traz resultado e recusa voto`.
- [ ] **2. Ensaio sem esta migration** → falha.
- [ ] **3. Escrever a migration.**
- [ ] **4. Ensaio A1 + A2 + A3** → `TUDO OK`.
- [ ] **5. Commit** `feat(portal-cliente): leitura e voto de assembleia pelo condômino`.

**Pronto quando:** ensaio `TUDO OK`.

### Task A4: Serviço TS do gestor e tradução de erro

**Arquivos**
- Criar: `services/condominioAssembleiaService.ts`
- Teste: `__tests__/condominioAssembleiaService.test.ts`

**Consome:** RPCs da A2 e tabelas da A1.

**Produz**
- Tipos `StatusAssembleia`, `TipoItem`, `Quorum`, `ResultadoItem`, `Assembleia`,
  `ItemAssembleia`, `UnidadeNaAssembleia`, `VotoAssembleia`, `Apuracao`, `Retrato`
  (campos = colunas/JSON das A1–A2 em camelCase).
- `interface OperacoesAssembleia` — `convocar(id, corpoAviso)`, `cancelar(id, motivo,
  corpoAviso)`, `registrarPresenca(id, unitId, presenca, procurador?, procuracaoId?)`,
  `instalar(id, { convocacao, presidente, secretario, editalEntregue })`,
  `lancarVoto(itemId, unitId, opcao)`, `encerrar(id, deliberacoes, observacao)`,
  `vincularAta(id, documentoId)`, `apuracao(id): Promise<Apuracao>`,
  `carregar(id): Promise<{ assembleia, itens, unidades, votos }>`. **A fase B
  implementa a mesma interface para o síndico.**
- `export const operacoesDoGestor: OperacoesAssembleia`.
- `condominioAssembleiaService.listar(empreendimentoId)`, `.salvarRascunho(dados)`,
  `.salvarItens(assembleiaId, itens)`, `.excluirRascunho(id)`.
- `traduzirErroAssembleia(e: { code?: string; hint?: string; details?: string; message: string }): string`
  — `assembleia_travada` → 'Esta assembleia não aceita mais mudanças neste estado.';
  `unidade_impedida` → 'Unidade impedida de votar: ' + details; `sem_quorum_primeira`
  → 'Presentes não somam metade das frações: só é possível instalar em 2ª
  convocação.'; `antes_do_horario` → 'Ainda não chegou o horário desta convocação.';
  `opcao_invalida` → 'Opção de voto inválida para este item.'; `sem_direito_de_voto` →
  'Só o proprietário da unidade, com login próprio, pode votar.'; `42501` → 'Sem
  permissão neste condomínio.'; outro → `message`.

- [ ] **1. Teste**: um `it` por HINT acima com a frase exata, + `42501` e `desconhecido
  devolve message`.
- [ ] **2. Rodar** `npx vitest run __tests__/condominioAssembleiaService.test.ts` → falha.
- [ ] **3. Implementar.**
- [ ] **4. Rodar** → passa.
- [ ] **5. Commit** `feat(condominio): serviço de assembleias`.

### Task A5: Textos: convocação, edital e ata (modelo puro)

**Arquivos**
- Criar: `utils/assembleiaTextos.ts`
- Teste: `__tests__/assembleiaTextos.test.ts`

**Consome:** tipos da A4.

**Produz**
- `ASSUNTOS_COMUNS: { id, rotulo, quorum, tipo }[]` — Aprovar contas, Orçamento,
  Eleger síndico (ESCOLHA) → MAIORIA_PRESENTES; Obra útil → MAIORIA_ABSOLUTA;
  Destituir síndico → MAIORIA_ABSOLUTA; Obra voluptuária, Acréscimo às partes comuns,
  Alterar convenção, Mudar destinação → DOIS_TERCOS; Novo pavimento → UNANIMIDADE;
  Outro assunto → MAIORIA_PRESENTES.
- `ROTULO_QUORUM`, `ROTULO_RESULTADO`, `ROTULO_STATUS`, `ROTULO_OPCAO` ('SIM' → 'Sim',
  'NAO' → 'Não', 'ABSTENCAO' → 'Abstenção').
- `dataHoraBrasilia(iso: string): string` → `'10/12/2026 às 19:00'` (fuso
  `America/Sao_Paulo`).
- `textoConvocacao(a: Assembleia, itens: ItemAssembleia[], condominioNome: string): string`
  — tipo, datas da 1ª e 2ª, local, link, pauta numerada e o parágrafo fixo de
  instruções: "O voto pode ser dado pelo Portal do Cliente › Condomínio › Assembleias,
  com e-mail e senha, desde esta convocação até o encerramento da assembleia, e pode
  ser alterado até lá; vale o último voto registrado da unidade, pelo portal ou na
  reunião. A administração não responde por falhas de equipamento ou de conexão dos
  condôminos (CC art. 1.354-A §2º)."
- `textoCancelamento(a: Assembleia, motivo: string): string` — "A assembleia <tipo>
  <título> marcada para <data da 1ª> foi cancelada. Motivo: <motivo>."
- `montarEdital(a, itens, condominio: { nome; cnpj }): EditalModelo` e
  `montarAta(retrato: Retrato, a: Assembleia, condominio): AtaModelo` — seções da R9
  em ordem, peso em **% do total da assembleia** (`percentualDoTotal(fracao, total)`,
  exportada daqui: no Bella Vista a soma das frações é 0,01, então a fração crua em %
  daria 0,125% — o que importa é 12,5% = 1/8) e nº de unidades por opção.

- [ ] **1. Teste**: `dataHoraBrasilia('2026-12-10T22:00:00Z') === '10/12/2026 às
  19:00'`; `percentualDoTotal(0.00125, 0.01) === '12,50%'`; `textoConvocacao contém as duas datas, a pauta numerada e "art. 1.354-A"`;
  `montarAta lista presença com forma "procurador: <nome>"`; `montarAta traz
  "Quórum não atingido" e o quórum exigido`; `montarAta lista impedidas na
  instalação`; `anexo tem uma linha por unidade × item`; `ESCOLHA mostra a
  vencedora`.
- [ ] **2. Rodar** `npx vitest run __tests__/assembleiaTextos.test.ts` → falha.
- [ ] **3. Implementar.**
- [ ] **4. Rodar** → passa.
- [ ] **5. Commit** `feat(condominio): textos de convocação, edital e ata`.

### Task A6: PDF do edital e da ata

**Arquivos**
- Criar: `services/assembleiaPdf.ts` (molde `services/relatorioRateioPdf.ts`: paleta,
  cabeçalho de seção, rodapé em todas as páginas, `import()` dinâmico)

**Consome:** `EditalModelo`, `AtaModelo` (A5).

**Produz:** `baixarEditalPdf(m: EditalModelo): Promise<void>` (`doc.save`);
`gerarAtaPdf(m: AtaModelo): Promise<Blob>` (o chamador grava).

- [ ] **1. Implementar.** Ata termina com as linhas de assinatura de presidente e
  secretário; o anexo de votos vem depois, em página própria.
- [ ] **2. Conferir** gerando os dois PDFs na tela da A7 com a assembleia do ensaio
  local, e abrir: acentos certos, nenhuma tabela cortada, rodapé em todas as páginas.
- [ ] **3. Commit** `feat(condominio): PDF de edital e ata`.

### Task A7: App: aba Assembleias e tela da assembleia

**Arquivos**
- Criar: `components/condominio/AssembleiasTab.tsx` (lista StandardTable + ação
  "Nova assembleia")
- Criar: `components/condominio/AssembleiaSheet.tsx` (criar/editar rascunho e itens;
  assunto comum sugere quórum e tipo)
- Criar: `components/condominio/AssembleiaDetalheView.tsx` — props
  `{ assembleiaId, empreendimento, ops: OperacoesAssembleia, onVoltar }`; seções Pauta ·
  Unidades · Apuração ao vivo · Edital/Ata; ação do estado no título
- Modificar: `components/condominio/CondominioDetail.tsx` — `Aba` ganha
  `'assembleias'`; aba entre Financeiro e Comunicação (ícone `Vote` ou `Gavel` do
  lucide); `assembleiaAberta` com retorno antecipado igual ao `rateioAberto`
- Teste: `__tests__/assembleiaDetalheView.test.tsx`

**Consome:** A4 (`operacoesDoGestor`, `traduzirErroAssembleia`), A5, A6,
`condominioComunicacaoService.uploadDocumento`.

**Comportamento que o teste fixa**
- Lançar voto em unidade com voto PORTAL abre confirmação "Esta unidade votou <opção>
  pelo portal em <data>. Substituir?"; sem confirmar, `ops.lancarVoto` não é chamado.
- Instalar: caixa "Confirmo que o edital foi entregue a todas as unidades" obrigatória;
  opção 1ª convocação desligada com o motivo quando presentes < 50%.
- Encerrar → `ops.encerrar` → `gerarAtaPdf` → `uploadDocumento(File 'ata-<data>.pdf',
  { categoria 'ATA', visivel_portal: true, organization_id: orgDoCondominio(e) })` →
  `ops.vincularAta`. Falha no upload deixa o botão "Gerar ata novamente".
- Convocar mostra as unidades "fora da assembleia: sem fração ideal" e a antecedência
  em dias; envia `textoConvocacao(...)` como corpo do aviso. Depois de convocada, a
  seção Unidades mostra quantas leram o aviso (`_leituras` de
  `condominioComunicacaoService.listAvisos`, só informação).
- Presença por procurador: nome + arquivo obrigatórios; o arquivo sobe por
  `uploadDocumento(arquivo, { categoria: 'OUTRO', visivel_portal: false, titulo:
  'Procuração — <unidade> — <título da assembleia>' })` e o id vai em
  `ops.registrarPresenca(..., 'PROCURADOR', nome, documentoId)`.
- Cancelar pede motivo e envia `textoCancelamento(...)` como corpo do aviso.

- [ ] **1. Teste** (Testing Library, `ops` falso): `confirma antes de substituir voto
  do portal`; `não instala sem a caixa do edital`; `1ª convocação desligada diz o
  motivo`; `encerrar grava ata e vincula`; `upload falho mostra Gerar ata
  novamente`.
- [ ] **2. Rodar** `npx vitest run __tests__/assembleiaDetalheView.test.tsx` → falha.
- [ ] **3. Implementar** as três telas e a mudança no `CondominioDetail`.
- [ ] **4. Rodar** → passa; `npx vitest run __tests__/orgDoCondominioGuard.test.ts` →
  passa; `bash scripts/check-ui-standard.sh` nos 4 `.tsx` → 0.
- [ ] **5. Commit** `feat(condominio): aba Assembleias e condução pelo gestor`.

### Task A8: Portal do Cliente: sub-aba Assembleias e cédula

**Arquivos**
- Modificar: `services/clientPortalService.ts` — tipo `PortalAssembleia` (= payload da
  A3), `getAssembleiasByToken(token)`, `getAssembleiasForClient(clientId)` (erro →
  `[]` com `console.error`, como `getCondominioByToken`), `votarAssembleia(itemId,
  unitId, opcao)` (erro → lança com `traduzirErroAssembleia`)
- Criar: `components/client/AssembleiasCondominio.tsx` — lista; detalhe com link,
  pauta e **uma cédula por unidade**; encerrada mostra resultado, voto da unidade e
  "Baixar ata" (via `onResolverDocumento` já existente)
- Modificar: `components/client/CondominioTab.tsx` — `ABAS_CONDOMINIO` ganha
  `{ id: 'assembleias', label: 'Assembleias', curto: 'Assembleias' }` entre `avisos` e
  `documentos`; nova prop `assembleias` + `onVotar`
- Modificar: `components/ClientArea.tsx` — carrega assembleias junto com o condomínio,
  na mesma precedência (token manda; senão cliente logado)
- Teste: estender `__tests__/condominioPortalCliente.test.ts`

**Comportamento**
- Cédula desligada com motivo: `sessaoValida=false` → "Entre com e-mail e senha para
  votar."; `impedida` → o texto do banco; status ENCERRADA → "Votação encerrada.".
- Voto já dado aparece marcado com "votado em <data> (portal|na reunião)"; trocar pede
  confirmação.

- [ ] **1. Teste**: `resolverAba('assembleias') === 'assembleias'`; `cédula sem
  sessão desligada com o motivo`; `impedida mostra o motivo do banco`; `uma cédula por
  unidade do cliente`; `encerrada mostra resultado e Baixar ata`.
- [ ] **2. Rodar** `npx vitest run __tests__/condominioPortalCliente.test.ts` → falha.
- [ ] **3. Implementar.**
- [ ] **4. Rodar** → passa; `check-ui-standard.sh` nos `.tsx` alterados → 0.
- [ ] **5. Commit** `feat(portal-cliente): assembleias do condomínio e voto por unidade`.

### Task A10: Impedimento marcado à mão e aviso de cotas não conferidas

Decisão do usuário (26/11): hoje nenhum rateio do app tem cobrança gerada (0 itens com transaction_id; Bella Vista só tem rateios CANCELADO/RASCUNHO), então a regra automática de inadimplência (R3) não pega ninguém. Escolha: **aviso + marcar à mão**.

**O que muda**
- Banco (editar no lugar as migrations ainda não aplicadas — 860100 para o núcleo/gestor e 860200 para o portal; manter idempotência, REVOKE/GRANT, DEFINER + search_path):
  - `condominio_assembleia_unidades` ganha `impedimento_manual text` (motivo; NULL = sem marcação), `impedimento_manual_em timestamptz`; autoria vai em `condominio_assembleia_eventos` (evento `IMPEDIMENTO_MANUAL`, detalhe {motivo|null}).
  - `fn_assembleia_impedimento(p_assembleia uuid, p_unit uuid) RETURNS text` (revogada de todos): `coalesce(impedimento_manual, fn_assembleia_unidade_impedida(p_unit))`. **Toda** checagem de impedimento da assembleia passa a usar esta função (presença, voto presencial, voto do portal, quórum de instalação, `condominio_assembleia_impedimentos`, payload do portal). Nenhum lugar continua chamando só a regra automática.
  - `fn_assembleia_cotas_conferidas(p_empreendimento uuid) RETURNS boolean` (revogada de todos): existe ao menos um `condominio_rateio_itens` com `transaction_id` em rateio ≠ CANCELADO desse condomínio.
  - Núcleo `_assembleia_marcar_impedida(p_assembleia, p_unit, p_motivo text, p_ator, p_papel)`: FOR UPDATE primeiro; só CONVOCADA/INSTALADA; unidade na assembleia; `p_motivo` NULL desmarca, senão `btrim` não vazio (HINT `sem_motivo`); recusa marcar unidade que já tem voto PRESENCIAL lançado (HINT `tem_voto_presencial`)? — **não**: marcar impede ações futuras, voto já dado continua valendo (mesma regra do R3 "momento da checagem"). Invólucro do gestor `condominio_assembleia_marcar_impedida(p_assembleia, p_unit, p_motivo)` (membro da org, 42501; GRANT authenticated).
  - `condominio_assembleia_impedimentos` passa a devolver `[{ unitId, motivo, origem: 'MANUAL'|'AUTOMATICA' }]` e uma RPC nova `condominio_assembleia_cotas_conferidas(p_assembleia) RETURNS boolean` (membro, GRANT authenticated).
  - `_assembleia_instalar` grava em `quorum_instalacao` também `cotasConferidas` (boolean) e, em cada impedida, `origem`; o retrato herda.
- TS: `services/condominioAssembleiaService.ts` — tipos novos (`origem` nas impedidas, `cotasConferidas`), `OperacoesAssembleia.marcarImpedida(id, unitId, motivo|null)` e `.cotasConferidas(id): Promise<boolean>`; tradução dos HINTs novos.
- Tela (AssembleiaDetalheView + UnidadeSheet + ConducaoSheets): quando `cotasConferidas = false`, aviso (não bloqueia) nas gavetas Convocar e Instalar e no topo da seção Unidades: "Este condomínio não tem cotas cobradas pelo Òpura: a inadimplência não é conferida automaticamente. Marque à mão a unidade impedida." Na gaveta da unidade: "Marcar como impedida" com motivo obrigatório, e "Desmarcar"; a situação mostra "Impedida (marcada pelo gestor): <motivo>" × "Impedida: <motivo automático>".
- Textos/PDF (utils/assembleiaTextos.ts, services/assembleiaPdf.ts): a ata lista a origem de cada impedida; quando `cotasConferidas = false` na instalação, frase: "A inadimplência não foi conferida pelo sistema, porque o condomínio não tem cotas cobradas pelo Òpura; as unidades impedidas foram indicadas pelo gestor."
- Portal: nada novo na tela — o motivo manual chega como `impedida` pelo payload (já é texto).

**Testes**
- SQL (`scripts/teste-condominio-assembleias-conduzir.sql` e `-portal.sql`): `marcar impedida bloqueia presença e voto`; `voto dado antes de marcar continua valendo`; `desmarcar libera`; `motivo vazio recusado (sem_motivo)`; `não-membro 42501`; `cotas_conferidas false sem título / true com título`; `instalar grava cotasConferidas e origem`; `portal recebe o motivo manual em impedida`; `voto do portal recusado para unidade marcada`.
- Vitest: serviço (RPC e tradução), tela (aviso aparece com cotasConferidas=false; marcar exige motivo; situação com origem), textos/PDF (frase de não conferida; origem na lista de impedidas).

**Pronto quando:** os 3 ensaios SQL `TUDO OK`, Vitest verde, `check-ui-standard` 0 nos `.tsx` tocados, `npm run typecheck` 0.

### Task A9: Aplicar, publicar e provar de ponta a ponta

- [ ] **1.** Ensaio final A1+A2+A3 → `TUDO OK`; aplicar as 3 migrations em ordem com
  `db query -f`; rodar os 3 scripts de teste contra o banco aplicado → `TUDO OK`.
- [ ] **2.** `npx tsc --noEmit` e a suíte dos arquivos tocados verdes; PR; **todos** os
  jobs verdes; merge; `bash scripts/publicar-producao.sh` prova o SHA no domínio.
- [ ] **3. Prova em produção, condomínio de teste** (nunca o Bella Vista): criar
  "Teste Assembleia" com 2 unidades e frações, proprietário = um cliente cujo e-mail é
  de uma conta de teste convidada pelo Portal do Cliente. Gestor convoca → aviso no
  mural → cliente logado vota → gestor instala em 2ª, registra presença da outra
  unidade por procurador, lança voto, substitui o voto do portal com confirmação →
  encerra → ata em Documentos e no portal. Print de cada passo.
- [ ] **4.** Excluir o condomínio de teste e o cliente de teste **por script como postgres**, desligando a trava só nessa transação (decisão 26/11).

**Pronto (fase A):** os 4 passos feitos. **Fase A só fecha de verdade** quando a
assembleia real do Bella Vista acontecer pelo app (pré-requisitos operacionais acima).

---

### Task B1: Banco: porta do síndico

**Arquivos**
- Criar: `supabase/migrations/aplicar_<prefixo livre>_condominio_assembleias_sindico.sql`
- Teste: `scripts/teste-condominio-assembleias-sindico.sql`

**Consome:** núcleo `_assembleia_*` (A2), `fn_sindico_resolver(token, client, modo)`.

**Produz:** `sindico_portal_assembleia_<acao>(p_token text, p_client_id uuid, …mesmos
parâmetros do invólucro do gestor…)` para criar/editar rascunho e itens, convocar,
cancelar, registrar presença, instalar, lançar voto, encerrar, vincular ata, apuração e
listar/carregar. Cada um: `fn_sindico_resolver(p_token, p_client_id, 'sessao')` (login
+ mandato vigente), confere que a assembleia é de um prédio do síndico, chama o núcleo
com `auth.uid(), 'SINDICO'`. Rascunho/itens passam por funções DEFINER próprias (o
síndico não é membro da org; RLS não serve). **Upload de ata e procuração (decisão 26/11):** Edge Function NOVA `supabase/functions/sindico-portal-documentos/index.ts`
(FormData: `token?`, `clientId?`, `empreendimentoId`, `categoria` ATA|OUTRO, `titulo`, `visivelPortal`, `file`).
Autoriza pelo MESMO caminho do `sindico-portal-financeiro` (sessão do síndico com mandato vigente daquele
condomínio — conferido no código: `exigirUsuario` + `fn_sindico_resolver(...,'sessao')`; nunca só o gateway,
REGRA #7 p3), grava no bucket `condominio-documentos` em `{org do condomínio}/{empreendimento}/{uuid}.{ext}`
(mesmos MIME e teto de `condominioComunicacaoService`), cria a linha em `condominio_documentos` com
service_role e devolve `{ documentoId }`. Recusa e apaga o arquivo se a linha falhar.

**Leituras que a tela da assembleia faz por fora de `ops` (A7)** — unidades do condomínio sem fração
(lista "fora" antes de convocar) e leituras do aviso (`_leituras`) — ganham RPCs do síndico:
`sindico_portal_assembleia_unidades_fora(p_token, p_client_id, p_assembleia)` e
`sindico_portal_assembleia_leituras(p_token, p_client_id, p_assembleia) RETURNS int`. Também
`sindico_portal_assembleia_impedimentos`, `_marcar_impedida` e `_cotas_conferidas` (A10).

- [x] **1. Teste**: `síndico logado convoca e encerra`; `síndico só por link (sem
  sessão) recusado`; `mandato vencido recusado`; `síndico de outro prédio recusado`;
  `evento registra papel SINDICO`; `gestor e síndico na mesma assembleia: segundo
  Encerrar recebe assembleia_travada`.
- [x] **2–4.** Ensaio sem → falha; migration; ensaio com → `TUDO OK`.
- [x] **5. Commit** `feat(portal-sindico): síndico conduz assembleia`.

**Execução (26/11):** migration `aplicar_20271126860000_condominio_assembleias_sindico.sql`
(NÃO aplicada — fica para a B3), prova `scripts/teste-condominio-assembleias-sindico.sql`,
Edge Function `sindico-portal-documentos` (NÃO publicada) com regras puras em `regras.ts`
(`__tests__/sindicoPortalDocumentosRegras.test.ts`). Desvio do texto acima, de propósito:
o **ator** do síndico passado ao núcleo é o `client_id` dele (devolvido pelo resolvedor em
modo 'sessao'), não o `auth.uid()` — o retrato da A2 busca o nome de quem instalou em
`clients` quando o papel é SINDICO; com o `auth.uid()` a ata sairia "pelo síndico", sem o
nome. Erros da porta: 42501 com HINT `sindico_sem_sessao` | `sindico_sem_acesso` |
`sindico_fora_do_mandato` (frases em `FRASE_DO_HINT`). A 2ª chamada de Encerrar recebe
`estado` ("já foi encerrada") — o núcleo confere o estado antes da trava.

### Task B2: Portal do Síndico: aba Assembleias

**Arquivos**
- Modificar: `services/sindicoPortalService.ts` — `operacoesDoSindico(token, clientId): OperacoesAssembleia`
- Modificar: `services/condominioAssembleiaService.ts` — `OperacoesAssembleia` ganha `unidadesFora(id)`, `leiturasDoAviso(id)` e `enviarDocumento(id, arquivo, { categoria, titulo, visivelPortal }): Promise<{ documentoId }>`; `operacoesDoGestor` implementa com o que a A7 já usa
- Modificar: `components/condominio/AssembleiaDetalheView.tsx` (+ `assembleia/*`) — passa a usar só `ops` para essas três coisas (nenhuma chamada direta a `condominioComunicacaoService`/`empreendimentoService` na tela da assembleia); testes da A7 seguem verdes
- Criar: `components/sindico/PainelAssembleiasDoSindico.tsx` — lista + Sheet de
  rascunho + `AssembleiaDetalheView` com `ops = operacoesDoSindico(...)` (a mesma tela
  da A7, sem cópia)
- Modificar: `components/sindico/SindicoPortal.tsx` — aba "Assembleias"
- Teste: `__tests__/sindicoAssembleias.test.tsx` — `sem sessão mostra "Entre com
  e-mail e senha para conduzir a assembleia"`; `usa operacoesDoSindico`.

- [x] **1–4.** Teste → falha → implementar → passa; `check-ui-standard.sh` → 0.
- [x] **5. Commit** `feat(portal-sindico): aba Assembleias`.

**Execução (26/11):** a porta da tela é uma só — `OperacoesAssembleia` ganhou também
`listar`/`salvarRascunho`/`salvarItens`/`excluirRascunho` (a lista e a gaveta de rascunho
passam a receber `ops`, sem cópia) e `abrirDocumento(id, documentoId)` (o "Abrir ata" também
lia o serviço por fora), além de `unidadesFora`, `leiturasDoAviso` e `enviarDocumento`. A
condução do gestor e a do síndico saem do mesmo `conducaoPorRpc(prefixo, identidade)` — as
RPCs têm os mesmos parâmetros, só muda o prefixo e a identidade. O gestor resolve o condomínio
pela assembleia (`condominio_assembleias.empreendimento_id`) e sobe com
`orgDoCondominio(empreendimentos)`; o síndico sobe pela `sindico-portal-documentos`. A tela fixa
a natureza do documento: ata = ATA visível no portal; procuração = OUTRO, **nunca** visível
no portal. A tela recebe só `CondominioDaAssembleia` (id, nome, código, razão social, CNPJ) —
o Portal do Síndico monta isso do payload dele. Aba "Assembleias" entre Avisos e Documentos
(convocar publica o aviso; a ata cai em Documentos). Sem sessão (link) a aba diz "Entre com
e-mail e senha para conduzir a assembleia" e não chama o banco; a administradora (portal pelo
app) é mandada para a tela do gestor. Catraca nova no teste da A7: a tela, a gaveta e a lista
não chamam `condominioComunicacaoService`/`empreendimentoService`/`supabase` por fora de `ops`.

### Task B3: Aplicar, publicar e provar

- [ ] **1.** Ensaio, aplicar, scripts `TUDO OK`; PR com todos os jobs verdes; merge;
  prova do SHA.
- [ ] **2.** Síndica do Bella Vista convidada ao Portal do Síndico (pré-requisito).
- [ ] **3. Prova:** com a conta de teste como síndica do condomínio de teste, criar,
  convocar, instalar e encerrar pelo Portal do Síndico; ata igual à da fase A.

**Pronto (fase B):** os 3 passos feitos.

## Estado

- [x] Desenho aprovado pelo usuário (25/11/2026)
- [ ] Fase A: 0 de 9
- [ ] Fase B: 2 de 3 (B1 e B2 commitadas; migration e function ainda não aplicadas/publicadas)
