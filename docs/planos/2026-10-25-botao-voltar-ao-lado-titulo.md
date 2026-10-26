# Botão "Voltar" ao lado do título, não em cima

## Pedido original

Sessão 2026-10-25 (23:xx, horário local do usuário), em
`recursos humanos > Gestão de Folha de Pagamento > Detalhes da Folha`:

> botão voltar em cima do título diminui o espaço vertical prejudicando UX.
> Qual a melhor pratica para botão voltar?

Depois de uma primeira correção (reduzir o gap entre as duas linhas), o
usuário corrigiu o rumo:

> o que foi que eu te pedi? para que o botao voltar nao ficasse em cima do
> titulo nao foi?

Em seguida, perguntado entre as 3 opções já usadas uma vez neste projeto
(ver `docs/ui_ux_guia_unificado.md` §23, caso `CondominioDetail.tsx`,
23/09/2026 — mesma reclamação, resolvida então com migalha de pão), o
usuário escolheu:

- **Seta à esquerda do H1** (ícone de voltar colado ao título, mesma linha,
  mesma altura — zero linha extra), e
- **escopo: virar o padrão geral**, migrando todas as telas de detalhe de
  "1 salto" que hoje usam o botão "Voltar" numa linha própria acima do
  título — não só `PayrollRunDetail.tsx`.

## Padrão novo (substitui, para 1 salto, o botão-acima-do-título)

Markup de referência (adaptar ao título/subtítulo de cada tela, preservando
o que cada uma já tem — classificação, badges, etc. — ao lado ou abaixo):

```tsx
<div>
  <div className="flex items-center gap-3">
    <button
      onClick={onBack}
      className="flex items-center justify-center h-9 w-9 -ml-2 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all shrink-0"
      title="Voltar"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{titulo}</h1>
  </div>
  <p className="text-gray-400 text-sm mt-1.5 font-medium ml-12">{subtitulo}</p>
</div>
```

Pontos fixos:
- botão **ícone-only** (sem o texto "Voltar"/"Voltar à lista") — `title`
  (tooltip nativo) cobre a acessibilidade/descoberta.
- `h-9 w-9` para dar alvo de clique de 36px (abaixo de `h-8`/32px do botão
  antigo ficaria pequeno demais pra um alvo só-ícone).
- subtítulo ganha `ml-12` (36px do botão + 12px do gap) pra alinhar com o
  título, não com a seta.
- `-ml-2` no botão pra óptico-alinhar a borda esquerda da seta com a borda
  esquerda do texto do título (compensa o padding interno do botão),
  mesma lógica que o botão antigo já usava (`-ml-2.5`).

**Não migrar** (exceções já documentadas ou fora de escopo):
- `components/condominio/CondominioDetail.tsx` — já é a exceção nomeada de
  migalha de pão (§23), decisão explícita do usuário, não mexer.
- `components/TasksMobileApp.tsx` — chrome de app mobile, fora do escopo do
  guia (§23, nota "Chrome de app mobile").
- `components/OpuraAssetsModule.tsx` — pendência JÁ registrada no guia
  (`❌ pendente — remover, não migrar`), motivo diferente (trilha estática
  sem navegação real); não tocar aqui, é outro item.
- Qualquer botão "Voltar" que NÃO seja o cabeçalho de uma tela de detalhe
  (ex.: rodapé de modal/wizard multi-step, "Cancelar"/"Voltar" de formulário
  em `Sheet`, navegação interna de abas) — esses não são o padrão do §23 e
  não entram nesta migração.
- Telas com breadcrumb de verdade (§23, critério de 2+ saltos) — já não usam
  "Voltar", não se aplica.

## Itens

Levantamento inicial (grep `<ArrowLeft[^>]*/>\s*Voltar` + triagem manual —
cada item abaixo precisa ser CONFIRMADO como o padrão cabeçalho-acima-do-
título antes de migrar, não só por bater o grep):

