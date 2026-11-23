# Transcrição do texto dos documentos do empreendimento

## Pedido original

> empreendimento > documentos: Ao fazer upload da escritura, fazer a transcrição do texto da escritura.
> Pesquise qual as opcoes existentes de forma gratuita

Sessão `75f6aefe-f3eb-4854-a756-cef3b1d784d2` · 23/11/2026, ~17h.

Depois da pesquisa (opções gratuitas) e da proposta de testar com uma escritura real e montar o plano:

> sim

23/11/2026 — decisões (resposta literal):

> Só escritura ou também outros documentos? Outros documentos.
> Linhas duvidosas: destacar para revisão

23/11/2026, depois da 1ª publicação (#676), ao ver o texto dentro do painel lateral:

> a transcricao em drawer fica muito ruim a visualizacao. implemente uma tela

## Pesquisa e teste (23/11/2026)

Opções gratuitas levantadas: texto do próprio PDF (pdf.js, já no app), Tesseract.js no navegador,
PaddleOCR, Google Cloud Vision/Document AI (1.000 páginas/mês), Azure Document Intelligence F0
(500 páginas/mês), OCR.space (3 páginas por PDF — não serve para escritura) e Gemini grátis
(descartado: na camada grátis o conteúdo é usado para treinar, e escritura tem CPF).

Teste com duas escrituras reais (CASA, 3 páginas; TERRENO, 2 páginas — Cartório de Cambuí):

- as duas são **escaneadas**: o pdf.js devolve 0 caracteres;
- Tesseract.js `por`, página a 300 dpi: 7–13 s por página; o **texto datilografado sai quase
  perfeito** (CPF, RG, datas e descrição do imóvel conferidos contra a imagem);
- linha cortada por carimbo sai parcialmente embaralhada; cabeçalho com selo e a página de
  averbação do RI (carimbo + manuscrito) viram lixo;
- a confiança por linha separa bem o lixo (< 70), mas também pega linhas úteis cortadas por
  carimbo ("Emolumentos: Código 1409-2…") — por isso a decisão de **destacar**, não esconder.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 23/11/2026 | Só escritura ou também outros documentos? | Outros documentos — todo PDF/imagem da aba |
| 23/11/2026 | Linhas duvidosas: destacar ou esconder? | Destacar para revisão |
| 23/11/2026 | Onde ler a transcrição? | Numa tela, não no drawer ("implemente uma tela") |

Decisões técnicas (minhas, registradas para revisão):

- **Grátis e sem sair do navegador:** texto do PDF quando a página tem texto; senão Tesseract.js
  (`por`). O arquivo não é enviado a serviço nenhum; só o modelo de idioma é baixado do CDN do
  Tesseract (jsDelivr) na primeira vez.
- **A transcrição é da VERSÃO do arquivo** (`opura_document_versions`), em tabela própria
  `opura_document_transcricoes`: o GED lê `active_version(*)` em muitas listas e uma coluna com
  dezenas de KB pesaria em todas. Nova versão do arquivo = transcrição nova.
- **Linha duvidosa = confiança do OCR < 70** (`LIMIAR_LINHA_DUVIDOSA`, medido no teste). A
  confiança de cada linha fica gravada, então mudar o limiar não exige transcrever de novo.
- **Automático depois do envio** de PDF/imagem pela aba (item do checklist, linha da tabela,
  "Enviar documento", nova versão). Acima de **20 páginas escaneadas** não começa sozinha
  (levaria minutos): mostra o tamanho e o botão "Transcrever".
- Documento já anexado antes desta mudança: botão "Transcrever" no painel do documento.
- A fila roda na aba aberta: fechar a aba no meio perde a transcrição em andamento (o painel
  volta a oferecer "Transcrever").

## Plano

1. **`supabase/migrations/aplicar_20271123100000_opura_document_transcricoes.sql`** — tabela
   `opura_document_transcricoes` (PK `version_id` → versões, `organization_id`, `origem`
   `TEXTO_DO_PDF|OCR`, `paginas`, `linhas` jsonb array, `atualizado_por`, datas), RLS por
   conjunto (`minhas_orgs_membro()`) + na escrita a versão tem de ser visível; REVOKE de anon e
   de TRUNCATE/REFERENCES/TRIGGER. Sem função nova.
   *Pronto quando:* `segurancaMigrations.test.ts` verde e, aplicada, a tabela existe com as 4
   policies e ACL sem anon.
2. **`utils/transcricaoDocumento.ts`** — regras puras: limiar, linha duvidosa, texto da
   transcrição, linhas a partir do texto do pdf.js, aplicar edição (linha alterada deixa de ser
   duvidosa; inalterada mantém), marcar tudo revisado, quais arquivos transcrevem.
   *Pronto quando:* `__tests__/transcricaoDocumento.test.ts` verde.
3. **`services/transcricaoDocumentoService.ts`** — motor no navegador (pdf.js página a página;
   página sem texto → render 300 dpi → Tesseract), progresso e cancelamento; ler/gravar na
   tabela; baixar o arquivo de uma versão já existente.
   *Pronto quando:* tsc limpo e a transcrição de uma escritura escaneada grava linhas com
   confiança (conferido na tela).
4. **`components/empreendimento/TranscricaoDoDocumento.tsx`** — seção "Transcrição" (SecaoTitulo
   §30; progresso com `SegmentedProgress` §29; linhas duvidosas destacadas com borda + fundo
   âmbar + texto para leitor de tela; copiar; revisar em textarea; marcar como revisado;
   transcrever de novo com `useConfirm` quando já há revisão) e o hook `useFilaDeTranscricao`
   (fila de um por vez, cancelável, aborta ao sair da aba).
   *Pronto quando:* `check-ui-standard.sh` sem achado novo e tsc limpo.
5. **`components/empreendimento/DocumentosEmpreendimentoTab.tsx`** — enfileira depois de cada
   envio de PDF/imagem (4 caminhos) e mostra a seção no painel do item legal e no painel do
   outro documento; editar a transcrição marca o painel como sujo.
   *Pronto quando:* enviar a ESCRITURA TERRENO.pdf num item do checklist mostra o progresso e,
   no fim, o texto com as linhas duvidosas destacadas; reabrir o painel mostra o texto gravado.

### Fase 2 — tela própria (pedido "implemente uma tela", 23/11/2026)

Decisão de desenho (minha): a tela ocupa o lugar da **aba Documentos** (voltar de 1 salto,
§23.1), não do detalhe inteiro — a fila de transcrição mora na aba, e sair dela cancelaria a
leitura. **Arquivo original à esquerda, texto à direita**: revisar linha duvidosa é olhar os dois.

6. **`components/empreendimento/TelaDeTranscricao.tsx`** (novo) — cabeçalho com voltar, nome do
   arquivo, copiar / transcrever de novo / "Revisar texto"; coluna do arquivo (PDF no
   visualizador do navegador por URL local `blob:`, imagem por `<img>`); coluna do texto com
   contagem e navegação ‹ › entre linhas duvidosas (rola só a caixa), "Marcar tudo como
   revisado", revisão em área de texto da altura da coluna; texto não salvo pergunta ao sair
   (`useUnsavedChanges` com `guardarNavegacao`: vale também para trocar de aba do empreendimento).
   *Pronto quando:* tsc e `check-ui-standard.sh` limpos; print com as duas colunas, a navegação
   sem rolar a página e o modo de revisão.
7. **`TranscricaoDoDocumento.tsx`** — o painel deixa de mostrar o texto: fica o andamento, o
   resumo ("N linhas, M com leitura duvidosa") e "Abrir transcrição" (desligado com o motivo se o
   painel tem alteração não salva). Leitura e estados viram peças comuns ao painel e à tela.
   *Pronto quando:* print do painel com o resumo.
8. **`DocumentosEmpreendimentoTab.tsx`** — estado da tela; ação "Ver transcrição" no menu da linha
   do checklist e botão na linha de "Outros documentos" (desligado com o motivo para
   Word/Excel/DWG/ZIP ou item sem arquivo; coluna Tipo 180→150 para caber a coluna de ações).
   *Pronto quando:* tsc limpo; abrir pela linha e pelo painel chega à mesma tela.

## Estado

- [x] 1. Migration — aplicada em 23/11/2026 com autorização do usuário ("Aplique você mesmo");
      no banco: RLS ligada, 4 policies, ACL sem anon e sem TRUNCATE/REFERENCES/TRIGGER para
      authenticated; prova como usuário comum (bloco desfeito no fim): grava na própria org, recusa
      org alheia, recusa versão de outra org, recusa TRUNCATE
- [x] 2. Regras puras + teste — 14 testes verdes
- [x] 3. Serviço — tsc limpo; provado no Chrome (Playwright, página temporária que chama o
      serviço): ESCRITURA TERRENO.pdf 2 páginas escaneadas em 17 s (com o download do modelo),
      110 linhas, 29 duvidosas, progresso por página; PDF com texto (NBR 5410, 4 páginas) em
      < 1 s, origem TEXTO_DO_PDF, 0 duvidosas; JPG em 5 s; 0 erro no console
- [x] 4. Componente + fila — `check-ui-standard.sh` sem achado, tsc limpo; conferido por
      print (progresso; texto com as linhas duvidosas em âmbar)
- [ ] 5. Ligação na aba — no ar desde #676 (8fb67cb, conferir-producao ✅); **falta a prova na
      tela real logada** (envio de escritura no checklist → texto gravado → reabrir)
- [x] 6. Tela própria — tsc e `check-ui-standard.sh` limpos; prints (Chrome 1440×900, componente
      real, escritura TERRENO): duas colunas cabem na janela; 12 cliques em "próxima" levaram a
      "12 de 29" com a página parada (scrollY 44 → 44) e só a caixa rolando; modo de revisão
- [x] 7. Painel compacto — print: "109 linhas, 29 com leitura duvidosa para revisar" + "Abrir
      transcrição"
- [ ] 8. Ligação da tela na aba — tsc limpo; **falta a prova na tela real logada** (abrir pela
      linha e pelo painel)

## Verificação

1. Empreendimento › Documentos › item "Escritura" › enviar `ESCRITURA TERRENO.pdf` (escaneada):
   progresso página 1 de 2, 2 de 2; texto aparece; linhas de carimbo em âmbar.
2. Fechar e reabrir o painel: o texto vem do banco.
3. Revisar: corrigir uma linha âmbar → salva sem o destaque nela; as demais continuam.
4. Enviar um PDF com texto (gerado digitalmente): transcrição instantânea, origem "texto do PDF".
5. Enviar `.docx`: nenhuma seção de transcrição.
