/** Seção 4: empreendimentos — números e até 4 fotos cada (foto que não carregou some, a seção segue). */
import type { CreditRoomVersion } from '../../types/creditRoom';
import type { SnapshotEmpreendimentoItem } from '../creditRoomSnapshot';
import { ROTULO_DO_OBJETIVO } from '../empreendimentoObjetivo';
import {
    FRASE_SCHEMA_1, MARGEM, N_D, aviso, fotoNaCaixa, garantir, inteiro, larguraUtil, money, prepararFoto, secao,
    subtitulo, tabela, type Ctx, type FotoPronta,
} from './base';
import { fotosDoEmpreendimento } from './fotos';
import { linhasDoCardDoEmpreendimento } from '../creditRoomEmpreendimentoCard';

function localizacao(e: SnapshotEmpreendimentoItem): string {
    const lugar = e.cidade && e.uf ? `${e.cidade}/${e.uf}` : (e.cidade ?? e.uf ?? '');
    const objetivo = e.objetivo ? (ROTULO_DO_OBJETIVO[e.objetivo as keyof typeof ROTULO_DO_OBJETIVO] ?? '') : '';
    return [lugar, objetivo].filter(Boolean).join(' · ') || N_D;
}

export function secaoEmpreendimentos(c: Ctx, versao: CreditRoomVersion, imagens: Record<string, string>) {
    const emps = versao.snapshot.empreendimentos ?? null;
    secao(c, '4. Empreendimentos');
    if (!emps) { aviso(c, `Esta seção não consta neste book: ${FRASE_SCHEMA_1}.`); return; }
    if (emps.length === 0) { aviso(c, 'Nenhum empreendimento no escopo desta versão.'); return; }
    for (const e of emps) {
        garantir(c, 40);
        subtitulo(c, e.nome);
        aviso(c, localizacao(e));
        // As colunas de números seguem o objetivo (vendas, locação ou serviço); ausente = "n/d".
        const linhas = linhasDoCardDoEmpreendimento(e, { ausente: N_D, money });
        tabela(c, ['Unidades', 'Vendidas', 'Alugadas', 'Disponíveis', ...linhas.map(l => l.rotulo)], [[
            inteiro(e.unidades_total), inteiro(e.vendidas), inteiro(e.alugadas), inteiro(e.disponiveis),
            ...linhas.map(l => l.valor),
        ]], { direitaA: 0 });
        const fotos = fotosDoEmpreendimento(e)
            .map(u => prepararFoto(c.doc, imagens[u]))
            .filter((f): f is FotoPronta => f !== null);
        if (!fotos.length) { aviso(c, 'Sem fotos nesta versão.'); continue; }
        const gap = 4; const bw = (larguraUtil(c.doc) - gap) / 2; const bh = 56;
        for (let k = 0; k < fotos.length; k += 2) {
            garantir(c, bh + 4);
            fotos.slice(k, k + 2).forEach((f, j) => { fotoNaCaixa(c.doc, f, MARGEM + j * (bw + gap), c.y, bw, bh); });
            c.y += bh + 4;
        }
    }
}
