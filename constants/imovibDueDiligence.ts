/**
 * Itens da due diligence do terreno (item 5.9 do plano
 * docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md). Nascem pelo botão
 * "Criar checklist" (UNIQUE study_id + item_key), nunca ao abrir a aba.
 */
export const IMOVIB_DUE_DILIGENCE: readonly { key: string; label: string }[] = [
    { key: 'matricula', label: 'Matrícula atualizada' },
    { key: 'cadeia_dominial', label: 'Cadeia dominial' },
    { key: 'onus_gravames', label: 'Ônus e gravames' },
    { key: 'certidoes_vendedores', label: 'Certidões dos vendedores' },
    { key: 'iptu_debitos', label: 'IPTU e débitos municipais' },
    { key: 'uso_do_solo', label: 'Certidão de uso do solo' },
    { key: 'restricao_ambiental', label: 'Restrição ambiental' },
    { key: 'contaminacao', label: 'Contaminação' },
    { key: 'tombamento', label: 'Tombamento' },
    { key: 'cone_aeroportuario', label: 'Cone aeroportuário' },
    { key: 'faixas_servidoes', label: 'Faixas não edificáveis e servidões' },
    { key: 'topografia', label: 'Topografia' },
    { key: 'sondagem', label: 'Sondagem' },
    { key: 'concessionarias', label: 'Viabilidade das concessionárias' },
] as const;
