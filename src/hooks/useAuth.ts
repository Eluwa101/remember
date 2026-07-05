import { FormEvent, useCallback, useState } from "react";

export function useAuth() {
  const savedPhone = localStorage.getItem("remember_phone") || "";
  const savedToken = localStorage.getItem("remember_session_token") || "";

  const [phoneNumber, setPhoneNumber] = useState<string>(savedPhone);
  const [phoneInput, setPhoneInput] = useState<string>(savedPhone);
  const [sessionToken, setSessionToken] = useState<string>(savedToken);
  const [otpInput, setOtpInput] = useState<string>("");
  const [isWaitingForOtp, setIsWaitingForOtp] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!(savedPhone && savedToken));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/[^0-9]/g, "").trim();
    if (cleanPhone.length < 6) {
      alert("Please enter a valid phone number with country code (e.g., 18315551212)");
      return;
    }
    setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) return;
    setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  };

  // Memoized: this is passed as onUnauthorized into useDashboardData, where it's a
  // dependency of the fetch-triggering effect. An unmemoized function here would get
  // a new identity every render, re-firing that effect in an infinite fetch loop.
  const handleLogout = useCallback(() => {
    localStorage.removeItem("remember_phone");
    localStorage.removeItem("remember_session_token");
    setPhoneNumber("");
    setPhoneInput("");
    setSessionToken("");
    setIsLoggedIn(false);
    setIsWaitingForOtp(false);
    setOtpInput("");
  }, []);

  return {
    phoneNumber,
    phoneInput,
    setPhoneInput,
    sessionToken,
    otpInput,
    setOtpInput,
    isWaitingForOtp,
    setIsWaitingForOtp,
    isLoggedIn,
    isSubmitting,
    handleRequestOtp,
    handleVerifyOtp,
    handleLogout
  };
}
