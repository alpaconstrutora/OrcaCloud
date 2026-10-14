# Áreas NBR 12721 dentro da Planta Inteligente (fim do módulo "Motor de Áreas")

## Pedido original

> analise se o módulo incorporacao > Motor de Áreas deve ser incoportado pelo módulo  incorporacao > planta inteligente

Sessão `80cb89f8-7ce6-4781-99db-43df5ff25292` · 11/10/2026

A primeira resposta recomendou manter os módulos separados e ligá-los por uma ponte. Em seguida veio a mudança de rumo:

> vamos dar um passo atras .
> faça um plano para integrar o motor de áreas em planta inteligente. Não faz nenhum sentido um módulo separado se todo o motor necessario ja existe em planta inteligente. Mas antes analise

Mesma sessão · 13/10/2026

## Análise (13/10/2026, lida no `origin/main` @ `82b8da13` e no banco)

**Uso real do Motor.** São 2 `area_projects`, 3 `area_versions` (1 draft e 2 calculated), nenhuma aprovada ou travada, 85 unidades e **0 frações devolvidas** ao Empreendimento. A última alteração foi em 27/07/2026. A Planta tem 77 estudos. Migrar custa pouco.

**"Todo o motor já existe na Planta?" Em parte.**

| Peça | Planta | Motor |
|---|---|---|
| Área real por ambiente, pelo eixo, com a geminada pela metade | ✅ `utils/blueprintUnidades.ts` | digitada |
| Privativa por unidade e comum por pavimento | ✅ `quadroDeUnidades` | ✅ |
| Vagas como objeto (`Vaga`) e ambiente `VARANDA` | ✅ | digitados |
| Versão imutável, hash e trilha de auditoria | ✅ `blueprint_snapshots` e `blueprint_audit_events` | ✅ lock, hash e `area_version_audit_logs` |
| Cobertura (padrão, diferente ou descoberta) e coeficiente, que dão a área equivalente | ❌ | ✅ |
| Comum proporcional × não proporcional, rateio global ou por bloco | ❌ | ✅ |
| Acessório vinculado (vaga ou depósito da unidade) | ❌ | ✅ |
| Quadros I, II e IV-B e fração pelo coeficiente de proporcionalidade (QII-31) | ❌ (a fração da Planta é privativa ÷ Σ, sem coeficiente) | ✅ `calculate_area_version`, 683 linhas de SQL |
| Aprovação técnica e jurídica | ❌ | ✅ |
| Exportação PDF/XLSX, memorial de incorporação e devolução da fração | ❌ | ✅ |
| Unidades em **todos** os andares | ❌ só o pavimento tipo tem `Unidade`; as cópias (`Level.tipoDeId`) não têm | ✅ |

A Planta já tem a geometria e a infraestrutura de versão. Falta a camada normativa: classificar, aplicar coeficientes, ratear, montar os quadros e aprovar. Unidades em todos os andares são pré-requisito do Quadro IV-B do prédio.

**Quem usa o Motor fora dele.**
- `components/empreendimento/EmpreendimentoDetail.tsx` lê os quadros.
- `services/incorporationMemorialService.ts` usa os tipos.
- `services/areaEngineExportService.ts` gera PDF e XLSX.
- `services/empreendimentoAuditService.ts`, `empreendimentoLinksService.ts` e `empreendimentoTypeService.ts`.
- `components/empreendimento/VinculacoesTab.tsx:654` chama `onChangeView('area-engine')`.
- Menu: `components/Layout.tsx`, em Engenharia (~956) e em Incorporação (~1166), e o array `engViews` (~473).
- Rota: `components/AppRouter.tsx`, `case 'area-engine'`, com a permissão `canViewBudget`/`obras` (~340).
- A permissão declarada `canViewAreaEngine` (`OrganizationUsers.tsx:350`) não é lida por nenhum código.
- Colunas que vão para o Empreendimento: `empreendimento_units.fracao_ideal_decimal`, `fracao_ideal_thousandths`, `area_real_total_m2`, `area_engine_version_id` e `area_engine_synced_at`. Quem as lê é o Condomínio (`FracoesTab`, `OcupacoesTab`, `ComunicacaoTab` e `PortalCondominoAdmin`). A fração transcrita da convenção (`fracaoIdealService`, origem `CONVENCAO`) **vence** a calculada.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 13/10/2026 | Integrar ou manter separado? | Integrar. Um só módulo, a Planta Inteligente. |
| 13/10/2026 | Empreendimento cujo projeto veio de fora (DWG/PDF), sem desenho na Planta | **Estudo da Planta sem desenho**, com ambientes de área declarada. Um caminho e um motor. |
| 13/10/2026 | Onde roda o cálculo dos Quadros I/II/IV-B | **TS puro**. A função SQL atual serve de **testemunha** até ser aposentada. |
| 13/10/2026 | Os 2 projetos e as 3 versões existentes no Motor | **Podem ser excluídos.** Não exportar nem converter. |

## Desenho

```
Estudo da Planta (desenhado, declarado ou misto)
   ├─ ambientes desenhados (Space + SpaceLabel.nbr12721)
   ├─ ambientes declarados (AmbienteDeclarado: área digitada, sem geometria)
   ├─ unidades do tipo + unidades derivadas das cópias de pavimento
   └─ vagas e depósitos → unidade dona (acessório)
        │  adaptador puro: utils/blueprintNbr12721.ts
        ▼
EntradaNbr12721 (independente da Planta)
        │  motor puro: utils/nbr12721/quadros.ts
        ▼
Quadros I, II e IV-B, frações e pendências   → tela ao vivo, enquanto se desenha
        │  ao publicar
        ▼
blueprint_snapshot_nbr12721 (imutável, com hash) → aprovações técnica e jurídica
        │
        ├─ PDF/XLSX e memorial de incorporação
        └─ devolução da fração ao Empreendimento (respeitando CONVENCAO)
```

- **Paredes e resíduo.** Na Planta, a comum do pavimento é a área construída menos a soma das privativas, o que inclui paredes e circulação. O que não estiver em nenhum ambiente classificado vira um espaço comum **proporcional, coberto padrão** chamado "Paredes e circulação — <pavimento>". Ele aparece nos quadros e na lista de pendências. Assim a soma fecha com a área construída sem número escondido.
- **Folgas viram hipóteses** (regra de feedback): coeficientes padrão por classe, área da vaga e regra de numeração por andar são hipóteses editáveis do estudo, marcadas "CONFERIR". Nenhuma vira constante no código.
- **Comportamento padrão.** O que a Planta já sabe vem preenchido sem sobrescrever o que foi digitado: `VARANDA` sugere "coberta de padrão diferente"; ambiente sem laje ou água de telhado acima sugere "descoberta"; ambiente sem unidade sugere "comum proporcional".

## Plano

Cada item diz **o que muda** e **como sei que terminou**.

### Fase 0: capturar a testemunha antes de qualquer remoção

0.1 **`scripts/nbr12721-testemunha.mjs` + `__tests__/fixtures/nbr12721/*.json`**
- **O que muda:** monta cada caso no banco dentro de uma transação com **ROLLBACK**, roda `validate_area_version` e `calculate_area_version`, lê os quadros e as frações e grava entrada e saída em JSON.
- **Casos:** os 10 de `QA_MOTOR_AREAS_NBR12721.md` e os de `__tests__/areaEngineFixtures.test.ts`. Acrescento os que o QA não cobre: ≥ 3 unidades, acessório vinculado com `affects_coefficient`, escopo por bloco, área descoberta com coeficiente e dois blocos.
- **Pronto quando:** existem ≥ 15 fixtures com a saída do SQL e uma contagem antes e depois prova que as tabelas `area_*` não mudaram.

### Fase 1: motor puro, sem Planta

1.1 **`utils/nbr12721/tipos.ts`**
- **O que muda:** `EntradaNbr12721`, com blocos, pavimentos, unidades, espaços (uso, cobertura, coeficiente, divisão, escopo, área real em m²), vínculos de acessório e escopos. `SaidaNbr12721`, com os Quadros I, II e IV-B, as frações e as pendências. Os nomes das colunas seguem `qi_*`, `qii_*` e `qivb_*` para conferir linha a linha.
- **Pronto quando:** compila e a fase 1.2 usa esses tipos.

1.2 **`utils/nbr12721/quadros.ts`**
- **O que muda:** `validar(entrada)` devolve os mesmos códigos do SQL (`MOTOR_007`, `MOTOR_012`, `QII_VAL_006`, `FRAC_VAL_002`, `COM_PROP_VAL_001`…). `calcular(entrada)` monta os quadros e as frações. Os milésimos fecham **exatamente 1000** pelo maior resto; era uma pendência antiga para cartório.
- **Pronto quando:** `__tests__/nbr12721Quadros.test.ts` bate com **todas** as fixtures da fase 0 (tolerância 1e-9), a soma das frações dá 1 e os milésimos somam 1000 em todos os casos.

