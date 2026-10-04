# Todas as folgas da massa em hipóteses

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 04/10/2026. Depois de a "folga até o recuo" virar hipótese, a pergunta foi se
o 0,5 % do corte pela taxa de ocupação era fixo. Resposta: fixo (0,995 por lado ≈ 1 % de área). Pedido, literal:

> sim.
> e alias todas as folgas que houver devem ser incluidas em hipoteses

## Levantamento

| Folga | Antes | Agora |
|---|---|---|
| Folga até o recuo | 10 cm fixos | hipótese do Gerar massa (já feita: `margemDoEnvelopeMm`) |
| Folga na taxa de ocupação (embasamento + torre) | 0,995 por lado | `folgaDaTaxaDeOcupacaoPct`, % da ÁREA, padrão 1 % |
| Piso de unidades ao priorizar o sol | 80 % | `pisoDeUnidadesNoSolPct`, padrão 80 %, 0 desliga |
| Manobra entre vagas em fila | 1.000 mm | `HipotesesDeVagas.folgaDaFilaMm` (gaveta Vagas) e `HipotesesDoProduto.folgaDaFilaMm` (contagem da massa) |
| Afastamento das vagas ao contorno | 200 mm (massa: fixo) | `HipotesesDoProduto.recuoDasVagasMm` (mín. 100 mm) e o `recuoMm` da gaveta Vagas, agora editável |

Ficam fixos (regras da biblioteca/detecção, não folga de projeto): lado mínimo de bloco 8 m, passo da busca do
retângulo inscrito 25 cm, tolerância de divergência da escritura 10 mm, alinhamento de faixa restrita 50 mm.

⚠️ Achado: na contagem de vagas da massa a garagem é cercada por paredes virtuais de 200 mm no eixo do contorno; com
afastamento abaixo de 100 mm a primeira fileira bate nelas (medido numa garagem 30 × 20 m: 22 → 11 vagas). Por isso o
afastamento do Produto tem mínimo de 100 mm.

## Telas

- Gerar massa: "Folga na TO (% da área)" e, com o objetivo de sol, "Unidades mínimas no sol (%)".
- Produto › Hipóteses: "Vagas: afastamento do contorno (mm, mín. 100)" e "Vagas em fila: manobra entre vagas (mm)".
- Gaveta Vagas: "Afastamento do contorno (mm)" e, no arranjo em fila, "Manobra em fila (mm)".

## Verificação

- Gerador: 1 % → 99 % do teto da TO (249,5 m² na planta 12 × 30); 5 % → 95 %; o piso do sol escrito na decisão; 0 desliga.
- Vagas: padrão igual ao de antes; manobra maior em fila cabe menos; afastamento maior cabe menos; abaixo de 100 vale 100;
  `geometriaDoArranjo` usa a hipótese.
- Editor: os campos nascem com os padrões e gravam o que se digita.
