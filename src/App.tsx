import React, { useState } from "react";
import { CloudCheck } from "lucide-react";
import ConnectionPanel from "./components/ConnectionPanel";
import ReminderList from "./components/ReminderList";
import AppHeader from "./components/AppHeader";
import ShareTargetBanner from "./components/ShareTargetBanner";
import LoginCard from "./components/LoginCard";
import QuickSaveForm from "./components/QuickSaveForm";
import MemoriesFeed from "./components/MemoriesFeed";
import ArchiveView from "./components/ArchiveView";
import { useAuth } from "./hooks/useAuth";
import { useShareTarget } from "./hooks/useShareTarget";
import { useDashboardData } from "./hooks/useDashboardData";

export default function App() {
  const auth = useAuth();
  const shareTarget = useShareTarget();
  const dashboard = useDashboardData(auth.phoneNumber, auth.sessionToken, auth.isLoggedIn, auth.handleLogout);
  const [view, setView] = useState<'feed' | 'archive'>('feed');

  const handleSaveSharedContent = async () => {
    if (!auth.phoneNumber) {
      throw new Error("Please connect your phone number first to save memories.");
    }
    await dashboard.saveMemory(shareTarget.sharedText);
    shareTarget.clear();
    dashboard.refresh();
  };

  return (
    <div id="main-app-container" className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <AppHeader
        isLoggedIn={auth.isLoggedIn}
        userProfile={dashboard.userProfile}
        phoneNumber={auth.phoneNumber}
        onLogout={auth.handleLogout}
      />

      {shareTarget.isSharedActive && (
        <ShareTargetBanner
          sharedText={shareTarget.sharedText}
          onDismiss={shareTarget.dismiss}
          onSave={handleSaveSharedContent}
        />
      )}

      {!auth.isLoggedIn ? (
        <LoginCard
          phoneInput={auth.phoneInput}
          setPhoneInput={auth.setPhoneInput}
          otpInput={auth.otpInput}
          setOtpInput={auth.setOtpInput}
          isWaitingForOtp={auth.isWaitingForOtp}
          setIsWaitingForOtp={auth.setIsWaitingForOtp}
          phoneNumber={auth.phoneNumber}
          isSubmitting={auth.isSubmitting}
          onRequestOtp={auth.handleRequestOtp}
          onVerifyOtp={auth.handleVerifyOtp}
        />
      ) : (
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-5 space-y-8">
            <ConnectionPanel config={dashboard.config} />
            <ReminderList reminders={dashboard.reminders} />
          </section>

          <section className="lg:col-span-7 space-y-8">
            <QuickSaveForm onSave={dashboard.saveMemory} />
            {view === 'feed' ? (
              <MemoriesFeed
                memories={dashboard.memories}
                isLoading={dashboard.isLoading}
                onRefresh={dashboard.refresh}
                onDelete={dashboard.deleteMemory}
                onToggleSafeKeep={dashboard.toggleSafeKeep}
                archivedCount={dashboard.archivedMemories.length}
                onViewArchive={() => setView('archive')}
                token={auth.sessionToken}
              />
            ) : (
              <ArchiveView
                memories={dashboard.archivedMemories}
                isLoading={dashboard.isLoading}
                onRefresh={dashboard.refresh}
                onDelete={dashboard.deleteMemory}
                onRestore={dashboard.restoreMemory}
                onToggleSafeKeep={dashboard.toggleSafeKeep}
                archiveRetentionDays={dashboard.settings.archive_retention_days}
                onUpdateRetentionDays={dashboard.updateRetentionSetting}
                onBack={() => setView('feed')}
                token={auth.sessionToken}
              />
            )}
          </section>
        </main>
      )}

      <footer className="mt-16 pt-8 border-t border-slate-800/40 text-center text-slate-500 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="flex items-center justify-center gap-1.5">
          <CloudCheck size={14} className="text-emerald-500" />
          <span>Supabase Vector database synched over Secure HTTPS</span>
        </p>
        <p>Remember AI - Created via Google AI Studio & Twilio</p>
      </footer>
    </div>
  );
}
