
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      await login(email.trim(), password, rememberMe);
      navigate("/staff/dashboard", { replace: true });
    } catch {
      setError("Unable to log in. Please check your credentials.");
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        {/* Left branding panel */}
        <aside className="auth-brand-panel">
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

          {/* Healthcare branding */}
          <div className="auth-brand-content">
            <span className="auth-eyebrow">
              YOUR HEALTHCARE, IN ONE PLACE
            </span>

            <h1>
              Care that
              <br />
              <span>connects us.</span>
            </h1>

            <p>
              Access your healthcare services, manage appointments,
              and stay connected throughout your healthcare journey.
            </p>

            <div className="auth-feature-list">
             

              

             
            </div>
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

        {/* Right login panel */}
        <section className="auth-form-panel">
          <div className="auth-mobile-brand">
            <span className="auth-mobile-mark">+</span>
            <span>MediOS</span>
          </div>

          <div className="auth-form-container">
            <div className="auth-form-heading">
              <span className="auth-form-eyebrow">
                WELCOME BACK
              </span>

              <h2>Welcome back</h2>

              <p>
                Log in to access your account and healthcare services.
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {/* Email */}
              <div className="auth-field">
                <label htmlFor="login-email">Email address</label>

                <div className="auth-input-wrap">
                  <svg
                    className="auth-input-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="14"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M4 7L12 13L20 7"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError("");
                    }}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="login-password">Password</label>
                </div>

                <div className="auth-input-wrap">
                  <svg
                    className="auth-input-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="5"
                      y="10"
                      width="14"
                      height="11"
                      rx="2.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M8 10V7A4 4 0 0 1 16 7V10"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="12"
                      cy="15"
                      r="1.2"
                      fill="currentColor"
                    />
                  </svg>

                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    autoComplete="current-password"
                    required
                    disabled={loading}
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
                    aria-pressed={showPassword}
                    disabled={loading}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Login options */}
              <div className="auth-options">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) =>
                      setRememberMe(event.target.checked)
                    }
                    disabled={loading}
                  />
                  <span>Remember me</span>
                </label>

                <span className="auth-help-text">
                  Need help logging in?
                </span>
              </div>

              {/* Error message */}
              {error && (
                <div className="auth-error" role="alert">
                  <span aria-hidden="true">!</span>
                  {error}
                </div>
              )}

              {/* Login button */}
              <button
                type="submit"
                className="auth-submit"
                disabled={loading}
              >
                <span>{loading ? "Logging in..." : "Log in"}</span>

                {!loading && (
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

              {/* Security note */}
              <p className="auth-security-note">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 3L19 6V11C19 15.5 16 19 12 21C8 19 5 15.5 5 11V6L12 3Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12L11 14L15 10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                Secure access to your healthcare account
              </p>
            </form>

            {/* Registration link */}
            <div className="auth-signup">
              <span>Don't have an account?</span>
              <Link to="/signup">Sign up</Link>
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

export default LoginPage;