- [x] `components/PayrollRunDetail.tsx` — confirmado (caso que originou o pedido). Migrado.
- [x] `components/debt/DebtDetail.tsx` — migrado.
- [x] `components/credit/CreditRoomDetail.tsx` — migrado.
- [x] `components/empreendimento/EmpreendimentoDetail.tsx` — cabeçalho em CARD (ícone-bolha Building2 + badges), não o h1-solto padrão; a seta entrou na mesma linha `flex items-center gap-3`, ANTES do ícone-bolha, sem alterar o resto do card. Guia §23.1 documenta esse caso. Migrado.
- [x] `components/AppraisalModule.tsx` — h2 (não h1; é o 2º nível dentro de um módulo maior), mesmo tratamento. Migrado.
- [x] `components/BrokerPortal.tsx` — `onBack` condicional; `ml-12` do subtítulo também condicional. Migrado.
- [x] `components/DataTablePrototype.tsx` — é tela viva (rota `table-prototype` em `AppRouter.tsx:593-598`, não código morto). Migrado.
- [x] `components/condominio/PortalCondominoAdmin.tsx` — 3 ocorrências (prévia do Portal do Síndico, Acessos ao portal, Como X vê o portal). Migradas as 3.
- [x] `components/fiscal/FiscalDocuments.tsx` — **excluído**: o botão já vive `flex items-center gap-3` na MESMA linha do `<h1>` desde antes (só o texto "Voltar" sobrava ao lado do ícone) — não tinha o problema de linha extra que esta migração resolve. Não precisa de mudança.
- [x] `components/public/PublicOpportunityDetail.tsx` — **excluído**: os dois "Voltar" do arquivo não são cabeçalho de tela — um é passo de formulário multi-etapa (`step === 'form'` → `'view'`) e o outro é um link de breadcrumb com o nome da organização dentro de um `<nav>`. Também é portal público (§24, investidor) por natureza.
- [x] `components/regulatoryMap/RegulatoryMapModule.tsx` — `onVoltarParaPlanta` condicional; `ml-12` do subtítulo também condicional. Migrado.
- [x] `components/regulatoryMap/RegulatoryMapExcelImportModal.tsx` — **excluído**: confirmado rodapé de passo de modal wizard (`step === 'mapping'`/`'preview'`, ao lado de "Continuar"/"Importar"), não cabeçalho de página.
- [x] `components/regulatoryMap/RegulatoryMapDetail.tsx` — achado FORA do grep original (usa `{backLabel}`, uma prop de texto variável, não o literal "Voltar" — por isso a busca estreita não pegou). Migrado; `title={backLabel}`.
- [x] Varredura adicional: `grep -rl "ArrowLeft" components | xargs grep -l "Voltar"` devolveu 49 arquivos. Passados os 49 um a um (via grep de contexto + leitura dos trechos ambíguos). Achado real do que NÃO estava nos 13 itens acima:
  - **Maioria já estava conforme** (ícone-só, já na mesma linha do título/h1) — nenhuma mudança necessária: `CompanyDetailPage.tsx`, `Dashboard.tsx`, `ClientForm.tsx` (comentário no próprio arquivo já cita "Mesmo padrão de ContractDetailView"), `BoletoFormModal.tsx` (modal), `DocxTemplateManager.tsx`, `ImovibDetailView.tsx`, `LaborEmployeeForm.tsx`, `OpuraDocsModule.tsx`, `OpuraReports.tsx`, `ProjectDiaryManager.tsx`, `ProjectModal.tsx`, `QuotationResponseForm.tsx`, `SupplierForm.tsx`, `SupplyChainOrderDetails.tsx`, `WarrantyModule.tsx`, `academy/AcademyCourseBuilder.tsx`, `academy/AcademyPlayerView.tsx`, `academy/AcademyQuizRunner.tsx`, `condominio/RateioDetalheView.tsx`, `oficios/ModeloEditorTela.tsx`, `oficios/NovoOficioTela.tsx`, `suprimentos/SolicitacaoCompraForm.tsx`. Ou seja: o padrão novo já era, na prática, o mais comum no código recente — só um bolso de telas mais antigas (os 10 arquivos migrados acima) tinha ficado para trás.
  - **Fora de escopo por natureza** (não é cabeçalho `<h1>` de página): `DatabaseExplorer.tsx` (botão de navegação de relações num explorador de banco, não cabeçalho), `Auth.tsx` (botão `absolute top-8 left-8` num cartão de login centralizado, não em fluxo acima de h1), `DealModal.tsx` (controle de fechar/voltar de modal, alterna com X), `DiaryMobileApp.tsx` e `broker/BrokerPortalMobile.tsx` (chrome de app mobile, mesma exceção do `TasksMobileApp.tsx`), `blueprint/BlueprintCanvas.tsx` (era `ArrowLeft` de atalho de teclado, nem é o ícone), `blueprint/BlueprintEditor.tsx` (controle de ribbon/`BotaoBarra`, §19.5, não cabeçalho §20), `portal/PortalHelp.tsx` e `reconciliation/RegrasSheet.tsx` (navegação interna de um `Sheet`, não página), `schedule/ScheduleHeader.tsx` (slot do ribbon §19.5, já ícone-só), `PropertyModal.tsx` (botão no rodapé/cabeçalho de MODAL — `h3`, não `h1` — já na mesma linha do título, alterna com X).
  - **Família com design próprio já decidido, fora de escopo desta migração**: `ClientArea.tsx`, `supplier/SupplierPortalManager.tsx` e `partner/PartnerWorkspaceManager.tsx` compartilham um padrão deliberado e documentado (comentário em `ClientArea.tsx`: *"espelha o Portal do Fornecedor... linha 'Voltar' + 'Link de Acesso', depois o título §20 ... Pedido de 22/09/2026"*) — uma barra própria com "Voltar" + ação secundária, ANTES de uma seção de título separada (em `SupplierPortalManager.tsx` o "Voltar" nem fica acima do MESMO `<h1>`: fica acima de um componente filho embutido com cabeçalho próprio). Migrar só `PartnerWorkspaceManager.tsx` (o único dos três em que a seta ficaria tecnicamente colada ao `<h1>` seguinte) quebraria a consistência entre os três. Como não houve pedido para mudar essa família, nenhum dos três foi tocado — fica registrado aqui para decisão futura, não migrado "por engano" um e não os outros.
