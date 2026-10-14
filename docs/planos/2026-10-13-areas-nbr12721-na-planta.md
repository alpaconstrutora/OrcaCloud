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
- [ ] Fase 3: unidades do prédio (0 de 1)
- [ ] Fase 4: adaptador e hipóteses (0 de 2)
- [ ] Fase 5: estudo sem desenho (0 de 2)
- [ ] Fase 6: tela na Planta (0 de 2)
- [ ] Fase 7: congelar e aprovar (0 de 2)
- [ ] Fase 8: saídas (0 de 2)
- [ ] Fase 9: Empreendimento (0 de 3)
- [ ] Fase 10: remoção (0 de 5)

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