### Fase 2: o kernel aprende a classificação NBR

2.1 **`utils/blueprintKernel/model.ts`**
- **O que muda:**
  - `SpaceLabel.nbr12721?: { cobertura: 'PADRAO'|'DIFERENTE'|'DESCOBERTA'; coeficiente?: number|null; divisaoComum?: 'PROPORCIONAL'|'NAO_PROPORCIONAL'; escopo?: 'GLOBAL'|'BLOCO' }`;
  - `Unidade.acessorios?: { uid: ElementUid; afetaCoeficiente: boolean }[]`, onde o `uid` é de vaga ou de etiqueta de depósito;
  - entidade nova **`AmbienteDeclarado`** `{ id, uid, levelId, nome, areaMm2, unidadeUid?, nbr12721? }`, usada pelo estudo sem desenho e por pavimentos não desenhados.
  - Todos os campos são omitidos no canônico quando ausentes, então o hash dos estudos atuais não muda. Bump **minor** do `KERNEL_VERSION` (`units.ts`, hoje `0.99.0`).
- **Pronto quando:** o teste de ida e volta no canônico passa, as goldens dos estudos atuais ficam idênticas e o hash de um estudo antigo continua igual.

2.2 **`utils/blueprintKernel/commands.ts`**
- **O que muda:** `SetNbr12721DoAmbiente` (aceita lote), `SetAcessoriosDaUnidade`, e `Add/Set/RemoveAmbienteDeclarado`. Apagar uma vaga ou etiqueta tira o vínculo de acessório. Apagar um pavimento leva junto os ambientes declarados dele.
- **Pronto quando:** `__tests__/blueprintNbr12721Kernel.test.ts` cobre os invariantes (coeficiente > 0, acessório não pode ser privativo de outra unidade, uid inexistente gera erro) e o desfazer/refazer.

2.3 **Bundle da `planta-api`**
- **O que muda:** regerar o bundle **depois da última edição** do kernel.
- **Pronto quando:** `__tests__/plantaApi.test.ts` passa (3/3).

### Fase 3: unidades em todos os andares

3.1 **`utils/blueprintUnidadesDoPredio.ts`**
- **O que muda:** `unidadesDoPredio(model, hipoteses)` devolve as unidades do pavimento tipo **mais** uma unidade derivada por cópia viva (`Level.tipoDeId`). A chave é `"<uid da Unidade>:<uid do Level>"`. A área vem da origem, porque a geometria das cópias é idêntica por construção. A numeração segue a hipótese `numeracaoPorAndar` (padrão: o andar seguido da posição, como `nomeDaUnidadeDaMassa`). Unidades de pavimentos que não são cópia são medidas direto.
- **Pronto quando:** em `__tests__/blueprintUnidadesDoPredio.test.ts`, um tipo com 4 unidades e 10 cópias dá 44 unidades com números únicos; renomear a origem propaga; apagar uma cópia tira as unidades dela.

### Fase 4: adaptador Planta → motor

4.1 **`utils/blueprintNbr12721.ts`**
- **O que muda:** `entradaDoEstudo(model, hipoteses)` vira uma `EntradaNbr12721`, com: blocos a partir de `Bloco` (ou um bloco único), pavimentos, unidades da fase 3, espaços desenhados (área pelo eixo, como em `blueprintUnidades`), ambientes declarados, vagas (área = contorno ou hipótese), acessórios e o espaço-resíduo "Paredes e circulação".
- `classificacaoSugerida(model)` traz os padrões descritos no Desenho e nunca sobrescreve um valor existente.
- mm² → m² sem arredondar antes do motor.
- **Pronto quando:** em `__tests__/blueprintNbr12721.test.ts`:
  - o sobrado de prova dá privativa igual à `quadroDeUnidades`;
  - a soma dos espaços de cada pavimento é igual à área construída;
  - uma varanda é sugerida como DIFERENTE;
  - um terraço sem laje é sugerido como DESCOBERTA;
  - um estudo só com ambientes declarados dá o mesmo quadro que a fixture equivalente da fase 0.

4.2 **Hipóteses do estudo: migration `aplicar_2027…_blueprint_study_nbr12721.sql` + `services/blueprintNbr12721Service.ts`**
- **O que muda:** a tabela `blueprint_study_nbr12721` guarda os coeficientes padrão por classe, a área de vaga, a numeração por andar e o escopo padrão. Uma linha por estudo, RLS por organização, no molde de `blueprint_study_produto`. Passa pelas perguntas da REGRA #7.
- **Pronto quando:**
  - a migration está aplicada (`db query -f`, nunca `db push`);
  - a política é conferida como `authenticated` de outra organização (zero linhas);
  - gravar e ler pelo serviço funciona no app real.

### Fase 5: estudo sem desenho

5.1 **`services/blueprintEstudoDoEmpreendimento.ts`**
- **O que muda:** "Novo estudo a partir do Empreendimento (sem desenho)". Porta o mapeamento de `areaEngineService.importFromEmpreendimento` (F1 e F2):
  - torres viram `Bloco`;
  - os `empreendimento_floors` viram pavimentos, expandindo `repeat_count`, com garagem e técnico incluídos;
  - as unidades viram `Unidade` com um `AmbienteDeclarado` privativo cada, usando **só** a `private_area` (a comum é rateada pelo motor);
  - as `common_areas` viram ambientes declarados comuns.
  - Grava `empreendimentos.blueprint_study_id`.
- **Pronto quando:** um teste com o empreendimento de fixture gera o número esperado de pavimentos, unidades e ambientes, e a privativa total é igual à soma das `private_area`. No app real, o estudo criado abre na Planta e a tela de Áreas NBR mostra os quadros.

5.2 **UI: botão no Empreendimento e na lista de estudos da Planta**
- **O que muda:** o botão "Criar estudo de áreas (sem desenho)" e a edição em tabela dos ambientes declarados, com importação de planilha XLSX (reaproveitando a Camada B: edição em lote).
- **Pronto quando:** no app real, cria, edita 3 ambientes em lote e salva. `check-ui-standard.sh` está limpo.

### Fase 6: a tela "Áreas NBR 12721" na Planta

6.1 **`components/blueprint/TelaAreasNbr12721.tsx`** (tela em fluxo, Analisar › Relatórios)
- **O que muda:** cinco sub-abas.
  - **Classificação:** ambientes com cobertura, coeficiente, divisão e escopo; edição em lote; "Aplicar sugestões".
  - **Acessórios:** vagas e depósitos ligados à unidade dona; assistente para vincular N vagas.
  - **Pendências:** os códigos do `validar`, com "Ir ao ambiente".
  - **Quadros:** I, II e IV-B, calculados ao vivo.
  - **Frações:** decimal, percentual e milésimos.
- Botão desabilitado sempre diz o motivo. Segue o protocolo da REGRA #1 (`apply-ui-standard`).
- **Pronto quando:** no app real, o estudo de prova mostra os três quadros; mudar o coeficiente de uma varanda muda o QII-31 na hora; `check-ui-standard.sh` está limpo; o teste de componente cobre as cinco abas.

6.2 **`components/blueprint/TelaUnidades.tsx` + `BlueprintEditor.tsx`**
- **O que muda:** a coluna "Fração ideal" passa a mostrar a fração do Quadro IV-B quando não há pendência. Se houver, mostra "Fração estimada (sem coeficiente)" com o motivo. O texto explicativo e o cabeçalho (`BlueprintEditor.tsx` ~11358) passam a apontar para a tela nova.
- **Pronto quando:** um teste de componente mostra os dois estados, e não sobra o rótulo "Fração ideal" sem qualificação calculado por privativa ÷ Σ.

### Fase 7: congelar e aprovar na versão publicada

7.1 **Migration `aplicar_2027…_blueprint_snapshot_nbr12721.sql`**
- **O que muda:** a tabela `blueprint_snapshot_nbr12721`, com `snapshot_id` como PK, a entrada e a saída em JSONB, o hash e a versão do motor. É imutável pelo gatilho `fn_blueprint_block_mutation`.
- Também cria `blueprint_snapshot_nbr12721_aprovacoes` (só acrescenta linhas: TÉCNICA ou JURÍDICA, quem, quando, observação) e a RPC `aprovar_nbr12721_da_versao`, com `REVOKE` de `PUBLIC` e checagem de membro da organização.
- **Pronto quando:**
  - um `UPDATE` como `postgres` dá **23001** (não 42703 — lição da M4);
  - um usuário de outra organização lê zero linhas;
  - a RPC recusa quem não é membro;
  - `verificar-views-anon.sh` está limpo.

