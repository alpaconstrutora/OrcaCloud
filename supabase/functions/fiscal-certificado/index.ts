/**
 * fiscal-certificado — recebe o certificado digital A1 (.pfx/.p12) da empresa
 * junto com a senha, confere os dois e só então grava.
 *
 * Plano: docs/planos/2026-10-18-nfe-captura-automatica-sefaz.md (item 1.3).
 *
 * O que é conferido antes de gravar qualquer coisa:
 *   1. a senha abre o arquivo (senão: "Senha incorreta");
 *   2. o certificado está dentro da validade;
 *   3. o CNPJ de DENTRO do certificado é o CNPJ da empresa — um A1 de outra
 *      empresa consultaria a SEFAZ em nome dela.
 *
 * Passando, grava o arquivo no bucket `company-certificates`, a senha no Vault
 * (`fiscal_cert_guardar_senha`, só service_role) e, em `companies`, o caminho,
 * a validade e o CNPJ lidos do certificado. A senha não volta ao navegador e
 * não fica em coluna nenhuma.
 *
 * Entrada (POST, JSON, Authorization: Bearer <JWT do usuário>):
 *   { companyId, arquivoBase64, senha }        owner/admin da organização da empresa
 *
 * REGRA #7 pergunta 3: publicada com --no-verify-jwt; o gate é exigirGestor com
 * a organização DONA da empresa, lida da linha, nunca do corpo.
 *
 * Por que aqui e não no GitHub Actions: abrir o .pfx com node-forge funciona no
 * Deno (spike de 18/10); o que o Deno não faz é a renegociação TLS da SEFAZ.
 */
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import forge from "npm:node-forge@1.3.1";
import { exigirGestor, respostaDeErro } from "../_shared/auth.ts";
import { cnpjDoCertificado, digitosCnpj, dataBrasilia } from "../_shared/certificadoA1.ts";

declare const Deno: { env: { get(key: string): string | undefined } };
// deno-lint-ignore no-explicit-any
type Qualquer = any;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const BUCKET = 'company-certificates';
const TAMANHO_MAXIMO = 5 * 1024 * 1024; // o mesmo limite do bucket
const fmtCnpj = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const fmtData = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(d);

interface Aberto {
    cert: Qualquer;
    commonName: string;
    derBinario: string;
}

/** Abre o PKCS#12 e devolve o certificado cujo par é a chave privada do arquivo. */
function abrirPfx(bytes: Uint8Array, senha: string): Aberto {
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binario), senha);

    const chaves = [
        ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
        ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
    ];
    const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
        .map((b: Qualquer) => b.cert).filter(Boolean);
    const chave = chaves[0]?.key;
    if (!chave || certs.length === 0) throw new Error('SEM_CHAVE_OU_CERTIFICADO');

    // O arquivo costuma trazer a cadeia (AC raiz, AC intermediária). O certificado
    // da empresa é o que tem a mesma chave pública que a chave privada.
    const cert = certs.find((c: Qualquer) => c.publicKey?.n?.equals?.(chave.n)) ?? null;
    if (!cert) throw new Error('SEM_CHAVE_OU_CERTIFICADO');

    const cn = cert.subject.getField('CN')?.value ?? '';
    const derBinario = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return { cert, commonName: String(cn), derBinario };
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
    if (!req.headers.get('Authorization')) return json({ error: 'Unauthorized' }, 401);

    let b: { companyId?: string; arquivoBase64?: string; senha?: string } = {};
    try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const admin: Qualquer = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    if (!b.companyId) return json({ error: 'Empresa não informada.' }, 400);
    const { data: empresa } = await admin
        .from('companies').select('id, org_id, cnpj').eq('id', b.companyId).maybeSingle();
    // Mesmo 403 de "sem acesso": não confirma se a empresa existe.
    if (!empresa) return json({ error: 'Sem acesso a esta organização.' }, 403);

    const vinculo = await exigirGestor(req, empresa.org_id);
    if (!vinculo.ok) return respostaDeErro(vinculo, corsHeaders);

    const senha = b.senha ?? '';
    if (!senha) return json({ error: 'Informe a senha do certificado.' }, 400);
    if (!b.arquivoBase64) return json({ error: 'Selecione o arquivo do certificado (.pfx ou .p12).' }, 400);

    let bytes: Uint8Array;
    try {
        bytes = Uint8Array.from(atob(b.arquivoBase64), c => c.charCodeAt(0));
    } catch {
        return json({ error: 'Arquivo ilegível.' }, 400);
    }
    if (bytes.length > TAMANHO_MAXIMO) return json({ error: 'Arquivo maior que 5 MB — não parece um certificado A1.' }, 400);

    const cnpjEmpresa = digitosCnpj(empresa.cnpj);
    if (!cnpjEmpresa) {
        return json({ error: 'Cadastre o CNPJ da empresa antes de enviar o certificado: é com ele que o certificado é conferido.' }, 422);
    }

    let aberto: Aberto;
    try {
        aberto = abrirPfx(bytes, senha);
    } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (/MAC could not be verified|Invalid password/i.test(msg)) {
            return json({ error: 'Senha incorreta para este certificado.' }, 422);
        }
        if (msg === 'SEM_CHAVE_OU_CERTIFICADO') {
            return json({ error: 'O arquivo não traz a chave privada junto do certificado. Exporte o A1 como .pfx com a chave privada.' }, 422);
        }
        return json({ error: 'O arquivo não é um certificado A1 (.pfx/.p12) válido.' }, 422);
    }

    const agora = new Date();
    const fim: Date = aberto.cert.validity.notAfter;
    const inicio: Date = aberto.cert.validity.notBefore;
    if (fim < agora) return json({ error: `Este certificado venceu em ${fmtData(fim)}.` }, 422);
    if (inicio > agora) return json({ error: `Este certificado só passa a valer em ${fmtData(inicio)}.` }, 422);

    const cnpjCert = cnpjDoCertificado(aberto.derBinario, aberto.commonName);
    if (!cnpjCert) {
        return json({ error: 'Não encontrei CNPJ dentro do certificado. Envie o e-CNPJ A1 da empresa (não o e-CPF de uma pessoa).' }, 422);
    }
    if (cnpjCert !== cnpjEmpresa) {
        return json({
            error: `Este certificado é do CNPJ ${fmtCnpj(cnpjCert)}, mas a empresa é ${fmtCnpj(cnpjEmpresa)}. Nada foi gravado.`,
        }, 422);
    }

    // ── Conferido: grava ─────────────────────────────────────────────────────
    const caminho = `${empresa.id}/certificado_digital.pfx`;
    const { error: errUpload } = await admin.storage.from(BUCKET)
        .upload(caminho, bytes, { upsert: true, contentType: 'application/x-pkcs12' });
    if (errUpload) return json({ error: `Não consegui gravar o arquivo: ${errUpload.message}` }, 500);

    const { error: errCofre } = await admin.rpc('fiscal_cert_guardar_senha', { p_company: empresa.id, p_senha: senha });
    if (errCofre) return json({ error: `Não consegui guardar a senha no cofre: ${errCofre.message}` }, 500);

    const validade = dataBrasilia(fim);
    const { error: errEmpresa } = await admin.from('companies').update({
        certificado_digital_url: caminho,
        certificado_validade: validade,
        certificado_cnpj: cnpjCert,
    }).eq('id', empresa.id);
    if (errEmpresa) return json({ error: `Certificado e senha gravados, mas a empresa não foi atualizada: ${errEmpresa.message}` }, 500);

    return json({
        ok: true,
        caminho,
        validade,
        cnpj: cnpjCert,
        titular: aberto.commonName,
    });
});
