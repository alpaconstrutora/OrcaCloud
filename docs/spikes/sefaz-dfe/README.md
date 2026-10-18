# Spike — mTLS com a SEFAZ (NFeDistribuicaoDFe)

Plano: `docs/planos/2026-10-18-nfe-captura-automatica-sefaz.md`, item 0.1. Rodado em 18/10/2026.

**Pergunta:** dá para chamar o web service de distribuição da SEFAZ, com certificado
de cliente, de dentro de uma Edge Function do Supabase?

**Resposta: não.** E não é configuração: é o TLS do runtime. Em Node funciona.

## O que foi medido

Certificado de cliente usado: o público do badssl.com (`badssl.com-client.p12`,
senha `badssl.com`). Ele prova se o certificado **é apresentado**, mas a SEFAZ
nunca vai aceitá-lo, porque não é ICP-Brasil.

| Teste | Supabase Edge (Deno) | Node 24 local |
|---|---|---|
| `Deno.createHttpClient` existe | sim | — |
| `client.badssl.com` sem certificado | 400 "No required SSL certificate was sent" | — |
| `client.badssl.com` com certificado | **200** (`createHttpClient({cert,key})`) | **200** (`https.request({cert,key})`) |
| `node:https` com `pfx` | **a função cai (503)** | `pfx` recusado: "Unsupported PKCS12 PFX data" (RC2, OpenSSL 3) |
| abrir `.p12` com `node-forge` → PEM | ok, ~0,7 s | ok |
| SEFAZ, HTTP/2 (padrão do Deno) | "endpoint requires HTTP/1.1" | — |
| SEFAZ, HTTP/1.1, sem certificado | **conexão resetada** | **HTTP 403** |
| SEFAZ, HTTP/1.1, certificado de teste | **conexão resetada** | **HTTP 403** |

## Por quê

`openssl s_client -connect www1.nfe.fazenda.gov.br:443 -tls1_2` mostra
**"No client certificate CA names sent"** no primeiro handshake e
**"Secure Renegotiation IS supported"**. O `curl` do Windows registra
"schannel: renegotiating SSL/TLS connection". Ou seja, o IIS da SEFAZ só pede o
certificado do cliente numa **renegociação TLS**, depois de receber a requisição.

- O Deno usa **rustls, que não implementa renegociação**. O servidor pede, o
  cliente não atende, e a conexão é derrubada. Em HTTP/2 a renegociação é
  proibida, daí "endpoint requires HTTP/1.1".
- O Node usa **OpenSSL, que renegocia**, e chega até a resposta HTTP (403 com
  certificado não ICP-Brasil).
- O certificado do **servidor** da SEFAZ (cadeia "AC SERPRO AR46 OV TLS CA 2025")
  é aceito pelos dois sem CA extra.

## Consequências para o plano

1. A chamada à SEFAZ precisa rodar em **Node** (OpenSSL), fora das Edge Functions.
2. O `.pfx` deve ser aberto com **node-forge** e passado como PEM (`cert`/`key`):
   o OpenSSL 3 do Node 24 recusa PFX com cifra antiga, comum em A1.
3. Use **HTTP/1.1**.
4. **Ainda falta a prova final:** resposta 200 com `cStat` exige um certificado A1
   ICP-Brasil real. O 403 é o mesmo genérico com e sem certificado de teste, então
   não distingue "não veio certificado" de "certificado não aceito".

## Arquivos

- `edge-deno-spike.ts` — a função usada no Supabase (publicada como
  `spike-sefaz-mtls`, protegida pelo `CRON_SECRET`, **apagada** depois do teste:
  a URL responde 404).
- `node-openssl-spike.mjs` — o teste local em Node (`npm i node-forge@1.3.1`).
