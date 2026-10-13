import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in transform transition-all scale-100" onClick={(e) => e.stopPropagation()}>
      <div className="absolute top-4 right-4 z-10">
        <button onClick={onClose} className="p-2 rounded-full bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-8">
        {children}
      </div>
    </div>
  </div>
);

export default Modal;