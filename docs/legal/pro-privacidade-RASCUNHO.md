# ÒPURA Pro — Política de Privacidade

> **RASCUNHO para revisão jurídica — não publicar sem aprovação.** Escrito em 14/11/2026 a partir
> do que o ÒPURA Pro guarda de fato (tabelas `pro_config`, `pro_clientes`, `pro_orcamentos`,
> `pro_servicos` e o login). Dados da empresa, encarregado, contato e prazos preenchidos pelo
> usuário em 15/11/2026; o que ainda está entre **[colchetes]** é revisão jurídica. Plano:
> `docs/planos/2026-11-14-opura-pro-publico.md` (P5).

Última atualização: [data da publicação]

## 1. Quem somos

O ÒPURA Pro é um aplicativo gratuito para profissionais autônomos fazerem orçamentos, cobrar pelo
Pix e organizar os serviços. Ele é oferecido por **Alpa Construtora e Incorporadora**, CNPJ **09.264.396/0001-59**, com sede na
**Rua Angelo Bernardo Faccio, 90, Centro, Cambuí – MG, CEP 37600-000** ("nós").

Para falar sobre seus dados, escreva para **privacidade@alpaconstrutora.com.br**. Nosso encarregado pelo
tratamento de dados (LGPD, art. 41) é **Altair Pereira da Rosa**.

## 2. Dois tipos de dado, dois papéis

O ÒPURA Pro guarda dois tipos de informação, e a lei trata cada uma de um jeito:

- **Os seus dados, como usuário do aplicativo.** Para estes, nós somos o **controlador**: decidimos
  como e para quê eles são usados, sempre dentro desta política.
- **Os dados dos seus clientes**, que você cadastra para fazer orçamentos e serviços. Para estes,
  **quem decide é você**: você é o controlador e nós somos o **operador**, que guarda e processa essas
  informações só para o aplicativo funcionar para você. Cabe a você ter um motivo legítimo para
  cadastrar seus clientes, que normalmente é a própria prestação do serviço que eles contrataram.

## 3. Que dados guardamos

**Seus dados**

| O quê | Para quê |
|---|---|
| E-mail (e, se você entrar com o Google, nome e foto da conta Google) | Criar sua conta e deixar você entrar |
| Nome comercial, profissão e cidade | Aparecer nos seus orçamentos e no código Pix; sugerir modelos de orçamento |
| Chave Pix e o tipo da chave | Gerar o QR Code e o código Pix Copia e Cola das suas cobranças |
| Modelos de orçamento e texto de rodapé | Preencher seus orçamentos mais rápido |

**Dados dos seus clientes e serviços (você é quem cadastra)**

| O quê | Para quê |
|---|---|
| Nome, telefone, endereço e observações do cliente | Montar o orçamento e abrir a conversa no WhatsApp |
| Descrição, valor, validade, garantia e situação do orçamento | O orçamento em si e o seu controle |
| Etapas do serviço, fotos de antes e depois, data agendada | Registrar a execução e montar o comprovante |
| Assinatura do cliente (imagem), nome de quem assinou e a data | Registrar o aceite do serviço |
| Data de conclusão, data e forma de recebimento | Mostrar o que você recebeu e quem ainda deve |

**O que não fazemos**

- Não recebemos nem movimentamos dinheiro. O Pix vai direto do seu cliente para a sua chave, pelo
  banco dele. Nós só montamos o código com a chave que você informou.
- Não enviamos mensagens no seu nome. O WhatsApp abre no seu celular, com o texto pronto, e quem
  envia é você.
- Não vendemos dados, não usamos seus dados nem os dos seus clientes para publicidade e não fazemos
  perfil para anúncios.

## 4. Base legal (LGPD, art. 7º)

- **Execução do contrato** (os Termos de Uso): para criar sua conta e fazer o aplicativo funcionar.
- **Legítimo interesse**: para manter o serviço seguro e corrigir erros, por exemplo com registros
  técnicos de acesso.
- **Cumprimento de obrigação legal**: quando a lei exigir que guardemos algo.

[Revisão jurídica: confirmar as bases e se há outra finalidade a declarar.]

## 5. Com quem os dados são compartilhados

Só com quem precisamos para o aplicativo funcionar, sempre como operadores sob contrato:

- **Supabase**: banco de dados, login e envio do e-mail com o código de acesso;
- **Vercel**: hospedagem do aplicativo;
- **Google**: só se você escolher entrar com a conta Google.

Os dados que você cadastra ficam guardados em servidores no **Brasil (São Paulo)**.

[Revisão jurídica: o banco do Supabase fica em São Paulo (região `sa-east-1`, conferido em
15/11/2026). A Vercel só entrega o aplicativo, por uma rede global, e os dados cadastrados vão do
aparelho direto para o banco — mas a Vercel e o envio de e-mail podem registrar endereço IP e e-mail
fora do Brasil. Confirmar se isso precisa ser citado como transferência internacional (LGPD,
art. 33) e em qual base.]

Podemos também ter de entregar dados a autoridades, quando a lei ou uma ordem judicial exigir.

## 6. Por quanto tempo guardamos

Enquanto sua conta existir. Quando você exclui a conta pelo aplicativo (**Ajustes › Minha conta**),
seus dados e os dos seus clientes são apagados na hora. Pedidos por e-mail são atendidos em até
**30 dias**. Fica guardado só o que a lei nos obrigar a manter por mais tempo.
[Revisão jurídica: confirmar se cópias de segurança do banco precisam ser citadas (o provedor guarda
backups por um período; a exclusão vale para elas quando o backup expira).]

## 7. Seus direitos (LGPD, art. 18)

Você pode, a qualquer momento:

- confirmar se tratamos seus dados e pedir acesso a eles;
- corrigir dados errados ou desatualizados (a maioria você mesmo corrige em **Ajustes**);
- pedir uma cópia dos seus dados;
- pedir a exclusão da sua conta e dos seus dados;
- saber com quem compartilhamos os dados;
- revogar o consentimento, quando ele for a base do tratamento.

A cópia e a exclusão você faz sozinho, no aplicativo: **Ajustes › Minha conta › Baixar meus dados**
(um arquivo com tudo o que você cadastrou, inclusive fotos e assinaturas) e **Excluir minha conta**.
Para o resto, ou se preferir, escreva para **privacidade@alpaconstrutora.com.br** a partir do e-mail da sua
conta. Respondemos em até **15 dias**.

Se o pedido for sobre os dados de um **cliente** seu, encaminhamos a você, que é o controlador desses
dados (seção 2).

## 8. Segurança

Cada conta só enxerga os próprios dados. O banco aplica essa regra em todas as consultas, e o
aplicativo usa conexão criptografada (HTTPS). Nenhum sistema é infalível: se acontecer um incidente
que possa causar risco ou dano relevante, avisamos você e a ANPD, como manda a lei.

## 9. Cookies e armazenamento no aparelho

Guardamos no seu navegador só o necessário para manter você conectado (a sessão de login) e algumas
preferências do aplicativo. Não usamos cookies de publicidade nem de rastreamento de terceiros.

## 10. Menores de idade

O ÒPURA Pro é para quem tem 18 anos ou mais.

## 11. Mudanças nesta política

Se mudarmos algo importante, avisamos no aplicativo ou por e-mail antes de a mudança valer.
