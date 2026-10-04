# Gerar massa: a margem da borda do envelope vira hipótese ("Folga até o recuo")

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 04/10/2026. Na análise da "Planta 02/10/2026" foi explicado que o gerador
encolhe o envelope em 10 cm de cada lado (constante `MARGEM_MM`), e oferecido torná-la ajustável — "margem 0 para
encostar no recuo, ou folga maior para revestimento de fachada". Resposta do usuário, literal:

> sim transformar em hipotese

## O que foi feito

- `HipotesesDoGeradorDeMassa.margemDoEnvelopeMm` (padrão 100 mm — o mesmo de antes); a constante `MARGEM_MM` saiu.
  `retanguloDoAnel` recebe a margem; `gerarMassa` a normaliza (inteiro, 0 a 2.000 mm; valor inválido → padrão).
- A decisão escrita do gerador diz a folga usada ("a 10 cm da borda (folga até o recuo)" / "encostado na borda").
- Tela do Gerar massa: campo **"Folga até o recuo (cm)"**, ao lado de "Entre blocos", com a explicação no título.
  Fica na configuração guardada no navegador (`blueprint:gerador-de-massa`); configuração antiga ganha o padrão pela
  mescla que a tela já fazia.

## Verificação

- Gerador: com 10 cm reproduz o embasamento da "Planta 02/10/2026" (10,48 × 23,80 m); com 0, envelope 12 × 27 m e
  embasamento 10,53 × 23,69 m; o quadro do térreo encolhe a folga de cada lado; valores fora da faixa são normalizados.
- Editor: o campo nasce com 10 cm e grava a hipótese em mm.
