import React from 'react';
import { LoaderCircle } from 'lucide-react';

const LoadingSpinner = ({ message = "Loading Hospital System..." }) => (
  <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col items-center justify-center">
    <div className="relative">
        <div className="absolute inset-0 bg-indigo-200 rounded-full blur-xl opacity-50 animate-pulse"></div>
        <LoaderCircle className="relative w-16 h-16 text-indigo-600 animate-spin mb-4" />
    </div>
    <h2 className="text-xl font-bold text-gray-800 mt-4">{message}</h2>
    <p className="text-gray-500 text-sm mt-1">Connecting to secure server...</p>
  </div>
);

export default LoadingSpinner;