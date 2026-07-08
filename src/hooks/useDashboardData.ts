import { useCallback, useEffect, useState } from "react";
import { ConfigDetails, DashboardSettings, Memory, Reminder } from "../types";

interface MediaPayload {
  data: string;
  mimeType: string;
}

interface UserProfile {
  name?: string;
  title?: string;
  timezone?: string;
}

export function useDashboardData(
  phoneNumber: string,
  sessionToken: string,
  isLoggedIn: boolean,
  onUnauthorized: () => void
) {
  const [config, setConfig] = useState<ConfigDetails | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [archivedMemories, setArchivedMemories] = useState<Memory[]>([]);
  const [safeKeepMemories, setSafeKeepMemories] = useState<Memory[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<DashboardSettings>({ archive_retention_days: 3 });
  // Starts true when already logged in at mount (e.g. a restored session) so a
  // returning user with real data doesn't flash the first-time-onboarding
  // screen for a render before the initial fetch resolves and corrects it.
  const [isLoading, setIsLoading] = useState<boolean>(isLoggedIn);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Fetch server configuration on load
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          setConfig(await res.json());
        }
      } catch (err) {
        console.error("Failed to load server config:", err);
      }
    }
    fetchConfig();
  }, []);

  const fetchUserData = useCallback(async () => {
    if (!phoneNumber || !sessionToken) return;
    setIsLoading(true);
    try {
      const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/dashboard/summary?phone=${encodeURIComponent(phoneNumber)}&timezone=${encodeURIComponent(systemTimezone)}`, {
        headers: { "Authorization": `Bearer ${sessionToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
        setArchivedMemories(data.archivedMemories || []);
        setSafeKeepMemories(data.safeKeepMemories || []);
        setReminders(data.reminders || []);
        if (data.profile) {
          setUserProfile(data.profile);
        }
        if (data.settings) {
          setSettings(data.settings);
        }
      } else if (res.status === 401) {
        onUnauthorized();
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [phoneNumber, sessionToken, onUnauthorized]);

  useEffect(() => {
    if (isLoggedIn && phoneNumber) {
      fetchUserData();
    }
  }, [isLoggedIn, phoneNumber, fetchUserData]);

  // Reset local state once the user logs out
  useEffect(() => {
    if (!isLoggedIn) {
      setMemories([]);
      setArchivedMemories([]);
      setSafeKeepMemories([]);
      setReminders([]);
      setUserProfile(null);
    }
  }, [isLoggedIn]);

  const saveMemory = async (content: string, media: MediaPayload | null = null) => {
    const res = await fetch("/api/web/memories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ phone: phoneNumber, content, media })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to process memory with AI.");
    }
  };

  const deleteMemory = async (id: string) => {
    const res = await fetch("/api/web/memories/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      setMemories(prev => prev.filter(m => m.id !== id));
      setArchivedMemories(prev => prev.filter(m => m.id !== id));
      setSafeKeepMemories(prev => prev.filter(m => m.id !== id));
      setReminders(prev => prev.filter(r => r.memory_id !== id));
    }
  };

  // Restoring/safe-keeping both move an item between the main feed and Archive —
  // refetching keeps the two lists consistent rather than hand-patching both.
  const restoreMemory = async (id: string) => {
    const res = await fetch("/api/web/memories/restore", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      await fetchUserData();
    }
  };

  const toggleSafeKeep = async (id: string, enabled: boolean, days?: number) => {
    const res = await fetch("/api/web/memories/safe-keep", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ id, enabled, days })
    });
    if (res.ok) {
      await fetchUserData();
    }
  };

  const updateRetentionSetting = async (archiveRetentionDays: number) => {
    const res = await fetch("/api/dashboard/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ archive_retention_days: archiveRetentionDays })
    });
    if (res.ok) {
      setSettings({ archive_retention_days: archiveRetentionDays });
    }
  };

  // Irreversible — the caller (SettingsView) gates this behind a type-to-confirm step.
  const deleteAccount = async () => {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Authorization": `Bearer ${sessionToken}` }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to delete account.");
    }
  };

  return {
    config,
    memories,
    archivedMemories,
    safeKeepMemories,
    reminders,
    settings,
    isLoading,
    userProfile,
    refresh: fetchUserData,
    saveMemory,
    deleteMemory,
    restoreMemory,
    toggleSafeKeep,
    updateRetentionSetting,
    deleteAccount
  };
}
