import React, { useState } from "react";
import { ArrowLeft, User, Archive, AlertTriangle, Trash2 } from "lucide-react";

interface SettingsViewProps {
  phoneNumber: string;
  userProfile: { name?: string; title?: string; timezone?: string } | null;
  archiveRetentionDays: number;
  onUpdateRetentionDays: (days: number) => void;
  onDeleteAccount: () => Promise<void>;
  onBack: () => void;
}

export default function SettingsView({
  phoneNumber,
  userProfile,
  archiveRetentionDays,
  onUpdateRetentionDays,
  onDeleteAccount,
  onBack
}: SettingsViewProps) {
  const [retentionInput, setRetentionInput] = useState(archiveRetentionDays);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteAccount();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete account.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
          title="Back to Saved Memories"
        >
          <ArrowLeft size={14} />
        </button>
        <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
      </div>

      {/* Account info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <User size={16} className="text-blue-400" />
          <span>Account</span>
        </div>
        <div className="text-sm text-slate-300">
          <span className="text-slate-500">Connected number:</span>{" "}
          <span className="font-mono text-emerald-400">+{phoneNumber}</span>
        </div>
        {userProfile?.name && (
          <div className="text-sm text-slate-300">
            <span className="text-slate-500">Name:</span>{" "}
            {userProfile.title ? `${userProfile.title} ${userProfile.name}` : userProfile.name}
          </div>
        )}
        {userProfile?.timezone && (
          <div className="text-sm text-slate-300">
            <span className="text-slate-500">Timezone:</span> {userProfile.timezone}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Text the bot "call me [name]" or mention your city/timezone on WhatsApp to update these.
        </p>
      </div>

      {/* Archive retention */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Archive size={16} className="text-blue-400" />
          <span>Archive Retention</span>
        </div>
        <p className="text-xs text-slate-400">
          Archived memories are permanently deleted after this many days.
        </p>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="number"
            min={1}
            value={retentionInput}
            onChange={(e) => setRetentionInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
            onBlur={() => retentionInput !== archiveRetentionDays && onUpdateRetentionDays(retentionInput)}
            className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-center"
          />
          <span>days</span>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
          <AlertTriangle size={16} />
          <span>Danger Zone</span>
        </div>
        <p className="text-xs text-slate-400">
          Permanently deletes your account and everything in it — every memory, reminder, and
          setting. This cannot be undone.
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-slate-400">
            Type <span className="font-mono font-semibold text-rose-400">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full sm:w-48 bg-slate-950 border border-rose-900/40 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors"
          />
        </div>
        {deleteError && (
          <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/5 p-2.5 rounded-lg border border-rose-500/10">
            <AlertTriangle size={12} />
            <span>{deleteError}</span>
          </div>
        )}
        <button
          onClick={handleDelete}
          disabled={!canDelete || isDeleting}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-all"
        >
          <Trash2 size={14} />
          <span>{isDeleting ? "Deleting account..." : "Delete My Account"}</span>
        </button>
      </div>
    </div>
  );
}
