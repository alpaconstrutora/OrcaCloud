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

## Fase B — execução (10/10/2026, frente `market-colar-link`)

- **⚠️ Achado que muda as Fases C e E:** vistos **do servidor da Supabase**, ZAP Imóveis, VivaReal e OLX respondem **HTTP 403** à página de anúncio. Da máquina de desenvolvimento o ZAP ainda respondia 200 no mesmo dia, então o bloqueio é por IP de nuvem, não pelo User-Agent. Os sites de imobiliária (WordPress, ImobiBrasil, Arbo) e a API da Conexão 381 respondem normalmente ao servidor.
  - Consequência: para portal, o caminho que funciona é a **captura no navegador (Fase C)**, que roda na máquina do usuário. A **varredura no servidor (Fase E)** tende a cair no mesmo 403. Mascarar o servidor como navegador para passar do bloqueio não é feito: seria driblar um controle de acesso do portal.
- **`logica.ts`** (puro, sem `import`):
  - `lerAnuncioDaPagina(html, url)`: leitor específico do site (grupo ZAP pelo payload do Next.js, OLX pelo `initial-data`, Arbo pelo `__NEXT_DATA__` `imv_*`), depois JSON-LD, depois o título e o OpenGraph. Cada campo vem da fonte mais confiável que o tiver.
  - O JSON-LD ignora `Organization` e `RealEstateAgent`: na ImobiBrasil o 1º bloco é o endereço da imobiliária, não o do imóvel.
  - `lerAnuncioConexao381(json, url)`: a API de detalhe. Também serve à Fase D.
  - Links estáveis: o grupo ZAP é gravado por `https://www.zapimoveis.com.br/imovel/id-<id>/`, que o site redireciona à página e é **o mesmo para ZAP e VivaReal**. A Conexão 381 é gravada por `/imoveis/<código>`. Nos demais sites vale o canônico do mesmo host, sem `utm_*` e sem `#`.
  - Posição "aproximada" do portal e o ponto padrão de centro de cidade (`PONTOS_PADRAO_DE_CIDADE`) nunca viram posição `fonte`.
  - `anuncioConferido` valida no servidor o que volta da tela. A tela usa a **mesma** função, então o botão só liga quando a gravação vai passar.
  - `bairroNoTexto`: um bairro cadastrado citado no título vira sugestão, com aviso.
- **Edge Function:**
  - `ler-anuncio` só lê, nunca grava. Site que bloqueia não é erro: volta o anúncio em branco com `falhaLeitura`, além de `jaGravado` e `bairroCadastrado`. O VivaReal é lido pela página do ZAP (mesmo id).
  - `gravar-anuncio` passa pelo `gravarFeed` sem `feedId`, com `atualizarCadastro`: colar de novo também grava área, quartos, tipo e bairro corrigidos. Endereço e posição ficam como estão.
  - `preco_oculto_na_fonte` (F1) passa a ser gravado.
  - Republicada com `--no-verify-jwt`; sem cabeçalho dá 401.
- **Tela:** bloco "Colar link de anúncio" no topo da aba Fontes, que abre a gaveta "Conferir anúncio" (`MarketAnuncioLinkSheet`, malha §30). O que não veio do site fica em destaque âmbar. Em "Todas", o botão fica desligado com o motivo.
- **Testes:** `__tests__/opuraMarketAnuncioPorLink.test.ts`, 32 casos com trechos reduzidos das páginas reais.
- **Prova** com a organização `ZZ Teste E2E Market (link)`, tudo apagado depois:
  - **Leitura completa** em Arbo, ImobiBrasil, WordPress e Conexão 381.
  - **Bloqueio (403)** em ZAP, VivaReal e OLX: a gaveta abriu em branco e foi preenchida à mão.
  - **Sem duplicar:** 6 anúncios gravados, nenhum duplicado. O VivaReal colado depois do ZAP reconheceu o mesmo anúncio e atualizou o preço. Conexão 381 e ImobiBrasil colados de novo deram "já estava na base: dados atualizados", e a suíte corrigida foi gravada.
  - O WordPress chama o terreno (600 m²) de `floorSize`: é para isso que existe a conferência.

## Estado

- [x] Fase A
- [x] Fase B (captura no navegador passa a ser o caminho para portal; ver o achado acima)
- [ ] Fase C
- [ ] Fase D
- [ ] Fase E
- [ ] Fase F
