# Espelho de vendas — "Vendável (entra no VGV)" e o VGV do Imovib

## Pedido original

Sessão `21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0` · 19/11/2026.

> imovib > aba receita: qual a origem das unidades, quando o estudo é vinculado a um empreendimento?

Resposta: estrutura (torres, tipologias, áreas) lida do empreendimento; VGV do espelho de vendas do estudo,
alinhado às unidades do empreendimento. No Garden, 12 unidades do espelho da Torre B (R$ 6,06 mi) sem unidade
correspondente no empreendimento entram no VGV.

> conforme item 2 afirma que o VGV vem do espelho de vendas do empreendimento. O imovib deve observar o status  espelho de vendas, coluna acoes quando a unidade não é publicada por exemplo estacionamento, área comum, garagem nao deve estar disponivel para venda.
> Para deixar bem claro o que entra para venda e que não entra avalie minha sugestão de criar uma coluna em empreendimento > espelhos de vendas > disponivel para venda (coluna nova).

Avaliação dada: o conceito já existe no banco (`empreendimento_units.is_vendavel`), sem coluna na tela; o Imovib
o respeita no caminho área × preço/m² mas **não** no caminho do espelho (onde soma tudo). Propostas: mostrar
`is_vendavel` como coluna em vez de coluna nova; rótulo "Vendável (entra no VGV)" (e não "Disponível", que já é
status); não usar "Publicar" como critério (vitrine ≠ VGV); unidades do espelho do estudo sem unidade no
empreendimento fora do VGV. Perguntado "Quer que eu escreva o plano com essas três partes?":

> sim

## Desenho

**Regra:** com estudo vinculado a empreendimento, conta no VGV (e em "unidades à venda") só a unidade do espelho
do estudo que corresponde a uma unidade **vendável** do empreendimento. Fica fora, marcada na tela:

| Unidade do espelho do estudo | No VGV? | Marca na tela |
|---|---|---|
| ligada a unidade vendável | sim | — |
| ligada a unidade **não vendável** (garagem, área comum, estacionamento) | não | "Não vendável no empreendimento" |
| **sem unidade** no empreendimento | não | "Sem unidade no empreendimento" + remover com confirmação |

Estudo **sem** empreendimento: nada muda. Permutada continua como hoje (fora do VGV, na permuta).
Versões congeladas não mudam (o cálculo delas é congelado); o estudo vivo do Garden perde ~R$ 6,06 mi de VGV.

**Empreendimento › Espelho de vendas:** coluna nova na tela, **"Vendável"**, interruptor por linha e "todas" no
cabeçalho, grava `is_vendavel` na hora; dica "Desligue para garagem, área comum, estacionamento e o que mais não
é vendido — fica fora do VGV do estudo de viabilidade". Unidade não vendável não se publica: o "Publicar" da
linha fica desligado com o motivo.

**Fora:** coluna nova no banco (usa `is_vendavel`); "Publicar" como critério do VGV; mudar preço/status pelo
alinhamento (segue a regra do write-back: nunca preço nem status).

### Abordagens consideradas

1. **Mostrar `is_vendavel` e respeitá-lo no espelho** — escolhida: uma fonte só, já usada no caminho área × preço/m².
2. Coluna nova "disponível para venda" — duas fontes para a mesma coisa, sincronizar as duas.
3. Usar "Publicar" — tiraria do VGV unidade guardada fora da vitrine por estratégia.

---

## Plano de implementação

**Objetivo:** o VGV do estudo vinculado conta só unidades vendáveis do empreendimento, e o empreendimento mostra
e edita o que é vendável. **Arquitetura:** a marcação "fora do VGV" é derivada na leitura (função pura) e o motor
só a respeita — sem migration. **Pilha:** React + TypeScript, Supabase (leitura), Vitest.

### Restrições globais

- Sem migration. Gravação só de `empreendimento_units.is_vendavel` (RLS de sempre).
- Rótulos sem caixa alta (§21), valor escuro (§32), botão desligado diz o motivo (memória), `check-ui-standard.sh`.
- O mesmo critério na tela do estudo **e** na listagem de estudos (`getStudiesWithMetrics`), senão a lista mostra
  outro VGV.

### Foco de revisão

