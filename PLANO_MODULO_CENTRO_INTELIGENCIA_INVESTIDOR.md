# PLANO — Centro de Inteligência do Investidor

> Status: **PRD reescopado (aguardando implementação)** · Submódulo do [[project_portal_investidor]] (Fases 1–4 completas).
> Origem: PRD de visão "analista digital" (4 perguntas por evento). Este documento **reescopa** aquele PRD em
> MVP-0/1/2 para inverter a ordem de risco: começar pelo impacto **determinístico** sobre dados internos, e
> tratar notícia externa + IA interpretativa como fases posteriores (com revisão humana e disclaimer jurídico).

## 1. Tese e princípio de priorização

O diferencial **não** é agregar notícias — é ordenar por **relevância para a carteira** do investidor e responder,
para cada evento, 4 perguntas: **o que aconteceu / como impacta meus investimentos / preciso agir / qual a relevância**.

O PRD original prioriza no MVP exatamente as partes de **maior custo e maior risco** (ingestão de notícia externa
+ IA que interpreta impacto de mercado). Este plano inverte:

- **Impacto calculado** (determinístico, sobre dados ÒPURA): alto valor, baixo risco, auditável → **MVP-0**.
- **Leitura de mercado** (IA sobre notícia externa, especulativa): alto risco reputacional/regulatório → **MVP-1+**,
  sempre com confiança explícita, revisão humana e disclaimer.

## 2. Riscos que governam o escopo

1. **Regulatório (CVM).** "Ação sugerida", "Radar de Oportunidades", "recomendações por perfil" tangenciam
   **recomendação de investimento**. Investidor lê "oportunidade/risco" como conselho. → **Bloqueio**: validar
   com jurídico antes de produção; disclaimer obrigatório em todo item de leitura de mercado.
2. **IA interpretativa erra e vira risco reputacional.** Correlação "nova fábrica em Extrema → valoriza seu galpão"
   é especulativa. → Revisão humana (painel admin) no MVP-1; confiança e fonte sempre visíveis.
3. **Ingestão de notícia externa é sumidouro de esforço** (APIs caras/limitadas, scraping frágil, direito autoral).
   O próprio painel "aprovar/ocultar/editar resumo" já assume que IA sozinha não basta. → Adiar para MVP-1.

## 3. O que JÁ existe (reusar, não reimplementar)

| Necessidade | Onde já está no ÒPURA |
|---|---|
| Indicadores econômicos (Selic/CDI/IPCA/INCC/CUB) | script BACEN — [[project_dados_mestres_integracao]] |
| Relação investidor ↔ SPE ↔ obra/empreendimento | [[project_portal_investidor]] + [[project_modulo_empreendimentos]] |
| Eventos internos (medições, cronograma, fluxo, ocorrências) | Empreendimentos / Financeiro / Planejamento / BI |
| Comunicados internos ao investidor | Portal do Investidor (docs+comunicados) |
| Orçamento/medições p/ cálculo de impacto | módulo Orçamento + curva S / DRE por obra |
| Padrão de cron (diário/mensal) | [[project_modulo_tarefas]], Portal, Controladoria |
| Padrão RLS por org (dual-check uid+email) | [[feedback_rls_organization_members]] |
| Objeto polimórfico (modelo de referência) | [[project_bim_lab_spike]] (Objeto Digital) |

## 4. Modelo de dados (núcleo)

**`intelligence_event` polimórfico** — uma linha por evento de inteligência, espelhando as 4 perguntas:

- `id`, `org_id`, `source_type` (`INDICATOR | INTERNAL_EVENT | NEWS`), `source_ref` (JSON do payload bruto)
- `category` (enum: Mercado/Juros/Inflação/Construção/Obras/Locação/Venda/Financiamento/Jurídico/Ambiental…)
- **4 respostas**: `what_happened`, `impact_summary`, `suggested_action` (nullable), `severity` (`INFO|BAIXO|MEDIO|ALTO|CRITICO`)
- `impact_kind` (`CALCULATED` determinístico × `MARKET_READING` IA) — **separação obrigatória na UI**
- `ai_confidence` (0–1, só p/ MARKET_READING), `ai_audit` (prompt+modelo+versão+output — obrigatório, ver §2/§7)
- `human_reviewed` (bool), `published` (bool), `pinned` (bool)
- `event_date`, `created_at`

**`intelligence_event_link`** (junção evento ↔ alvo): `event_id`, `target_type` (`PROJECT|SPE|ASSET|INVESTOR`),
`target_id`, `relevance_score` — base da ordenação por relevância da carteira.

