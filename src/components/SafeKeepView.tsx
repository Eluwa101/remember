import React, { useState } from "react";
import { RefreshCw, Search, ShieldCheck, ArrowLeft } from "lucide-react";
import { Memory } from "../types";
import MemoryCard from "./MemoryCard";

interface SafeKeepViewProps {
  memories: Memory[];
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onToggleSafeKeep: (id: string, enabled: boolean, days?: number) => void;
  onBack: () => void;
  token: string;
}

export default function SafeKeepView({
  memories,
  isLoading,
  onRefresh,
  onDelete,
  onToggleSafeKeep,
  onBack,
  token
}: SafeKeepViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredMemories = memories.filter(m =>
    m.raw_content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.metadata?.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
            title="Back to Saved Memories"
          >
            <ArrowLeft size={14} />
          </button>
          <h2 className="text-lg font-semibold text-slate-100">Safe Keep</h2>
          <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full font-mono font-semibold">
            {memories.length} total
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all self-end sm:self-center"
          title="Reload safe-kept memories"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
          <Search size={16} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter safe-kept memories..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {filteredMemories.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
          <ShieldCheck className="text-slate-700" size={40} />
          <p className="text-sm text-slate-400">
            {searchQuery ? "No matching safe-kept memories" : "Nothing safe-kept yet"}
          </p>
          <p className="text-xs text-slate-600 max-w-sm">
            Passwords, dates, anniversaries, and similar long-term details are flagged
            automatically — or tap "Safe Keep" on any memory to hold onto it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((mem) => (
            <MemoryCard
              key={mem.id}
              memory={mem}
              mode="active"
              onDelete={onDelete}
              onToggleSafeKeep={onToggleSafeKeep}
              token={token}
            />
          ))}
        </div>
      )}
    </div>
  );
}
