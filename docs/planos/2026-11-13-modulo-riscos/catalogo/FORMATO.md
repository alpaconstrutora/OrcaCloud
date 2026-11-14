# Catálogo de riscos enriquecido — formato

Fonte dos eventos: `eventos-base.tsv` (transcrição literal da especificação
"ÒPURA Riscos – Especificação funcional", 13/11/2026). **O texto do evento não se
altera**: o catálogo acrescenta campos, não reescreve o evento.

Situação: **RASCUNHO para revisão técnica** (engenheiro civil e técnico/engenheiro de
segurança do trabalho). Nada aqui é parecer técnico.

## Um arquivo por categoria: `RXX.json`

```json
{
  "categoria": "R05",
  "nome": "Riscos geológicos, geotécnicos e topográficos",
  "itens": [ { ...item... } ]
}
```

## Item

| campo | tipo | regra |
|---|---|---|
| `codigo` | string | igual ao `eventos-base.tsv` |
| `evento` | string | **cópia literal** do `eventos-base.tsv` |
| `causas` | string[] 2–4 | causas típicas e específicas, nada genérico como "falta de gestão" |
| `consequencias` | string[] 2–4 | efeitos concretos (o que acontece com custo, prazo, pessoas, obra, contrato) |
| `controles_preventivos` | string[] 3–5 | ações que reduzem a probabilidade ou a consequência ANTES do evento; verificáveis (gera evidência) |
| `controles_resposta` | string[] 1–3 | contingência / o que fazer quando o evento ocorre |
| `sinais_alerta` | string[] 1–3 | indicadores observáveis/mensuráveis que antecipam o evento (KRIs), de preferência um dado que o ÒPURA já tem |
| `dimensoes` | string[] 1–4 | das 8 abaixo, ordenadas da mais relevante para a menos |
| `fases` | string[] 1–5 | da lista fechada abaixo |
| `tipologias` | string[] | da lista fechada abaixo; todas as que se aplicam |
| `condicoes_sugestao` | string[] 0–4 | características da obra que fazem o sistema SUGERIR este risco; lista fechada abaixo |
| `integracoes` | string[] 0–4 | módulos do ÒPURA que fornecem sinal ou recebem ação; lista fechada abaixo |
| `gatilho_critico` | boolean | `true` só se a pior consequência plausível for: morte/lesão grave, colapso/instabilidade estrutural, ou descumprimento legal que gera embargo, interdição ou responsabilização criminal |
| `gatilho_motivo` | string \| null | uma frase quando `gatilho_critico = true`; senão `null` |
| `referencias` | string[] 0–3 | só normas/leis cujo número E assunto você tem certeza (ex.: "NR-35 – trabalho em altura", "ABNT NBR 6122 – fundações"); na dúvida, deixe vazio |

Estilo: português do Brasil, frases curtas (até ~20 palavras), sem caixa alta, sem ponto
final, sem repetir o texto do evento. Seja específico à construção civil brasileira.

### `dimensoes` (8)
`financeira` · `prazo` · `seguranca` · `qualidade` · `juridica` · `ambiental` · `reputacional` · `operacional`

### `fases` (11)
`aquisicao` · `viabilidade` · `projeto_aprovacao` · `contratacao` · `inicio_obra` · `fundacoes` · `estrutura` · `instalacoes` · `acabamentos` · `entrega` · `pos_obra`

### `tipologias` (6)
`residencial` · `comercial` · `galpao_industrial` · `loteamento` · `reforma` · `obra_publica`

### `condicoes_sugestao` (lista fechada)
`subsolo` · `escavacao_profunda` · `contencao` · `terreno_inclinado` · `nivel_agua_alto` · `proximo_curso_dagua` · `area_ambiental_sensivel` · `vizinhanca_proxima` · `edificacao_ocupada` · `area_urbana_densa` · `estrutura_concreto` · `estrutura_metalica` · `pre_moldado` · `protensao` · `fundacao_profunda` · `grua_ou_guindaste` · `trabalho_em_altura` · `espaco_confinado` · `demolicao` · `edificacao_antiga` · `financiamento_bancario` · `venda_na_planta` · `locacao` · `contrato_publico` · `insumo_importado` · `muitos_terceirizados` · `prazo_curto` · `regiao_chuvosa` · `bim`

### `integracoes` (lista fechada)
`planejamento` · `orcamento` · `financeiro` · `dividas` · `suprimentos` · `contratos` · `rh` · `sst` · `garantia_qualidade` · `ordens_servico` · `docs_ged` · `diario` · `comercial` · `locacoes` · `planta_bim` · `imovib` · `investidor` · `fiscal`
