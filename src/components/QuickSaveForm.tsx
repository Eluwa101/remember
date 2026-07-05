import React, { useState } from "react";
import { Sparkles, Paperclip, X, AlertTriangle, PlusCircle } from "lucide-react";

interface SelectedFile {
  name: string;
  data: string;
  mimeType: string;
}

interface QuickSaveFormProps {
  onSave: (content: string, media: { data: string; mimeType: string } | null) => Promise<void>;
}

export default function QuickSaveForm({ onSave }: QuickSaveFormProps) {
  const [content, setContent] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (max 5MB for base64 safety)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be under 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setSelectedFile({
        name: file.name,
        data: base64Data,
        mimeType: file.type || "application/octet-stream"
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !selectedFile) return;

    setIsSaving(true);
    setError(null);
    try {
      await onSave(content, selectedFile ? { data: selectedFile.data, mimeType: selectedFile.mimeType } : null);
      setContent("");
      setSelectedFile(null);
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Sparkles size={14} className="text-blue-400" />
        <span>Quick Save Memory</span>
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {selectedFile && (
          <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg p-2 px-3 mb-2">
            <div className="flex items-center gap-2 text-xs text-slate-300 truncate">
              <Paperclip size={12} className="text-blue-400" />
              <span className="truncate">{selectedFile.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type anything to remember... E.g. 'Saved password for secondary lock is 1823' or 'Remind me tomorrow at 4 PM to call Alex'"
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-slate-200 placeholder-slate-600 text-sm leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 p-2.5 rounded-lg border border-rose-500/10 mt-2">
              <AlertTriangle size={12} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-3">
          <label className="cursor-pointer p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors group relative">
            <Paperclip size={16} />
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,audio/*,video/*,.pdf,.txt,.md" />
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap text-slate-200">Attach Media</span>
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving || (!content.trim() && !selectedFile)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/5 flex items-center gap-2"
            >
              <PlusCircle size={14} />
              <span>{isSaving ? "Structuring via Gemini..." : "Save Memory"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
