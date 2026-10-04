/**
 * Ações do externo nos portais que contam para o checklist "Primeiros passos"
 * (tour v2, F8 — 04/10/2026).
 *
 * Canal de módulo (sem DOM): quem faz a ação avisa, quem cuida do checklist
 * (PortalHelp) ouve. Funciona também dentro do <iframe> da prévia mobile, que
 * roda no mesmo JS, e evita passar callback por cinco níveis de componente.
 * Avisar sem ninguém ouvindo (app interno, gestor) não faz nada.
 */
export type PortalAcao =
  | 'abriu-contrato' | 'enviou-documento' | 'abriu-solicitacao'
  | 'respondeu-cotacao' | 'atualizou-logistica' | 'enviou-nf'
  | 'enviou-proposta' | 'criou-lead' | 'baixou-material';

type Ouvinte = (acao: PortalAcao) => void;
const ouvintes = new Set<Ouvinte>();

export function avisarAcaoDoPortal(acao: PortalAcao): void {
  ouvintes.forEach(ouvir => {
    try { ouvir(acao); } catch (e) { console.warn('[portalEventos] ouvinte falhou:', e); }
  });
}

export function ouvirAcoesDoPortal(ouvir: Ouvinte): () => void {
  ouvintes.add(ouvir);
  return () => { ouvintes.delete(ouvir); };
}
