
import React from 'react';
import { Package, Truck, CheckCircle2, ShoppingBag, Clock, AlertTriangle } from 'lucide-react';

export type OrderStatus = 'BIDDING' | 'CONFIRMED' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'RECEIVED' | 'DIVERTED';

interface OrderLifelineProps {
    status: OrderStatus;
    estimatedDelivery?: string;
    separationDate?: string;
    shippedDate?: string;
    deliveredDate?: string;
    onStatusChange?: (status: OrderStatus) => void;
    isEditable?: boolean;
    maxSelectableStatus?: OrderStatus;
}

const OrderLifeline: React.FC<OrderLifelineProps> = ({ status, estimatedDelivery, separationDate, shippedDate, deliveredDate, onStatusChange, isEditable, maxSelectableStatus }) => {
    const steps = [
        { id: 'BIDDING' as OrderStatus, label: 'Lances', icon: <ShoppingBag className="w-5 h-5" /> },
        { id: 'CONFIRMED' as OrderStatus, label: 'Confirmado', icon: <CheckCircle2 className="w-5 h-5" />, date: undefined },
        { id: 'PREPARING' as OrderStatus, label: 'Separação', icon: <Package className="w-5 h-5" />, date: separationDate },
        { id: 'SHIPPED' as OrderStatus, label: 'Em Trânsito', icon: <Truck className="w-5 h-5" />, date: shippedDate },
        { id: 'DELIVERED' as OrderStatus, label: 'Entregue', icon: <CheckCircle2 className="w-5 h-5" />, date: deliveredDate },
        { id: 'RECEIVED' as OrderStatus, label: 'Recebido', icon: <CheckCircle2 className="w-5 h-5" /> },
        { id: 'DIVERTED' as OrderStatus, label: 'Divergência', icon: <AlertTriangle className="w-5 h-5" /> }
    ];

    // Redirect status if it's diverted or received to show proper progress
    const effectiveStatus = status;

    const currentStepIndex = steps.findIndex(s => s.id === status);

    return (
        <div className="w-full py-8">
            <div className="relative flex justify-between items-center max-w-4xl mx-auto">
                {/* Background Line */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 rounded-full" />

                {/* Progress Line */}
                <div
                    className="absolute top-1/2 left-0 h-1 bg-indigo-600 -translate-y-1/2 rounded-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(79,70,229,0.4)]"
                    style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                />

                {steps.map((step, index) => {
                    const isActive = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;

                    const maxSelectableIndex = maxSelectableStatus
                        ? steps.findIndex(s => s.id === maxSelectableStatus)
                        : steps.length - 1;

                    const canSelect = isEditable && onStatusChange && index <= maxSelectableIndex;

                    return (
                        <div key={step.id} className="relative z-10 flex flex-col items-center group">
                            <button
                                onClick={() => canSelect && onStatusChange(step.id)}
                                disabled={!canSelect}
                                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm
                  ${isCurrent
                                        ? 'bg-indigo-600 text-white scale-110 shadow-xl shadow-indigo-200 ring-4 ring-indigo-50 animate-pulse-subtle'
                                        : isActive
                                            ? 'bg-indigo-100 text-indigo-600'
                                            : 'bg-white text-gray-300 border border-gray-100'}
                  ${canSelect ? 'hover:scale-110 cursor-pointer active:scale-95' : 'cursor-default'}
                `}
                            >
                                {isActive && !isCurrent && index < currentStepIndex ? (
                                    <CheckCircle2 className="w-6 h-6" />
                                ) : (
                                    step.icon
                                )}
                            </button>

                            <div className="mt-4 flex flex-col items-center">
                                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors
                  ${isCurrent ? 'text-indigo-600' : isActive ? 'text-gray-900' : 'text-gray-400'}
                `}>
                                    {step.label}
                                </span>
                                {step.date && (
                                    <span className="text-[8px] font-black text-gray-400 mt-1 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                                        {new Date(step.date).toLocaleDateString()}
                                    </span>
                                )}
                                {isCurrent && estimatedDelivery && (
                                    <div className="absolute -bottom-10 whitespace-nowrap bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-2 duration-700">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-tight">Prev: {estimatedDelivery}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default OrderLifeline;
