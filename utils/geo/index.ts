/**
 * O MÓDULO GEODÉSICO do ÒPURA (fase A0) — a porta única.
 *
 * Quem precisa converter coordenada, formatar ângulo ou calcular área real
 * importa daqui, não dos arquivos internos: assim a troca de `proj4` por outra
 * biblioteca (ou a volta para conta própria) fica confinada a esta pasta.
 */
export * from './crs';
export * from './projecao';
export * from './formato';
export * from './sgl';
