'use client';

import React, { useState, useMemo } from 'react';
import { useSpaceWeather } from '../../../context/SpaceWeatherContext';
import HistoryTable from '../HistoryTable';
import { Search, Filter, FileJson, FileSpreadsheet, ArrowUpDown } from 'lucide-react';

export const WeatherHistoryView = () => {
  const { history } = useSpaceWeather();
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DATE_DESC');

  // Filter and sort the history list
  const filteredAndSortedHistory = useMemo(() => {
    let result = [...history];

    // Filter by search term (date)
    if (searchTerm) {
      result = result.filter(item => item.date.includes(searchTerm));
    }

    // Filter by risk label
    if (riskFilter !== 'ALL') {
      result = result.filter(item => item.riskLabel?.toUpperCase() === riskFilter);
    }

    // Sort operations
    result.sort((a, b) => {
      if (sortBy === 'DATE_ASC') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === 'DATE_DESC') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === 'RISK_ASC') {
        return a.risk - b.risk;
      }
      if (sortBy === 'RISK_DESC') {
        return b.risk - a.risk;
      }
      return 0;
    });

    return result;
  }, [history, searchTerm, riskFilter, sortBy]);

  // Premium export functions creating browser data blobs
  const exportToCSV = () => {
    const headers = ['Date', 'Risk Index (%)', 'Threat Classification', 'Confidence (%)'];
    const rows = filteredAndSortedHistory.map(item => [
      item.date,
      item.risk,
      item.riskLabel,
      item.confidence
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `spaceguard_risk_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(filteredAndSortedHistory, null, 2)
    )}`;
    
    const link = document.createElement("a");
    link.setAttribute("href", jsonString);
    link.setAttribute("download", `spaceguard_risk_history_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            AI Model Prediction Logs
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            COMPLETE ARCHIVE OF SPACEGUARD AI RISK CLASSIFICATIONS & CONFIDENCE STATS
          </p>
        </div>

        {/* Action Downloads */}
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#1E293B] text-xs font-mono text-slate-300 hover:text-white hover:border-slate-700 transition-all duration-200"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            <span>EXPORT CSV</span>
          </button>
          <button 
            onClick={exportToJSON}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#1E293B] text-xs font-mono text-slate-300 hover:text-white hover:border-slate-700 transition-all duration-200"
          >
            <FileJson className="h-4 w-4 text-blue-500" />
            <span>EXPORT JSON</span>
          </button>
        </div>
      </div>

      {/* Interactive Toolbar */}
      <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search dates (YYYY-MM-DD)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all duration-200"
          />
        </div>

        {/* Threat Level Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500 shrink-0" />
          <select 
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 font-mono text-xs focus:outline-none focus:border-blue-500/50 transition-all duration-200"
          >
            <option value="ALL">ALL RISK LEVELS</option>
            <option value="LOW">LOW RISK ONLY</option>
            <option value="MEDIUM">MEDIUM RISK ONLY</option>
            <option value="HIGH">HIGH RISK ONLY</option>
            <option value="CRITICAL">CRITICAL RISK ONLY</option>
          </select>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-slate-500 shrink-0" />
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 font-mono text-xs focus:outline-none focus:border-blue-500/50 transition-all duration-200"
          >
            <option value="DATE_DESC">NEWEST PREDICTIONS</option>
            <option value="DATE_ASC">OLDEST PREDICTIONS</option>
            <option value="RISK_DESC">HIGHEST RISK INDEX</option>
            <option value="RISK_ASC">LOWEST RISK INDEX</option>
          </select>
        </div>
      </div>

      {/* Grid: Show Results count and main table */}
      <div className="space-y-4">
        <div className="flex justify-between items-center text-xs font-mono text-slate-500 px-1">
          <span>QUERY RESULTS:</span>
          <span>FOUND <strong>{filteredAndSortedHistory.length}</strong> LOG ENTRY RECORDS</span>
        </div>
        
        {/* Audit Table displaying filtered set */}
        <HistoryTable data={filteredAndSortedHistory} limit={10} />
      </div>
    </div>
  );
};

export default WeatherHistoryView;
