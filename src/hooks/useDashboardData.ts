import { useCallback, useEffect, useState } from "react";
import { ConfigDetails, Memory, Reminder } from "../types";

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
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
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
        setReminders(data.reminders || []);
        if (data.profile) {
          setUserProfile(data.profile);
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
      setReminders(prev => prev.filter(r => r.memory_id !== id));
    }
  };

  return {
    config,
    memories,
    reminders,
    isLoading,
    userProfile,
    refresh: fetchUserData,
    saveMemory,
    deleteMemory
  };
}
