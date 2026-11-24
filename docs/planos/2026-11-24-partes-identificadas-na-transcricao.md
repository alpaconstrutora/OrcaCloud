# Partes identificadas na transcrição (nomes e documentos)

## Pedido original

> na transcricao é possivel indentificar nomes e documentos? Geralmente eles estarão em letras maisculas.

Sessão `75f6aefe-f3eb-4854-a756-cef3b1d784d2` · 24/11/2026.

Depois do teste nas transcrições reais e da proposta ("Partes identificadas" na tela de
transcrição; vínculo com Meus Clientes como passo seguinte, a decidir):

> sim

24/11/2026, depois do #684 no ar:

> Perfeito. No texto aplique negrito nas partes identificadas

24/11/2026, depois do #688 no ar:

> mais uma coisa a ser identificada a destacada em negrito no texto. que são os objetos que geralmente também estão em maiscula

24/11/2026, depois de ver a regra testada nas transcrições reais (3 objetos na escritura do 021):

> de acordo

Continuação de `2026-11-23-transcricao-de-documentos-do-empreendimento.md`.

## Teste antes de implementar (24/11/2026)

Nas duas transcrições gravadas do 021 - Tamareiras da Lagoa (escritura, 134 linhas; matrícula,
113 linhas — ambas escaneadas, OCR):

- os 4 nomes das partes estão em MAIÚSCULAS, em linhas com confiança 94–96; o lixo em
  maiúsculas que o OCR tira de carimbo/selo fica abaixo de 70;
- só "maiúsculas" não basta: títulos ("REPÚBLICA FEDERATIVA DO BRASIL", "COMARCA DE …"),
  valor por extenso ("CINQUENTA MIL REAIS") e cláusulas ("DIREITO DE SERVIDÃO …") também são;
  o que distingue a parte é a **qualificação logo depois do nome** (brasileiro, portador, inscrita…);
- texto de cartório padronizado: "outorgante(s) vendedor(es) – NOME, …, RG nº …, CPF nº …" e
  "casado … com NOME" para o cônjuge — dá para tirar o papel de cada parte;
- o OCR já leu um CPF com espaço no meio ("123.456. 789-09") e outro com o hífen como "r" —
  o dígito verificador do CPF/CNPJ é o que diz se o número saiu certo.

## Decisões

- Só na **tela de transcrição**, calculado do texto na hora (função pura) — nada novo gravado
  no banco; revisar o texto atualiza as partes.
- Vínculo/cadastro em Meus Clientes: **fora deste plano** (o usuário respondeu "sim" à
  implementação sem escolher esse passo; fica para quando pedir).

## Itens

1. [x] `utils/partesDaTranscricao.ts` — `identificarPartes(linhas)`: nome em maiúsculas +
   qualificação; papel pelo último marcador antes do nome (herda da parte anterior);
   cônjuge por "casado … com"; CPF/CNPJ/RG na janela até a próxima parte; dígito verificador
   (`lib/validators`); parte duvidosa se a linha do nome ou de um documento for duvidosa;
   nome repetido (assinaturas no fim) aparece uma vez.
   **Pronto quando:** nas duas transcrições reais sai 4 de 4 partes com papel, RG e CPF
   válido. ✅ 24/11 — escritura e matrícula: Vendedor, Vendedor, Comprador, Comprador ·
   cônjuge; 4 RG, 4 CPF com dígito verificador válido (rodado localmente sobre as linhas do banco).
2. [x] `__tests__/partesDaTranscricao.test.ts` — texto fictício no molde da escritura:
   títulos fora, papéis, cônjuge com "6.515/77" no meio, CPF com espaço e hífen lido errado,
   nome quebrado entre linhas, CPF inválido marcado, duvidosa, empresa com CNPJ, sigla colada.
   **Pronto quando:** `npx vitest run __tests__/partesDaTranscricao.test.ts` verde. ✅ 10/10.