7.2 **`components/blueprint/PainelVersoes.tsx` + serviço**
- **O que muda:** ao publicar, congela os quadros, no mesmo ponto em que `blueprintSnapshotProdutoService.congelar` já é chamado. A versão mostra o selo "Aprovada técnica / jurídica". Aprovação jurídica exige a técnica antes, e uma versão com pendência não aprova.
- **Pronto quando:** no app real, com escrita autorizada num estudo descartável, publicar, aprovar as duas e conferir no banco (2 aprovações, quadro congelado, hash igual ao calculado na tela).

### Fase 8: saídas

8.1 **`services/nbr12721ExportService.ts`** (porta `areaEngineExportService.ts`)
- **O que muda:** gera PDF e XLSX dos quadros a partir de `SaidaNbr12721` da versão congelada, com o carimbo da organização e "Versão N · hash".
- **Pronto quando:** os arquivos baixados no app real têm os três quadros e as frações, e os totais batem com a tela.

8.2 **`services/incorporationMemorialService.ts`**
- **O que muda:** passa a ler os tipos novos a partir do snapshot aprovado do estudo ligado ao empreendimento.
- **Pronto quando:** o memorial gerado no app real traz os quadros da versão aprovada.

### Fase 9: Empreendimento

9.1 **Migration + `services/blueprintNbr12721Service.ts` (`devolverFracoesAoEmpreendimento`)**
- **O que muda:**
  - a coluna `empreendimento_units.nbr12721_snapshot_id` substitui `area_engine_version_id`;
  - a coluna `blueprint_unidade_chave` (texto, chave da fase 3) entra na proveniência;
  - a devolução grava `fracao_ideal_*`, `area_real_total_m2` e `area_engine_synced_at` **só a partir de uma versão aprovada**;
  - nunca sobrescreve `fracao_ideal_origem = 'CONVENCAO'`;
  - unidade sem proveniência é reportada, nunca inferida.
- A coluna nova entra em `UNIT_COLS` (`empreendimentoService.ts`), e o teste de travas confere isso.
- **Pronto quando:** num empreendimento descartável no app real, a devolução grava N unidades, pula a de convenção e lista as sem proveniência. A Fracoes do Condomínio mostra os valores.

9.2 **`components/empreendimento/EmpreendimentoDetail.tsx` e `VinculacoesTab.tsx`**
- **O que muda:** os quadros passam a vir do snapshot aprovado do estudo (`empreendimentos.blueprint_study_id`). "Abrir áreas" passa a levar a `#/blueprint?studyId=…` em vez de `'area-engine'`.
- **Pronto quando:** no app real, a aba mostra os quadros e o link abre o estudo certo.

9.3 **`empreendimentoAuditService.ts`, `empreendimentoLinksService.ts` e `empreendimentoTypeService.ts`**
- **O que muda:** trocam as referências ao Motor pelo snapshot da Planta.
- **Pronto quando:** `git grep areaEngine` nesses arquivos dá vazio e a suíte deles passa.

### Fase 10: remover o Motor de Áreas

10.1 **`components/Layout.tsx`**
- **O que muda:** saem os dois `DropdownItem id="area-engine"`, sai `'area-engine'` de `engViews` e do `hasActiveChild` da Incorporação.
- **Pronto quando:** o teste de menu (molde `LayoutMenuMarket.test.tsx`) prova que "Áreas NBR 12721" não aparece em nenhum grupo.

10.2 **`components/AppRouter.tsx`**
- **O que muda:** sai o `case 'area-engine'` e o lazy import. A view antiga `area-engine` redireciona para `blueprint`, como já é feito com `regulatory-maps`. O `'area-engine'` sai da lista de permissão (~340).
- **Pronto quando:** abrir `#/area-engine` cai na Planta, sem tela branca.

10.3 **Permissões (`OrganizationUsers.tsx` e `types/users.ts`)**
- **O que muda:** `canViewAreaEngine` e `canEditAreaEngine` passam a valer **de fato** para a tela 6.1 e a aprovação 7.2, com o grupo "Incorporação › Planta" e o rótulo "Áreas NBR 12721 (Planta)". Assim a permissão deixa de ser só declarada.
- **Pronto quando:** um usuário sem `canEditAreaEngine` vê os quadros mas não aprova nem edita a classificação, e o botão diz o motivo.

10.4 **Apagar o código**
- **O que muda:** saem `components/AreaEngineModule.tsx`, `components/area-engine/`, `services/areaEngineService.ts`, `services/areaEngineExportService.ts` e `types/areaEngine.ts`. `__tests__/areaEngineFixtures.test.ts` é substituído pelas fixtures da fase 0. Os textos em `HistoricoTab.tsx:44` e `EmpreendimentoTypesSettings.tsx:238` são ajustados. `QA_MOTOR_AREAS_NBR12721.md` vai para `docs/` como histórico.
- **Pronto quando:** `git grep -nE "areaEngine|area-engine|AreaEngine"` só encontra migrations antigas; `npm run ci` passa e a check-run `ci` fica verde depois do push.

10.5 **Migration `aplicar_2027…_drop_area_engine.sql`**
- **O que muda:** `DROP` das 18 tabelas `area_*` (incluindo os 2 projetos e as 3 versões, conforme autorizado em 13/10) e das funções `validate_`, `calculate_`, `approve_`, `lock_` e `supersede_area_version`, além de `area_rls_can_access_version`, `area_prevent_locked_version_mutation`, `area_touch_updated_at` e `area_jsonb_append`. Também os tipos enum `area_*` que ficarem órfãos.
- **Só roda depois** das fases 0 a 9 estarem em produção.
- **Pronto quando:** antes do `DROP`, uma consulta confirma 2 projetos e 3 versões (nada novo desde a análise); depois, `to_regclass('public.area_versions') IS NULL` e nenhuma função `%area_version%` em `pg_proc`.

## Achados da testemunha (13/10/2026) — decidir antes da Fase 1

Os 16 casos rodaram contra o SQL vigente: `calculate_area_version`, md5 `1c4b650b…`, e `validate_area_version`, md5 `91c1d497…`. Os 9 casos transcritos bateram com os valores esperados das fixtures antigas. Os fechamentos entre quadros mostram onde o SQL **não fecha**:

| Caso | QI-17 (real, prédio) | QII-37 (real, Σ unidades) | IV-B f | QI-18 (equivalente) | QII-38 | Causa |
|---|---|---|---|---|---|---|
| 12 | 175 | **162,5** | 175 | 162,5 | **156,25** | Vaga vinculada com `affects_coefficient = false`: sai do Quadro II e entra no IV-B |
| 14 | 507,5 | **482,5** | 482,5 | 461,25 | **436,25** | Unidade **não autônoma** (zeladoria, 25 m²) entra no Quadro I por pavimento e não é distribuída a ninguém |
| 15 | 196 | **146** | 146 | 178 | **125** | Unidade **inativa** (50 m²) faz o mesmo. O equivalente informado à mão (9 em vez de 30 × 0,4 = 12) abre mais 3 m² |
| 04, 11, 13, 14 | — | — | — | — | — | Σ milésimos = 1000,00000001 / 999,99999999: o SQL só arredonda; não fecha pelo maior resto |

Em todos os demais casos os três quadros fecham. As decisões abaixo são da Fase 1. Por padrão, o motor TS **reproduz** o SQL (é a testemunha) e **acrescenta uma pendência** quando o prédio não fecha. O comportamento muda depois, e só por decisão registrada aqui.

## Estado

- [x] Análise e decisões (13/10/2026)
- [x] Fase 0: testemunha (1 de 1) — `scripts/nbr12721-testemunha.mjs` e 16 casos em `__tests__/fixtures/nbr12721/` (9 transcritos das fixtures `supabase/seed/area_engine_case*`; o caso 7 tem os mesmos dados do 1 e o 8 virou caso de cálculo; 7 novos com ≥ 3 unidades, acessório fora do coeficiente, escopos mistos, rateio por percentual, cinco pavimentos com duplex, unidade inativa e não autônoma, dois erros ao mesmo tempo e unidade sem área). Banco antes e depois: `{"auditoria":8,"espacos":85,"projetos":2,"quadro_ii":76,"versoes":3}`, idêntico.
- [x] Fase 0 publicada: `0ad5c162`, check-run `ci` = success
- [x] Fase 1: motor puro (2 de 2)
  - `utils/nbr12721/tipos.ts` e `utils/nbr12721/quadros.ts`, com `calcularNbr12721`, `validarNbr12721` e `milesimosPeloMaiorResto`.
  - `__tests__/nbr12721Quadros.test.ts`: 34 testes. Os 16 casos batem campo a campo com a testemunha (tolerância 1e-9) nos Quadros I, II e IV-B e nas frações. Os milésimos fecham exatamente 1000. Os avisos FECH_001/002/003 aparecem nos casos 12, 14 e 15 e somem nos que fecham. O motor é puro, e referência inexistente gera erro.
  - Mutação provada: trocar q22 por q21 no q30 derruba 6 testes; zerar o q25 derruba 3.
  - Suíte completa: 9.103 testes, 0 falhas. A conta fecha com o `BlueprintEditor.test.tsx` rodado à parte (251 de 251) depois do "still running" do Node 24.
