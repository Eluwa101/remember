import React, { useState } from "react";
import { RefreshCw, Search, Brain } from "lucide-react";
import { Memory } from "../types";
import MemoryCard from "./MemoryCard";

interface MemoriesFeedProps {
  memories: Memory[];
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}

export default function MemoriesFeed({ memories, isLoading, onRefresh, onDelete }: MemoriesFeedProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredMemories = memories.filter(m => {
    const rawMatch = m.raw_content.toLowerCase().includes(searchQuery.toLowerCase());
    const summaryMatch = m.metadata?.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    const catMatch = m.category.toLowerCase().includes(searchQuery.toLowerCase());

    const kpMatch = m.metadata?.entities?.key_points?.some(kp =>
      kp.toLowerCase().includes(searchQuery.toLowerCase())
    ) || false;

    return rawMatch || summaryMatch || catMatch || kpMatch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">Saved Memories</h2>
          <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full font-mono font-semibold">
            {memories.length} total
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all self-end sm:self-center"
          title="Reload memories feed"
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
          placeholder="Filter memories by query, tag, or key point..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {isLoading && memories.length === 0 ? (
        <div className="text-center py-20 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="animate-spin text-blue-500" size={28} />
          <p className="text-sm text-slate-400">Retrieving your encrypted memories...</p>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
          <Brain className="text-slate-700" size={40} />
          <p className="text-sm text-slate-400">
            {searchQuery ? "No matching memories found" : "Your memory space is empty"}
          </p>
          <p className="text-xs text-slate-600 max-w-sm">
            {searchQuery
              ? "Try tweaking your keyword, or filter by category badges (like 'Task', 'Insight')."
              : "Send some texts or photos to your personalized WhatsApp bot sandbox, and they will load in real-time!"
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((mem) => (
            <MemoryCard
              key={mem.id}
              memory={mem}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
