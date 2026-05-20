// ============================================================
// OrçaCloud — Edge Function: fiscal-nfe-processor
// Processa NF-e XML: parse → validate → extract → normalize
//
// Adaptações em relação ao módulo standalone:
//   - invoices      → nfe_invoices
//   - invoice_items → nfe_invoice_items
//   - company_id    → organization_id
//   - bucket        → fiscal-documents
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4";

const PARSER_VERSION = "1.0.0";
const CONTRACT_VERSION = "1.0.0";

// ============================================================
// TIPOS
// ============================================================

interface ProcessingJob {
  id: string;
  organization_id: string;
  raw_document_id: string;
  retry_count: number;
  max_retries: number;
}

interface ExtractedContract {
  document_version: string;
  issuer: {
    cnpj: string;
    name: string;
    ie?: string;
    address?: Record<string, unknown>;
  };
  recipient: {
    cnpj?: string;
    cpf?: string;
    name?: string;
  };
  totals: {
    total_products: number;
    total_freight?: number;
    total_discount?: number;
    total_value: number;
    total_tax?: number;
  };
  items: Array<{
    line_number: number;
    description: string;
    ncm?: string;
    cfop?: string;
    quantity: number;
    commercial_unit?: string;
    taxable_unit?: string;
    unit_value: number;
    total_value: number;
    tax_value?: number;
  }>;
  taxes: Record<string, unknown>;
  metadata: {
    parser_version: string;
    parsed_at: string;
    source_hash: string;
    warnings: string[];
    schema_version: string;
    access_key: string;
    issue_date: string;
  };
}

// ============================================================
// PARSER NF-e
// ============================================================

