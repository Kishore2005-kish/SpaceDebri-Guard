import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SpaceWeatherHistoryItem } from '../../lib/weather-api';

interface HistoryTableProps {
  data?: SpaceWeatherHistoryItem[];
  limit?: number;
  showViewMoreLink?: boolean;
}

export const HistoryTable = ({ data = [], limit = 5, showViewMoreLink = false }: HistoryTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const getRiskColor = (label: string) => {
    switch (label?.toUpperCase()) {
      case 'CRITICAL':
        return 'text-rose-400 border-rose-500/20 bg-rose-500/10';
      case 'HIGH':
        return 'text-orange-400 border-orange-500/20 bg-orange-500/10';
      case 'MEDIUM':
        return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
      default:
        return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
    }
  };

  const itemsPerPage = limit;
  const totalPages = Math.ceil(data.length / itemsPerPage);
  
  // Get current items
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem);

  const paginate = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  return (
    <div className="bg-[#1E293B] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all duration-300">
      <div className="flex justify-between items-center mb-4">
        <div>
          <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-semibold">
            Telemetry Database Archive
          </span>
          <h3 className="text-base font-bold text-white font-sans">
            Recent Predictions Audit Log
          </h3>
        </div>
        
        {/* Pagination Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => paginate(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1 rounded bg-[#0F172A] border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-all duration-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-mono text-slate-400">
            PAGE {currentPage} OF {totalPages || 1}
          </span>
          <button 
            onClick={() => paginate(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1 rounded bg-[#0F172A] border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-all duration-200"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500">
              <th className="py-3 px-4 font-semibold uppercase tracking-wider">Forecast Date</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider">Threat Index</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-center">Threat Class</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {currentItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  No records stored in data tables.
                </td>
              </tr>
            ) : (
              currentItems.map((row, index) => (
                <tr 
                  key={index}
                  className="hover:bg-[#0F172A]/40 transition-colors duration-150 group"
                >
                  <td className="py-3.5 px-4 text-slate-300 font-semibold">{row.date}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className={`h-full rounded-full ${
                            row.risk > 80 ? 'bg-rose-500' :
                            row.risk > 50 ? 'bg-orange-500' :
                            row.risk > 30 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${row.risk}%` }}
                        ></div>
                      </div>
                      <span>{row.risk}%</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-block text-[9px] font-bold px-2.5 py-0.5 rounded-full border tracking-wide uppercase ${getRiskColor(row.riskLabel)}`}>
                      {row.riskLabel}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right text-blue-400 font-bold">{row.confidence}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoryTable;
