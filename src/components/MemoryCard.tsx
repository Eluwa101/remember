import React, { useState } from "react";
import { Trash2, Calendar, FileText, Lightbulb, CheckSquare, Brain, Eye, EyeOff, Globe, MessageSquare } from "lucide-react";
import { Memory } from "../types";

interface MemoryCardProps {
  key?: React.Key;
  memory: Memory;
  onDelete: (id: string) => void;
}

export default function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const [showEntities, setShowEntities] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "reminder":
        return {
          icon: <Calendar size={12} />,
          text: "Reminder",
          classes: "bg-amber-500/10 text-amber-400 border-amber-500/20"
        };
      case "task":
        return {
          icon: <CheckSquare size={12} />,
          text: "Task",
          classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        };
      case "insight":
        return {
          icon: <Lightbulb size={12} />,
          text: "Insight",
          classes: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
        };
      case "document":
        return {
          icon: <FileText size={12} />,
          text: "Doc/Info",
          classes: "bg-purple-500/10 text-purple-400 border-purple-500/20"
        };
      default:
        return {
          icon: <Brain size={12} />,
          text: "Memory",
          classes: "bg-slate-500/10 text-slate-400 border-slate-500/20"
        };
    }
  };

  const getChannelBadge = (channel: string) => {
    if (channel === "whatsapp") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded-full">
          <MessageSquare size={10} />
          <span>WhatsApp</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-sky-950/40 text-sky-400 border border-sky-800/40 px-2 py-0.5 rounded-full">
        <Globe size={10} />
        <span>Web Web</span>
      </span>
    );
  };

  const badge = getCategoryBadge(memory.category);
  const entities = memory.metadata.entities || {};
  const hasEntities = 
    (entities.key_points && entities.key_points.length > 0) ||
    (entities.people && entities.people.length > 0) ||
    (entities.actions && entities.actions.length > 0) ||
    (entities.dates_mentioned && entities.dates_mentioned.length > 0);

  const handleDeleteClick = async () => {
    setIsDeleting(true);
    try {
      await onDelete(memory.id);
    } catch (e) {
      setIsDeleting(false);
    }
  };

  return (
    <div id={`memory-${memory.id}`} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-all shadow-lg flex flex-col justify-between">
      <div className="p-5">
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs border px-2.5 py-0.5 rounded-full font-medium ${badge.classes}`}>
              {badge.icon}
              <span>{badge.text}</span>
            </span>
            {getChannelBadge(memory.source_channel)}
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {new Date(memory.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </span>
        </div>

        {/* Card Body */}
        <div className="space-y-3">
          {/* AI Summary */}
          {memory.metadata.summary && (
            <div className="text-slate-100 font-medium text-sm leading-relaxed border-l-2 border-blue-500/30 pl-3 py-0.5">
              {memory.metadata.summary}
            </div>
          )}

          {/* Raw Input Content */}
          <div className="text-slate-400 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-900/60 font-serif leading-relaxed select-all">
            "{memory.raw_content}"
          </div>

          {/* Media thumbnail if present */}
          {memory.metadata.media_url && (
            <div className="mt-2 rounded-lg overflow-hidden border border-slate-800 max-h-40 bg-slate-950 flex items-center justify-center">
              <img
                src={memory.metadata.media_url}
                alt="Memory Attachment"
                className="object-contain max-h-40 w-full"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {/* Scheduled Indicator */}
          {memory.metadata.is_time_bound && memory.metadata.execution_time_iso && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400/90 font-medium bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-amber-500/10">
              <Calendar size={12} />
              <span>Reminder scheduled: {new Date(memory.metadata.execution_time_iso).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer / Metadata Details */}
      <div className="px-5 pb-5 pt-2 border-t border-slate-800/40 flex flex-col gap-3">
        {hasEntities && (
          <div>
            <button
              onClick={() => setShowEntities(!showEntities)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {showEntities ? <EyeOff size={12} /> : <Eye size={12} />}
              <span>{showEntities ? "Hide AI Metadata" : "Show AI Metadata"}</span>
            </button>

            {showEntities && (
              <div className="mt-3 space-y-2 text-[11px] bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                {entities.key_points && entities.key_points.length > 0 && (
                  <div>
                    <span className="text-slate-500 font-medium">Key Points:</span>
                    <ul className="list-disc pl-4 text-slate-300 space-y-0.5 mt-0.5">
                      {entities.key_points.map((pt, i) => <li key={i}>{pt}</li>)}
                    </ul>
                  </div>
                )}
                
                {entities.actions && entities.actions.length > 0 && (
                  <div>
                    <span className="text-slate-500 font-medium">Action Items:</span>
                    <ul className="list-disc pl-4 text-emerald-400/90 space-y-0.5 mt-0.5">
                      {entities.actions.map((act, i) => <li key={i}>{act}</li>)}
                    </ul>
                  </div>
                )}

                {entities.people && entities.people.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap items-center mt-1">
                    <span className="text-slate-500">People:</span>
                    {entities.people.map((p, i) => (
                      <span key={i} className="bg-blue-500/10 text-blue-300 px-1.5 py-0.2 rounded">
                        {p}
                      </span>
                    ))}
                  </div>
                )}

                {entities.dates_mentioned && entities.dates_mentioned.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap items-center mt-1">
                    <span className="text-slate-500">Dates:</span>
                    {entities.dates_mentioned.map((d, i) => (
                      <span key={i} className="bg-amber-500/10 text-amber-300 px-1.5 py-0.2 rounded">
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-400 transition-colors p-1 disabled:opacity-50"
            title="Delete memory"
          >
            <Trash2 size={13} />
            <span>{isDeleting ? "Deleting..." : "Forget"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
