# ÒPURA Market — várias fontes de anúncios, não só o feed XML

## Pedido original

> *"aqui nós chegamos a um ponto que o sistema deixou de ser um web scraping para depender
> totalmente da boa vontade de imobiliária enviar o link xml para cadastro. Ok que essa pode ser
> uma solução, mas nem de longe deveria ser a única."* (10/10/2026)

Plano aprovado em 10/10/2026.

## Contexto

Na Fase 3 do plano `2026-10-07-opura-market-intelligence.md`, o robô foi trocado pelo feed VRSync
(decisão D7). O motivo foi a conclusão de que o portal da Conexão 381 "não tinha dado por anúncio".
A conclusão estava errada: o site tem uma **API JSON pública**.

Levantamento de 10/10/2026 (só GET, 1 requisição por segundo):

| Fonte | O que o servidor consegue ler | Observação |
|---|---|---|
| Conexão 381 — `/api/properties-fast` | 471 imóveis de venda (351 em Cambuí), 8 páginas de 60. Traz preço, tipo, bairro, quartos e áreas | Termos de uso, item 8: proíbem "extração automatizada indevida". Item 9: fotos de terceiros não podem ser reproduzidas |
| Conexão 381 — `/api/public-property-by-code/<código>` | Rua (qualidade variável), número (9 de 18), CEP; lat/lng em 14 de 18 | O ponto `-22,61003; -46,05763` é o centro da cidade usado como padrão e vale como "sem coordenada". `source_url` estável: `https://conexao381.com.br/imoveis/<código>` |
| ZAP Imóveis e VivaReal (mesmo grupo, mesmo id) | Página do anúncio com o anúncio inteiro no payload do Next.js (`"listing":{…}`) | Rua e coordenada só quando o anunciante libera |
| OLX | `<script id="initial-data" data-json=…>` com preço, área, quartos, CEP e coordenadas | Às vezes a coordenada é o centro padrão da cidade |
| Sites de imobiliária (WordPress/Houzez, ImobiBrasil, Arbo) | JSON-LD `RealEstateListing`/`Product` com preço | ImobiBrasil serve a página em ISO-8859-1 |

## Decisões (10/10/2026)

| # | Pergunta | Decisão |
|---|---|---|
| F1 | Preço que o site esconde, mas a API devolve (15 de 471 na Conexão 381) | **Usar o preço da API**, com uma marca no anúncio (`preco_oculto_na_fonte`) |
| F2 | Coleta diária da API da Conexão 381, sabendo dos termos de uso | **Pedir autorização antes.** O conector fica pronto e **desligado por padrão**; "Importar agora" funciona sob comando |
| F3 | Varredura automática das listagens de ZAP, VivaReal e OLX | **Sim.** O risco dos termos de uso foi assumido pela Alpa; há interruptor por praça |
| F4 | Quais conectores | Os quatro: colar link, API do site, captura no navegador e avaliação de dados pagos |

## Arquitetura

Todo conector produz `AnuncioLido[]` e grava pelo mesmo `gravarFeed`, na Edge Function
`opura-market-import`. A função já cuida de duplicados, geocodificação, saídas e reativação.

- `source_url` é estável por anúncio.
- Uma varredura completa de fonte salva passa `feedId`, e com isso gera as saídas.
- Um anúncio avulso nunca passa `feedId`.
- Fotos nunca são copiadas.

## Fases

| Fase | Frente | Conteúdo |
|---|---|---|
| A | `market-fontes-base` | Fontes múltiplas por praça (`tipo`, `config`), cron em 4 janelas, busca pública com corte de bytes no fluxo e charset, painel "Fontes" |
| B | `market-colar-link` | `lerAnuncioDaPagina` (extratores específicos → JSON-LD → OpenGraph), modos `ler-anuncio` e `gravar-anuncio`, gaveta de conferência |
| C | `market-captura-navegador` | Bookmarklet "Enviar ao ÒPURA" → `#/opura-market?anuncio=…` → mesma gaveta |
| D | `market-conector-c381` | Conector da API da Conexão 381, desligado por padrão (F2) |
| E | `market-conector-portais` | Varredura de ZAP/VivaReal e OLX (F3), com detecção de bloqueio |
| F | — | Documento comparando fornecedores de dados pagos |

## Fase A — execução (10/10/2026, frente `market-fontes-base`)

- **Ajuste no plano:** a chave da fonte ficou organização + cidade + tipo + **link**, e não só tipo. Assim cabem os feeds VRSync de várias imobiliárias na mesma praça, o caso real.
- **Migration `aplicar_20271010003300_opura_market_fontes.sql`, aplicada** (com ensaio antes):
  - `tipo` com CHECK e `config`;
  - novo UNIQUE `(org, city, tipo, url)`;
  - `opura_market_listings.preco_oculto_na_fonte`;
  - cron `opura-market-feeds-diario` em `*/30 9-10 * * *`, que são 4 janelas, das 06:00 às 07:30 em Brasília.
  - ⚠️ Ela foi aplicada junto do envio porque a tela antiga fazia upsert com `onConflict 'organization_id,city_id'`: com o UNIQUE antigo já removido, esse salvar daria 42P10.
- **Edge Function:**
  - `buscarUrlPublica`: corte de bytes no fluxo (antes o corpo inteiro era lido antes de conferir o tamanho) e decodificação pelo charset da resposta ou do `<meta>`; o ISO-8859-1 do ImobiBrasil vira windows-1252.
  - `executarFonte` despacha por `tipo`. Por enquanto só `vrsync`; os outros tipos dizem "ainda não está disponível".
  - `rodarAgendado` pega só as fontes que não rodaram hoje.
  - Novo modo `importar-fonte`, em que a fonte tem de ser da organização validada.
  - O modo `feed` acha a fonte salva pelo mesmo link (`mesmaUrl`).
  - Republicada com `--no-verify-jwt`; sem cabeçalho dá 401 em todos os modos.
- **`logica.ts`:** `TIPOS_DE_FONTE`, `charsetDaResposta`, `mesmaUrl` e `inicioDoDiaUtc` (+4 testes, 54 no arquivo).
- **Tela:** a aba "📡 Feed XML" virou "📡 Fontes".
  - Lista de fontes da praça, cada uma com interruptor "Todo dia", "Importar agora", remover (com confirmação) e última importação.
  - Formulário "Adicionar fonte".
  - "Importar um arquivo .xml uma vez", que não gera saídas.
  - Tudo desligado com motivo em "Todas".
- **Prova** com a organização `ZZ Teste E2E Market (fontes)`, com 2 fontes VRSync na mesma praça, tudo apagado depois:
  - **Cron:** a 1ª janela rodou as duas (2 e 1 novos, cada anúncio com o `feed_id` da sua fonte). A 2ª janela no mesmo dia pegou 0 fontes.
  - **Tela:** "Importar agora" atualizou sem duplicar. O interruptor gravou. Adicionar a mesma fonte de novo deu "Esta fonte já está cadastrada nesta praça". Remover pediu confirmação.
- **Suíte:** 7.828 aprovados, 34 pulados, 0 falhas.

## Estado

- [x] Fase A
- [ ] Fase B
- [ ] Fase C
- [ ] Fase D
- [ ] Fase E
- [ ] Fase F
