# Normas de incêndio — Minas Gerais (CBMMG)

Os textos que o motor de incêndio (`utils/blueprintIncendioClassificacao.ts` e as etapas do
roadmap `docs/planos/2026-09-29-incendio-benchmark-altoqi-e-roadmap.md`) usa.

As 45 ITs do CBMMG (PDF) foram entregues pelo usuário em 01/10/2026 e ficam FORA do repositório,
em `C:\D\ORÇACLOUD\Instruções Técnicas` (IT 10, 19, 20 e 36 revogadas). O que foi transcrito
mora aqui, com a página de onde saiu. As tabelas foram lidas pela IMAGEM da página: o texto
extraído do PDF embaralha as colunas das tabelas.

## Transcrito (D1 do plano `2026-10-01-incendio-backlog-pos-roadmap.md`)

| Texto | Onde no código | Teste |
|---|---|---|
| IT 01 (10ª ed., Portaria 84/2026), Anexo A, Tabelas 1 a 18 — exigências por divisão × altura, com as notas → [`it01-anexo-a-tabelas.txt`](it01-anexo-a-tabelas.txt) | `utils/blueprintIncendioTabelasMG.ts` (dados) + `utils/blueprintIncendioExigenciasMG.ts` (notas) | `__tests__/incendioExigenciasMG.test.ts` relê o `.txt` e confere célula a célula |
| IT 01, A.4.1 a (A-1 isenta) e A.4.5 (iluminação na térrea ≤ 200 m² com menos de 50 pessoas) | `blueprintIncendioExigenciasMG.ts` | idem |
| IT 08, Tabela 1 — tipos por altura (I ≤ 12 · II ≤ 30 · III ≤ 54 · IV acima) | `FAIXAS_DE_ALTURA` | `blueprintIncendioClassificacao.test.ts` |
| IT 09, item 5.10 — risco pela carga (≤ 300 · ≤ 1.200 · acima, MJ/m²) | `nivelDeCarga` | idem |
| IT 09, Tabela A.1 — carga do grupo A (300 MJ/m²) | `DIVISOES_TRANSCRITAS` | idem |
| IT 17 (Portaria 70/2022), Tabelas 2 e 4 + itens 5.3 a 5.18 → [`it17-tabelas.txt`](it17-tabelas.txt) | `utils/blueprintIncendioHidrantesMG.ts`: tipo de sistema e reserva pela Tabela 4, vazões e mangueiras pela Tabela 2, jato fora da cobertura (5.8.2) | `__tests__/incendioHidrantesMG.test.ts` relê o `.txt` |

## Ainda por transcrever (as constantes seguem marcadas `CONFERIR` no código)

| Texto | Destrava |
|---|---|
| IT 09, Tabela A.1 inteira (cerca de 600 atividades → divisão + carga) | escolher a ATIVIDADE em vez de declarar divisão e carga |
| IT 08 — saídas de emergência | E6: população, unidades de passagem, percurso, tipo de escada |
| IT 18 — chuveiros automáticos | E5: risco, densidade, área de operação |
| IT 16 — extintores | E7.1 |
| IT 15 — sinalização | E7.2 |
| IT 13 — iluminação de emergência | E7.3 |
| IT 14 — detecção e alarme | E7.4 |