function parseNFe(
  xmlContent: string,
  sourceHash: string
): { contract: ExtractedContract | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlContent);
  } catch (e) {
    errors.push(`XML_PARSE_ERROR: ${e.message}`);
    return { contract: null, errors, warnings };
  }

  const root = (parsed["nfeProc"] || parsed["NFe"] || parsed) as Record<string, unknown>;
  const nfe = (root["NFe"] || root) as Record<string, unknown>;
  const infNFe = (nfe["infNFe"] || {}) as Record<string, unknown>;

  if (!infNFe || Object.keys(infNFe).length === 0) {
    errors.push("INVALID_SCHEMA: infNFe não encontrado");
    return { contract: null, errors, warnings };
  }

  const accessKey = (infNFe["@_Id"] as string || "").replace("NFe", "");
  if (!accessKey || accessKey.length !== 44) {
    errors.push("MISSING_ACCESS_KEY: chave de acesso ausente ou inválida");
    return { contract: null, errors, warnings };
  }

  const emit = (infNFe["emit"] || {}) as Record<string, unknown>;
  const issuerCnpj = String(emit["CNPJ"] || "").replace(/\D/g, "");
  const issuerName = String(emit["xNome"] || emit["xFant"] || "");

  if (!issuerCnpj || issuerCnpj.length !== 14) {
    errors.push("INVALID_ISSUER: CNPJ do emitente inválido");
    return { contract: null, errors, warnings };
  }
  if (!issuerName) warnings.push("MISSING_ISSUER_NAME: nome do emitente ausente");

  const dest = (infNFe["dest"] || {}) as Record<string, unknown>;
  const recipientCnpj = String(dest["CNPJ"] || "").replace(/\D/g, "") || undefined;
  const recipientCpf  = String(dest["CPF"]  || "").replace(/\D/g, "") || undefined;
  const recipientName = String(dest["xNome"] || "") || undefined;

  if (!recipientName) warnings.push("MISSING_RECIPIENT_NAME");

  const ide = (infNFe["ide"] || {}) as Record<string, unknown>;
  const issueDate = String(ide["dhEmi"] || ide["dEmi"] || "").substring(0, 10);
  if (!issueDate) {
    errors.push("MISSING_ISSUE_DATE: data de emissão ausente");
    return { contract: null, errors, warnings };
  }

  const total   = (infNFe["total"]   || {}) as Record<string, unknown>;
  const icmsTot = (total["ICMSTot"]  || {}) as Record<string, unknown>;
  const totalValue    = parseFloat(String(icmsTot["vNF"]      || "0"));
  const totalProducts = parseFloat(String(icmsTot["vProd"]    || "0"));
  const totalFreight  = parseFloat(String(icmsTot["vFrete"]   || "0")) || undefined;
  const totalDiscount = parseFloat(String(icmsTot["vDesc"]    || "0")) || undefined;
  const totalTax      = parseFloat(String(icmsTot["vTotTrib"] || "0")) || undefined;

  if (!totalValue) {
    errors.push("MISSING_TOTAL_VALUE: valor total da NF ausente");
    return { contract: null, errors, warnings };
  }

  const rawDet = infNFe["det"];
  if (!rawDet) {
    errors.push("MISSING_ITEMS: itens da NF ausentes");
    return { contract: null, errors, warnings };
  }

  const detArray = Array.isArray(rawDet) ? rawDet : [rawDet];
  const items = detArray.map((det: Record<string, unknown>, idx: number) => {
    const prod    = (det["prod"]    || {}) as Record<string, unknown>;
    const imposto = (det["imposto"] || {}) as Record<string, unknown>;

    const icms      = (imposto["ICMS"] || {}) as Record<string, unknown>;
    const icmsGrupo = (Object.values(icms)[0] as Record<string, unknown>) || {};
    const icmsVal   = parseFloat(String(icmsGrupo["vICMS"] || "0"));
    const ipiVal    = parseFloat(String(
      ((imposto["IPI"] as Record<string, unknown> || {})["IPITrib"] as Record<string, unknown> || {})["vIPI"] || "0"
    ));
    const taxValue = icmsVal + ipiVal || undefined;

    return {
      line_number:      parseInt(String(det["@_nItem"] || idx + 1)),
      description:      String(prod["xProd"] || ""),
      ncm:              String(prod["NCM"]   || "") || undefined,
      cfop:             String(prod["CFOP"]  || "") || undefined,
      quantity:         parseFloat(String(prod["qCom"]   || "0")),
      commercial_unit:  String(prod["uCom"]  || "") || undefined,
      taxable_unit:     String(prod["uTrib"] || "") || undefined,
      unit_value:       parseFloat(String(prod["vUnCom"] || "0")),
      total_value:      parseFloat(String(prod["vProd"]  || "0")),
      tax_value:        taxValue,
    };
  });

  if (items.length === 0) {
    errors.push("EMPTY_ITEMS: nenhum item válido encontrado");
    return { contract: null, errors, warnings };
  }

  const contract: ExtractedContract = {
    document_version: String(ide["mod"] || "55") === "55" ? "4.00" : "3.10",
    issuer:    { cnpj: issuerCnpj, name: issuerName, ie: String(emit["IE"] || "") || undefined },
    recipient: { cnpj: recipientCnpj, cpf: recipientCpf, name: recipientName },
    totals:    { total_products: totalProducts, total_freight: totalFreight, total_discount: totalDiscount, total_value: totalValue, total_tax: totalTax },
    items,
    taxes: icmsTot,
    metadata: {
      parser_version: PARSER_VERSION,
      parsed_at:      new Date().toISOString(),
      source_hash:    sourceHash,
      warnings,
      schema_version: "4.00",
      access_key:     accessKey,
      issue_date:     issueDate,
    },
  };

  return { contract, errors, warnings };
}

// ============================================================
// CLASSIFICAÇÃO HEURÍSTICA (lê tabela, não hardcode)
// Ordem: NCM (prioridade 10) → CFOP (80) → keyword (50)
// ============================================================

