# Imovib para o investidor — relatório PDF e dashboard

## Pedido original

> O resultado do Imovib deve ser mostrado para o investidor em formado de relatorio pdf e em dashboard.
> Faço um plano para isso.
> referencia para o dashboard: https://www.instagram.com/reel/Dfj_FGsTAVB/?utm_source=ig_web_copy_link&dlrf=NTc4MTIwNjQ2YQ==
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-15

Respostas do usuário (15/11):

| Pergunta | Resposta |
|---|---|
| Por onde chega ao investidor | **Oportunidade publicada** (Portal do Investidor › Oportunidades) |
| Que números ele vê | **Versão congelada publicada** — editar o estudo não muda o que ele recebeu |
| Visual | **Referência com a cor do portal** (vidro fosco, brilho, hover; paleta coral do PortalKit) |
| PDF | **Relatório completo + gráficos** (as 12 seções de hoje, com capa e gráficos) |

A referência (reel de code.xr, "Glassy Dashboard": glassmorphism, acentos luminosos, hover animado, responsivo, gráficos interativos) foi lida só pela legenda — o Instagram pede login para o vídeo.

## Estado (16/11/2026)

**Implementação: concluída e no ar.** Produção conferida de fora em 15/11: o domínio serve `8a6f581` (= `origin/main`)
e os textos novos de cada fase estão nos arquivos servidos.

| Fase | O quê | PR | No main | Migration |
|---|---|---|---|---|
| 1 | Versão congelada guarda as listas do relatório | #476 | `e6bee0b8` | — |
| 2 | Oportunidade publica uma versão; portal lê a versão | #478 | `da11a75c` | `aplicar_20271115960000` ✅ aplicada |
| 3 | Relatório completo com capa e gráficos | #482 | `12bbbab7` | — |
| 4–5 | Painel de vidro no portal; conferências | #483 | `9fa883a0` | `aplicar_20271115970000` ✅ aplicada (revisão) |
| Revisão | Listas recortadas, leitura pela oportunidade, prévia = portal, logo | #483 | `9fa883a0` | (a de cima) |
| 6 | Números congelados na versão | #484 | `8a6f581d` | `aplicar_20271115980000` ✅ aplicada |

Itens do plano: **todos marcados**, nenhum `[ ]` em aberto.

### Pendências

**Conferência com dado real (depende do usuário)**
- [ ] Congelar uma versão do Garden Cambuhy (Imovib › Versões) e publicá-la numa oportunidade (Portal do Investidor ›
  Oportunidades › Editar › "Versão que o investidor vê"). Em 15/11 o banco tinha **0 versões e 0 oportunidades com estudo**:
  o painel foi conferido num harness com o estudo de teste, o PDF no Garden com escritas bloqueadas e o portal por
  transações desfeitas — o caminho completo com uma versão real ainda não rodou.

**Fora do pedido, registradas e não consertadas (conferidas pelas policies)**
- [ ] Data Room pelo link fica vazio em silêncio (`opportunity_documents` só tem policy de membro da organização).
- [ ] Investidor que entra por e-mail não vê oportunidades (`investor_opportunities`/`imovib_study_versions` idem).

**Limpeza (precisa de migration — só com OK)**
- [ ] Remover `fn_investor_portal_get_study(token, estudo)`: ficou só para o app publicado antes do #483, que já saiu
  do ar; hoje ela só delega para `fn_investor_portal_get_versao`.

**Minors (visuais, não feitos)**
- [ ] Celular: no gráfico de cenários o valor negativo encosta no rótulo; os valores do eixo do tornado ficam apertados.
- [ ] PDF: o maior valor do eixo do gráfico de vendas quebra em duas linhas ("340 / mil"); o quadradinho da legenda
  HTML sai um pouco acima do texto na captura.
- [ ] Gerar o relatório completo leva ~10 s (o botão mostra "Gerando...").

