# NBR 5410 — previsão de carga (9.5.2) e divisão (9.5.3): auditoria contra o texto

## Pedido original

> considerear as normas abaixo para Previsão de carga de acordo com a NBR-5410.
> 9.5.2 Previsão de carga 9.5.2.1 Iluminação 9.5.2.1.1 Em cada cômodo ou
> dependência deve ser previsto pelo menos um ponto de luz fixo no teto,
> comandado por interruptor. […] 9.5.3.3 Em locais de habitação, admite-se,
> como exceção à regra geral de 4.2.5.5, que pontos de tomada […] e pontos de
> iluminação possam ser alimentados por circuito comum, desde que […]

(13/09/2026 — o usuário colou o texto integral de 9.5.2.1 a 9.5.3.3; a
auditoria abaixo foi feita cláusula a cláusula contra esse texto, não contra a
memória.)

## Resultado — 13/09/2026 ✅

| cláusula | o que a norma diz | estado no código |
|---|---|---|
| 9.5.2.1.1 | luz fixa no teto, comandada por interruptor | ✅ já havia (`conferirIluminacao`, letras de comando) |
| 9.5.2.1.1 nota 1 | hotéis: tomada 100 VA comandada no lugar da luz | ⛔ fora — não há tipo "hotel"; declarado |
| 9.5.2.1.1 nota 2 | em sob escada, depósito, despensa, lavabo e varanda de pequenas dimensões, luz na PAREDE vale | **corrigido**: `luzNaParedeAdmitida` — VARANDA/BANHEIRO/OUTRO com área ≤ 6 m² e arandela; deixa de ser falta e vira AVISO "admitido (nota 2)". "Pequenas dimensões" não tem número na norma: 6 m² é a fronteira de 9.5.2.1.2, hipótese declarada |
| 9.5.2.1.2 | 100 VA até 6 m²; +60 VA por 4 m² inteiros | ✅ `minimoDeIluminacaoVA` (floor) |
| 9.5.2.2.1 a | banheiro: ≥ 1 junto ao lavatório | ✅ (1 na altura média, "junto ao lavatório") |
| 9.5.2.2.1 b | cozinha etc.: 1 por 3,5 m ou fração; ≥ 2 sobre a bancada, **no mesmo ponto ou em pontos distintos** | ✅ contagem; **corrigido** o texto da regra para dizer a alternativa do mesmo ponto — o desenho só conta pontos, um ponto duplo não se distingue |
| 9.5.2.2.1 c | varanda ≥ 1; nota: fora dela, junto ao acesso, se < 2 m² ou profundidade < 0,80 m | **corrigido**: `admiteFora` (800 mm do contorno, hipótese declarada para "junto ao acesso"); profundidade = menor lado do retângulo envolvente (`menorLadoM`) |
| 9.5.2.2.1 d | sala/dormitório: 1 por 5 m ou fração | ✅ |
| 9.5.2.2.1 e.1 | ≤ 2,25 m²: 1, podendo ficar até 0,80 m da porta | **corrigido**: `admiteFora` 800 mm; tomada do pavimento a essa distância do contorno conta (`existentesFora`) e a conferência diz que contou |
| 9.5.2.2.1 e.2/e.3 | 2,25–6 m²: 1; > 6 m²: 1 por 5 m | ✅ |
| 9.5.2.2.2 a | 600 VA até 3 pontos, 100 VA excedentes, por ambiente; se o conjunto passa de 6, 600 até 2 | ✅ `minimoDePotencia` (viabilidade: as k maiores ≥ 600, todas ≥ 100) |
| 9.5.2.2.2 b | demais: 100 VA | ✅ |
| 9.5.2.3 | aquecedor: ligação direta | ✅ (reconhecido pelo nome; declarado) |
| 9.5.3.1 | > 10 A: circuito independente | ✅ |
| 9.5.3.2 | tomadas de cozinha/serviço: circuito exclusivo | ✅ (`AMBIENTES_9532` = COZINHA_SERVICO; banheiro fica fora, como no texto) |
| 9.5.3.3 a/b/c | comum ≤ 16 A; nem toda a luz nem todas as tomadas num só comum | ✅ |

**Prova**: `__tests__/blueprintNbr5410Notas.test.ts` (6): e.1 conta a 500 mm e
não a 1.200 mm; varanda < 2 m² e varanda de 0,7 m de profundidade; texto da
bancada; distância ao anel; lavabo com arandela admitido; sala/depósito grande
e ambiente sem tipo continuam faltando. Os testes anteriores da norma seguem
verdes (Minimo, Iluminacao, Conferencia, TomadasSugeridas, DistribuirTomadas).
