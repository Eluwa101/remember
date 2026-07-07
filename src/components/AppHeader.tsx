import React from "react";
import { Brain, LogOut, Settings } from "lucide-react";

interface AppHeaderProps {
  isLoggedIn: boolean;
  userProfile: { name?: string; title?: string; timezone?: string } | null;
  phoneNumber: string;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export default function AppHeader({ isLoggedIn, userProfile, phoneNumber, onLogout, onOpenSettings }: AppHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 mb-8 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-500/20">
          <Brain size={28} id="logo-icon" className="animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Remember <span className="text-[10px] uppercase font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">beta</span>
          </h1>
          <p className="text-xs text-slate-400 italic">O remember, remember.</p>
        </div>
      </div>

      {isLoggedIn && (
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 self-start sm:self-center">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"></div>
          <div className="text-left">
            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">
              {userProfile?.name ? (userProfile.title ? `${userProfile.title} ${userProfile.name}` : userProfile.name) : "Connected client"}
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-400 block">+{phoneNumber}</span>
            <span className="text-[9px] text-slate-400 font-mono block">🕒 {userProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </div>
          <button
            onClick={onOpenSettings}
            className="ml-2 p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <button
            id="logout-btn"
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
            title="Disconnect client"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </header>
  );
}
