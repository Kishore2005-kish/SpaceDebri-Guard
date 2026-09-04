import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
}

export const LoadingSpinner = ({ size = 'medium' }: LoadingSpinnerProps) => {
  const sizeClasses = {
    small: 'h-8 w-8 border-2',
    medium: 'h-16 w-16 border-3',
    large: 'h-24 w-24 border-4',
  };

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer Radar Loop */}
      <div className={`rounded-full border-t-blue-500 border-r-transparent border-b-blue-600/20 border-l-transparent animate-spin ${sizeClasses[size]}`}></div>
      
      {/* Inner Ping Ring */}
      <div className={`absolute rounded-full border border-blue-400/40 animate-ping ${
        size === 'small' ? 'h-5 w-5' : size === 'medium' ? 'h-10 w-10' : 'h-16 w-16'
      }`}></div>

      {/* Center Reticle Point */}
      <div className={`absolute bg-blue-500 rounded-full ${
        size === 'small' ? 'h-1.5 w-1.5' : size === 'medium' ? 'h-3 w-3 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'h-4 w-4 shadow-[0_0_12px_rgba(59,130,246,0.9)]'
      }`}></div>
      
      {/* Ticking sonar sweep grid ticks */}
      {size !== 'small' && (
        <>
          <div className="absolute h-full w-[1px] bg-slate-800/40 rotate-0"></div>
          <div className="absolute h-full w-[1px] bg-slate-800/40 rotate-90"></div>
          <div className="absolute h-full w-[1px] bg-slate-800/40 rotate-45"></div>
          <div className="absolute h-full w-[1px] bg-slate-800/40 rotate-135"></div>
        </>
      )}
    </div>
  );
};

export default LoadingSpinner;