- [x] Fase 1 publicada: `05545205`, check-run `ci` = success
- [x] Fase 2: kernel (3 de 3), **kernel 0.99.0 → 0.100.0**
  - 2.1 `model.ts`: `ClassificacaoNbr12721` em `SpaceLabel.nbr12721?` (cobertura, coeficiente, natureza ACESSORIA, divisão, escopo); `Unidade.acessorios?` (`AcessorioDaUnidade`: uid de vaga, etiqueta ou declarado, com `afetaPrivativa`/`afetaCoeficiente`); família `ambientesDeclarados` (`AmbienteDeclarado`: pavimento, nome, mm² inteiro, `unidadeUid?`, classificação). Invariante: acessório de uma unidade só e **nunca privativo de ninguém** (seria o ACC_VAL_003, agora recusado na origem). No canônico, a classificação e os acessórios saem por família e índice, e o declarado leva a unidade por índice num 2º passo. Tudo é omitido quando ausente.
  - 2.2 `commands.ts`: `SetNbr12721DoAmbiente` (lote de etiquetas e declarados, um objeto novo por alvo), `SetAcessoriosDaUnidade` (tira o acessório da unidade anterior e recusa uid que nunca existiu), `Add/SetAmbienteDeclaradoProps/DeleteAmbienteDeclarado`. `RemoveLevel` leva os declarados. A cauda `limparReferenciasNbr12721` tira o acessório morto e deixa sem dona o declarado cuja unidade sumiu. A cópia de grupo leva a classificação; o pavimento tipo já levava (cópia por espalhamento). `__tests__/blueprintNbr12721Kernel.test.ts`: 10 testes.
  - 2.3 Bundle da `planta-api` regenerado depois da última edição; `plantaApi.test.ts` passa.
  - Prova antes do bump: com a string em 0.99.0, 4.191 testes de blueprint/planta/sync passaram (4.216 = 4.191 + 25 pulados). Depois do bump houve 12 falhas, todas previstas: 6 hashes de golden (cada um uma vez, contagens idênticas) e **6 testes que comparavam a versão como TEXTO**. Como 0.100 é a primeira versão de 3 dígitos, `'0.100' < '0.46'` como string; os testes passaram a comparar número. Antes disso conferi que **nem o app nem o banco** comparam ordem de `kernel_version`: o banco só grava e repassa.
  - Suíte completa: 9.113 = 9.079 + 34 pulados, 0 falhas; tsc 0 erros.
  - Portão `blueprintCamadasPorDisciplina`: `ambientesDeclarados` declarado referência, porque não tem geometria nem camada.
- [x] Fase 2 publicada: `ff968972`, check-run `ci` = success
- [x] Fase 3: unidades do prédio (1 de 1)
  - `utils/blueprintUnidadesDoPredio.ts`: `unidadesDoPredio(model, hipoteses)`. As unidades do tipo são **derivadas**, nunca gravadas, uma por cópia viva, com a chave `"<uid da Unidade>:<uid do pavimento>"`.
  - Cada derivada é **medida no próprio andar**, com as derivadas vizinhas presentes, para a geminada sair geminada.
  - Numeração pela hipótese `ANDAR_E_POSICAO` (101 → 501; T01 no térreo). Um número fora desse padrão cai em `PAVIMENTO_E_NUMERO` ("2º · Apto A"), com aviso.
  - Também geram aviso: unidade que atravessa pavimentos num tipo com cópia (não é replicada), cópia fora de sincronia e número repetido.
  - Exports NBR 12721 da Fase 2 que faltavam no `index.ts` do kernel foram adicionados; o bundle não mudou.
  - `__tests__/blueprintUnidadesDoPredio.test.ts`: 6 testes. 4 unidades × (1 tipo + 10 cópias) = 44, com números únicos e a área igual à da origem; geminada na cópia; renomear a origem propaga; apagar a cópia some com as unidades dela; numeração fora do padrão; duplex. Mutação provada: medir a cópia sem as vizinhas derruba o teste da geminada.
  - Suíte: 9.119 = 9.085 + 34 pulados, 0 falhas; tsc 0 erros.
- [x] Fase 3 publicada: `b4f93bd5`
- [x] Fase 4: adaptador e hipóteses (2 de 2; a 4.2 fechou em 14/10 com a prova no app real da 6b)
  - [x] 4.1 `utils/blueprintNbr12721.ts`
    - `entradaDoEstudo(model, hip)` usa as unidades do prédio (Fase 3), os ambientes desenhados (eixo), a **metade das paredes externas de cada unidade** como espaço privativo próprio e o **resto da área construída** como "Paredes e circulação — <pavimento>" (comum proporcional padrão). Assim o Quadro I fecha com `areaConstruidaMm2`.
    - Vaga vinculada **sai do ambiente que a contém** e entra como acessório, com a cobertura e o coeficiente daquele ambiente.
    - Ambientes declarados entram, e o do tipo é replicado nas cópias com a dona derivada; o acessório vinculado não se replica.
    - Os escopos vêm da classificação ou do padrão do estudo.
    - Rateios não proporcionais vêm das hipóteses; o órfão é avisado e ignorado, e o comum não proporcional sem rateio é avisado.
    - `classificacaoSugerida`: varanda → DIFERENTE; nada acima com pavimento acima (`exposicaoDoNivel` → EXTERIOR) → DESCOBERTA; fora de unidade → comum proporcional. A sugestão entra quando falta classificação, e o ambiente volta em `aClassificar`.
    - **Limite conhecido:** a unidade DERIVADA (andar copiado) ainda não recebe acessório próprio; o vínculo de vaga só existe na unidade de origem. Isso fica para a Fase 6, com a tela de acessórios (campo opcional de pavimento no acessório).
    - `__tests__/blueprintNbr12721.test.ts`: 8 testes. A privativa do IV-B é igual à da Planta; o Quadro I do pavimento é igual à área construída; classificação gravada × hipótese × MOTOR_007; andares copiados; vaga sai da garagem; rateio por hipótese e órfão; sugestão (varanda/descoberta/comum); o **estudo só com declarados reproduz o caso 02 da testemunha** (Quadros I, II e IV-B, 1e-9); sanitização das hipóteses.
    - Mutações provadas: tirar a metade externa derruba 1 teste; não descontar a vaga derruba 1.
  - [x] 4.2 `aplicar_20271013200000_blueprint_study_nbr12721.sql` **aplicada no remoto em 13/10** (tabela nova, uma policy de uma perna `is_org_member`, REVOKE de anon/PUBLIC, GRANT só a authenticated), `services/blueprintNbr12721Service.ts` (get com o padrão quando não há linha; save sanitizado, organização DO ESTUDO) e `types/blueprint.ts` (`BlueprintNbr12721Row`).
    - Prova de RLS num bloco que sempre aborta (a tabela continuou com 0 linhas): um autenticado membro de nada vê 0 e o UPDATE dele afeta 0; o membro da organização do estudo vê 1. Não havia, no banco, usuário que estivesse em alguma organização e fora da do estudo, por isso foi usado um uid novo.
    - `__tests__/blueprintNbr12721Service.test.ts`: 3 testes.
    - `verificar-views-anon.sh` não rodou: pede a senha do agente-leitura, e a migration não cria view.
    - **Falta:** gravar e ler pelo serviço no app real, que vem com a tela da Fase 6.
  - Suíte: 9.130 = 9.096 + 34 pulados, 0 falhas; tsc 0 erros; `check-org-selector-guard` ok.