1. Empreendimento com unidade ligada a DUAS instâncias (ou instância apontada por duas unidades) → conta uma vez.
2. Unidade do empreendimento de OUTRA organização não vale (mesma blindagem de `carregarVinculos`).
3. Versão congelada antes desta mudança: o PDF e os números dela não mudam.
4. Torre inteira não vendável (só garagens) → VGV 0 da torre, sem "bloco sem preço" falso.
5. Estudo vinculado sem espelho (caminho área × preço/m²) → igual a hoje.

### Fase 1 — Regra pura e leitura

- [x] F1.1 `utils/imovibEstrutura.ts`: `marcarEspelhoDoEmpreendimento(instancias: ImovibUnitInstance[],
  unidades: { id: string; imovib_instance_id: string | null; is_vendavel: boolean | null }[]): ImovibUnitInstance[]`
  — devolve as instâncias com `fora_do_vgv?: 'nao_vendavel' | 'sem_unidade'`. Teste
  `__tests__/imovibEspelhoVendavel.test.ts`: ligada a vendável → sem marca; ligada a não vendável →
  `'nao_vendavel'`; sem unidade → `'sem_unidade'`; instância apontada por duas unidades (uma vendável) → sem marca.
- [x] F1.2 `types/imovib.ts`: `ImovibUnitInstance.fora_do_vgv?` (derivado, não é coluna).
  `services/imovibService.ts`: `carregarVinculos` passa a ler `imovib_instance_id` das unidades; `getStudyById` e
  `getStudiesWithMetrics` aplicam a marca depois de ler as instâncias (estudo sem vínculo: sem marca).
- [x] F1.3 `utils/imovibMotor.ts` (`computeImovibMath`): instância com `fora_do_vgv` sai de VGV, permuta, unidades
  à venda e área vendável. Teste no motor: Garden-like (17 + 26 ligadas, 12 sem unidade) → VGV = soma das 43;
  torre só de garagens → VGV 0 e não entra em `blocosSemPreco`.

### Fase 2 — Telas

- [x] F2.1 `components/ImovibSalesMapTab.tsx`: linha marcada "Não vendável no empreendimento" / "Sem unidade no
  empreendimento" (texto, não pílula, §8), sem campo de preço editável nela; aviso no topo com quantas e o valor que
  ficou fora; "Remover as sem unidade" com `useConfirm` (lista os nomes). Teste de componente.
- [x] F2.2 `components/empreendimento/EspelhoVendasTab.tsx`: coluna "Vendável" (interruptor por linha + "todas"),
  grava `is_vendavel` na hora (§22: atualiza a linha local); "Publicar" desligado com motivo quando não vendável.
  Teste de componente.

### Revisão final do branch (19/11)

Revisor independente: 1 crítico, 3 importantes, 4 menores. Medido no banco antes de corrigir: só o Garden tem
estudo vinculado com espelho (55 instâncias, 12 sem unidade, nenhuma vendida/reservada).

- **C1** espelho nunca alinhado ao empreendimento zerava o VGV sem aviso → aviso próprio `espelho_sem_vinculo`
  por torre ("use Alinhar"), e o aviso geral "nenhum bloco tem preço" não aparece nesse caso.
- **I1** "Remover as sem unidade" → confere o vínculo no banco na hora, nunca apaga vendida/reservada, diz o que
  fica e sugere "Alinhar" antes.
- **I2** "Vendável — todas" → unidade a unidade (mantém o histórico de auditoria), em lotes de 10; falha no meio
  recarrega do banco.
- **I3** "Publicar — todas" travava com unidade não vendável → conta só as vendáveis.

Menores, registrados e não feitos: unidade publicada que vira não vendável continua publicada (fica a cargo de
desligar o Publicar); KPIs "Total" e "Vendidas" do espelho do estudo contam as marcadas; a comparação de versões
acusa "Espelho de vendas" alterado entre versão antiga e nova só pela marca; editar uma versão antiga recalcula com
a marca nova.

### Fase 3 — Conferência e publicação

- [ ] F3.1 Leitura no banco antes/depois: VGV do Garden pela tela do estudo = soma das 43 ligadas; versão congelada
  inalterada. Navegador (conta de teste; escrita real só ligar/desligar "Vendável" numa unidade e voltar — com OK).
- [ ] F3.2 PR, CI, merge, `conferir-producao.sh`, este plano com "Publicado no PR #".
