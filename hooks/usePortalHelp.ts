import { useCallback, useEffect, useMemo, useState } from 'react';
import { portalHelpService, type PortalHelpContact, type PortalTourSeen } from '../services/portalHelpService';
import { mergePortalHelp, type MergedHelp, type Portal, type PortalHelpRow } from '../utils/portalHelpDefaults';

/**
 * Conteúdo da ajuda para um portal, nos dois modos:
 *  - `token`  → acesso pelo link: a org vem do token (RPC anon);
 *  - sem token → externo logado por e-mail (ou membro interno em prévia):
 *    `portal_help_get_mine` devolve as orgs da identidade; com uma só (ou
 *    `orgId` dado) já traz a ajuda; com várias, o painel pede para escolher.
 * Carrega só quando `enabled` (o painel abriu). Sem conteúdo do servidor (erro,
 * token inválido, sem org) o padrão do código continua valendo — a ajuda nunca
 * fica vazia por falha de rede.
 */
export function usePortalHelp(
  portal: Portal,
  opts: { token?: string | null; orgId?: string | null; visibleSections?: readonly string[] | null; enabled: boolean },
) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PortalHelpRow[] | null>(null);
  const [contact, setContact] = useState<PortalHelpContact | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(opts.orgId ?? null);
  const [erro, setErro] = useState<string | null>(null);
  // "já viu" gravado no banco para esta identidade + se a 1ª leitura terminou
  // (o tour do primeiro acesso só decide depois dela)
  const [seen, setSeen] = useState<PortalTourSeen[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => { setSelectedOrgId(opts.orgId ?? null); }, [opts.orgId]);

  const carregar = useCallback(async (orgEscolhida: string | null) => {
    setLoading(true);
    setErro(null);
    try {
      if (opts.token) {
        const payload = await portalHelpService.getByToken(portal, opts.token);
        setRows(payload?.items ?? []);
        setContact(payload?.contact ?? null);
        setSeen(payload?.seen ?? []);
      } else {
        const mine = await portalHelpService.getMine(portal, orgEscolhida);
        setOrgs(mine.orgs);
        setRows(mine.help?.items ?? []);
        setContact(mine.help?.contact ?? null);
        setSeen(mine.help?.seen ?? []);
        if (mine.help?.org_id) setSelectedOrgId(mine.help.org_id);
      }
    } catch (e) {
      console.error('[portalHelp] falha ao carregar a ajuda:', e);
      setErro('Não foi possível carregar a ajuda da construtora. Mostrando o conteúdo padrão.');
      setRows([]);
    } finally {
      setLoading(false);
      setCarregado(true);
    }
  }, [portal, opts.token]);

  /** Reflete na hora uma marca recém-gravada (sem reler do banco). */
  const registrarVisto = useCallback((tourId: string, status: PortalTourSeen['status']) => {
    setSeen(prev => [...prev.filter(x => x.tour_id !== tourId), { tour_id: tourId, status }]);
  }, []);

  useEffect(() => {
    if (!opts.enabled) return;
    carregar(selectedOrgId);
    // selectedOrgId entra por `selectOrg`, que chama carregar diretamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, carregar]);

  const selectOrg = useCallback((id: string) => {
    setSelectedOrgId(id);
    carregar(id);
  }, [carregar]);

  const help: MergedHelp = useMemo(
    () => mergePortalHelp(portal, rows, { visibleSections: opts.visibleSections }),
    [portal, rows, opts.visibleSections],
  );

  return {
    loading,
    erro,
    help,
    contact,
    orgs,
    selectedOrgId,
    selectOrg,
    seen,
    carregado,
    registrarVisto,
    /** várias construtoras e nenhuma escolhida ainda */
    precisaEscolherOrg: !opts.token && orgs.length > 1 && !contact && rows !== null && rows.length === 0 && !selectedOrgId,
    reload: () => carregar(selectedOrgId),
  };
}
