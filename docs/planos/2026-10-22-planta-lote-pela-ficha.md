# Planta: criar o lote pelos dados da ficha do empreendimento

## Pedido original

Sessão de 22/10/2026 (Claude Code, VS Code), com print de Dados do lote › "Ficha do empreendimento ·
011 - Garden Cambuhy" (ficha: Irregular, 1.229 m², frente 18, fundos 21, profundidade 71; planta sem lote):

> quando existe um conexão entre planta inteligente e empreendimento e os dados do lote (frente, fundos, profundidade) sejam puxados do empreendimento, nao existe um botao para criar lote atraves destes dados, Analise

Análise entregue: o "Criar o lote digitando" já abria com frente × profundidade da ficha, mas (1) o bloco
da ficha não oferecia ação nenhuma, (2) o preenchimento montava um RETÂNGULO 18 × 71 = 1.278 m², ignorando
fundos 21, a área 1.229 e o tipo Irregular, e (3) os números do Garden não fecham entre si: trapézio
18/21 com 71 m = 1.384,5 m² (+12,7%); para bater 1.229 m² a profundidade seria 63,03 m.

Decisões do usuário (perguntadas, mesma sessão):
- Trapézio **centralizado** (fundos centrado sobre a frente).
- Área que não bate: primeiro escolheu "ajustar a profundidade para bater a área"; logo depois corrigiu:
  > alias, perguntar ao usuário o que ele quer, ajustar a profundidade ou manter

  → a tela PERGUNTA (manter a profundidade da ficha × ajustar para fechar a área), sem padrão; lançar
  fica desligado, com o motivo, até a escolha.

## Itens

1. **Frente × fundo aceita fundos** — `loteRetangular` ganha `fundosMm` opcional: diferente da frente =
   trapézio centralizado (laterais iguais, inclinadas). Laterais de trapézio não levam medida de
   escritura (são calculadas, não da matrícula). *Pronto quando:* teste da geometria (área, lados, papéis).
2. **Sugestão da ficha completa** — `dadosDoEmpreendimentoParaPlanta().lote` traz fundos e a profundidade
   que fecharia a área (`profundidadePelaAreaMm`) quando a ficha tem área. *Pronto quando:* teste (Garden:
   63,03 m).
3. **A pergunta no painel** — com as duas profundidades diferentes, o painel mostra a escolha
   (manter × ajustar, cada uma com a área resultante); sem escolha, "Lançar o lote" desligado com o motivo.
   *Pronto quando:* teste do `PainelLoteDigitado`.
4. **Botão no bloco da ficha** — "Criar lote pela ficha" (sem lote ainda), abre o painel já preenchido;
   desligado com o motivo quando falta dado. *Pronto quando:* teste do bloco + conferência na tela.

## Andamento

- 22/10 — item 1 feito: `loteRetangular({ fundosMm, lateraisCalculadas })`; trapézio centralizado com
  laterais sem escritura (e, com a profundidade ajustada, nem no retângulo). 2 testes em `blueprintLoteDigitado`.
- 22/10 — item 2 feito: `lote.{fundosMm, profundidadeMm (pode faltar), profundidadePelaAreaMm, areaM2}`;
  Garden → 63,03 m. 2 testes novos.
- 22/10 — item 3 feito: campo "Fundos (m, opcional)"; com as duas profundidades divergindo (> 1 cm) a
  profundidade nasce vazia, a pergunta mostra as duas com a área que cada uma dá, e "Lançar o lote" fica
  desligado com "Escolha acima: …". Enquanto a pergunta está aberta, o lote não é calculado (sem o aviso
  "Informe a frente e a profundidade", que confundia). Bug pego pelo teste antes de publicar: a área da
  pergunta tratava mm como m (`lerMedidaEmMetros` devolve mm). O `useMemo` do lote ganhou `fundos` e os
  sinais da pergunta nas dependências (sem isso, mudar os fundos não refazia a prévia — teste de regressão).
- 22/10 — item 4 feito: "Criar lote pela ficha" no bloco da ficha (só sem lote; desligado diz o que falta).
  3 testes no `PainelTerrenoFicha`.
- 22/10 — conferido na tela com a planta REAL "Garden" (já aberta pelo usuário em produção, então sem
  preenchimento automático novo): `c:/tmp/pwtest/conferencia-lote-pela-ficha.cjs`, 10/10, zero escrita, zero
  erro; o lote NÃO foi lançado; `draft_saved_at` do Garden inalterado (14:20:33).
- `check-ui-standard.sh` limpo nos 3 .tsx; 68 testes dos arquivos afetados verdes.