**Fora do plano, achado ao fechar a frente (16/11):** o `node_modules` do checkout de integração estava vazio desde
15/11 19:17 (outra sessão); reinstalado com `npm ci` a pedido do usuário (735 pacotes, 108 executáveis).

## Fase 7 — Resolver as pendências (pedido de 16/11)

> rsolver pendencias
>
> Respostas (16/11): conferência com dado real → **"Pode fazer você"** (congelo uma versão do Garden, publico uma
> oportunidade de teste, confiro, despublico; a versão fica no histórico). Data Room → **"Sim, eu publico a função"**
> (o usuário roda o `functions deploy`).
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-16

- [x] Login do investidor por e-mail abre a casca do link (padrão de Cliente/Fornecedor/Corretor/Síndico):
  `portal_token_para_mim('investidor')`; `validateAccess` por ela (o e-mail reservado `financeiro@` segue como está);
  `InvestorPortalTokenGate` com `onLogout` ("Sair" no menu da conta e em "Mais opções"; a faixa "Acesso via link
  público" só no link). **Pronto quando:** teste de `validateAccess` e da casca com `onLogout`; prova da RPC em transação
  desfeita (investidor com e-mail → token criado/renovado; sem cadastro → `nao_cadastrado`).
- [x] Data Room pelo link: `fn_investor_portal_get_dataroom(token, oportunidade)` (oportunidade publicada da org do
  token) + Edge Function `investor-portal-dataroom-download` (mesma RPC com a credencial do chamador; só assina o que
  está na lista; service_role só para assinar) + `DataRoomPanel` em modo portal. **Pronto quando:** testes do serviço
  e do painel; prova da RPC; função publicada pelo usuário e sonda HTTP (token inválido → 403).
- [x] Remover `fn_investor_portal_get_study` (compatibilidade, já sem chamador). **Pronto quando:** `git grep` sem
  chamada no front; prova `DROP` em transação desfeita.
- [x] Minors: cenário negativo no celular (valor à direita do zero), eixo do tornado no celular (compacto), eixo do
  gráfico de vendas no PDF (mais largo), legenda na captura (em SVG no PDF; a HTML do chartKit não mudou).
- Prova no banco (16/11, transação desfeita): `[1 situacao=ok token_gravado=1] [1b mesmo token=t] [1c nao_cadastrado] [2 valid=true docs=1 nome=Matricula.pdf] [2b rascunho: forbidden] [2c token inválido: unauthorized] [3 get_study existe=f]` (a foto da oportunidade fica fora do Data Room). Testes: `validateAccessPortais` (6, 7), `DataRoomPanelPortal` (3), `InvestorDashboardSair` (2); suítes 136 arquivos, 1109/1109; tsc sem erro. Celular e PDF conferidos no navegador (cenários, tornado, eixo de vendas, legenda).
- [x] Migration `aplicar_20271116100000_investidor_login_email_e_dataroom.sql` aplicada (com OK, 16/11) e Edge Function `investor-portal-dataroom-download` publicada pelo usuário (16/11). Sonda de fora: sem chave → 401; chave pública + token inválido → 403 `unauthorized`; corpo vazio → 400.
- [x] **Pedido de 16/11, durante a conferência:** *"em minha organização > investidor : existe abaixo de organizações um checkbox chamado Disponível em todas as organizações. Então todas as oprtunidades de todas as organizacoes deveriam estar disponiveis para o investido Tiago"*. Migration `aplicar_20271116200000_investidor_oportunidades_das_orgs.sql`: lista de oportunidades, versão publicada, Data Room e "Manifestar interesse" passam a aceitar oportunidade de qualquer organização do investidor (`fn_orgs_do_investidor`, como resumo/obras/SPEs já faziam desde o #316); estudo, capa e documentos são os da organização da OPORTUNIDADE; o interesse é gravado na organização da oportunidade (antes ia para a do link). Prova em transação desfeita: `[1 Tiago vê a da SPE=t] [2 versao=PROVA ORGS capa=Construção do Edifício Garden Cambuhy SPE] [3 dataroom valid=true docs=1] [4 interesse na SPE=t] [5 não compartilhado vê a da SPE=f] [6 não compartilhado abre a versão: forbidden]`.
- [x] **Achado da conferência:** pelo LINK, a aba Oportunidades (`PortalOpportunities`) era uma lista que só expandia — o painel, o PDF e o Data Room moravam no `OpportunityDetail`, que só o app interno abria. Agora a linha expandida tem **"Ver viabilidade"** (com estudo) e **"Documentos"**, que abrem `PortalOportunidadeDetalhe` abaixo da lista (não em tela cheia), com abas Viabilidade e Documentos. Teste `PortalOportunidadeDetalhe.test.tsx` (4).
- [x] **Conferência com dado real (16/11), app da frente contra o banco de produção, link real do Tiago (escritas bloqueadas):** versão "Conferência do portal" do Garden gravada (montada com o código do congelamento, cálculo congelado; 1 linha), oportunidade de teste publicada na SPE, documento no Data Room (`relatorio-viabilidade-conferencia.pdf`, 553.874 bytes). Resultado: oportunidade na lista do Tiago (é da SPE; ele é da Alpa, compartilhado); painel com a versão e os números do Garden (VPL R$ 706.968, TIR 19% a.a., margem 20,41%, exposição R$ 6.059.583 no mês 28); PDF do investidor em 2,7 s, 525 KB, 13 páginas, capa da SPE, sem parecer/critérios/fontes; Data Room: função 200, link assinado, arquivo baixado com os mesmos 553.874 bytes; 0 erros.
- [ ] Depois do merge: conferir em produção e **despublicar** a oportunidade de teste (a versão "Conferência do portal" fica no histórico do Garden; o documento fica no Data Room da oportunidade despublicada).
- ~~Conferência com dado real (depois do deploy): congelar versão do Garden, oportunidade de teste publicada,
  painel e PDF pelo link do portal; despublicar no fim.~~ → feita (acima).

## Contexto — o que já existe (origin/main, 15/11)

- **Caminho até o investidor:** `investor_opportunities.imovib_study_id` → `components/investor/OpportunityDetail.tsx` (aba "Viabilidade & Investimento", `:600`) carrega o estudo **vivo** por `investorPortalTokenService.getStudyByToken` → RPC `fn_investor_portal_get_study` (vigente em `aplicar_20271112980000_imovib_governanca_pendencias.sql:116`, já tira parecer, hurdles e `premise_notes`). Mostra KPIs, `LineChart` do fluxo, `PieChart` do capital, cenários e sliders (VGV/custo/prazo). Visual azul/índigo, fora do PortalKit.
- **PDF:** "Relatório completo" = `secoesDoRelatorio(DadosDoRelatorio)` (`utils/imovibRelatorio.ts`, puro, 12 seções) + `pdfDoRelatorio` (`utils/imovibRelatorioPdf.ts`, jsPDF + autotable). **Sem gráficos, sem capa visual.** `DadosDoRelatorio = { study, comparaveis, riscos, cenarios, dueDiligence, socios, hoje }`.
- **Versões:** `imovib_study_versions` (imutável; `snapshot` = estudo carregado + `cenarios`; `results` = `ResultadosDaVersao`). `imovibService.congelarVersao` (`services/imovibService.ts:922`). **O snapshot não guarda comparáveis, riscos, due diligence nem sócios.**
- **Gráficos do Imovib:** nenhum é de props puras (Curva S inline em `ImovibExecutiveSummary.tsx:487-534`; tornado em `ImovibTornadoCard`; capital/cenários inline em `OpportunityDetail`). Cálculos puros existem: `computeImovibMath`, `calcularIndicadores`, `tornado()`, `composicaoDoCapital`, `marcosDoEstudo`.
- **Imagem em PDF:** padrão `utils/opuraMarketRelatorioPdf.ts:25-48` (html2canvas com folhas oklch desligadas) e `utils/html2canvasCores.ts`.
- **Portal:** §24 do guia (`docs/ui_ux_guia_unificado.md:3190`) — kit `components/portal/PortalKit.tsx` (`P`, `PortalCard`, `KpiStrip`, coral `#E1553C`); gestor vê com `accent='indigo'`.
- **Banco hoje (lido em 15/11):** 6 oportunidades, **0** com estudo; **0** versões congeladas → exigir versão para publicar não quebra nada existente.

## Decisões de desenho (baratas de mudar antes da fase)

1. **Uma fonte só para PDF e dashboard: a versão publicada.** A versão passa a guardar tudo o que o relatório lê (comparáveis, riscos, due diligence, sócios, além dos cenários). O PDF é gerado no navegador a partir dela — no app (gestor) e no portal (investidor) sai o MESMO documento. Sem upload, sem bucket, sem Edge Function.
2. **Edição do investidor** do relatório completo: as 12 seções, menos o que a RPC já trata como interno (parecer, critérios/hurdles, notas de fonte das premissas). A capa vira capa visual (logo e nome da organização, nome do estudo, versão e data, 4 KPIs).
3. **`fn_investor_portal_get_study` passa a servir a versão publicada** (mesma assinatura): o portal deixa de enxergar o estudo vivo — senão a versão seria contornável chamando a RPC.
4. Sliders de simulação continuam no dashboard, rotulados "Simulação — não altera a versão publicada".

---

## Fase 1 — Versão congelada completa

- [x] `congelarVersao` grava no snapshot `relatorio: { comparaveis, riscos, dueDiligence, socios }` (lidos com os serviços que o "Relatório completo" já usa em `ImovibExecutiveSummary.tsx:245-265`).
- [x] `utils/imovibVersoes.ts`: `dadosDoRelatorioDaVersao(snapshot, versao): DadosDoRelatorio` (puro; `hoje` = data da versão; versão sem `relatorio` → listas vazias, cada seção sai com a frase de vazio).
- [x] Aba Versões: botão "Relatório da versão (PDF)" por linha — sai hoje com o PDF de texto e tabelas; a Fase 3 acrescenta capa e gráficos. A capa ainda diz "Relatório gerado em <data da versão>": a Fase 3 troca por "Versão <nome> · congelada em <data>".
- **Pronto quando:** teste do serviço prova o snapshot com as 4 listas; teste puro de `dadosDoRelatorioDaVersao` (com e sem `relatorio`); `secoesDoRelatorio(dadosDoRelatorioDaVersao(...))` = `secoesDoRelatorio` do estudo ao vivo no mesmo instante.

## Fase 2 — Publicar uma versão na oportunidade (migration — aplicar só com OK)

- [x] Migration `aplicar_20271115960000_investidor_versao_publicada.sql` (escrita; **aplicar com OK** antes do merge — o front lê a coluna nova) (conferir prefixo com TODOS os nomes, não `ls|tail`):
  - `investor_opportunities.imovib_version_id uuid REFERENCES imovib_study_versions(id) ON DELETE RESTRICT`;
  - gatilho BEFORE INSERT/UPDATE: versão pertence ao `imovib_study_id`; oportunidade publicada com estudo exige versão (mensagem em português); função com `REVOKE … FROM PUBLIC, anon, authenticated`;
  - `CREATE OR REPLACE fn_investor_portal_get_study(p_token, p_study_id)`: mesmas checagens de token/oportunidade publicada; devolve `snapshot` da versão publicada menos as chaves internas (lista atual + `premise_notes`), `relatorio` (as 4 listas), `versao {label, created_at}`, `organizacao {name, logo_url}`. Mantém `REVOKE PUBLIC` + `GRANT anon, authenticated` (REGRA #7, perguntas 1 e 2).
- [x] `OpportunityForm.tsx` (`:325`): depois do estudo, seletor "Versão publicada" (versões do estudo, mais nova primeiro, com data). Publicar com estudo e sem versão: botão desligado com o motivo no `title`.
- [x] `OpportunityDetail` no modo gestor lê a mesma versão (`imovibService.snapshotDaVersao`) — prévia igual ao que o investidor vê.
- [x] Aba Versões do Imovib: coluna "Para o investidor" ("Publicada em X" / "Escolhida em X (rascunho)").
- Também: a lista de oportunidades diz o motivo e abre o editor ao publicar sem versão, e o erro de publicar aparece (antes ia só para o console); `montarEstudoDoPortal` saiu (o snapshot já vem montado).
- **Prova (15/11, transação desfeita, como `postgres` e `anon`):** os 6 casos passaram — publicar sem versão recusa; versão de outro estudo recusa; rascunho sem versão e publicação com versão passam; RPC pelo link devolve versão, organização, cenários e riscos sem nenhuma chave interna; `anon` com token inválido → `unauthorized`, com token válido → `valid`; tirar o estudo limpa a versão. A coluna não ficou no banco (ROLLBACK).
- **Pronto quando:** prova no banco em transação desfeita (`BEGIN … RAISE EXCEPTION 'PROVA' … ROLLBACK`): publicar sem versão recusa; versão de outro estudo recusa; RPC com token devolve a versão sem `recommendation`/`hurdle_*`/`premise_notes`; RPC chamada com `anon` sem token válido → `unauthorized`. `__tests__/segurancaMigrations.test.ts` verde.

## Fase 3 — Gráficos de props puras + PDF com capa e gráficos

- [x] ~~`components/imovib/graficos/`~~ → `components/ImovibGraficos.tsx` + dados em `utils/imovibGraficos.ts` (decisão: os componentes do Imovib moram soltos em `components/` com o prefixo; seguir o padrão). Props puras, `animado?: boolean`, tamanho fixo opcional): `GraficoCurvaS` (fluxo líquido + acumulado/exposição), `GraficoComposicaoDoCapital`, `GraficoCenarios`, `GraficoTornado`, `GraficoCurvaDeVendas`, `LinhaDoTempoDosMarcos`. As telas atuais (Resumo Executivo, Tornado, OpportunityDetail) passam a usá-los — sem mudança visual no app. §28 do guia (cromo, rótulo, paleta validada, vazio próprio).
- [x] `components/ImovibGraficosParaPdf.tsx` (JSX; `utils/` não tem `.tsx`): monta os gráficos fora da tela (contêiner oculto, `animado={false}`), captura com html2canvas + `coresCompativeisNaCopia`, devolve `Record<GraficoId, dataURL>`.
- [x] `utils/imovibRelatorio.ts`: opção `edicao: 'interna' | 'investidor'` (investidor: sem parecer/critérios; capa com organização e versão); cada seção declara `graficos: GraficoId[]` (indicadores → Curva S; fluxo → Curva S anual; sensibilidade → tornado + cenários; cronograma → marcos + curva de vendas; capital → composição).
- [x] `utils/imovibRelatorioPdf.ts`: capa visual (logo via `logoComoDataUrl` de `services/docGen`, título, versão/data, 4 KPIs em grade) e imagens de gráfico na seção, com quebra de página que não corta imagem.
- [x] O "Relatório completo" do Resumo Executivo também ganha capa e gráficos (edição interna); a aba Versões também (`gerarRelatorioCompleto`).
- Decisões tomadas na execução:
  - sem cenário salvo, a seção de sensibilidade não fica vazia: diz "Sem cenários salvos" e mantém o **tornado** (ele não depende de cenário);
  - **uma captura só** (html2canvas copia a página inteira a cada chamada) e cada gráfico é recortado dela, em **JPEG**; a logo é reduzida a 480 px e o PNG vai com compressão. Medido no Garden: 47 s / 40 MB → **10,4 s / 556 KB**;
  - logo sobre fundo branco na faixa escura (logo feita para papel sumia);
  - legenda da Curva S na cor de texto (§28.3) e eixo mais largo no PDF;
  - `logoComoDataUrl` mudou de `services/docGen/previa.ts` para `utils/logoComoDataUrl.ts` (reexportada lá): importar de `previa` trazia o pdfmake para o relatório.
- Minors (registrados, não feitos): no gráfico de vendas o maior valor do eixo quebra em duas linhas ("340 / mil"); a legenda HTML do chartKit sai com o quadradinho um pouco acima do texto na captura; gerar leva ~10 s (botão mostra "Gerando...").
- **Pronto quando:** testes puros das seções (edição investidor não contém "Parecer"/hurdles; cada seção lista seus gráficos); teste dos componentes de gráfico com dado e vazio; PDF real gerado no navegador do Garden aberto e conferido página a página (capa, gráficos nítidos, nenhum corte).

## Fase 4 — Dashboard do investidor (referência, cor do portal)

- [x] `components/investor/portal/ImovibPainelDoInvestidor.tsx` (props: estudo da versão, `versao`, `organizacao`, `accent`), substituindo o conteúdo da aba "Viabilidade & Investimento" do `OpportunityDetail`:
  - faixa da versão ("Versão <label> · <data>") + botão "Baixar relatório (PDF)" (edição investidor, Fase 3);
  - 4 KPIs principais (VPL, TIR a.a., margem líquida, exposição máxima) + 4 de apoio (VGV, lucro, payback, múltiplo);
  - Curva S / exposição, composição do capital, cenários, sensibilidade (tornado), linha do tempo dos marcos, curva de vendas;
  - simuladores atuais (VGV/custo/prazo) num card "Simulação — não altera a versão publicada".
- [x] Visual da referência no vocabulário do portal: cards de vidro (`bg-white/60 backdrop-blur`, borda branca translúcida, sombra com brilho coral `P`), hover que levanta e acende, entrada suave; `prefers-reduced-motion` desliga animação; sem `dark:` (§33); responsivo até 390 px.
- [x] Guia: nova subseção no §24 (§24.1, "painel de vidro do investidor") — padrão que o guia não cobre vira seção (REGRA #1, item 4).
- Feito: a aba mostra o painel quando há estudo (sem estudo, o bloco antigo); o "Sensibilidade" digitado na oportunidade só aparece sem estudo. Conferido num harness na largura da aba (976 px) em 1600 px e 390 px: sem rolagem horizontal, 0 erros; correções da conferência — indicadores em uma coluna no celular, rótulos de eixo menores, marcos em lista, legenda do capital na cor de texto, eixo do tornado com margem.
- **Pronto quando:** testes do painel (KPIs batem com `ResultadosDaVersao` da versão; simulação não muda a faixa da versão; botão PDF chama a edição investidor); `check-ui-standard.sh` nos `.tsx` tocados; navegador: link de portal com token de teste em 1600 px e 390 px, prints conferidos; 0 erros de console.

## Fase 5 — Conferências e pendências vizinhas (só registrar, não consertar sem pedido)

- [x] Conferir se o **Data Room** abre no portal por link (lê `opportunity_documents` direto → provável lista vazia em silêncio, ver memória "portal lendo tabela direto").
- [x] Conferir se o **investidor logado por e-mail** (sem token) consegue ler oportunidade/versão (lê por RLS de membro da org).
- Registrar o resultado em "Pendências" deste plano.

## Fase 6 — Números congelados na versão (pedido de 15/11)

> Uma decisão sua: 1. Pergunta: O problema pode ser corrigido criando historico de versões?
>
> (resposta: o histórico já existe; o que resolve é a versão guardar também o RESULTADO do cálculo e o painel/PDF lerem dele — "Quer que eu faça?") → "1. Quer que eu faça? sim"
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-15

- [x] `utils/imovibCalculoDaVersao.ts`: `calculoDaVersao(dados, versao)` → `{ versaoDoCalculo, investidor: { capa, secoes, indicadores, graficos }, interno: { secoes } }`, já como volta do banco (NaN → null). `indicadoresDoEstudo` e `graficosDoEstudo` são os mesmos cálculos que a tela faz ao vivo.
- [x] `congelarVersao` grava `snapshot.calculo` (import dinâmico do cálculo).
- [x] Painel lê `versaoPublicada.calculo` (indicadores e gráficos); sem ele (prévia, versão anterior) calcula na hora. A simulação continua calculando, de propósito.
- [x] PDF: `gerarRelatorioCompleto(..., { congelado })` usa seções, capa e gráficos guardados — o motor não roda; aba Versões usa a edição interna congelada, o painel a do investidor (`congeladoDaVersao`).
- [x] Migration `aplicar_20271115980000_investidor_calculo_congelado.sql`: `calculo` sai de `study` e só `calculo.investidor` vai ao portal, em chave própria (sem ela o `interno`, com o parecer, iria dentro de `study`). **Aplicar ANTES do merge da Fase 6.**
- **Pronto quando:** `ImovibNumerosCongelados.test.tsx` (um cálculo "impossível" — VPL 123.456 — aparece igual no painel, no PDF e no portal; a edição interna não entra no recorte do investidor), `imovibCalculoDaVersao.test.ts` (cálculo = o da tela; sobrevive ao JSON), contrato da RPC; prova no banco em transação desfeita: `[vpl congelado=123456] [secao=SECAO DO INVESTIDOR] [study tem calculo=f] [resposta cita o interno=f]`.
- Decisão: o `results` (ResultadosDaVersao) que a aba Versões compara continua como era; agora é o mesmo número que o painel mostra (ambos do congelamento).
- Não conferido de ponta a ponta: congelar uma versão de verdade grava no banco (há 0 versões); depende de o usuário congelar uma.

## Revisão independente das Fases 2–5 (15/11)

Sem Critical. Corrigido (testes RED→GREEN; migration `aplicar_20271115970000_investidor_versao_por_oportunidade.sql`,
provada em transação desfeita — **aplicar com OK**):

- [x] **Important** — a RPC mandava as listas do relatório inteiras (notas e vínculo dos sócios, notas e fonte dos
  comparáveis, responsável do risco, quem conferiu a due diligence). Agora cada lista vai só com os campos do relatório
  (`CAMPOS_PARA_O_INVESTIDOR`, igual no banco e no front).
- [x] **Important** — a prévia do gestor não tirava as chaves internas (o PDF baixado nela levaria as fontes das premissas);
  e no portal a edição do investidor dizia "N de N premissas sem fonte". `versaoPublicadaDoSnapshot` faz o mesmo recorte
  da RPC; a edição do investidor sai sem as colunas Fonte/Data e sem a contagem.
- [x] **Important** — duas oportunidades publicadas do mesmo estudo: o investidor via a versão da mais nova. Nova
  `fn_investor_portal_get_versao(token, oportunidade)`; a antiga (por estudo) delega para ela, até o app novo estar no ar.
- [x] Minor — estudo de outra organização: gatilho e RPC conferem que o estudo é da organização da oportunidade/do link.
- [x] Minor — falha na captura (ou num gráfico) derrubava o PDF: sai só com texto e tabelas.
- [x] Minor — aba em segundo plano pausava a geração (`requestAnimationFrame`): `setTimeout` de 50 ms como alternativa.
- [x] Minor — datas da versão em UTC (congelada depois das 21h aparecia no dia seguinte): `utils/dataDeBrasilia.ts`.
- [x] Minor — prévia sem versão dizia "nenhum cenário": usa os cenários do estudo atual; erro ao ler as versões no
  formulário dizia "não tem versão": diz que não leu.
- Pergunta do usuário (15/11): "O problema pode ser corrigido criando histórico de versões?" — resposta: o histórico já existe (versões imutáveis); o que resolve é congelar também o RESULTADO do cálculo (indicadores, fluxo, tornado, cenários, vendas) na versão e o painel/PDF lerem dele. Oferecido como próximo passo, aguardando decisão.
- ~~Ruling: **os números são recalculados pelo motor atual sobre o snapshot**~~ → resolvido na Fase 6 (números congelados).
- (histórico) Ruling: **os números são recalculados pelo motor atual sobre o snapshot**, não lidos do `results` congelado — assim
  indicadores, gráficos e PDF ficam coerentes entre si. Custo: uma correção futura do motor muda o que o investidor vê de
  uma versão já publicada (e pode divergir da aba Versões, que mostra o `results` do momento). Revisitar se o usuário
  quiser números imutáveis.
- [x] Minor (pedido do usuário, 15/11: "Corrigir problema com logo") — falha de rede não fica mais no cache de
  `logoComoDataUrl`; logo SVG/WebP (qualquer tamanho, inclusive SVG só com viewBox) é redesenhada em PNG
  (`utils/logoParaOPdf.ts`). Conferido no Garden com uma logo SVG trocada só na resposta: aparece na capa.

## Pendências (registradas 15/11, fora do pedido — não consertadas)

- **Data Room pelo link fica vazio em silêncio.** `opportunity_documents` só tem policy para
  `authenticated` membro da organização; o portal por token lê a tabela direto (`DataRoomPanel` →
  `opportunityDocumentsService.list`) e recebe `[]`. Conferido pelas policies, não na tela. Conserto:
  RPC por token (como `fn_investor_portal_get_reports`) + URL assinada por Edge Function (bucket privado).
- **Investidor que entra por e-mail não vê oportunidades.** `investor_opportunities` e
  `imovib_study_versions` só liberam leitura para membro da organização; o investidor logado não é
  membro. O caminho que funciona é o link com token. Conserto: as mesmas RPCs por `auth.uid()`
  (molde de `fn_investor_get_espelho`).
- Minors do painel: no celular, o valor do cenário negativo encosta no rótulo e o eixo do tornado fica
  apertado; os quadradinhos da legenda HTML saem um pouco acima do texto na captura do PDF.

---

## Arquivos principais

`services/imovibService.ts` · `utils/imovibVersoes.ts` · `utils/imovibRelatorio.ts` · `utils/imovibRelatorioPdf.ts` · `utils/imovibGraficosParaPdf.ts` (novo) · `components/imovib/graficos/*` (novos) · `components/ImovibExecutiveSummary.tsx` · `components/ImovibVersoesTab.tsx` · `components/investor/OpportunityForm.tsx` · `components/investor/OpportunityDetail.tsx` · `components/investor/portal/ImovibPainelDoInvestidor.tsx` (novo) · `services/investorPortalTokenService.ts` (`montarEstudoDoPortal`) · migration nova · `docs/ui_ux_guia_unificado.md` §24.

## Verificação (cada fase, na frente)

- Vitest dos arquivos tocados + suíte Imovib/investidor (`npx vitest run imovib Imovib investor Opportunity`), `npm run typecheck`, `check-ui-standard.sh` nos `.tsx`, travas de UI (`rotulo*Guard`, `campoAlturaGuard`, `valorDeCampoSemCinzaGuard`, `orgContextGuard`, `segurancaMigrations`).
- Banco: só leitura ou transação desfeita; migration aplicada com `db query -f` após OK (nunca `db push`).
- Navegador (Playwright, escritas bloqueadas e listadas): Garden Cambuhy — congelar versão e publicar exigem gravação real, então a prova de ponta a ponta usa versão/oportunidade **descartáveis** criadas e apagadas no `finally` (com OK do usuário), ou o usuário publica uma versão real do Garden.
- Publicação: PR por fase, CI verde, merge (`--match-head-commit`), `conferir-producao.sh "<texto novo>"`.
