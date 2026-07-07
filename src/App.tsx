import React, { useState } from "react";
import ConnectionPanel from "./components/ConnectionPanel";
import ReminderList from "./components/ReminderList";
import AppHeader from "./components/AppHeader";
import ShareTargetBanner from "./components/ShareTargetBanner";
import LoginCard from "./components/LoginCard";
import QuickSaveForm from "./components/QuickSaveForm";
import MemoriesFeed from "./components/MemoriesFeed";
import ArchiveView from "./components/ArchiveView";
import SafeKeepView from "./components/SafeKeepView";
import SettingsView from "./components/SettingsView";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsOfUse from "./components/TermsOfUse";
import { useAuth } from "./hooks/useAuth";
import { useShareTarget } from "./hooks/useShareTarget";
import { useDashboardData } from "./hooks/useDashboardData";

type View = 'feed' | 'archive' | 'safekeep' | 'settings' | 'privacy' | 'terms';

export default function App() {
  const auth = useAuth();
  const shareTarget = useShareTarget();
  const dashboard = useDashboardData(auth.phoneNumber, auth.sessionToken, auth.isLoggedIn, auth.handleLogout);
  const [view, setView] = useState<View>('feed');

  const handleSaveSharedContent = async () => {
    if (!auth.phoneNumber) {
      throw new Error("Please connect your phone number first to save memories.");
    }
    await dashboard.saveMemory(shareTarget.sharedText);
    shareTarget.clear();
    dashboard.refresh();
  };

  const handleDeleteAccount = async () => {
    await dashboard.deleteAccount();
    auth.handleLogout();
  };

  const isFirstTimeUser =
    !dashboard.isLoading &&
    dashboard.memories.length === 0 &&
    dashboard.reminders.length === 0 &&
    dashboard.archivedMemories.length === 0 &&
    dashboard.safeKeepMemories.length === 0;

  return (
    <div id="main-app-container" className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <AppHeader
        isLoggedIn={auth.isLoggedIn}
        userProfile={dashboard.userProfile}
        phoneNumber={auth.phoneNumber}
        onLogout={auth.handleLogout}
        onOpenSettings={() => setView('settings')}
      />

      {shareTarget.isSharedActive && (
        <ShareTargetBanner
          sharedText={shareTarget.sharedText}
          onDismiss={shareTarget.dismiss}
          onSave={handleSaveSharedContent}
        />
      )}

      {view === 'privacy' ? (
        <PrivacyPolicy onBack={() => setView('feed')} />
      ) : view === 'terms' ? (
        <TermsOfUse onBack={() => setView('feed')} />
      ) : !auth.isLoggedIn ? (
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
      ) : view === 'feed' && isFirstTimeUser ? (
        <main className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-white">Let's get you connected</h2>
            <p className="text-sm text-slate-400">
              Follow the steps below, then send your first message — it'll show up right here.
            </p>
          </div>
          <ConnectionPanel config={dashboard.config} />
          <QuickSaveForm onSave={dashboard.saveMemory} />
        </main>
      ) : (
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-5 space-y-8">
            <ConnectionPanel config={dashboard.config} />
            <ReminderList reminders={dashboard.reminders} />
          </section>

          <section className="lg:col-span-7 space-y-8">
            {view === 'feed' && <QuickSaveForm onSave={dashboard.saveMemory} />}
            {view === 'feed' ? (
              <MemoriesFeed
                memories={dashboard.memories}
                isLoading={dashboard.isLoading}
                onRefresh={dashboard.refresh}
                onDelete={dashboard.deleteMemory}
                onToggleSafeKeep={dashboard.toggleSafeKeep}
                archivedCount={dashboard.archivedMemories.length}
                onViewArchive={() => setView('archive')}
                safeKeepCount={dashboard.safeKeepMemories.length}
                onViewSafeKeep={() => setView('safekeep')}
                token={auth.sessionToken}
              />
            ) : view === 'archive' ? (
              <ArchiveView
                memories={dashboard.archivedMemories}
                isLoading={dashboard.isLoading}
                onRefresh={dashboard.refresh}
                onDelete={dashboard.deleteMemory}
                onRestore={dashboard.restoreMemory}
                onToggleSafeKeep={dashboard.toggleSafeKeep}
                archiveRetentionDays={dashboard.settings.archive_retention_days}
                onBack={() => setView('feed')}
                token={auth.sessionToken}
              />
            ) : view === 'safekeep' ? (
              <SafeKeepView
                memories={dashboard.safeKeepMemories}
                isLoading={dashboard.isLoading}
                onRefresh={dashboard.refresh}
                onDelete={dashboard.deleteMemory}
                onToggleSafeKeep={dashboard.toggleSafeKeep}
                onBack={() => setView('feed')}
                token={auth.sessionToken}
              />
            ) : (
              <SettingsView
                phoneNumber={auth.phoneNumber}
                userProfile={dashboard.userProfile}
                archiveRetentionDays={dashboard.settings.archive_retention_days}
                onUpdateRetentionDays={dashboard.updateRetentionSetting}
                onDeleteAccount={handleDeleteAccount}
                onBack={() => setView('feed')}
              />
            )}
          </section>
        </main>
      )}

      <footer className="mt-16 pt-8 border-t border-slate-800/40 text-center text-slate-500 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p>Your secure memory companion</p>
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setView('privacy')} className="hover:text-slate-300 transition-colors">
            Privacy Policy
          </button>
          <button onClick={() => setView('terms')} className="hover:text-slate-300 transition-colors">
            Terms of Use
          </button>
        </div>
      </footer>
    </div>
  );
}
