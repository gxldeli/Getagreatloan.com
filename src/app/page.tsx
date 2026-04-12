"use client";

import { useState, FormEvent } from "react";

const WEBHOOK_URL =
  process.env.NEXT_PUBLIC_GHL_WEBHOOK_URL ||
  "https://services.leadconnectorhq.com/hooks/PLACEHOLDER";

export default function Home() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    phone: "",
    email: "",
    goal: "",
    mortgageBalance: "",
    creditScore: "",
    employment: "",
    timeline: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } catch {
      // Still show thank you — webhook may be placeholder
    }
    setSubmitting(false);
    setSubmitted(true);
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Hero */}
      <section className="px-6 py-20 text-center max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-6">
          Ontario Homeowners: See How Much You Could Save on Your Mortgage
        </h1>
        <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Lower your payments. Consolidate debt. Access your equity. Find out
          what you qualify for in under 30 seconds.
        </p>
        <a
          href="#qualify"
          className="inline-block bg-teal hover:bg-teal-dark text-white font-semibold text-lg px-8 py-4 rounded-lg transition-colors"
        >
          Check If You Qualify →
        </a>
      </section>

      {/* Benefit Cards */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="bg-navy-light rounded-xl p-8">
            <h3 className="text-xl font-semibold mb-3 text-teal">
              Lower Your Payments
            </h3>
            <p className="text-gray-300">
              Refinance at today&apos;s rates and keep more money every month.
            </p>
          </div>
          <div className="bg-navy-light rounded-xl p-8">
            <h3 className="text-xl font-semibold mb-3 text-teal">
              Consolidate Your Debt
            </h3>
            <p className="text-gray-300">
              Roll credit cards, car loans, and other debt into one low payment.
            </p>
          </div>
          <div className="bg-navy-light rounded-xl p-8">
            <h3 className="text-xl font-semibold mb-3 text-teal">
              Access Your Equity
            </h3>
            <p className="text-gray-300">
              Tap into your home&apos;s value without affecting your current
              mortgage.
            </p>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="text-center py-10">
        <p className="text-gray-400 text-lg">
          Trusted by 500+ Ontario homeowners
        </p>
      </section>

      {/* Lead Capture Form */}
      <section id="qualify" className="px-6 py-16 max-w-xl mx-auto w-full">
        {submitted ? (
          <div className="bg-navy-light rounded-xl p-10 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              You&apos;re All Set!
            </h2>
            <p className="text-gray-300 text-lg">
              We&apos;re reviewing your info now. Keep your phone nearby —
              we&apos;ll reach out shortly with your options.
            </p>
          </div>
        ) : (
          <div className="bg-navy-light rounded-xl p-8 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
              Check If You Qualify
            </h2>
            <p className="text-gray-400 text-center mb-8">
              Takes under 30 seconds. No obligation.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                name="firstName"
                placeholder="First Name"
                required
                value={form.firstName}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-teal"
              />
              <input
                type="tel"
                name="phone"
                placeholder="Phone Number"
                required
                value={form.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-teal"
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                required
                value={form.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-teal"
              />

              <select
                name="goal"
                required
                value={form.goal}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white focus:outline-none focus:border-teal"
              >
                <option value="" disabled>
                  What are you looking for?
                </option>
                <option>Lower my monthly payments</option>
                <option>Consolidate my debt</option>
                <option>Access my home equity (HELOC)</option>
                <option>Refinance my mortgage</option>
                <option>Other</option>
              </select>

              <select
                name="mortgageBalance"
                required
                value={form.mortgageBalance}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white focus:outline-none focus:border-teal"
              >
                <option value="" disabled>
                  Current mortgage balance?
                </option>
                <option>Under $200K</option>
                <option>$200K–$400K</option>
                <option>$400K–$600K</option>
                <option>$600K–$800K</option>
                <option>$800K+</option>
              </select>

              <select
                name="creditScore"
                required
                value={form.creditScore}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white focus:outline-none focus:border-teal"
              >
                <option value="" disabled>
                  Approximate credit score?
                </option>
                <option>750+ Excellent</option>
                <option>700–749 Good</option>
                <option>650–699 Fair</option>
                <option>Below 650</option>
                <option>Not sure</option>
              </select>

              <select
                name="employment"
                required
                value={form.employment}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white focus:outline-none focus:border-teal"
              >
                <option value="" disabled>
                  Currently employed?
                </option>
                <option>Yes — Full-time</option>
                <option>Yes — Self-employed</option>
                <option>Yes — Part-time/Contract</option>
                <option>No</option>
              </select>

              <select
                name="timeline"
                required
                value={form.timeline}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-navy border border-gray-600 text-white focus:outline-none focus:border-teal"
              >
                <option value="" disabled>
                  How soon?
                </option>
                <option>ASAP</option>
                <option>Within 30 days</option>
                <option>1–3 months</option>
                <option>Just exploring</option>
              </select>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-teal hover:bg-teal-dark text-white font-semibold text-lg py-4 rounded-lg transition-colors disabled:opacity-50 mt-2"
              >
                {submitting ? "Submitting..." : "See My Options →"}
              </button>

              <p className="text-gray-500 text-sm text-center mt-1">
                Your info is used to match you with the best mortgage options.
                We don&apos;t sell your data.
              </p>
            </form>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-auto px-6 py-10 text-center">
        <p className="text-gray-500 text-sm">
          © 2026 Get A Great Loan. All rights reserved.
        </p>
        <p className="text-gray-600 text-xs mt-2">
          This is not a commitment to lend. Subject to qualification.
        </p>
      </footer>
    </div>
  );
}
