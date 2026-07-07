import React from "react";
import { ArrowLeft } from "lucide-react";

interface PrivacyPolicyProps {
  onBack: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <h2 className="text-lg font-semibold text-slate-100">Privacy Policy</h2>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 text-sm text-slate-300 leading-relaxed">
        <p className="text-xs text-slate-500">Last updated: [DATE]</p>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Information We Collect</h3>
          <p>
            We collect the WhatsApp phone number you connect with, the content of messages you
            send us (text, images, and voice notes), and anything you save through this web
            dashboard. If you tell us your name or location, we store that too so we can address
            you correctly and get reminder times right.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">How We Use It</h3>
          <p>
            Your messages are processed to categorize them, extract reminders, generate search
            embeddings, and reply to you conversationally. We don't use your data for advertising
            or sell it to third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Third-Party Services</h3>
          <p>We rely on the following processors to run this service:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Twilio</strong> — delivers and receives your WhatsApp messages.</li>
            <li><strong>Google Gemini</strong> and <strong>Groq</strong> — process message content to categorize it, extract reminders, and answer questions.</li>
            <li><strong>Supabase</strong> — hosts our database and backend functions.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Data Retention</h3>
          <p>
            Your memories and reminders are kept until you delete them. Completed reminders move
            to your Archive and are permanently deleted after the retention period you set in
            Settings. Items you mark as Safe Keep are retained for a longer, separately configurable
            period. You can delete your entire account and all associated data at any time from
            Settings.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Data Security</h3>
          <p>
            All traffic is encrypted over HTTPS. Your data is isolated at the database level and
            only accessible through authenticated requests tied to your phone number.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Your Rights</h3>
          <p>
            You can review everything we've stored about you directly in this dashboard, and
            permanently delete your account and all of its data at any time from Settings.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Children's Privacy</h3>
          <p>This service is not directed at children under 13, and we do not knowingly collect data from them.</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Changes to This Policy</h3>
          <p>We may update this policy from time to time. Material changes will be reflected by updating the date above.</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-slate-100 font-semibold">Contact</h3>
          <p>Questions about this policy? Reach us at <span className="font-mono">[CONTACT EMAIL]</span>.</p>
        </section>
      </div>
    </div>
  );
}
