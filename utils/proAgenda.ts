/**
 * Agenda do painel do ÒPURA Pro: em que lista cada serviço aberto aparece.
 *
 * Desde 14/11/2026 (passo 5 da crítica de design, docs/planos/2026-11-14-opura-pro-critica.md):
 *  - atrasados = agendado ANTES de hoje e ainda aberto (antes ia calado para "Próximos");
 *  - hoje      = agendado para hoje, ou em andamento (qualquer data);
 *  - proximos  = agendado depois de hoje, em ordem de data, sem corte;
 *  - semData   = sem data marcada (antes caía em "Hoje" pela criação do orçamento).
 * Concluído não entra: o que falta dele é cobrar (lista "Aguardando pagamento").
 *
 * Testes: `__tests__/proAgenda.test.ts`.
 */

type ServicoDaAgenda = { id: string; status: string; data_agendamento?: string | null; created_at?: string | null };

const diaLocal = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const porData = (campo: 'data_agendamento' | 'created_at') => (a: ServicoDaAgenda, b: ServicoDaAgenda) =>
  (a[campo] || '').localeCompare(b[campo] || '');

export function separarAgenda<S extends ServicoDaAgenda>(servicos: S[], agora: Date = new Date()) {
  const hojeDia = diaLocal(agora);
  const atrasados: S[] = [];
  const hoje: S[] = [];
  const proximos: S[] = [];
  const semData: S[] = [];

  for (const s of servicos) {
    if (s.status === 'CONCLUIDO') continue;
    const data = s.data_agendamento ? new Date(s.data_agendamento) : null;
    const dia = data && !Number.isNaN(data.getTime()) ? diaLocal(data) : null;

    if (s.status === 'EM_ANDAMENTO' || dia === hojeDia) hoje.push(s);
    else if (dia === null) semData.push(s);
    else if (dia < hojeDia) atrasados.push(s);
    else proximos.push(s);
  }

  atrasados.sort(porData('data_agendamento'));
  hoje.sort(porData('data_agendamento'));
  proximos.sort(porData('data_agendamento'));
  semData.sort(porData('created_at'));
  return { atrasados, hoje, proximos, semData };
}
