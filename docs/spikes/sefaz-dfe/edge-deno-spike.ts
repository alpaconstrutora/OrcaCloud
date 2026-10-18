// SPIKE DESCARTÁVEL — plano docs/planos/2026-10-18-nfe-captura-automatica-sefaz.md, item 0.1.
// Pergunta: o runtime de Edge Functions do Supabase apresenta certificado de
// cliente (mTLS) e alcança o web service da SEFAZ? Apagar depois do teste.
// deno-lint-ignore no-explicit-any
let forge: any;
// deno-lint-ignore no-explicit-any
let https: any;
import { chamadaDeCron } from "../_shared/auth.ts";

const SEFAZ = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const BADSSL = "https://client.badssl.com/";
const BADSSL_P12 = "https://badssl.com/certs/badssl.com-client.p12";

function p12ParaPem(der: Uint8Array, senha: string) {
  const bin = Array.from(der, (b) => String.fromCharCode(b)).join("");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), senha);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0];
  const cert = certBag.cert!;
  return {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keyBag.key!),
    sujeito: cert.subject.attributes.map((a: { shortName?: string; value: unknown }) => `${a.shortName}=${a.value}`).join(", "),
    validade: cert.validity.notAfter.toISOString(),
  };
}

async function tentar(nome: string, fn: () => Promise<unknown>) {
  try {
    return { nome, ok: true, resultado: await fn() };
  } catch (e) {
    return { nome, ok: false, erro: String((e as Error)?.message ?? e).slice(0, 400) };
  }
}

async function resumo(r: Response) {
  const corpo = await r.text();
  return { status: r.status, corpo: corpo.replace(/\s+/g, " ").slice(0, 300) };
}

function nodeGet(url: string, pfx?: Uint8Array, senha?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", pfx, passphrase: senha, timeout: 15000 }, (res) => {
      let corpo = "";
      res.on("data", (c) => (corpo += c));
      res.on("end", () => resolve({ status: res.statusCode, corpo: corpo.replace(/\s+/g, " ").slice(0, 300) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

Deno.serve(async (req) => {
  if (!chamadaDeCron(req)) return new Response("unauthorized", { status: 401 });

  const passo = new URL(req.url).searchParams.get("passo") ?? "";
  const json = (x: unknown) => new Response(JSON.stringify(x, null, 2), { headers: { "Content-Type": "application/json" } });
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);

  if (passo === "deno") {
    return json([
      { nome: "Deno.createHttpClient existe", ok: typeof (Deno as unknown as { createHttpClient?: unknown }).createHttpClient === "function" },
      await tentar("badssl SEM certificado (fetch)", async () => resumo(await fetch(BADSSL))),
      await tentar("SEFAZ sem certificado (fetch ?wsdl)", async () => resumo(await fetch(`${SEFAZ}?wsdl`))),
      { ms: ms() },
    ]);
  }
  if (passo === "node-import") {
    return json([await tentar("import node:https", async () => { https = (await import("node:https")).default; return typeof https.request; }), { ms: ms() }]);
  }
  if (passo === "forge-import") {
    return json([await tentar("import npm:node-forge", async () => { forge = (await import("npm:node-forge@1.3.1")).default; return typeof forge.pkcs12; }), { ms: ms() }]);
  }
  const p12 = new Uint8Array(await (await fetch(BADSSL_P12)).arrayBuffer());
  if (passo === "node-pfx") {
    https = (await import("node:https")).default;
    return json([
      await tentar("badssl COM certificado (node:https pfx)", () => nodeGet(BADSSL, p12, "badssl.com")),
      await tentar("SEFAZ com cert de teste (node:https ?wsdl)", () => nodeGet(`${SEFAZ}?wsdl`, p12, "badssl.com")),
      { ms: ms() },
    ]);
  }
  if (passo === "forge-pfx") {
    forge = (await import("npm:node-forge@1.3.1")).default;
    const pem = await tentar("forge: abrir .p12", async () => { const r = p12ParaPem(p12, "badssl.com"); return { sujeito: r.sujeito, validade: r.validade, certLen: r.cert.length, keyLen: r.key.length }; });
    return json([pem, { ms: ms() }]);
  }
  if (passo === "deno-mtls") {
    forge = (await import("npm:node-forge@1.3.1")).default;
    const { cert, key } = p12ParaPem(p12, "badssl.com");
    return json([
      await tentar("badssl COM certificado (Deno.createHttpClient)", async () => {
        const client = Deno.createHttpClient({ cert, key });
        return resumo(await fetch(BADSSL, { client } as RequestInit));
      }),
      await tentar("SEFAZ com cert de teste (Deno.createHttpClient ?wsdl)", async () => {
        const client = Deno.createHttpClient({ cert, key });
        return resumo(await fetch(`${SEFAZ}?wsdl`, { client } as RequestInit));
      }),
      await tentar("SEFAZ SEM cert, só HTTP/1.1 (?wsdl)", async () => {
        const client = Deno.createHttpClient({ http1: true, http2: false } as Deno.CreateHttpClientOptions);
        return resumo(await fetch(`${SEFAZ}?wsdl`, { client } as RequestInit));
      }),
      await tentar("SEFAZ com cert de teste, só HTTP/1.1 (?wsdl)", async () => {
        const client = Deno.createHttpClient({ cert, key, http1: true, http2: false } as Deno.CreateHttpClientOptions);
        return resumo(await fetch(`${SEFAZ}?wsdl`, { client } as RequestInit));
      }),
      await tentar("SEFAZ com cert de teste, só HTTP/1.1, POST SOAP distDFeInt", async () => {
        const client = Deno.createHttpClient({ cert, key, http1: true, http2: false } as Deno.CreateHttpClientOptions);
        const soap = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>35</cUFAutor><CNPJ>00000000000000</CNPJ><distNSU><ultNSU>000000000000000</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
        return resumo(await fetch(SEFAZ, {
          method: "POST", client, body: soap,
          headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        } as RequestInit));
      }),
      { ms: ms() },
    ]);
  }
  return json({ passos: ["deno", "node-import", "forge-import", "node-pfx", "forge-pfx", "deno-mtls"] });
});
