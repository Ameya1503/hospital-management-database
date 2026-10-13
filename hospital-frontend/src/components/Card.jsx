import React from 'react';

const Card = ({ title, icon: Icon, children, className = '', action }) => (
  <div className={`bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden transition-all duration-300 hover:shadow-lg ${className}`}>
    {(title || Icon) && (
      <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center bg-white">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Icon className="w-5 h-5" />
            </div>
          )}
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">{title}</h3>
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);

export default Card;