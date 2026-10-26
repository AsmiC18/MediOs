
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const SignupPage = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    accountType: "patient",
    password: "",
    confirmPassword: "",
    termsAccepted: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));

    setError("");
    setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.dateOfBirth ||
      !form.password ||
      !form.confirmPassword
    ) {
      setError("Please complete all required fields.");
      return;
    }

    if (new Date(form.dateOfBirth) > new Date()) {
      setError("Date of birth cannot be in the future.");
      return;
    }

    if (form.password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    if (!form.termsAccepted) {
      setError("Please accept the terms and privacy policy.");
      return;
    }

    if (form.accountType !== "patient") {
      setError(
        "Doctor and staff accounts require an approved invitation. Please contact your healthcare administrator."
      );
      return;
    }

    setSubmitting(true);

    try {
      // Connect your registration API here.
      // Do not store passwords or personal data in localStorage.

      setMessage(
        "Your details have been validated. Account creation is not yet connected to a registration service."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page signup-page">
      <section className="auth-shell signup-shell">
        {/* Branding panel */}
        <aside className="auth-brand-panel signup-brand-panel">
          <Link to="/login" className="signup-brand-link">
            <div className="auth-brand">
              <div className="auth-brand-mark" aria-hidden="true">
                <svg
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="2"
                    y="2"
                    width="44"
                    height="44"
                    rx="13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M24 12V36M12 24H36"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div>
                <span className="auth-brand-name">MediOS</span>
                <span className="auth-brand-caption">
                  HEALTHCARE PORTAL
                </span>
              </div>
            </div>
          </Link>

          <div className="auth-brand-content">
            <span className="auth-eyebrow">
              GET STARTED WITH MEDIOS
            </span>

            <h1>
              Your health.
              <br />
              <span>Your journey.</span>
            </h1>

            <p>
              Create your account to access healthcare services
              and stay connected with the care that matters to you.
            </p>
          </div>

          <div className="auth-brand-footer">
            <span className="auth-footer-dot" />
            Healthcare access, made simpler
          </div>

          <div
            className="auth-decoration auth-decoration-one"
            aria-hidden="true"
          />
          <div
            className="auth-decoration auth-decoration-two"
            aria-hidden="true"
          />
        </aside>

        {/* Registration form */}
        <section className="auth-form-panel signup-form-panel">
          <div className="auth-mobile-brand">
            <span className="auth-mobile-mark">+</span>
            <span>MediOS</span>
          </div>

          <div className="auth-form-container signup-form-container">
            <div className="auth-form-heading">
              <span className="auth-form-eyebrow">
                CREATE YOUR ACCOUNT
              </span>

              <h2>Join MediOS</h2>

              <p>
                Enter your details to get started with your healthcare
                account.
              </p>
            </div>

            <form
              className="auth-form signup-form"
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Account type */}
              <div className="auth-field">
                <label htmlFor="signup-account-type">
                  I am registering as
                </label>

                <select
                  id="signup-account-type"
                  name="accountType"
                  className="signup-select"
                  value={form.accountType}
                  onChange={updateField}
                  required
                >
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor — invitation required</option>
                  <option value="staff">Hospital staff — invitation required</option>
                </select>

                <p className="signup-field-hint">
                  Patient registration is open. Healthcare professionals
                  require an approved invitation.
                </p>
              </div>

              {/* Personal information */}
              <div className="signup-section-heading">
                <span className="signup-section-number">01</span>
                <span>Personal information</span>
              </div>

              <div className="signup-grid">
                <div className="auth-field">
                  <label htmlFor="signup-first-name">
                    First name <span className="signup-required">*</span>
                  </label>

                  <input
                    id="signup-first-name"
                    className="signup-input"
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={updateField}
                    autoComplete="given-name"
                    maxLength={80}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="signup-last-name">
                    Last name <span className="signup-required">*</span>
                  </label>

                  <input
                    id="signup-last-name"
                    className="signup-input"
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={updateField}
                    autoComplete="family-name"
                    maxLength={80}
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="signup-dob">
                    Date of birth <span className="signup-required">*</span>
                  </label>

                  <input
                    id="signup-dob"
                    className="signup-input"
                    type="date"
                    name="dateOfBirth"
                    value={form.dateOfBirth}
                    onChange={updateField}
                    max={new Date().toLocaleDateString("en-CA")}
                    autoComplete="bday"
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="signup-gender">
                    Gender <span className="signup-optional">(optional)</span>
                  </label>

                  <select
                    id="signup-gender"
                    className="signup-select"
                    name="gender"
                    value={form.gender}
                    onChange={updateField}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="nonbinary">Non-binary</option>
                    <option value="self-described">Self-describe</option>
                  </select>
                </div>
              </div>

              {/* Contact information */}
              <div className="signup-section-heading">
                <span className="signup-section-number">02</span>
                <span>Contact information</span>
              </div>

              <div className="auth-field">
                <label htmlFor="signup-email">
                  Email address <span className="signup-required">*</span>
                </label>

                <input
                  id="signup-email"
                  className="signup-input"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="signup-phone">
                  Phone number <span className="signup-required">*</span>
                </label>

                <input
                  id="signup-phone"
                  className="signup-input"
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  autoComplete="tel"
                  maxLength={25}
                  required
                />
              </div>

              {/* Account security */}
              <div className="signup-section-heading">
                <span className="signup-section-number">03</span>
                <span>Account security</span>
              </div>

              <div className="auth-field">
                <label htmlFor="signup-password">
                  Create password <span className="signup-required">*</span>
                </label>

                <div className="auth-input-wrap signup-password-wrap">
                  <input
                    id="signup-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={updateField}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />

                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <p className="signup-field-hint">
                  Use at least 8 characters. A longer, unique password
                  is recommended.
                </p>
              </div>

              <div className="auth-field">
                <label htmlFor="signup-confirm-password">
                  Confirm password <span className="signup-required">*</span>
                </label>

                <div className="auth-input-wrap signup-password-wrap">
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={updateField}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />

                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() =>
                      setShowConfirmPassword((current) => !current)
                    }
                    aria-label={
                      showConfirmPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Terms */}
              <label className="signup-consent">
                <input
                  type="checkbox"
                  name="termsAccepted"
                  checked={form.termsAccepted}
                  onChange={updateField}
                  required
                />

                <span>
                  I agree to the terms of service and privacy policy.
                  <span className="signup-required"> *</span>
                </span>
              </label>

              {/* Feedback */}
              {error && (
                <div className="auth-error" role="alert">
                  <span aria-hidden="true">!</span>
                  {error}
                </div>
              )}

              {message && (
                <div className="signup-message" role="status">
                  {message}
                </div>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={submitting}
              >
                <span>
                  {submitting ? "Please wait..." : "Create account"}
                </span>

                {!submitting && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 12H19M12 5L19 12L12 19"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

              <p className="signup-disclaimer">
                Your information should only be used to manage your
                account and provide authorized healthcare services.
              </p>
            </form>

            <div className="auth-signup signup-login-link">
              <span>Already have an account?</span>
              <Link to="/login">Log in</Link>
            </div>
          </div>

          <footer className="auth-form-footer">
            <span>© {new Date().getFullYear()} MediOS</span>
            <span>Healthcare Portal</span>
          </footer>
        </section>
      </section>
    </main>
  );
};

export default SignupPage;
