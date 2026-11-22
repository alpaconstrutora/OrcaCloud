// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// @ts-ignore
import { jsPDF } from "npm:jspdf@2.5.2"
// @ts-ignore
import autoTable from "npm:jspdf-autotable@3.8.4"
import { chamadaDeCron } from "../_shared/auth.ts"
import {
    caminhoDoRelatorioMensal, dadosDoRelatorioMensal, desenharRelatorioMensal, mesDoRelatorio, nomeDoRelatorioMensal,
} from "../../../utils/relatorioMensalDoInvestidor.ts"

declare const Deno: { env: { get(key: string): string | undefined } };

// Relatório mensal do investidor, a ROTINA do dia 1º (Fase C1 do plano
// docs/planos/2026-11-21-portal-do-investidor-consolidacao.md). Antes a rotina só criava um registro SEM
// arquivo e o comunicado "disponível" — o investidor via "Indisponível". Agora gera o PDF de CADA investidor
// (o mesmo do botão "Gerar Agora": utils/relatorioMensalDoInvestidor.ts), grava com o destinatário e só depois
// publica o comunicado da organização.
//
// Autorização: só a rotina (pg_cron → generate_monthly_investor_reports → net.http_post com o CRON_SECRET).
// Deploy com --no-verify-jwt: o gate é o chamadaDeCron, e a prova é uma requisição sem header dar 401.
// Idempotente: investidor que já tem o relatório do mês não ganha outro (a rotina pode ser reexecutada).

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req: Request) => {
    if (!chamadaDeCron(req)) return json({ error: 'Unauthorized' }, 401);

    // Ensaio: gera os PDFs e devolve o tamanho, sem gravar arquivo, registro nem comunicado (prova da rotina).
    let ensaio = false;
    try { ensaio = !!((await req.json()) as { ensaio?: boolean } | null)?.ensaio; } catch { /* corpo vazio */ }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { monthLabel } = mesDoRelatorio();
    const nome = nomeDoRelatorioMensal(monthLabel);

    const { data: investidores, error } = await admin
        .from('investors').select('id, name, organization_id').not('organization_id', 'is', null);
    if (error) return json({ error: `Falha ao ler os investidores: ${error.message}` }, 500);

    const porOrg = new Map<string, { id: string; name: string }[]>();
    for (const i of (investidores ?? []) as { id: string; name: string; organization_id: string }[]) {
        porOrg.set(i.organization_id, [...(porOrg.get(i.organization_id) ?? []), { id: i.id, name: i.name }]);
    }

    const resultado: { organizacao: string; gerados: number; jaExistiam: number; falhas: string[]; bytes?: number[] }[] = [];
    for (const [org, lista] of porOrg) {
        const r = { organizacao: org, gerados: 0, jaExistiam: 0, falhas: [] as string[] };
        const { data: existentes } = await admin
            .from('investor_reports').select('investor_id').eq('organization_id', org).eq('name', nome).not('url', 'is', null);
        const jaTem = new Set(((existentes ?? []) as { investor_id: string | null }[]).map(e => e.investor_id));
        for (const inv of lista) {
            if (jaTem.has(inv.id)) { r.jaExistiam++; continue; }
            try {
                const dados = await dadosDoRelatorioMensal(admin, org, inv);
                if (!dados) continue;   // sem obra nem lançamento nesta organização
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                desenharRelatorioMensal(doc, autoTable, dados);
                if (ensaio) { r.gerados++; (r.bytes ??= []).push(doc.output('arraybuffer').byteLength); continue; }
                const caminho = caminhoDoRelatorioMensal(org, inv.id, dados.monthLabel);
                const { error: up } = await admin.storage.from('documents')
                    .upload(caminho, new Uint8Array(doc.output('arraybuffer')), { contentType: 'application/pdf', upsert: false });
                if (up) throw up;
                const { error: ins } = await admin.from('investor_reports').insert({
                    organization_id: org, investor_id: inv.id, name: nome, type: 'PDF', category: 'relatorio',
                    report_date: new Date().toLocaleDateString('pt-BR'), url: caminho,
                });
                if (ins) throw ins;
                r.gerados++;
            } catch (e) {
                console.error('[investor-monthly-reports]', org, inv.id, e);
                r.falhas.push(inv.id);
            }
        }
        // O comunicado só sai com arquivo pronto, um por organização e por mês.
        if (r.gerados > 0 && !ensaio) {
            await admin.from('investor_announcements').insert({
                organization_id: org,
                title: `${nome} disponível`,
                body: `O seu relatório de evolução física e financeira referente a ${monthLabel} está disponível na seção Documentos do seu portal.`,
                type: 'comunicado',
                published_at: new Date().toISOString(),
                requires_acknowledgment: false,
            });
        }
        resultado.push(r);
    }
    return json({ mes: monthLabel, ensaio, resultado });
});
