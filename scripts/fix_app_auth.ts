import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace API key state with OTP and Token state
content = content.replace(
  'const [apiKey, setApiKey] = useState<string>("");\n  const [apiInput, setApiInput] = useState<string>("");',
  `const [sessionToken, setSessionToken] = useState<string>("");
  const [otpInput, setOtpInput] = useState<string>("");
  const [isWaitingForOtp, setIsWaitingForOtp] = useState<boolean>(false);`
);

// Replace check in useEffect
content = content.replace(
  `const savedKey = localStorage.getItem("remember_api_key");\n    if (savedPhone && savedKey) {\n      setPhoneNumber(savedPhone);\n      setPhoneInput(savedPhone);\n      setApiKey(savedKey);\n      setApiInput(savedKey);\n      setIsLoggedIn(true);\n    }`,
  `const savedToken = localStorage.getItem("remember_session_token");
    if (savedPhone && savedToken) {
      setPhoneNumber(savedPhone);
      setPhoneInput(savedPhone);
      setSessionToken(savedToken);
      setIsLoggedIn(true);
    }`
);

// Update fetchUserData
content = content.replace(
  `if (!phoneNumber || !apiKey) return;`,
  `if (!phoneNumber || !sessionToken) return;`
);

content = content.replace(
  `headers: { "Authorization": \`Bearer \${apiKey}\` }`,
  `headers: { "Authorization": \`Bearer \${sessionToken}\` }`
);

// Update memory calls
content = content.replace(
  /headers: \{ \n\s*"Content-Type": "application\/json",\n\s*"Authorization": `Bearer \$\{apiKey\}`\n\s*\}/g,
  `headers: { 
          "Content-Type": "application/json",
          "Authorization": \`Bearer \${sessionToken}\`
        }`
);

content = content.replace(
  /body: JSON\.stringify\(\{ id, phone: phoneNumber \}\)/,
  `body: JSON.stringify({ id })`
);

// Replace handleLogin
const newLogin = `
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/[^0-9]/g, "").trim();
    if (cleanPhone.length < 6) {
      alert("Please enter a valid phone number with country code (e.g., 18315551212)");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone })
      });
      if (res.ok) {
        setPhoneNumber(cleanPhone);
        setIsWaitingForOtp(true);
      } else {
        alert("Failed to send OTP code.");
      }
    } catch (err) {
      alert("Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, code: otpInput.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("remember_phone", phoneNumber);
        localStorage.setItem("remember_session_token", data.token);
        setSessionToken(data.token);
        setIsLoggedIn(true);
        setIsWaitingForOtp(false);
        setOtpInput("");
      } else {
        alert("Invalid or expired code.");
      }
    } catch (err) {
      alert("Network error.");
    } finally {
      setIsLoading(false);
    }
  };
`;
content = content.replace(
  /const handleLogin = \(e: React\.FormEvent\) => \{[\s\S]*?setIsLoggedIn\(true\);\n\s*\};/,
  newLogin
);


// Replace handleLogout
content = content.replace(
  `localStorage.removeItem("remember_api_key");\n    setPhoneNumber("");\n    setPhoneInput("");\n    setApiKey("");\n    setApiInput("");\n    setIsLoggedIn(false);`,
  `localStorage.removeItem("remember_session_token");
    setPhoneNumber("");
    setPhoneInput("");
    setSessionToken("");
    setIsLoggedIn(false);
    setIsWaitingForOtp(false);
    setOtpInput("");`
);

// Fix UI Form
content = content.replace(
  /<form onSubmit=\{handleLogin\} className="space-y-4 text-left">[\s\S]*?<\/form>/,
  `
            {!isWaitingForOtp ? (
              <form onSubmit={handleRequestOtp} className="space-y-4 text-left">
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
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="18315551212"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-8 pr-4 text-slate-100 placeholder-slate-600 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Include country code, no symbols or spaces (e.g. <strong>1</strong> for US, <strong>44</strong> for UK).
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2"
                >
                  <span>Send Login Code</span>
                  <Send size={14} />
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4 text-left">
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
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder="123456"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-4 pr-4 text-slate-100 placeholder-slate-600 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      required
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
                    disabled={isLoading}
                    className="w-2/3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-blue-500/15"
                  >
                    Verify Code
                  </button>
                </div>
              </form>
            )}
  `
);


fs.writeFileSync('src/App.tsx', content);
