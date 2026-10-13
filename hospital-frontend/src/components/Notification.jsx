import React from 'react';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const Notification = ({ message, type, onClose }) => {
  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: AlertCircle
  };
  const colors = {
    success: 'bg-green-100 border-green-400 text-green-800',
    error: 'bg-red-100 border-red-400 text-red-800',
    info: 'bg-blue-100 border-blue-400 text-blue-800'
  };

  const Icon = icons[type] || AlertCircle;

  return (
    <div className={`fixed top-4 right-4 p-4 rounded-lg border-2 shadow-lg z-50 flex items-center gap-3 ${colors[type]} animate-slide-in`}>
      <Icon className="w-5 h-5" />
      <span className="font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 font-bold hover:opacity-70">×</button>
    </div>
  );
};

export default Notification;