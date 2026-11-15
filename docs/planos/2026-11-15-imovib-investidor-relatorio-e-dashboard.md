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

- [ ] Migration `aplicar_<prefixo>_investidor_versao_publicada.sql` (conferir prefixo com TODOS os nomes, não `ls|tail`):
  - `investor_opportunities.imovib_version_id uuid REFERENCES imovib_study_versions(id) ON DELETE RESTRICT`;
  - gatilho BEFORE INSERT/UPDATE: versão pertence ao `imovib_study_id`; oportunidade publicada com estudo exige versão (mensagem em português); função com `REVOKE … FROM PUBLIC, anon, authenticated`;
  - `CREATE OR REPLACE fn_investor_portal_get_study(p_token, p_study_id)`: mesmas checagens de token/oportunidade publicada; devolve `snapshot` da versão publicada menos as chaves internas (lista atual + `premise_notes`), `relatorio` (as 4 listas), `versao {label, created_at}`, `organizacao {name, logo_url}`. Mantém `REVOKE PUBLIC` + `GRANT anon, authenticated` (REGRA #7, perguntas 1 e 2).
- [ ] `OpportunityForm.tsx` (`:325`): depois do estudo, seletor "Versão publicada" (versões do estudo, mais nova primeiro, com data). Publicar com estudo e sem versão: botão desligado com o motivo no `title`.
- [ ] `OpportunityDetail` no modo gestor lê a mesma versão (`imovibService.snapshotDaVersao`) — prévia igual ao que o investidor vê.
- [ ] Aba Versões do Imovib: marca "publicada em: <oportunidade>".
- **Pronto quando:** prova no banco em transação desfeita (`BEGIN … RAISE EXCEPTION 'PROVA' … ROLLBACK`): publicar sem versão recusa; versão de outro estudo recusa; RPC com token devolve a versão sem `recommendation`/`hurdle_*`/`premise_notes`; RPC chamada com `anon` sem token válido → `unauthorized`. `__tests__/segurancaMigrations.test.ts` verde.

## Fase 3 — Gráficos de props puras + PDF com capa e gráficos

- [ ] `components/imovib/graficos/` (props puras, `animado?: boolean`, tamanho fixo opcional): `GraficoCurvaS` (fluxo líquido + acumulado/exposição), `GraficoComposicaoDoCapital`, `GraficoCenarios`, `GraficoTornado`, `GraficoCurvaDeVendas`, `LinhaDoTempoDosMarcos`. As telas atuais (Resumo Executivo, Tornado, OpportunityDetail) passam a usá-los — sem mudança visual no app. §28 do guia (cromo, rótulo, paleta validada, vazio próprio).
- [ ] `utils/imovibGraficosParaPdf.ts`: monta os gráficos fora da tela (contêiner oculto, `animado={false}`), captura com html2canvas + `coresCompativeisNaCopia`, devolve `Record<GraficoId, dataURL>`.
- [ ] `utils/imovibRelatorio.ts`: opção `edicao: 'interna' | 'investidor'` (investidor: sem parecer/critérios; capa com organização e versão); cada seção declara `graficos: GraficoId[]` (indicadores → Curva S; fluxo → Curva S anual; sensibilidade → tornado + cenários; cronograma → marcos + curva de vendas; capital → composição).
- [ ] `utils/imovibRelatorioPdf.ts`: capa visual (logo via `logoComoDataUrl` de `services/docGen`, título, versão/data, 4 KPIs em grade) e imagens de gráfico na seção, com quebra de página que não corta imagem.
- [ ] O "Relatório completo" do Resumo Executivo também ganha capa e gráficos (edição interna).
- **Pronto quando:** testes puros das seções (edição investidor não contém "Parecer"/hurdles; cada seção lista seus gráficos); teste dos componentes de gráfico com dado e vazio; PDF real gerado no navegador do Garden aberto e conferido página a página (capa, gráficos nítidos, nenhum corte).

## Fase 4 — Dashboard do investidor (referência, cor do portal)

- [ ] `components/investor/portal/ImovibPainelDoInvestidor.tsx` (props: estudo da versão, `versao`, `organizacao`, `accent`), substituindo o conteúdo da aba "Viabilidade & Investimento" do `OpportunityDetail`:
  - faixa da versão ("Versão <label> · <data>") + botão "Baixar relatório (PDF)" (edição investidor, Fase 3);
  - 4 KPIs principais (VPL, TIR a.a., margem líquida, exposição máxima) + 4 de apoio (VGV, lucro, payback, múltiplo);
  - Curva S / exposição, composição do capital, cenários, sensibilidade (tornado), linha do tempo dos marcos, curva de vendas;
  - simuladores atuais (VGV/custo/prazo) num card "Simulação — não altera a versão publicada".
- [ ] Visual da referência no vocabulário do portal: cards de vidro (`bg-white/60 backdrop-blur`, borda branca translúcida, sombra com brilho coral `P`), hover que levanta e acende, entrada suave; `prefers-reduced-motion` desliga animação; sem `dark:` (§33); responsivo até 390 px.
- [ ] Guia: nova subseção no §24 ("painel de vidro do investidor") — padrão que o guia não cobre vira seção (REGRA #1, item 4).
- **Pronto quando:** testes do painel (KPIs batem com `ResultadosDaVersao` da versão; simulação não muda a faixa da versão; botão PDF chama a edição investidor); `check-ui-standard.sh` nos `.tsx` tocados; navegador: link de portal com token de teste em 1600 px e 390 px, prints conferidos; 0 erros de console.

## Fase 5 — Conferências e pendências vizinhas (só registrar, não consertar sem pedido)

- [ ] Conferir se o **Data Room** abre no portal por link (lê `opportunity_documents` direto → provável lista vazia em silêncio, ver memória "portal lendo tabela direto").
- [ ] Conferir se o **investidor logado por e-mail** (sem token) consegue ler oportunidade/versão (lê por RLS de membro da org).
- Registrar o resultado em "Pendências" deste plano.

---

## Arquivos principais

`services/imovibService.ts` · `utils/imovibVersoes.ts` · `utils/imovibRelatorio.ts` · `utils/imovibRelatorioPdf.ts` · `utils/imovibGraficosParaPdf.ts` (novo) · `components/imovib/graficos/*` (novos) · `components/ImovibExecutiveSummary.tsx` · `components/ImovibVersoesTab.tsx` · `components/investor/OpportunityForm.tsx` · `components/investor/OpportunityDetail.tsx` · `components/investor/portal/ImovibPainelDoInvestidor.tsx` (novo) · `services/investorPortalTokenService.ts` (`montarEstudoDoPortal`) · migration nova · `docs/ui_ux_guia_unificado.md` §24.

## Verificação (cada fase, na frente)

- Vitest dos arquivos tocados + suíte Imovib/investidor (`npx vitest run imovib Imovib investor Opportunity`), `npm run typecheck`, `check-ui-standard.sh` nos `.tsx`, travas de UI (`rotulo*Guard`, `campoAlturaGuard`, `valorDeCampoSemCinzaGuard`, `orgContextGuard`, `segurancaMigrations`).
- Banco: só leitura ou transação desfeita; migration aplicada com `db query -f` após OK (nunca `db push`).
- Navegador (Playwright, escritas bloqueadas e listadas): Garden Cambuhy — congelar versão e publicar exigem gravação real, então a prova de ponta a ponta usa versão/oportunidade **descartáveis** criadas e apagadas no `finally` (com OK do usuário), ou o usuário publica uma versão real do Garden.
- Publicação: PR por fase, CI verde, merge (`--match-head-commit`), `conferir-producao.sh "<texto novo>"`.
