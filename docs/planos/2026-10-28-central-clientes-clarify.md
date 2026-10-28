# Central de Clientes — vocabulário e textos (`/impeccable clarify`)

## Pedido original

> /impeccable critique analise e dados > Central de Clientes

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 28/10/2026. Crítica 2 (23/40), P1 "vocabulário".
Respostas do usuário: termo **"Em aberto"** (dividido em **Vencido** e **A vencer**), escopo **"Tudo"**,
ordem **"um de cada vez"** e depois **"siga em frente"**. 3º comando (1º #218, 2º #220).

## O que muda (`components/CentralCliente.tsx`)

| Antes | Depois | Por quê |
|---|---|---|
| "saldo devedor", "a receber", "em aberto", "previsto" para o mesmo valor | **em aberto** em toda a tela | decisão do usuário; 4 nomes para R$ 946.437,14 |
| Faturado: "recebido + a receber · 26,7% do contratado" | "recebido + em aberto, lançados no período" | o % dividia o faturado DO PERÍODO pelo contratado SEM PERÍODO (RPC conferida) |
| Contratado: "15 contratos" | "15 contratos, sem recorte de período" | a base escrita |
| Limiar invisível | linha abaixo dos KPIs com a regra e os números, só com alerta aceso | crítica: "o limiar de 30% não aparece em lugar nenhum" |
| Extrato: "previsto · vencido há N dias (venc. dd/mm)" | "Vencido há N dias" · "A vencer em dd/mm/aaaa" · "Recebido em dd/mm/aaaa" | um estado por linha, data uma vez; coluna "Lançado em" |
| Erros: texto técnico como mensagem; toast duplicado | "Não foi possível carregar X." + o que fazer + "Tentar de novo" + "Detalhe técnico: …" (`FalhaComSaida`, 3 lugares); toast da carga principal removido | o que falhou, o que fazer, sem repetir |
| Vazios: "Nenhum cliente cadastrado.", "Sem lançamentos." | com o próximo passo (onde cadastrar, outro tipo, ampliar o período) | vazio que orienta |
| Subtítulo: "Contratado × Faturado × Recebido — por cliente." | "Quem deve, quanto e há quanto tempo — por cliente e por obra." | o que a tela responde hoje |
| Nome acessível da linha: vencido e em aberto | + "há até N dias" | a idade da dívida para quem usa leitor de tela |

## Estado

- [x] textos — navegador (127.0.0.1:3140, Desenvolvedor): legendas dos KPIs sem corte; regra do alerta
  "97,6% do em aberto do período já venceu (alerta a partir de 30%, atenção a partir de 10%) ·
  R$ 2.220.292,00 vencidos há mais de 90 dias, lançados em qualquer data."; extrato "— Sem obra":
  39 "Vencido há N dias", 10 "A vencer em …", 4 "Recebido em …", nenhum "previsto"; erro forçado do
  extrato com a mensagem nova.

## Verificação

`tsc` 0; `check-ui-standard` limpo; navegador acima.
