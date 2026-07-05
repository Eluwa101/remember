import React from "react";
import { Clock, CheckCircle2, AlertCircle, XCircle, BellRing, CalendarRange } from "lucide-react";
import { Reminder } from "../types";

interface ReminderListProps {
  reminders: Reminder[];
}

export default function ReminderList({ reminders }: ReminderListProps) {
  const getStatusIconAndStyle = (status: string) => {
    switch (status) {
      case "sent":
        return {
          icon: <CheckCircle2 size={13} className="text-green-400" />,
          label: "Delivered",
          classes: "text-green-400 bg-green-500/5 border-green-500/10"
        };
      case "failed":
        return {
          icon: <AlertCircle size={13} className="text-rose-400" />,
          label: "Failed",
          classes: "text-rose-400 bg-rose-500/5 border-rose-500/10"
        };
      case "cancelled":
        return {
          icon: <XCircle size={13} className="text-slate-400" />,
          label: "Cancelled",
          classes: "text-slate-400 bg-slate-500/5 border-slate-500/10"
        };
      default:
        return {
          icon: <Clock size={13} className="text-amber-400 animate-pulse" />,
          label: "Scheduled",
          classes: "text-amber-400 bg-amber-500/5 border-amber-500/10"
        };
    }
  };

  const sortedReminders = [...reminders].sort((a, b) => {
    // Put pending first, then sort by time
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(a.target_time).getTime() - new Date(b.target_time).getTime();
  });

  return (
    <div id="reminder-list" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
          <BellRing size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Reminder Scheduler</h2>
          <p className="text-xs text-slate-400">Database-driven cron notification feed</p>
        </div>
      </div>

      {sortedReminders.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center gap-2">
          <CalendarRange className="text-slate-600" size={32} />
          <p className="text-sm text-slate-400">No reminders scheduled yet</p>
          <p className="text-xs text-slate-600 max-w-[250px]">
            Send a WhatsApp message like "Remind me next Monday at 9 AM to check my balance"
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {sortedReminders.map((rem) => {
            const status = getStatusIconAndStyle(rem.status);
            const isPending = rem.status === "pending";
            const isPast = new Date(rem.target_time).getTime() < Date.now();

            return (
              <div
                key={rem.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isPending ? "bg-slate-950/60 border-slate-800" : "bg-slate-950/20 border-slate-900 opacity-60"
                }`}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200 leading-snug">
                    {rem.reminder_text}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <Clock size={11} />
                    <span>
                      {new Date(rem.target_time).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    {isPending && isPast && (
                      <span className="text-[10px] text-amber-400/80 bg-amber-400/5 px-1.5 py-0.2 rounded border border-amber-400/10 font-sans">
                        Triggering soon...
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center self-start sm:self-center">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${status.classes}`}>
                    {status.icon}
                    <span>{status.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
