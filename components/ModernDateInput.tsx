import React from 'react';

interface ModernDateInputProps {
    value: string;
    onChange: (val: string) => void;
    label?: string;
    className?: string;
    compact?: boolean;
}

const ModernDateInput: React.FC<ModernDateInputProps> = ({ value, onChange, label, className, compact }) => {
    return (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            {label && <span className="text-[10px] font-bold text-gray-500 uppercase ml-1">{label}</span>}
            <div className="relative group/date">
                <input
                    type="date"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full bg-white border border-gray-100 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm group-hover/date:border-blue-200 ${compact ? 'py-1 px-2' : ''}`}
                />
            </div>
        </div>
    );
};

export default ModernDateInput;
