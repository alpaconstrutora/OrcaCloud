/** Seção 3: teste de estresse (3 cenários sobre a série congelada, ou a da prévia) e qualidade da renda. */
import type { CreditRoomVersion } from '../../types/creditRoom';
import {
    CENARIOS_ESTRESSE, estresseDaVersao, fluxosDaOperacao, resumoDaCapacidade, textosDaCapacidade,
} from '../creditCapacity';
import { ehPrevia } from '../creditRoomPrevia';
import { FRASE_SCHEMA_1, N_D, anos, aviso, money, pct, secao, subtitulo, tabela, vezes, type Ctx } from './base';

export function secaoEstresse(c: Ctx, versao: CreditRoomVersion) {
    const s = versao.snapshot;
    const cap = s.capacidade ?? null;
    const resumo = resumoDaCapacidade(cap);
    const previa = ehPrevia(versao);
    secao(c, '3. Teste de estresse', `Reaplica cada cenário à série ${previa ? 'desta prévia' : 'congelada desta versão'}. A despesa e o serviço da dívida não mudam: o prédio continua custando e o banco continua cobrando.`);
    if (!cap || !resumo) { aviso(c, `Esta seção não consta neste book: ${FRASE_SCHEMA_1}.`); return; }
    if (cap.serie.length === 0) { aviso(c, 'Esta versão não tem meses projetados: sem série não há o que estressar.'); return; }
    const fluxos = fluxosDaOperacao(s);
    const t = textosDaCapacidade(cap, resumo, s.operacao?.requested_amount ?? 0);
    tabela(c, ['Cenário', 'Inadimpl.', 'Vacância', 'Distrato', 'Valor máximo (sobre a dívida atual)', t.rotuloDscr, 'Meses com folga negativa'],
        CENARIOS_ESTRESSE.map((cen, k) => {
            // O Base é SEMPRE o número congelado: não se recalcula (uma só máxima para o banco ver).
            const r = k === 0 ? null : estresseDaVersao(cap, cen, fluxos);
            return [
                { v: cen.nome, direita: false, forte: true },
                pct(cen.inadimplencia_pct), pct(cen.vacancia_pct), pct(cen.distrato_pct),
                money(r ? r.capacidade_maxima.valor_maximo : cap.capacidade_maxima.valor_maximo),
                vezes(r ? r.dscr_minimo_12m : resumo.dscr_minimo_12m),
                String(r ? r.meses_folga_negativa : resumo.meses_folga_negativa),
            ];
        }), { fonte: 7.5, direitaA: 1 });
    aviso(c, `Base = ${previa ? 'valores desta prévia' : 'valores congelados na versão'}. Inadimplência reduz vendas e aluguéis; vacância só os aluguéis; distrato só as vendas.`);
    if (!fluxos.alugueis) aviso(c, 'Vacância sem efeito: aluguéis não entram no DSCR desta operação.');
    if (!fluxos.vendas) aviso(c, 'Distrato sem efeito: vendas não entram no DSCR desta operação.');

    subtitulo(c, 'Qualidade da renda');
    const q = s.qualidade ?? null;
    if (!q) { aviso(c, 'Esta versão não calculou a qualidade da renda.'); return; }
    tabela(c, ['Indicador', 'Valor'], [
        ['Concentração nos 5 maiores pagadores', pct(q.concentracao_top5_pct)],
        ['Prazo médio dos contratos (WALE)', anos(q.wale_anos)],
        ['Locações com prazo indeterminado', String(q.locacoes_prazo_indeterminado)],
        ['Pontualidade nos últimos 12 meses', pct(q.pontualidade_12m_pct)],
        ['Vencido na data-base', money(cap.vencido_na_data_base)],
    ]);
    aviso(c, `${N_D} = sem base para calcular (por exemplo, nenhum título venceu na janela).`);
}