- [x] Fase 4 publicada: `56803298`, check-run `ci` = success
- [x] Fase 5: estudo sem desenho (2 de 2; o 5.2 entrou com a 6b)
  - [x] 5.1 `utils/blueprintEstudoDoEmpreendimento.ts` (puro) + `services/blueprintEstudoDoEmpreendimento.ts`.
    - Porta o F1/F2 do Motor antigo: o template de pavimentos expandindo `repeat_count`, senão os andares das unidades; nome com o prefixo da torre quando há mais de uma.
    - Cada unidade vira uma `Unidade` (número cortado em 16 caracteres e único, com aviso) com **um ambiente declarado de `private_area` só** (a comum quem rateia é o motor). As áreas comuns viram declarados comuns proporcionais.
    - O serviço cria o estudo na **organização do Empreendimento**, grava o rascunho e vincula `blueprint_study_id`. Ele **recusa se já houver estudo vinculado**, porque sobrescrever quebraria o envio da massa ou do loteamento, e arquiva o estudo criado se o vínculo falhar.
    - **Dados reais (só leitura, em memória, 13/10):** dos 18 empreendimentos, 8 têm torre; os 8 montam e calculam com `success` (o maior é o Garden Cambuhy: 12 pavimentos, 41 unidades, 3 sem privativa avisadas). Os **10 sem torre** faziam a montagem recusar, e recusar deixaria a maioria sem caminho. **Mudança:** sem torre, o estudo nasce com um "Térreo" vazio e um aviso para declarar na tabela.
    - `__tests__/blueprintEstudoDoEmpreendimento.test.ts`: 8 testes.
      - Pavimentos, unidades e ambientes; privativa total = Σ `private_area`; o estudo montado calcula sem nada a classificar.
      - Template com `repeat_count` e garagem; número longo e unidade sem área; duas torres; sem torre.
      - Serviço: organização do Empreendimento, recusa com vínculo e arquiva em falha.
    - Suíte: 9.138 = 9.104 + 34 pulados, 0 falhas. A conta fechou com o `blueprintCasaDeBombas.test.ts` rodado à parte (11 de 11) depois do "pending" do Node 24.
  - [x] 5.2 (publicado na 6b, `7e2c6152`) **Mudança de sequência (13/10):** o botão "Criar estudo de áreas (sem desenho)" e a edição em tabela dos declarados vão **junto com a tela da Fase 6** (aba "Ambientes declarados"). O estudo sem desenho abre na Planta com o canvas vazio; publicar o botão antes da tabela poria no ar um caminho que cria um estudo que ninguém consegue editar.