- [x] Atualizar `docs/ui_ux_guia_unificado.md` §23: adicionada a seção §23.1 com o padrão novo, a lista do que migrou e do que ficou de fora (e por quê), preservando a exceção do Condomínio como estava.
- [x] `bash scripts/check-ui-standard.sh <arquivo>` em cada arquivo tocado — 10 arquivos, 0 violações.
- [x] `npx tsc --noEmit` no projeto inteiro — `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit -p .` (o `npx tsc` direto estoura a memória padrão do Node) — 0 erros.
- [x] `npm run test` (suíte completa) — 1142 arquivos de teste passando, 3 falharam (`PainelVersoes.test.tsx`, `ContasPagarDeepLink.test.tsx` + 1) só sob a carga da suíte inteira; isolados, os dois identificados passam 100%. Nenhum dos 3 arquivos de teste falhos, nem a busca pelo nome dos 10 componentes migrados, aparece ligado a esta mudança — roda `__tests__/orgContextGuard.test.ts` e os testes dos componentes tocados (`BrokerPortalMobile.test.tsx`, `portalTourAnchors.test.ts`, `portalTourPreviaVsLink.test.ts`, `portalHelpClienteCondominio.test.ts`) isolados: 5/5 arquivos, 80/80 testes OK.
- [ ] Commit + push (= deploy) + `bash scripts/conferir-producao.sh` para confirmar no ar — **commit feito nesta frente, SEM push** (a orquestradora revisa o diff final e publica).
