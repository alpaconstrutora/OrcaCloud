# Planta › Elétrico — textos e símbolos sem sobreposição (tela e prancha)

## Pedido original

Sessão `9e26b316`, 22/10/2026, com dois prints da planta **Garden** (Garden Cambuhy) com a disciplina elétrica ligada:

> veja estes dois print da planta Garden cambuhy. Sisteme elétrico. Veja a total confusão de sobreposicões de testos e componentes.

Decisões do usuário na mesma sessão (perguntas do plan mode):

- Escopo: **tela e prancha** (o mesmo motor nas duas saídas).
- Quando um texto não tem lugar livre ao lado do símbolo: **linha de chamada**.
- Tomada sugerida: **anel e frase sempre** (só passam a ser posicionados sem colisão).
- Rótulo da luminária: **só "C3"** (o círculo com a potência dentro já diz que é luz).

## Causa (lida em `origin/main` d42f19b8)

1. Todo texto elétrico ia a uma distância FIXA do próprio símbolo, sem olhar o vizinho
   (`BlueprintCanvas.tsx`: rótulo do ponto, bloco da tomada, letra do comando, potência da LD,
   círculo do trecho numerado + "N cond.", números/seção dos grupos de condutores, Ø).
   O único posicionador com colisão (`posicionarRotulos`) só atendia as siglas hidráulicas — e,
   sem lugar livre, devolvia a 1ª posição mesmo assim.
2. A prancha (`blueprintPranchaEletrica.ts`) fazia igual.
3. Um círculo numerado por PEDAÇO de tronco (`trechosNumerados`): cada derivação corta o tronco, e
   cada pedaço ganhava círculo + "N cond." (o print chega a "141").
4. Afastado (zoom < 0,08 px/mm) os textos ficam no tamanho mínimo e a planta encolhe.

## Itens

### F1 — Motor puro `utils/blueprintAnotacaoSemColisao.ts`
- **Muda:** função pura `posicionarAnotacoes(anotacoes, obstaculos, opcoes)` — prioridade, 8
  posições coladas, anéis crescentes com linha de chamada, grade espacial, melhor esforço.
- **Pronto quando:** `__tests__/blueprintAnotacaoSemColisao.test.ts` verde (vizinhos não se
  sobrepõem; prioridade escolhe primeiro; chamada só quando afastou; determinístico; caso denso
  sem interseção) e `__tests__/blueprintRotulosSemColisao.test.ts` continua verde.
- [ ] feito

### F2 — Canvas usa o motor
- **Muda:** `BlueprintCanvas.tsx` empilha os textos elétricos (ponto, tomada em bloco, comando,
  LD, trecho numerado, condutores, Ø) e desenha num passe só, depois dos símbolos; luminária
  escreve `C{n}`.
- **Pronto quando:** teste de componente com luz + interruptor + tomadas sugeridas coladas não
  acha interseção entre caixas de texto elétricas; prints antes/depois no app.
- [ ] feito

### F3 — Um número por tronco
- **Muda:** `trechosNumerados` agrupa trechos encadeados com a mesma composição num só rótulo;
  o círculo sai uma vez (no trecho mais longo do grupo); a tabela da folha tem uma linha por grupo.
- **Pronto quando:** teste em `fiacao` com tronco cortado em 3 pedaços iguais → 1 rótulo, 1 linha.
- [ ] feito

### F4 — Prancha usa o motor
- **Muda:** `blueprintPranchaEletrica.ts` posiciona os textos da planta pelo mesmo motor (mm), com
  chamada por `d.linha`; luminária `C{n}`.
- **Pronto quando:** teste com `DesenhistaDeProva` sem interseção entre textos da planta.
- [ ] feito

### F5 — Afastado demais
- **Muda:** abaixo de `ESCALA_DE_ANOTACAO_PX_MM` os textos de prioridade baixa (Ø, "N cond.",
  seção) não entram no motor; circuito, pendência, potência, instrução e nº do trecho continuam.
- **Pronto quando:** teste/inspeção no zoom de conjunto.
- [ ] feito

## Fora do escopo
- Trechos com 30–34 condutores num tronco: é o roteamento automático concentrando circuitos num
  caminho só (desenho não resolve). Diagnóstico separado.

## Estado
- [ ] PR + CI
- [ ] publicação
