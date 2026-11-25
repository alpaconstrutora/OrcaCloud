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

24/11/2026, antes do #691 entrar (ele juntava partes e objetos numa aba só, "Partes e objetos"):

> crie uma aba chamada objetos identificados ao lado de partes indentificadas. e da mesma forma que  partes indentificadas, liste os objetos que foram identificados

24/11/2026, depois do #691:

> implemente link, ao clicar em uma parte ou objeto identificado vá direito para o texto

24/11/2026, depois do #694 ("ficou otimo!"):

> Implemente nova funcionalidade
> Em partes identificadas, implemente botão para adicionar as partes em minha organização > clientes

Proposta: cadastrar direto (1 clique) × abrir o formulário de cliente preenchido (sai da
transcrição e cancela leitura em andamento). Resposta:

> Opção 1

25/11/2026, depois do #702 (sobre a categoria vazia aparecer "Não definido" na lista):

> implemente: "… Se preferir que quem entra pela transcrição já nasça com uma categoria (o
> formulário manual sugere "Vendas"), é uma mudança pequena."

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
- 24/11 (itens 7–8): **pedido** o cadastro em Clientes — botão por parte que grava DIRETO
  (opção 1). Organização = a do seletor do topo; em "Todas" com várias, pergunta
  (`useOrgWriteTarget`, modo `single` — cliente é de UMA organização, REGRA #5 exceção 4).
  CPF/CNPJ é único no sistema inteiro (`find_client_by_document`, qualquer organização): parte
  cujo documento já é cliente mostra "Já está em Clientes" em vez do botão. Parte sem CPF/CNPJ
  válido não tem botão ativo (sem documento não dá para saber se já existe — cadastrar por
  Clientes). Nome gravado em letra normal ("João da Silva"; 60 de 66 clientes estão assim),
  conectivos em minúscula, sigla de empresa (LTDA, S/A, ME…) em maiúscula. Grava: nome, tipo
  (PF/PJ pelo documento), CPF/CNPJ, RG com órgão/UF, e — se o texto diz "casado … com" —
  estado civil Casado(a), nome e CPF do cônjuge. Nacionalidade, profissão, regime
  de bens e endereço ficam vazios para completar em Clientes (não inventar). Vínculo com o
  empreendimento: não pedido.
- 25/11 (item 9): **categoria** deixa de ficar vazia — nasce com o mesmo tipo do formulário
  manual, `CATEGORIA_PADRAO_DO_CLIENTE` ("Vendas", em `constants/clientCategories.ts`, agora
  usada pelos dois). "Vendas" está no catálogo de toda organização (o serviço de categorias
  completa com os padrões), então o tipo sempre aparece na lista e no formulário. Cliente já
  cadastrado (035) não é alterado pelo código.

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
5. [x] Objetos — `identificarObjetos(linhas, partes)` em `utils/partesDaTranscricao.ts`:
   trecho em MAIÚSCULAS no meio do texto corrido (linha legível com prosa), com números e
   conectivos ("LOTE Nº 05 DA QUADRA 03"), tirando a abertura "BEM COMO O"; fora: parte
   (também com acento lido errado — "VERÁ MARINA …" na matrícula), pessoa citada ("Sr. …"),
   valor por extenso, cabeçalho/fórmula do cartório, linha duvidosa. `trechosDasPartes` →
   `trechosEmNegrito(linhas, partes, objetos)`: objeto em negrito só em maiúsculas. Aba
   própria **"Objetos identificados (n)"** ao lado de "Partes identificadas (n)" — lista no
   mesmo formato, com copiar e "Ver no texto" (a versão "Partes e objetos" numa aba só não
   chegou a ir ao ar).
   **Pronto quando:** testes verdes; nas reais, escritura = UMA CASA DE MORADA, DIREITO DE
   SERVIDÃO DE ÁGUA, DIREITO DE SERVIDÃO DE ENERGIA ELÉTRICA e matrícula = nenhum (lá o imóvel
   está em letra normal); na tela em produção os 3 aparecem na aba e em negrito no texto.
   ✅ parcial 24/11 — 18/18 (+14 da transcrição = 32/32), tsc exit 0, check-ui sem violação
   (também depois das abas separadas);
   nas reais saem exatamente os 3 objetos da escritura e nenhum na matrícula.
   ✅ 24/11 — #691 no ar (conferir-producao: 7bd2cb1); logado em produção, Escritura do
   terreno: abas "Partes identificadas 4" e "Objetos identificados 3" com os 3 objetos; no
   texto os 3 em negrito, inclusive o "ÁGUA" na linha seguinte. Nada gravado.
6. [x] Link — nas abas Partes identificadas e Objetos identificados, o nome da parte / o
   objeto é link (`text-blue-600`, §tipografia "Link / item relacionado") que leva à aba Texto,
   rola até a linha e a marca de azul; o ícone "Ver no texto", que fazia o mesmo, saiu.
   **Pronto quando:** tsc limpo, check-ui sem violação e, em produção, clicar num nome e num
   objeto leva à linha dele no texto.
   ✅ 24/11 — #694 no ar (conferir-producao: 4b9a52f); logado em produção: clicar em
   "DIREITO DE SERVIDÃO DE ÁGUA" e na 3ª parte levou à aba Texto com a linha de cada um
   marcada. Console sem erro (lido a partir da tela aberta).

7. [x] `utils/partesDaTranscricao.ts` — `nomeProprio(nome)` e `clienteDaParte(parte, partes)`
   (o cadastro que a parte vira: nome em letra normal, PF/PJ, documento formatado, RG
   separado em número/órgão/UF, cônjuge pelo par "casado … com"); `findDocumentOwner` em
   `services/documentDuplicateCheck.ts` (a mesma RPC do bloqueio de duplicado, agora
   devolvendo quem é o dono; `assertDocumentNotDuplicated` passa a usá-la).
   **Pronto quando:** testes novos verdes (nome próprio, PJ com LTDA, casal com cônjuge nos
   dois sentidos, RG com e sem órgão).
   ✅ 24/11 — 23/23 (+ orgContextGuard e testes que usam o bloqueio de duplicado: verdes);
   tsc exit 0. Nas transcrições reais do 021 (escritura e matrícula): as 4 partes com CPF que
   confere → 4 cadastráveis, RG separado em número/SSP/UF, o casal com estado civil e o
   cônjuge (nome e CPF) nos dois lados. Nenhum dos 4 CPFs está em Clientes hoje.
8. [x] `TelaDeTranscricao.tsx` — na aba Partes identificadas, por parte: "Adicionar aos
   clientes" (grava direto na organização do topo; em "Todas", pergunta); "Já está em Clientes ·
   código · organização" quando o CPF/CNPJ já é cliente; botão desligado com o motivo quando
   não há CPF/CNPJ válido.
   **Pronto quando:** tsc limpo, check-ui sem violação e, em produção (logado, 021), as 4
   partes mostram o estado certo e — só com autorização do usuário para gravar — o botão
   cria o cliente e a linha passa a "Já está em Clientes".
   ✅ 24/11 — tsc exit 0, check-ui sem violação; #702 no ar (conferir-producao: cb390fb).
   Logado em produção, Escritura do terreno: as 4 partes com o botão ligado (nenhum CPF era
   cliente). Com autorização do usuário ("quero que você clique e prove o fluxo inteiro"; ele
   escolheu a organização dona do 021), clique no 3º (comprador casado): topo em "Todas" →
   modal "Selecionar organização" → Construção do Edifício Garden Cambuhy SPE → aviso
   "cadastrado em Clientes (código 035)" e a linha passou a "Já está em Clientes · código 035 ·
   Construção do Edifício Garden Cambuhy SPE". No banco: PF, CPF, RG + SSP/MG, Casado(a),
   cônjuge com nome e CPF, Ativo; em Meus Clientes aparece com código 035. Console sem erro
   (lido desde a abertura da tela). Categoria ("Tipo" na lista) ficou "Não definido" — de propósito
   (mudou no item 9).
9. [ ] Categoria padrão — `clienteDaParte` grava `category: CATEGORIA_PADRAO_DO_CLIENTE`; o
   `ClientForm` usa a mesma constante no lugar do texto solto.
   **Pronto quando:** testes de `clienteDaParte` exigem `category: 'Vendas'` (vermelho antes,
   verde depois), tsc limpo e o texto novo servido em produção.

## Estado

- 24/11/2026: itens 1–3 concluídos e provados em produção (#684). Vínculo com Meus Clientes: não pedido.
- 24/11/2026: item 4 (negrito) concluído e provado em produção (#688). Itens 1–4 fechados.
- 24/11/2026: itens 5 (objetos, #691) e 6 (link, #694) concluídos e provados em produção. Itens 1–6 fechados.
- 24/11/2026: itens 7–8 (Partes → Clientes, #702) concluídos e provados em produção. Itens 1–8 fechados.
- 25/11/2026: item 9 (categoria padrão) em andamento.
