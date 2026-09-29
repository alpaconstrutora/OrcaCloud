/**
 * Desde 29/09/2026 (E2.3 do roadmap elétrico) este módulo mora no KERNEL
 * (`blueprintKernel/fiacao.ts`): o quantitativo de fio por tipo precisa da mesma
 * fiação derivada que o desenho, e o kernel não importa daqui. Reexportado
 * para quem já importava deste caminho.
 */
export * from './blueprintKernel/fiacao';
