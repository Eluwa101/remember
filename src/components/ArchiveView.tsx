import React, { useState } from "react";
import { RefreshCw, Search, Inbox, ArrowLeft } from "lucide-react";
import { Memory } from "../types";
import MemoryCard from "./MemoryCard";

interface ArchiveViewProps {
  memories: Memory[];
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onToggleSafeKeep: (id: string, enabled: boolean, days?: number) => void;
  archiveRetentionDays: number;
  onUpdateRetentionDays: (days: number) => void;
  onBack: () => void;
}

export default function ArchiveView({
  memories,
  isLoading,
  onRefresh,
  onDelete,
  onRestore,
  onToggleSafeKeep,
  archiveRetentionDays,
  onUpdateRetentionDays,
  onBack
}: ArchiveViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [retentionInput, setRetentionInput] = useState(archiveRetentionDays);

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
          <h2 className="text-lg font-semibold text-slate-100">Archive</h2>
          <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full font-mono font-semibold">
            {memories.length} total
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all self-end sm:self-center"
          title="Reload archive"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5">
        <span>Permanently delete archived items after</span>
        <input
          type="number"
          min={1}
          value={retentionInput}
          onChange={(e) => setRetentionInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
          onBlur={() => retentionInput !== archiveRetentionDays && onUpdateRetentionDays(retentionInput)}
          className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 font-mono text-center"
        />
        <span>days</span>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
          <Search size={16} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter archived memories..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-slate-200 placeholder-slate-600 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {filteredMemories.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
          <Inbox className="text-slate-700" size={40} />
          <p className="text-sm text-slate-400">
            {searchQuery ? "No matching archived memories" : "Nothing archived yet"}
          </p>
          <p className="text-xs text-slate-600 max-w-sm">
            Fulfilled reminders move here automatically a week after they're resolved,
            giving you a chance to review before they're permanently deleted.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((mem) => (
            <MemoryCard
              key={mem.id}
              memory={mem}
              mode="archive"
              onDelete={onDelete}
              onRestore={onRestore}
              onToggleSafeKeep={onToggleSafeKeep}
              archiveRetentionDays={archiveRetentionDays}
            />
          ))}
        </div>
      )}
    </div>
  );
}