async function classifyItem(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  description: string,
  ncm?: string,
  cfop?: string
): Promise<string | null> {
  if (ncm) {
    const { data } = await supabase
      .from("classification_rules")
      .select("category")
      .eq("rule_type", "ncm")
      .eq("match_value", ncm.substring(0, 4))
      .eq("is_active", true)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("priority", { ascending: true })
      .limit(1)
      .single();
    if (data) return data.category;
  }

  if (cfop) {
    const { data } = await supabase
      .from("classification_rules")
      .select("category")
      .eq("rule_type", "cfop")
      .eq("match_value", cfop)
      .eq("is_active", true)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .order("priority", { ascending: true })
      .limit(1)
      .single();
    if (data) return data.category;
  }

  const { data: keywordRules } = await supabase
    .from("classification_rules")
    .select("match_value, category")
    .eq("rule_type", "keyword")
    .eq("is_active", true)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .order("priority", { ascending: true });

  if (keywordRules) {
    const descLower = description.toLowerCase();
    for (const rule of keywordRules) {
      if (descLower.includes(rule.match_value.toLowerCase())) return rule.category;
    }
  }

  return null;
}

// ============================================================
// WORKER PRINCIPAL
// ============================================================

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: ProcessingJob
): Promise<void> {
  const jobId = job.id;

  // Lock otimista: apenas um worker processa este job
  const { data: locked, error: lockError } = await supabase.rpc("acquire_job", {
    p_job_id: jobId,
  });
  if (lockError || !locked) {
    console.log(`Job ${jobId} já está sendo processado`);
    return;
  }

  await supabase.from("raw_documents")
    .update({ processing_status: "processing" })
    .eq("id", job.raw_document_id);

  try {
    // 1. Verificar idempotência: NF já existe?
    const { data: rawDoc } = await supabase
      .from("raw_documents")
      .select("access_key, source_hash, file_path, organization_id")
      .eq("id", job.raw_document_id)
      .single();

    if (!rawDoc) throw new Error("RAW_DOC_NOT_FOUND");

    const { data: existing } = await supabase
      .from("nfe_invoices")
      .select("id")
      .eq("access_key", rawDoc.access_key)
      .single();

    if (existing) {
      await supabase.from("processing_jobs").update({
        status:       "duplicated",
        finished_at:  new Date().toISOString(),
        error_code:   "DUPLICATE_ACCESS_KEY",
        error_message: "NF-e já processada anteriormente",
        failure_type: "data_failure",
      }).eq("id", jobId);
      await supabase.from("raw_documents")
        .update({ processing_status: "duplicated" })
        .eq("id", job.raw_document_id);
      return;
    }

    // 2. Download do XML no Storage
    const { data: xmlData, error: storageErr } = await supabase.storage
      .from("fiscal-documents")
      .download(rawDoc.file_path);

    if (storageErr) throw new Error(`STORAGE_ERROR: ${storageErr.message}`);
    const xmlContent = await xmlData.text();

    // 3. Parse NF-e → JSON Contract V1
    await supabase.from("processing_jobs")
      .update({ status: "parsed" }).eq("id", jobId);
    await supabase.from("raw_documents")
      .update({ processing_status: "parsed" }).eq("id", job.raw_document_id);

    const { contract, errors, warnings } = parseNFe(xmlContent, rawDoc.source_hash);

    if (errors.length > 0 || !contract) {
      for (const err of errors) {
        await supabase.from("parsing_errors").insert({
          processing_job_id: jobId,
          raw_document_id:   job.raw_document_id,
          error_type:        "data_failure",
          error_code:        err.split(":")[0],
          error_message:     err,
          error_payload:     { errors, warnings },
          parser_version:    PARSER_VERSION,
        });
      }
      await supabase.from("processing_jobs").update({
        status:        "dead_letter",
        finished_at:   new Date().toISOString(),
        error_code:    errors[0]?.split(":")[0] || "PARSE_FAILED",
        error_message: errors.join("; "),
        failure_type:  "data_failure",
      }).eq("id", jobId);
      await supabase.from("raw_documents")
        .update({ processing_status: "dead_letter" })
        .eq("id", job.raw_document_id);
      return;
    }

    // 4. Transação atômica via RPC: extracted + nfe_invoices + nfe_invoice_items + job status
    const { error: txError } = await supabase.rpc("persist_nfe_transaction", {
      p_job_id:           jobId,
      p_raw_document_id:  job.raw_document_id,
      p_organization_id:  job.organization_id,
      p_contract:         contract,
      p_contract_version: CONTRACT_VERSION,
      p_parser_version:   PARSER_VERSION,
      p_warnings:         warnings,
    });

    if (txError) throw new Error(`TX_ERROR: ${txError.message}`);

    // 5. Classificar itens (pós-persistência — pode falhar sem rollback)
    const { data: savedInvoice } = await supabase
      .from("nfe_invoices")
      .select("id")
      .eq("access_key", contract.metadata.access_key)
      .single();

    if (savedInvoice) {
      const { data: savedItems } = await supabase
        .from("nfe_invoice_items")
        .select("id, description, ncm, cfop")
        .eq("invoice_id", savedInvoice.id);

      if (savedItems) {
        for (const item of savedItems) {
          const category = await classifyItem(
            supabase,
            job.organization_id,
            item.description,
            item.ncm,
            item.cfop
          );
          if (category) {
            await supabase.from("nfe_invoice_items")
              .update({ category })
              .eq("id", item.id);
          }
        }
      }
    }

  } catch (err) {
    const isDataError = err.message?.startsWith("DATA_");
    const newRetryCount = job.retry_count + 1;
    const shouldDeadLetter = isDataError || newRetryCount >= job.max_retries;

    await supabase.from("parsing_errors").insert({
      processing_job_id: jobId,
      raw_document_id:   job.raw_document_id,
      error_type:        isDataError ? "data_failure" : "technical_failure",
      error_code:        "WORKER_ERROR",
      error_message:     err.message || String(err),
      error_payload:     { stack: err.stack },
      parser_version:    PARSER_VERSION,
    });

    if (shouldDeadLetter) {
      await supabase.from("processing_jobs").update({
        status:        "dead_letter",
        finished_at:   new Date().toISOString(),
        retry_count:   newRetryCount,
        error_code:    "MAX_RETRIES_EXCEEDED",
        error_message: err.message,
        failure_type:  isDataError ? "data_failure" : "technical_failure",
      }).eq("id", jobId);
      await supabase.from("raw_documents")
        .update({ processing_status: "dead_letter" })
        .eq("id", job.raw_document_id);
    } else {
      const nextRetry = new Date(
        Date.now() + Math.pow(2, newRetryCount) * 60 * 1000
      ).toISOString();
      await supabase.from("processing_jobs").update({
        status:        "failed",
        retry_count:   newRetryCount,
        next_retry_at: nextRetry,
        error_code:    "WORKER_ERROR",
        error_message: err.message,
        failure_type:  "technical_failure",
      }).eq("id", jobId);
      await supabase.from("raw_documents")
        .update({ processing_status: "failed" })
        .eq("id", job.raw_document_id);
    }
  }
}

// ============================================================
// HANDLER HTTP
// ============================================================

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    let jobs: ProcessingJob[] = [];

    if (body.record) {
      // Webhook: novo job inserido
      jobs = [body.record as ProcessingJob];
    } else if (body.fallback_polling) {
      // Fallback polling: busca retry_candidates e orphans
      const { data: candidates } = await supabase
        .from("retry_candidates")
        .select("id, organization_id, raw_document_id, retry_count, max_retries")
        .limit(50);

      const { data: orphans } = await supabase
        .from("processing_jobs")
        .select("id, organization_id, raw_document_id, retry_count, max_retries")
        .eq("status", "queued")
        .lt("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .limit(50);

      jobs = [...(candidates || []), ...(orphans || [])];
    }

    // Processar em paralelo com chunks de 10
    for (let i = 0; i < jobs.length; i += 10) {
      await Promise.allSettled(
        jobs.slice(i, i + 10).map(job => processJob(supabase, job))
      );
    }

    return new Response(JSON.stringify({ processed: jobs.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