- [x] Fase 5.1 publicada: `eea4d7f4`, check-run `ci` = success
- [x] Fase 6: tela na Planta (2 de 2 itens do plano + 6a + 6b). **Divisão (14/10):** 6a = a tela com classificação, quadros, frações, pendências e hipóteses + a coluna de fração; 6b = acessórios (inclusive na unidade de andar copiado, com campo de pavimento no acessório e bump do kernel), aba de ambientes declarados (tabela + importar XLSX), botão "Criar estudo de áreas" no Empreendimento (o 5.2) e a prova de gravar e ler as hipóteses no app real (fecha a 4.2).
  - [x] 6.1 `components/blueprint/TelaAreasNbr12721.tsx`, ligada no editor (`telaAberta === 'areas-nbr12721'`, botão "Áreas NBR 12721" em Analisar ao lado de Unidades). As hipóteses são lidas ao abrir e gravadas na organização DO ESTUDO.
    - Abas (`TabsBar`): Classificação, Quadro I, Quadro II, Quadro IV-B, Frações, Pendências, Hipóteses. Os KPIs (`KpiCard`) são área real, área equivalente, unidades e pendências; quando o cálculo está bloqueado, o último card vira "Cálculo bloqueado".
    - Classificação: `ambientesParaClassificar` (as etiquetas dos andares COPIADOS ficam de fora: a sincronização do tipo as reescreve; a coluna "Cópias" diz quantas seguem cada uma), "Aplicar sugestões" num lote só, seleção em lote (§10) e drawer (`Sheet`, §26, malha §30). "Voltar a 'a classificar'" limpa.
    - Quadros e frações calculados ao vivo, com a linha de total numa célula (`colSpan`, molde `PainelEletrica`: o StandardTable não expõe as colunas visíveis).
    - Hipóteses (§30): coeficientes padrão, rateio, área da vaga e numeração. O botão de salvar desligado diz o motivo.
    - Adaptador: "a classificar" passou a contar só as etiquetas que se classificam (antes contava também as cópias: "12" na pendência contra "4" na aba).
    - `__tests__/components/TelaAreasNbr12721.test.tsx`: 8 testes (abas, sugestões em lote, drawer, quadros/frações, pendências, hipóteses, sem permissão, e a coluna de fração nos dois estados).
    - **Harness `docs/spikes/areas-nbr12721/`** (Chrome real, CSS do app, 1.340 px úteis, sem banco). Ele confere:
      - zero rolagem horizontal nas 7 abas e zero erro de página;
      - "Aplicar sugestões" zera a contagem, e a pendência conta o mesmo que a aba;
      - classificar o Hall como "descoberta 0,6" pelo drawer muda a comum equivalente do 101 no Quadro II na hora (24,22 → 19,06);
      - as frações fecham 1.000,0000.
    - **Prints conferidos.** Ajustados por eles: largura de "Pavimento" (cortava), rótulos curtos nos Quadros I/II (cabeçalho em 4 linhas) e a foto do drawer, que saía na animação.
  - [x] 6.2 `TelaUnidades.tsx`: a coluna diz QUAL fração. "Fração ideal (NBR 12721)" é a do IV-B, milésimos fechados com 4 casas, quando o quadro calcula; "Fração estimada (sem coeficiente)" aparece com o motivo quando está bloqueado. O texto da tela e o cabeçalho no editor também mudaram. 2 testes do `BlueprintEditor.test.tsx` esperavam o formato antigo "500,000 ‰" e foram atualizados para "500,0000 ‰" (a mesma fração 0,5, agora do Quadro IV-B), com comentário.
  - REGRA #1, checklist de aplicação:
    - **Aplicado:**
      - imports e colunas via `StandardTable` (§6.10, que embute §1–3, §6.1, §6.2, §6.5, §6.6, §7.2 e §11/§12);
      - `KpiCard` (§4); abas `TabsBar` (§19.1); ordem abas → KPIs → tabela (§20.1);
      - `<td>` em `text-sm font-normal`, com `font-medium` só no total (§7); status em texto colorido sem pílula (§8);
      - ação "Classificar" como texto azul (§9); barra de lote fixa azul (§10); drawer `Sheet` (§26); malha do formulário (§30);
      - botão primário compacto (§17); escala compacta (§16).
    - **Não se aplica:** toggle grade/lista (as tabelas são de quadro); `useConfirm` (nada destrutivo: "voltar a 'a classificar'" é desfazível por Ctrl+Z, porque o kernel é imutável); breadcrumb (o "voltar ao editor" do cabeçalho da Planta faz o papel); gráficos (§28).
    - `check-ui-standard.sh`: 0 violações em `TelaAreasNbr12721.tsx`, `TelaUnidades.tsx` e `BlueprintEditor.tsx` (igual à versão publicada).
  - **Não conferido no app real com login:** o harness monta a tela de verdade, mas sem o editor em volta nem o banco. A prova logada (abrir num estudo real e gravar as hipóteses) depende da senha do agente-leitura e entra na 6b.
  - Suíte: 9.146 = 9.112 + 34 pulados, 0 falhas. A conta fechou com o `BlueprintEditor.test.tsx` rodado à parte (251 de 251) depois da interrupção do Node 24. tsc 0 erros.
  - [x] 6a publicada: `1582c2fd`, check-run `ci` = success
  - [x] **6b** — código em `7e2c6152` (check-run `ci` = success) + correção da prova abaixo
    - **Kernel 0.100.0 → 0.101.0:** `AcessorioDaUnidade.levelUid?` liga o acessório à unidade DERIVADA de um andar copiado (a "201" da "101"); o vínculo mora na origem.
      - Comando e invariante recusam pavimento que não é cópia. O comando recusa explicitamente porque, de novo, a limpeza da cauda descartaria calado.
      - A cauda tira o acessório quando o andar some. No canônico vira `pavimento` (índice), só quando há.
      - Prova antes do bump: 4.252 testes (4.277 = 4.252 + 25). Depois do bump, 6 hashes de golden, cada um uma vez. Bundle regenerado.
    - **Adaptador:** o acessório com `levelUid` vai para a unidade derivada. `acessoriosParaVincular` lista os candidatos (vagas, declarados sem dona, etiquetas comuns fora das cópias) com a dona; `comandosDoAcessorio` troca a dona num lote. `comandosDaPlanilhaDeDeclarados` casa pavimento por nome e unidade por número (sem caixa nem acento), aceita área "1.234,5" ou "12.5" e devolve erro por LINHA, nunca palpite. A Classificação mostra o número da derivada ("acessório de 201").
    - **Tela, aba Acessórios:** "Unidade dona" em select na célula (§7.1), com todas as unidades do prédio, inclusive as derivadas. "Na privativa" e "No coeficiente" ficam desmarcadas e desligadas, com o motivo, sem dona.
    - **Tela, aba Ambientes declarados:** nome, pavimento, área e unidade editáveis na linha; "Adicionar" na barra, desligado com o motivo; excluir com `useConfirm` (§14); "Importar planilha" (xlsx) e "Modelo", que baixa a planilha com as colunas da importação.
    - **5.2:** botão no cabeçalho do `EmpreendimentoDetail`. Sem estudo vinculado é "Criar estudo de áreas": confirma, cria pelo serviço da Fase 5.1, mostra contagem e avisos e só navega com "Abrir na Planta". Com estudo vinculado é "Áreas NBR 12721" e abre direto.
    - **Link direto `#/blueprint?studyId=…&tela=areas-nbr12721`:** a lista de telas permitidas fica em `components/blueprint/telasDoLinkDireto.ts` (só `areas-nbr12721` e `unidades`; o resto é ignorado). A tela pedida vale só para aquele estudo.
    - **Testes:**
      - kernel: 1 caso (andar copiado aceito e não-cópia recusado, ida e volta, apagar o andar);
      - adaptador: vaga do 201 no IV-B do 201 e troca de dona; planilha com 5 linhas, inclusive a recusada com os 5 motivos;
      - componente: 2 casos (Acessórios, Ambientes declarados);
      - link direto: 2 casos (`tela` válida e desconhecida).
    - **Harness:** 9 abas, zero rolagem horizontal, prints conferidos.
    - Suíte: 9.153 = 9.119 + 34, 0 falhas; tsc 0; `check-ui-standard` limpo em `TelaAreasNbr12721`, `EmpreendimentoDetail` e `BlueprintModule`.
    - **Prova no app real (14/10, escrita autorizada pelo usuário, agente-leitura, servidor local desta frente, roteiro `c:/tmp/pwtest/areas-nbr-app-real.cjs`, senha só por variável de ambiente):**
      - Empreendimento descartável "ZZ TESTE Áreas NBR" (1 torre, 2 unidades de 60 e 40 m²) → "Criar estudo de áreas" → aviso "1 pavimento(s), 2 unidade(s), 2 ambiente(s)" → "Abrir na Planta" **abriu direto na tela Áreas NBR 12721** (KPI de unidades = 2).
      - Hall de 20 m² declarado pela aba, sugestões aplicadas. Quadro II: 101 = 0,600000 com 12,00 m² do hall, 102 = 0,400000 com 8,00, Σ coeficientes 1,000000.
      - Hipótese gravada **na organização do estudo (Alpa) com o topo em "Todas as organizações"** — conferido no banco (REGRA #5).
      - Na 2ª rodada, o botão do Empreendimento já era "Áreas NBR 12721" e o Hall da 1ª rodada estava lá: o rascunho foi gravado.
      - Depois de **recarregar a página**, a hipótese voltou do banco e o Hall continuou. Zero erro de página ou HTTP.
      - **Defeito achado pela prova e corrigido:** "Hipóteses salvas." sumia na hora. O formulário tinha `key={JSON.stringify(hipoteses)}`, e as hipóteses que voltam do salvar o remontavam. O teste de componente não via porque o salvar simulado não devolvia hipóteses. Agora os campos acompanham por efeito, sem remontar. Teste novo com estado real; com a `key` de volta, ele reprova.
      - **Limpeza conferida no banco:** estudo e Empreendimento de teste apagados num bloco que exige exatamente 1 de cada (cascata: ramos, hipóteses, torres, unidades). Antes = depois: 18 empreendimentos, 77 estudos, 0 hipóteses, 0 ramos e 0 torres sobrando. A trilha de auditoria do Empreendimento (sem FK, imutável) fica, como nas provas anteriores.
    - Suíte: 9.154 = 9.120 + 34, 0 falhas; o `blueprintPlantaDaUnidade.test.ts` foi rodado à parte (22 de 22) depois do "pending" do Node 24.
- [x] **Fase 7: congelar e aprovar (2 de 2)**
  - **7.1 Migration** `aplicar_20271014100000_blueprint_snapshot_nbr12721.sql`, aplicada com `db query -f`:
    - `blueprint_snapshot_nbr12721`: entrada, saída, hash sha256 da saída canônica e `versao_motor` (`nbr12721-ts-1.0.0`). FK composta `(snapshot_id, organization_id)` com CASCADE. UPDATE bloqueado pelo gatilho; grant só de SELECT e INSERT.
    - `…_aprovacoes`: TÉCNICA e JURÍDICA, uma de cada, com o hash aprovado. Só SELECT para `authenticated`; quem grava é a RPC `aprovar_nbr12721_da_versao` (SECURITY DEFINER, autorização dentro, REVOKE de PUBLIC e anon).
    - **Provado num bloco que sempre aborta:**
      - UPDATE do quadro dá 23001; jurídica antes da técnica dá 22023;
      - técnica e depois jurídica passam; repetir dá 23505;
      - quadro com pendência dá 22023; não-membro dá 42501 e lê 0 linhas;
      - UPDATE de aprovação dá 23001.
  - **7.2 Congelar ao publicar e aprovar nas Versões:**
    - `congelamentoNbr12721(model, hipóteses)` em `utils/blueprintNbr12721.ts`;
    - `publicarComTopografia` congela logo depois do produto. Uma falha NÃO desfaz a publicação: fica o aviso no console, e a seção diz "publique de novo";
    - `SecaoNbr12721DaVersao` no painel Versões mostra o hash, as aprovações e os botões, que quando desligados dizem o motivo.
  - **Defeito achado pela prova e corrigido:** "Publicar versão" ficava desligado em estudo SEM desenho. O `hashAtual` do `useBlueprintEditor` exigia parede ou divisa, e agora conta também unidades e ambientes declarados. O teste novo `blueprintPublicarSemDesenho.test.ts` reprova com a regra antiga.
  - **Prova no app real (14/10, agente-leitura, Vite local desta frente, roteiro `c:/tmp/pwtest/areas-nbr-fase7.cjs`):**
    - estudo descartável "ZZ TESTE Áreas NBR v7" com 101 de 60 m², 102 de 40 m² e um hall de 20 m², publicado pela TELA;
    - versão 1 com o quadro congelado: status success, hash `c73e050a…`, frações 101 = 600 e 102 = 400;
    - adulterar pelo cliente devolveu 42501 e o quadro ficou intacto;
    - em Versões, a seção diz "congelados" e a jurídica fica desligada com "A aprovação jurídica vem depois da técnica";
    - a técnica foi aprovada "por você" com observação, depois a jurídica, e os botões somem; nenhum erro de página nem de HTTP;
    - **no banco:** 2 aprovações, as duas com o hash igual ao do quadro e a organização igual à da versão.
  - **Limpeza conferida no banco:** o estudo foi apagado num bloco que exige exatamente 1 linha (a cascata leva ramo, versão, quadro e aprovações). Antes e depois: 77 estudos, 9 versões, 0 quadros, 0 aprovações.
  - **Testes:** congelamento no `blueprintNbr12721.test.ts`, 4 casos em `SecaoNbr12721DaVersao.test.tsx` e 2 em `blueprintPublicarSemDesenho.test.ts`.
  - **Suíte:** 9.161 = 9.127 + 34 pulados, 0 falhas, em 907 arquivos; tsc 0; `verificar:build` limpo; `check-ui-standard` limpo em `SecaoNbr12721DaVersao` e `PainelVersoes`.
  - **⚠️ Lição de processo:** o relatório JSON da suíte em `/tmp` foi sobrescrito por OUTRA frente (`/tmp` é compartilhado entre as sessões). A primeira leitura mostrou 610 arquivos de outra pasta. O relatório agora vai para o scratchpad da sessão, e a raiz dos caminhos é conferida.
  - ~~Pendente: mostrar o NOME de quem aprovou~~ — feito na Fase 8.
- [x] **Fase 8: saídas (2 de 2)**
  - **8.1 PDF e XLSX da versão:**
    - `utils/nbr12721/documento.ts` (puro) monta as tabelas a partir da SAÍDA CONGELADA, nunca de um recálculo:
      - Quadro I com as colunas 2 a 18 e Quadro II com as 20 a 38, com cabeçalho de grupo como na norma (Privativa / Comum não proporcional / Comum proporcional / Total);
      - Quadro IV-B, frações com os milésimos fechados em 1000, pendências e aprovações;
      - linha de total em cada quadro.
    - `services/nbr12721ExportService.ts`:
      - `documentoDaVersao` reúne estudo, empresa (carimbo do template de pranchas da organização, ou o nome da organização), versão, hash, motor e aprovações com o NOME de quem aprovou;
      - `pdfDoDocumento`: A4 paisagem, cada quadro inteiro na largura da folha, rodapé "empresa · estudo · Versão N · hash" em toda página;
      - `pastaXlsx`: aba Resumo + uma aba por tabela, com números como número.
    - Na seção da versão (painel Versões), botões "Baixar PDF" e "Baixar XLSX".
    - **Pendência da Fase 7 fechada:** a seção mostra o nome de quem aprovou, lido de `organization_members`. Uma falha nessa busca deixa o id curto e NÃO derruba a seção. O teste pegou que, do primeiro jeito, ela derrubava; agora há caso para isso.
  - **8.2 Memorial de incorporação:**
    - `incorporationMemorialService` passa a ler as Áreas NBR da versão publicada do estudo ligado ao Empreendimento (`documentoDoMemorial`), e não mais do Motor de Áreas.
    - A versão citada é escolhida por `versaoDoMemorial`: a de revisão mais alta com técnica E jurídica; senão a com técnica; senão a mais recente congelada.
    - A seção "e" traz versão, hash inteiro, situação e aprovações, e AVISA enquanto falta aprovação. A "i" traz os milésimos fechados.
    - O `EmpreendimentoDetail` não importa mais o `areaEngineService`.
  - **2 defeitos ANTIGOS do memorial, achados ao olhar o PDF renderizado:**
    - as notas "⚠ …" saíam letra a letra espaçadas e passavam da margem: a Helvetica do jsPDF não tem o "⚠". Agora é "Pendente: …", com a caixa crescendo conforme as linhas;
    - o nome do arquivo perdia as letras acentuadas ("reas", "descart_vel"). Agora tira o acento antes de filtrar.
  - **Ajustes no PDF achados na imagem (não nos números):**
    - sem `horizontalPageBreak`: com ele ligado, o autoTable partia o Quadro I em duas páginas meio vazias em vez de encolher as colunas;
    - totais alinhados à direita;
    - título da tabela como texto acima dela;
    - nenhuma tabela começa no pé da folha com uma linha só.
  - **Prova no app real (14/10, agente-leitura, Vite local, roteiro `c:/tmp/pwtest/areas-nbr-fase8.cjs`):**
    - Empreendimento descartável com 12 unidades em 3 andares (áreas quebradas) e hall de 33,30 m²; estudo criado e publicado pela tela, técnica e jurídica aprovadas;
    - "Baixar PDF", "Baixar XLSX" e, no Empreendimento, "Minuta do Memorial" baixaram, sem erro de página nem de HTTP;
    - **conferido contra o banco:**
      - as frações do XLSX batem unidade a unidade com a saída gravada, com Σ milésimos = 1000;
      - o total do Quadro I (698,16) bate;
      - o hash nas aprovações é o do quadro, e o nome de quem aprovou veio resolvido;
      - o PDF tem 3 páginas e traz o hash inteiro e os totais;
      - o memorial cita a versão aprovada, sem aviso, e as notas saem legíveis;
    - duas rodadas, a segunda já com o código final. O hash saiu idêntico nas duas: mesma entrada, mesmo hash.
  - **Limpeza:** cada rodada foi apagada num bloco que exige 1 empreendimento e 1 estudo. Antes e depois: 18 empreendimentos, 9 torres, 85 unidades, 0 áreas comuns, 77 estudos, 9 versões, 0 quadros, 0 aprovações.
  - **Testes:**
    - `nbr12721Documento.test.ts`, 13 casos: colunas da norma, totais, grupos, cabeçalho, formatação, XLSX lido de volta, PDF monta, escolha da versão do memorial e texto das seções "e"/"i";
    - `SecaoNbr12721DaVersao`, 3 casos novos: nome, falha do nome, baixar e erro ao baixar.
  - **Suíte:** 9.177 = 9.143 + 34 pulados, 0 falhas, em 908 arquivos (relatório no scratchpad, raiz conferida); tsc 0; `verificar:build` limpo; `check-ui-standard` limpo em `SecaoNbr12721DaVersao` e `EmpreendimentoDetail`.
- [x] **Fase 9: Empreendimento (3 de 3)**
  - **Decisões tomadas na implementação, com o padrão mais seguro:**
    - **Só versão aprovada na técnica E na jurídica devolve.** Essa fração vai para o Condomínio e para o Comercial.
    - **A ligação unidade do Empreendimento ↔ unidade da Planta é PROPOSTA e confirmada na tela, nunca gravada em silêncio:**
      - a que já existe fica;
      - a sem ligação ganha a da Planta de MESMO número (sem acento, caixa nem espaço) só quando o número é único dos dois lados;
      - o resto fica sem par.
    - **O estudo criado pelo Empreendimento (Fase 5) já nasce ligado:** a unidade da Planta nasce da unidade do Empreendimento, então ali a ligação é fato, não proposta.
  - **9.1 Migration `aplicar_20271014200000_empreendimento_unit_nbr12721.sql`** (aplicada com `db query -f`):
    - `empreendimento_units.blueprint_unidade_chave`, no molde do `blueprint_massa_chave`;
    - `empreendimento_units.nbr12721_snapshot_id`, FK para `blueprint_snapshots` com `ON DELETE SET NULL`. A `area_engine_version_id` fica até a Fase 10, porque tem FK para `area_versions`;
    - `blueprint_snapshot_nbr12721.unidades`: código ↔ chave ↔ número, congelado na publicação. Sem isso a fração ("101 [2]") não volta à unidade certa. A tabela tinha 0 linhas, então não houve linha antiga a tratar;
    - **RPC `devolver_nbr12721_ao_empreendimento(versão, empreendimento, pares)`:** SECURITY DEFINER, autorização dentro, uma transação. Grava a fração (milésimos FECHADOS em 1000), a área real total (IV-B f), a versão e a data, sempre com origem MOTOR, e nunca toca fração de CONVENÇÃO. REVOKE de PUBLIC e anon; ACL conferida (só authenticated, postgres e service_role).
    - **Provado num bloco que sempre aborta:**
      - caminho feliz: 101/102 gravadas (0,6 / 600 / 72 m², MOTOR, versão e data); 103 de convenção intacta; Zeladoria (sem fração) reportada;
      - sem aprovação: 22023; só técnica: 22023;
      - chave repetida, chave inexistente, unidade de outro empreendimento e versão de outro estudo: 22023;
      - chave que ficaria em duas unidades: 23505;
      - não-membro: 42501; sem login: 42501;
      - nada sobrou no banco.
  - **Código:**
    - `congelamentoNbr12721` passa a congelar as `unidades`;
    - `utils/nbr12721/vinculos.ts` (puro): `propostaDeVinculos` e `paresParaDevolver`;
    - o serviço da versão ganha `unidadesDaVersao`, `empreendimentoDoEstudo`, `unidadesDoEmpreendimento` e `devolverAoEmpreendimento`, que registra o evento no histórico do Empreendimento (`unit` / `sync` / `sync_blueprint`);
    - `DevolucaoNbr12721.tsx`, drawer `Sheet` 2xl com `StandardTable` denso: o par vai num select na célula (§7.1), cada linha mostra a situação, o botão desligado diz o motivo e, no fim, aparece o relatório;
    - na seção da versão entra "Levar ao Empreendimento", desligado com o motivo (sem Empreendimento ligado, com pendência, sem as duas aprovações), e o hash ganha o botão de copiar (§27);
    - `blueprintEstudoDoEmpreendimento.criar` grava as chaves;
    - `blueprint_unidade_chave` e `nbr12721_snapshot_id` entram no `UNIT_COLS`, conferido pelo teste de travas.
  - **9.2:** nas Vinculações, a seção "Áreas NBR 12721" mostra a versão que o memorial cita, com a situação das aprovações, e "Abrir" leva a `#/blueprint?studyId=…&tela=areas-nbr12721`. Sem desvincular, porque o vínculo é o do estudo da Planta. Estudo sem versão congelada aparece dizendo o que falta. Na tela de Frações do Condomínio, a origem MOTOR passa a ser "Planta (NBR 12721)".
  - **9.3:** o `empreendimentoLinksService` não lê mais `area_projects` (sai `loadAreaProject`/`linkAreaProject`, entra `loadAreasNbr`). A busca por `areaEngine` em `empreendimentoAuditService`, `empreendimentoLinksService` e `empreendimentoTypeService` dá vazio.
    - **⚠️ Para a Fase 10:** `empreendimento_types.motor_category`, `getMotorCategory` e o campo "categoria do motor" da tela de Tipos de Empreendimento só servem ao Motor antigo e saem junto com ele.
    - Os rótulos `area_project`/`area_engine` da aba Histórico ficam, porque leem eventos antigos.
  - **Prova no app real (14/10, agente-leitura, roteiros `c:/tmp/pwtest/areas-nbr-fase9*.cjs`):**
    - **preparo:** Empreendimento com 6 unidades em 2 andares e hall; criar o estudo **já ligou as 6**;
    - **o que foi mexido de propósito:** a 102 virou convenção; a 201 perdeu a ligação; a 999 foi criada depois, sem par;
    - **antes das aprovações,** "Levar" fica desligado com o motivo;
    - **no drawer:** 101 "Já ligada"; 102 "Já ligada · convenção (fração mantida)"; 201 "Proposta pelo número"; 999 "Sem par"; o botão diz "Gravar e levar 5 fração(ões)";
    - **relatório:** "5 gravadas; 6 ligadas; convenção mantida: 102; sem par: 999";
    - **no banco,** as 5 frações e áreas batem com a versão congelada, a 102 ficou com 50 milésimos e a fonte dela, a 999 não foi tocada, e o evento entrou no histórico;
    - **Vinculações** mostra "Quadros NBR 12721 — versão 1 · Técnica e jurídica aprovadas", sem desvincular, e "Abrir" abre a tela Áreas NBR 12721 (o módulo limpa o hash depois de ler o link, então o portão confere a TELA, não a URL);
    - nenhum erro de página nem de HTTP.
  - **Defeito achado pela prova e corrigido:** no drawer, a coluna "Milésimos atuais" sumia à direita (larguras somando 760 px num Sheet de ~670). Agora somam 620, e a medida no app deu tabela de 624 px num container de 624, sem rolagem.
  - **Limpeza:** bloco que exige 1 empreendimento e 1 estudo. Antes e depois: 18 empreendimentos, 9 torres, 85 unidades, 0 áreas comuns, 77 estudos, 9 versões, 0 quadros, 0 aprovações, 0 unidades ligadas. A trilha de auditoria do Empreendimento apagado fica (sem FK, imutável), como nas provas anteriores.
  - **Testes:**
    - congelamento com andares copiados;
    - `nbr12721Vinculos.test.ts`, 4 casos;
    - criação já ligada (Fase 5);
    - `DevolucaoNbr12721.test.tsx`, 3 casos;
    - seção: "Levar" com os 3 motivos e a abertura;
    - trava do `UNIT_COLS`.
  - **Suíte:** 9.187 = 9.153 + 34 pulados, 0 falhas, em 910 arquivos; tsc 0; `verificar:build` limpo; `check-ui-standard` limpo em `DevolucaoNbr12721`, `SecaoNbr12721DaVersao`, `VinculacoesTab` e `FracoesTab`. O `verificar-views-anon.sh` não se aplica: nenhuma view criada.
- [ ] **Fase 10: remoção (4 de 5; o DROP da 10.5 roda depois que a produção estiver no código sem o Motor)**
  - **Inventário do banco antes de qualquer remoção (14/10):**
    - 18 tabelas `area_*`, com 2 projetos e 3 versões, os mesmos da análise;
    - nenhuma view dependente, nenhum gatilho de fora, nenhum `cron`, nenhum enum `area_*` usado fora;
    - uma única FK de fora: `empreendimento_units.area_engine_version_id`, com 0 linhas preenchidas;
    - `empreendimento_types.motor_category` NOT NULL sem padrão: só o Motor a lia.
  - **Ordem segura:** migration preparatória (inofensiva ao código em produção), depois o push, depois o DROP.
  - **Migration `aplicar_20271014300000_areas_nbr12721_permissao.sql`** (aplicada com `db query -f`):
    - `fn_pode_editar_areas_nbr12721(org)`: não-membro não; admin/owner sim; chave `canEditAreaEngine` definida vale ela; sem chave, viewer não e os demais sim;
    - as RPCs `aprovar_nbr12721_da_versao` e `devolver_nbr12721_ao_empreendimento` passam a exigir a permissão. O corpo foi copiado dos ARQUIVOS das migrations, mais a checagem;
    - `motor_category` ganha DEFAULT 'vertical';
    - ACL conferida (só authenticated, postgres e service_role);
    - **provado num bloco que aborta:**
      - member+false: não; member+true: sim; member sem chave: sim; viewer sem chave: não; admin+false: sim; outra org: não;
      - aprovar e devolver negados dão 42501; liberados, passam;
      - o membro do agente-leitura ficou intacto.
    - Em 14/10 nenhum membro tinha a chave negada nem papel viewer: ninguém perdeu acesso.
  - **10.1 Menu:**
    - saem os dois "Áreas NBR 12721" (Engenharia e Incorporação), o `engViews` e o `hasActiveChild`;
    - teste `LayoutMenuSemMotorDeAreas.test.tsx` (abre os dois grupos e confere os vizinhos);
    - **portão que mentia, achado e corrigido no teste:**
      - os itens só entram no DOM com o grupo aberto, então "0 itens" sem abrir era falso;
      - `dashboard` já abre Engenharia, e o clique a fechava; por isso a view usada no teste é neutra;
    - o teste reprova com o Layout antigo (2 itens).
  - **10.2 Roteador:** saem o `case 'area-engine'`, o lazy import e a entrada da lista de permissão. O endereço antigo `area-engine` cai em `blueprint`. Provado no app: `#/area-engine` abre a Planta, sem tela branca.
  - **10.3 Permissões:**
    - "Áreas NBR 12721 (Planta)" vai para o grupo Incorporação. As chaves mantêm o nome antigo, pelo que já está gravado nos membros;
    - `hooks/useAreasNbr12721Edicao.ts` tem a mesma regra do banco, testada;
    - sem a permissão, a tela Áreas NBR 12721 abre SÓ PARA LEITURA:
      - aviso no topo;
      - classificação sem lote; "Classificar" e "Aplicar sugestões", acessórios, declarados (campos, Adicionar, Importar, excluir) e o salvar das hipóteses ficam desligados com o motivo;
      - ler, buscar e exportar continuam;
    - na seção da versão, "Aprovar" e "Levar ao Empreendimento" ficam desligados com o motivo, e baixar continua;
    - o banco confere a mesma regra nas RPCs.
  - **10.4 Código apagado:**
    - `AreaEngineModule.tsx`, `components/area-engine/`, `areaEngineService.ts`, `areaEngineExportService.ts` e `types/areaEngine.ts`;
    - `__tests__/areaEngineFixtures.test.ts` (21 testes), substituído pelas 16 fixtures da Fase 0;
    - os 12 `supabase/seed/area_engine_*.sql`;
    - `QA_MOTOR_AREAS_NBR12721.md` foi para `docs/historico/`.
    - **Tipos de Empreendimento:** a coluna "Categoria" vira "Cor", porque a edição da cor morava na célula da categoria. Saem `motor_category`, `getMotorCategory` e `MOTOR_CATEGORY_OPTIONS`. Provado no app: criar um tipo sem `motor_category` passa (DEFAULT) e o tipo de teste foi apagado (0 no banco).
    - **Também:**
      - `area_engine_version_id` sai dos tipos e do `UNIT_COLS`;
      - o Histórico rotula os eventos antigos como "(Motor antigo)";
      - o script da testemunha ganha o aviso "não roda mais; a testemunha está congelada nos JSON".
    - **Busca do critério:** sobram só as chaves de permissão `canView/canEditAreaEngine`, de propósito (dado gravado), e o redirecionamento de `area-engine`. Fora disso, `areaEngine|area-engine|AreaEngine` só aparece em migrations antigas e em documentos.
  - **Suíte:** 9.171 = 9.137 + 34 pulados, 0 falhas, em 911 arquivos. A conta fecha com 9.187 − 21 (areaEngineFixtures) + 5 novos e 910 − 1 + 2 arquivos. tsc 0; `verificar:build` limpo; `check-ui-standard` limpo nos `.tsx` tocados.
  - **10.5 DROP:** pendente. Roda depois do push, com a produção conferida no código novo.

Ordem de publicação: cada fase publica sozinha (push em `main`). Até a fase 9 o Motor antigo continua no ar e intocado. A fase 10 só começa com as fases 0 a 9 provadas em produção.

## Verificação (ponta a ponta)

1. **Mecânica, a cada fase:** `npm run typecheck` (o exit lido por `grep`, nunca por `tail`), os testes novos e os afetados, `check-ui-standard.sh` nos `.tsx` alterados e `npm run build`. A suíte completa roda antes de cada push; a check-run `ci` é lida depois do push.
2. **Testemunha:** `nbr12721Quadros.test.ts` reproduz a saída do SQL em todas as fixtures. É a prova de que o motor TS calcula o mesmo que o Motor antigo.
3. **App real** (harness Playwright do `index_harness_navegador`, escritas bloqueadas por padrão):
   - estudo desenhado: Planta › Analisar › Áreas NBR 12721, conferindo os três quadros e a reação ao vivo a uma mudança de coeficiente;
   - estudo sem desenho criado do Empreendimento;
   - com escrita autorizada num estudo **descartável**: publicar, aprovar, exportar PDF/XLSX, devolver a fração e ver a aba Frações do Condomínio.
4. **Banco:** a imutabilidade (23001), a RLS de outra organização (0 linhas), a RPC com `REVOKE` e, na fase 10, a ausência das tabelas e funções `area_*`.
5. **Produção:** `scripts/publicar-producao.sh` encontra o SHA no domínio depois de cada push.
