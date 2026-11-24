# Partes identificadas na transcrição (nomes e documentos)

## Pedido original

> na transcricao é possivel indentificar nomes e documentos? Geralmente eles estarão em letras maisculas.

Sessão `75f6aefe-f3eb-4854-a756-cef3b1d784d2` · 24/11/2026.

Depois do teste nas transcrições reais e da proposta ("Partes identificadas" na tela de
transcrição; vínculo com Meus Clientes como passo seguinte, a decidir):

> sim

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
3. [ ] `components/empreendimento/TelaDeTranscricao.tsx` — abas `Texto` / `Partes
   identificadas (n)` no cabeçalho da coluna (`TabsBar bare`); cada parte com nome, papel,
   documentos, aviso de duvidosa/número que não confere, "Copiar nome e documentos" e
   "Ver no texto" (volta à aba Texto, rola até a linha e marca de azul).
   **Pronto quando:** tsc limpo, `check-ui-standard.sh` sem falha nova, e na tela em produção
   (logado, 021 - Tamareiras da Lagoa) a aba mostra as 4 partes e "Ver no texto" leva à linha.

## Estado

- 24/11/2026: itens 1–2 feitos; item 3 implementado, falta tsc/checagem/prova em produção.
