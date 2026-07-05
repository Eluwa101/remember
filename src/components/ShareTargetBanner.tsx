import React, { useState } from "react";
import { Sparkles, PlusCircle } from "lucide-react";

interface ShareTargetBannerProps {
  sharedText: string;
  onDismiss: () => void;
  onSave: () => Promise<void>;
}

export default function ShareTargetBanner({ sharedText, onDismiss, onSave }: ShareTargetBannerProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } catch (err: any) {
      alert(err.message || "Failed to save shared content.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="pwa-share-banner" className="mb-8 p-6 bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/30 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex gap-3 items-start">
        <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 mt-1 md:mt-0">
          <Sparkles size={18} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            Captured Android Shared Content
          </h4>
          <p className="text-xs text-slate-400 mt-1 italic">
            "{sharedText}"
          </p>
        </div>
      </div>
      <div className="flex gap-2 w-full md:w-auto shrink-0">
        <button
          onClick={onDismiss}
          className="flex-1 md:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 md:flex-initial px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          <PlusCircle size={14} />
          <span>{isSaving ? "Saving..." : "Save to Remember"}</span>
        </button>
      </div>
    </div>
  );
}
