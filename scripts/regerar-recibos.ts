/**
 * Regera, em disco, os PDFs de recibos já emitidos a partir do registro
 * CONGELADO de `financial_receipts` — com o MESMO gerador do app
 * (`utils/reciboRecebimento.ts`). Não fala com o banco nem com o Storage: lê um
 * JSON exportado e grava arquivos; subir para o bucket é passo manual, por CLI
 * (docs/planos/2026-10-04-recibo-novo-layout.md, item 5).
 *
 *   npx supabase db query --linked -o json "select r.*, o.logo_url, o.phone, o.email, o.website
 *     from financial_receipts r join organizations o on o.id = r.organization_id
 *     where r.cancelled_at is null and r.file_path is not null" > recibos.json
 *   npx tsx scripts/regerar-recibos.ts recibos.json ./saida
 *
 * Saída: `<saida>/<file_path>` para cada recibo (o mesmo caminho do bucket) e
 * `<saida>/manifest.json` com bytes e sha256 de cada um.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { montarReciboPdf } from '../utils/reciboRecebimento';
import type { FinancialReceipt } from '../types/financial';

type Linha = FinancialReceipt & {
    amount: number | string;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
};

const [, , entrada, saida] = process.argv;
if (!entrada || !saida) {
    console.error('uso: npx tsx scripts/regerar-recibos.ts <recibos.json> <pasta-de-saida>');
    process.exit(2);
}

const bruto = JSON.parse(readFileSync(entrada, 'utf-8')) as { rows?: Linha[] } | Linha[];
const linhas: Linha[] = Array.isArray(bruto) ? bruto : (bruto.rows ?? []);
if (linhas.length === 0) {
    console.error('JSON sem linhas.');
    process.exit(1);
}

const manifesto: { id: string; kind: string; receipt_number: number; file_path: string; bytes: number; sha256: string }[] = [];

for (const l of linhas) {
    const esperado = `${l.organization_id}/${l.id}.pdf`;
    if (l.file_path !== esperado) {
        console.error(`file_path fora do padrão em ${l.id}: ${l.file_path} (esperado ${esperado}) — abortando.`);
        process.exit(1);
    }
    if (l.cancelled_at) {
        console.error(`recibo ${l.id} está cancelado — abortando (só os ativos são regerados).`);
        process.exit(1);
    }

    const recibo: FinancialReceipt = { ...l, amount: Number(l.amount) };
    const logo = l.logo_url && l.logo_url.startsWith('data:') ? l.logo_url : null;
    if (l.logo_url && !logo) console.warn(`logo de ${l.organization_id} não é data URL — recibo ${l.id} sai sem logo.`);

    const pdf = montarReciboPdf(recibo, {
        logoDataUrl: logo,
        contato: { phone: l.phone, email: l.email, website: l.website },
    });
    const bytes = Buffer.from(pdf.output('arraybuffer'));
    const destino = join(saida, l.file_path!);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    manifesto.push({ id: l.id, kind: l.kind ?? 'RECEBIMENTO', receipt_number: l.receipt_number, file_path: l.file_path!, bytes: bytes.length, sha256 });
    console.log(`${(l.kind ?? 'RECEBIMENTO').padEnd(11)} nº ${String(l.receipt_number).padStart(6, '0')}  ${bytes.length.toString().padStart(7)} bytes  ${sha256.slice(0, 12)}…  ${l.file_path}`);
}

writeFileSync(join(saida, 'manifest.json'), JSON.stringify(manifesto, null, 2));
console.log(`\n${manifesto.length} recibo(s) gerado(s) em ${saida}`);
