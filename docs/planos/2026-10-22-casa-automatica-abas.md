# Casa automática em abas

## Pedido original

> incorporacao > planta automatica > analisar > Casa automática:
> o resultado na tela fica bastante extensa. Avalie se seria melhor dividir em abas. veja planta garden cambuhy aberta

Sessão 8bf76f5b · 22/10/2026.

Depois da avaliação (medida na Garden Cambuhy, abaixo), a proposta de abas foi aprovada: *"sim"* (22/10/2026),
em resposta a "Quer que eu implemente numa frente separada?".

## O que a medição mostrou (Garden Cambuhy, 1920 × 855, prévia gerada)

| Bloco | Altura |
|---|---|
| Premissas (49 campos) | 1.247 px |
| Prévia (resumo, aviso, 24 etapas, relatório com 56 itens, 64 furos) | 2.332 px |
| **Tela inteira** | **3.603 px ≈ 4,2 telas** |

- "Gerar" ficava em y = 1.480 (abaixo da 1ª tela); "Lançar" em y = 3.726, depois da tabela de furos.
- Etapas (≈ 1.190 px, coluna esquerda) × Relatório (≈ 300 px com um grupo aberto) lado a lado: coluna direita vazia.
- O quadro âmbar "Faltam premissas" repetia os mesmos itens do grupo "Premissa faltando" do relatório.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 22/10/2026 | Dividir em abas (Programa · Hipóteses · Resultado · Relatório · Furos · Terraplenagem), com Gerar/Criar alternativa/Lançar na barra das abas? | "sim" |

Decisões de implementação (dentro do que foi aprovado):

- Barra = `components/ui/TabsBar.tsx` (§19.1); ações no slot da direita. Um só botão azul sólido (§17): **Gerar**
  sem prévia; **Lançar** com prévia (Gerar vira secundário).
- Abas do resultado só existem com prévia; Furos só com furo; Terraplenagem só com o platô. Aba que deixou de
  existir cai em Resultado (ou Programa, sem prévia) — "aba vazia não aparece" (§19.5).
- Ao terminar de gerar, vai para **Resultado** — salvo se o usuário está em Relatório/Furos/Terraplenagem e a aba
  continua existindo.
- O quadro âmbar vira **uma linha** no Resultado ("Faltam N premissas…") com um botão que abre o Relatório no grupo
  "Premissa faltando". O "porquê o gerador parou" continua à vista (a lição do PPCI, 10/10/2026), sem repetir a lista.
- Hipóteses: o mesmo card, separado por título (§30) em 4 seções — Implantação e telhado · Terreno, muro e calçadas ·
  Instalações · Estrutura, pavimentos e forro.
- Etapas em duas colunas na largura toda (24 etapas → 12 linhas).
- Tabela de furos com altura de 70vh na aba própria (era 24rem).

## Plano

1. `components/blueprint/TelaCasaAutomatica.tsx` — barra de abas + ações; conteúdo por aba; troca automática para
   Resultado; aviso de premissas em uma linha. **Pronto quando:** cada bloco aparece só na sua aba; Gerar/Lançar
   visíveis em todas; `check-ui-standard.sh` sem violação nova.
2. `components/blueprint/TabelaFurosPrevistos.tsx` — altura da rolagem 24rem → 70vh (só esta tela usa a tabela, então
   não precisou de prop). **Pronto quando:** a tabela na aba Furos rola só depois de 70vh.
3. `__tests__/components/TelaCasaAutomatica.test.tsx` — testes existentes passando pelas abas + novos: abas do
   resultado só com prévia, troca automática para Resultado, Furos/Terraplenagem condicionais, aviso abre o grupo
   certo do Relatório. **Pronto quando:** a suíte do arquivo e a do `BlueprintEditor` (casa automática) passam.
4. Medir de novo na Garden Cambuhy (produção, depois de publicado): altura de cada aba e posição dos botões.
   **Pronto quando:** os números estão registrados aqui.

## Estado

- [x] 1 — TelaCasaAutomatica (`check-ui-standard.sh`: nenhuma violação)
- [x] 2 — TabelaFurosPrevistos
- [x] 3 — testes: `TelaCasaAutomatica.test.tsx` 19/19 (16 antigos ajustados às abas + 3 novos); "casa automática (F10)"
  do `BlueprintEditor.test.tsx` passa sem mudança
- [x] 4 — publicado (#98, 4a18389, conferir-producao ✅); tela aprovada pelo usuário em 22/10/2026; medição por aba
  não feita (Chrome desconectado)

## Verificação

`npx vitest run __tests__/components/TelaCasaAutomatica.test.tsx`, o teste "casa automática (F10)" de
`__tests__/components/BlueprintEditor.test.tsx`, `npx tsc --noEmit`, `bash scripts/check-ui-standard.sh
components/blueprint/TelaCasaAutomatica.tsx` e a medição no Chrome.
