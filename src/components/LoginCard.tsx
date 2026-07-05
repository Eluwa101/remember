import React from "react";
import { Smartphone, Send } from "lucide-react";

interface LoginCardProps {
  phoneInput: string;
  setPhoneInput: (v: string) => void;
  otpInput: string;
  setOtpInput: (v: string) => void;
  isWaitingForOtp: boolean;
  setIsWaitingForOtp: (v: boolean) => void;
  phoneNumber: string;
  isSubmitting: boolean;
  onRequestOtp: (e: React.FormEvent) => void;
  onVerifyOtp: (e: React.FormEvent) => void;
}

export default function LoginCard({
  phoneInput,
  setPhoneInput,
  otpInput,
  setOtpInput,
  isWaitingForOtp,
  setIsWaitingForOtp,
  phoneNumber,
  isSubmitting,
  onRequestOtp,
  onVerifyOtp
}: LoginCardProps) {
  return (
    <main className="max-w-md mx-auto py-12">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>

        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl text-blue-400 flex items-center justify-center mx-auto mb-6">
          <Smartphone size={32} />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Connect Your Assistant</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Enter your WhatsApp number to create your workspace, retrieve your memories, and start scheduling alerts.
        </p>

        {!isWaitingForOtp ? (
          <form onSubmit={onRequestOtp} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                WhatsApp Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-semibold text-sm">
                  +
                </div>
                <input
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="18315551212"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-8 pr-4 text-slate-100 placeholder-slate-600 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Include country code, no symbols or spaces (e.g. <strong>1</strong> for US, <strong>44</strong> for UK).
              </p>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2"
            >
              <span>Send Login Code</span>
              <Send size={14} />
            </button>
          </form>
        ) : (
          <form onSubmit={onVerifyOtp} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Enter Code
              </label>
              <p className="text-xs text-slate-500 mb-3">
                We just sent a WhatsApp message to +{phoneNumber}.
              </p>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-4 pr-4 text-slate-100 placeholder-slate-600 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsWaitingForOtp(false)}
                className="w-1/3 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-2/3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-blue-500/15"
              >
                Verify Code
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