**`investor_intel_feedback`**: `event_id`, `investor_id`, `useful` (bool) — alimenta melhoria de relevância.

**`investor_intel_prefs`**: categorias de interesse, empreendimentos favoritos, nível mínimo de impacto. (MVP-0 mínimo.)

RLS por org com dual-check uid+email ([[feedback_rls_organization_members]]) — não inventar padrão novo, copiar o de Empreendimentos.

## 5. Fases

### MVP-0 — Inteligência determinística (interno, baixo risco) ⭐ COMEÇAR AQUI
Valida a tese sem nenhuma notícia externa nem IA especulativa.

1. **Dashboard** do Centro de Inteligência (cartões por prioridade) no Portal do Investidor.
2. **Feed priorizado por relevância** (não cronológico) — ordenação por `relevance_score` da carteira.
3. **Indicadores econômicos** (Selic/CDI/IPCA/INCC/CUB) via script BACEN existente → vira fonte `INDICATOR`.
4. **Indicadores Inteligentes (feature matadora)**: impacto **determinístico** sobre orçamento/medições —
   ex.: "INCC +0,46% → custo restante da obra ~+R$ 420 mil". Conta sobre dados ÒPURA, `impact_kind=CALCULATED`.
5. **Eventos internos** como fonte (`INTERNAL_EVENT`): medições, marcos de cronograma, fluxo financeiro, ocorrências.
6. **Correlação evento → empreendimento da carteira** (junção + score). Reusa relação investidor↔SPE↔obra.
7. **Feedback "Útil / Não útil"** por evento.
8. Preferências básicas (categorias + empreendimentos favoritos).

### MVP-1 — Notícia externa + IA com revisão humana
1. **Uma** fonte de notícia externa (não várias) → `source_type=NEWS`.
2. **Resumo executivo por IA** (Opus) com as 4 respostas; `impact_kind=MARKET_READING`, `ai_confidence` + `ai_audit`.
3. **Painel admin / moderação**: aprovar, ocultar, destacar, fixar, editar resumo, reclassificar. `published` só após revisão.
4. **Classificação automática** por categoria.
5. **Disclaimer jurídico** em todo item de leitura de mercado (pré-requisito: validação CVM — §2).
6. **Busca unificada** (notícias + comunicados + empreendimentos + indicadores).
7. **Alertas inteligentes** por criticidade — canal **Portal** apenas.

### MVP-2 — Expansão
- Múltiplas fontes externas + cache inteligente (RNF §21 do PRD original).
- Radar de Riscos / Oportunidades estruturados (probabilidade/impacto/criticidade/mitigação).
- Alertas Push / Email / WhatsApp.
- Linha do tempo com filtros; explicação da IA expansível.
- Personalização avançada (regiões, palavras-chave, frequência).

### Diferido / Não-objetivo
- Multi-idioma (PRD §18/§21).
- Modelos preditivos de impacto financeiro / cenários macro (visão de longo prazo — só depois de MVP-2).
- Serviços meteorológicos, dados governamentais externos.

## 6. Requisitos não funcionais que NÃO são opcionais
- **Auditoria de toda análise de IA** (`ai_audit`): prompt, modelo (`claude-opus-4-8`), versão, output. Necessário
  para compliance e para o KPI "Precisão da IA". Já no MVP-1.
- **Processamento assíncrono** via cron (reusar padrão diário/mensal existente) — coleta e enriquecimento fora do request.
- **Separação visual rígida** CALCULATED × MARKET_READING — nunca apresentar leitura de IA com o mesmo peso de cálculo determinístico.

## 7. Ordem de implementação sugerida
1. Migration `intelligence_event` + links + feedback + prefs (+ RLS dual-check). NÃO aplicar fora de janela (ver fila de migrations pendentes em [[project_opura_analytics]]).
2. Fonte `INDICATOR` (BACEN) + motor de impacto determinístico sobre orçamento (núcleo de valor).
3. Dashboard + feed priorizado + correlação carteira + feedback (MVP-0 fechado).
4. Só então: fonte NEWS + IA + painel de moderação (MVP-1), após sinal verde do jurídico.

## 8. Métricas de sucesso
- Taxa "Útil" do feed (qualidade da relevância) — KPI primário.
- Engajamento no Portal do Investidor (sessões/abertura).
- Precisão da IA (% de itens MARKET_READING aprovados sem edição no painel).
- Tempo até primeira fonte determinística entregar impacto real (MVP-0).