3. [x] `components/empreendimento/TelaDeTranscricao.tsx` — abas `Texto` / `Partes
   identificadas (n)` no cabeçalho da coluna (`TabsBar bare`); cada parte com nome, papel,
   documentos, aviso de duvidosa/número que não confere, "Copiar nome e documentos" e
   "Ver no texto" (volta à aba Texto, rola até a linha e marca de azul).
   **Pronto quando:** tsc limpo, `check-ui-standard.sh` sem falha nova, e na tela em produção
   (logado, 021 - Tamareiras da Lagoa) a aba mostra as 4 partes e "Ver no texto" leva à linha.
   ✅ 24/11 — tsc (heap 12 GB) exit 0, `check-ui-standard.sh` sem violação; #684 no ar
   (conferir-producao: 12cf6e0). Logado em produção, Escritura do terreno: aba
   "Partes identificadas 4" com os 4 nomes, papéis, cônjuge, CPF e RG; "Ver no texto" da
   4ª parte voltou à aba Texto e marcou a linha dela. Console sem erro (lido a partir da
   abertura da tela, não do carregamento da página). Nada gravado.
4. [x] Negrito no texto — `trechosDasPartes(linhas, partes)` em `utils/partesDaTranscricao.ts`
   (toda ocorrência do nome, sem diferenciar maiúsculas — as assinaturas vêm em letra normal;
   nome quebrado entre linhas vira um trecho por linha) e `comNegrito` na aba Texto de
   `TelaDeTranscricao.tsx` (linha normal e duvidosa).
   **Pronto quando:** testes verdes; nas transcrições reais do 021 os nomes saem marcados na
   qualificação, no meio do texto e nas assinaturas; na tela em produção os nomes aparecem
   em negrito. ✅ 24/11 — 14/14 testes; nas reais: escritura 9 linhas marcadas
   (qualificação, linhas 79–81 com nome quebrado, assinaturas 99–100), matrícula idem.
   #688 no ar (conferir-producao: 84aa1ee); logado em produção, Escritura do terreno: os 4
   nomes em negrito na qualificação e nas assinaturas do fim ("Vendedoras (aa) …"). Nada gravado.
5. [ ] Objetos — `identificarObjetos(linhas, partes)` em `utils/partesDaTranscricao.ts`:
   trecho em MAIÚSCULAS no meio do texto corrido (linha legível com prosa), com números e
   conectivos ("LOTE Nº 05 DA QUADRA 03"), tirando a abertura "BEM COMO O"; fora: parte
   (também com acento lido errado — "VERÁ MARINA …" na matrícula), pessoa citada ("Sr. …"),
   valor por extenso, cabeçalho/fórmula do cartório, linha duvidosa. `trechosDasPartes` →
   `trechosEmNegrito(linhas, partes, objetos)`: objeto em negrito só em maiúsculas. Aba
   "Partes identificadas" → "Partes e objetos" (seções Partes · n e Objetos · n; copiar e
   "Ver no texto" nos dois).
   **Pronto quando:** testes verdes; nas reais, escritura = UMA CASA DE MORADA, DIREITO DE
   SERVIDÃO DE ÁGUA, DIREITO DE SERVIDÃO DE ENERGIA ELÉTRICA e matrícula = nenhum (lá o imóvel
   está em letra normal); na tela em produção os 3 aparecem na aba e em negrito no texto.
   ✅ parcial 24/11 — 18/18 (+14 da transcrição = 32/32), tsc exit 0, check-ui sem violação;
   nas reais saem exatamente os 3 objetos da escritura e nenhum na matrícula.

## Estado

- 24/11/2026: itens 1–3 concluídos e provados em produção (#684). Vínculo com Meus Clientes: não pedido.
- 24/11/2026: item 4 (negrito) concluído e provado em produção (#688). Itens 1–4 fechados.
- 24/11/2026: item 5 (objetos) implementado; falta prova em produção.
