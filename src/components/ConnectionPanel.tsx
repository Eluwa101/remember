import React, { useState } from "react";
import { Copy, Check, MessageSquare, Phone, ShieldCheck, ArrowRight } from "lucide-react";
import { ConfigDetails } from "../types";

interface ConnectionPanelProps {
  config: ConfigDetails | null;
}

export default function ConnectionPanel({ config }: ConnectionPanelProps) {
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const sandboxNumber = config?.twilioSandboxNumber || "+14155238886";
  const sandboxCode = config?.twilioSandboxCode || "caught-addition";
  const joinMessage = `join ${sandboxCode}`;

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="connection-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
          <Phone size={22} id="phone-icon" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Connect WhatsApp</h2>
          <p className="text-xs text-slate-400">Pair your phone to start remembering</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Step 1 */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-semibold text-sm">
              1
            </div>
            <div className="w-0.5 flex-1 bg-slate-800 my-1"></div>
          </div>
          <div className="flex-1 pb-4">
            <h3 className="text-sm font-medium text-slate-200">Save the Contact</h3>
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Save this number in your phone's address book as <strong>"Remember AI"</strong>.
            </p>
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2.5">
              <span className="font-mono text-xs text-slate-300">{sandboxNumber}</span>
              <button
                id="copy-number-btn"
                onClick={() => copyToClipboard(sandboxNumber, setCopiedNumber)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-900 rounded transition-colors"
                title="Copy phone number"
              >
                {copiedNumber ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-semibold text-sm">
              2
            </div>
            <div className="w-0.5 flex-1 bg-slate-800 my-1"></div>
          </div>
          <div className="flex-1 pb-4">
            <h3 className="text-sm font-medium text-slate-200">Send Verification Code</h3>
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Send the message below to the contact you just saved to link your WhatsApp client:
            </p>
            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2.5">
              <span className="font-mono text-xs text-emerald-400 font-semibold">{joinMessage}</span>
              <button
                id="copy-code-btn"
                onClick={() => copyToClipboard(joinMessage, setCopiedCode)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-900 rounded transition-colors"
                title="Copy link code"
              >
                {copiedCode ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center font-semibold text-sm">
              3
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-slate-200">Start Recording Memories</h3>
            <p className="text-xs text-slate-400 mt-1">
              Anything you send from here on — text, photos, or voice notes — is instantly structured and saved!
            </p>
            
            <div className="mt-3 bg-slate-950/50 rounded-xl p-3 border border-slate-800/60 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <MessageSquare size={12} className="text-blue-400" />
                <span>Example Commands</span>
              </div>
              <ul className="text-xs space-y-1.5 text-slate-300">
                <li className="flex items-center gap-1.5">
                  <ArrowRight size={10} className="text-slate-500" />
                  <span>"Remind me to buy milk tomorrow at 10 AM"</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <ArrowRight size={10} className="text-slate-500" />
                  <span>"The parking spot code is B-42 at level 2"</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <ArrowRight size={10} className="text-slate-500" />
                  <span>"Where did I leave my parking code?" <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1 py-0.2 rounded font-mono ml-1">SEARCH</span></span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
