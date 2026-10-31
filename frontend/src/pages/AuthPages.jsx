import '../auth-overrides.css'
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../context/AuthContext";
import { EmailAction, emailAction } from '../email/EmailActions'
export function Login() {
  const [form, setForm] = useState({ email: "", password: "", remember: false });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const { login, linkGoogle, loading, googleEnabled, startGoogleLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleError = new URLSearchParams(location.search).get("error");
  const returnTo = getSafeReturnTo(new URLSearchParams(location.search).get("returnTo"));
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const signedIn = await login(form);
      if (signedIn.role === 'admin') { navigate('/admin'); return; }
      if (googleError === "google-account-link-required") await linkGoogle();
      navigate(returnTo);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to sign in. Check your details.",
      );
    }
  };
  return (
    <AuthShell title="Welcome back." subtitle="Your ritual is waiting.">
      {new URLSearchParams(location.search).get("passwordChanged") && <p role="status">Password changed. Sign in with your new password.</p>}
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              type={show ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label="Toggle password visibility"
            >
              {show ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </label>
        {(error || googleError) && <p className="form-error">{error || googleErrorMessage(googleError)}</p>}
        <div className="form-options">
          <label className="check-label">
            <input type="checkbox" checked={form.remember} onChange={e => setForm({ ...form, remember: e.target.checked })} /> Remember me
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="button button-dark auth-submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {googleEnabled && <><div className="auth-divider"><span>or</span></div><button className="google-button" type="button" onClick={startGoogleLogin}><FcGoogle /> Continue with Google</button></>}
        <p className="auth-switch">
          New to Aurelia? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
export function Signup() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const { signup, loading, googleEnabled, startGoogleLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleError = new URLSearchParams(location.search).get("error");
  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword)
      return setError("Passwords do not match.");
    if (form.password.length < 12)
      return setError("Password must be at least 12 characters.");
    try {
      const registrationDetails = { name: form.name, email: form.email, password: form.password };
      await signup(registrationDetails);
      navigate(getSafeReturnTo(new URLSearchParams(location.search).get("returnTo")));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create account.");
    }
  };
  const action = emailAction(location.hash);
  if (action && ['verify','resend'].includes(action.kind)) return <EmailAction key={location.hash} {...action}/>;
  return (
    <AuthShell
      title="Begin your ritual."
      subtitle="Beauty, made more considered."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          Full name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength="12"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            required
            value={form.confirmPassword}
            onChange={(e) =>
              setForm({ ...form, confirmPassword: e.target.value })
            }
          />
        </label>
        {(error || googleError) && <p className="form-error">{error || googleErrorMessage(googleError)}</p>}
        <label className="check-label">
          <input type="checkbox" required /> I agree to the Terms & Conditions
        </label>
        <button className="button button-dark auth-submit" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>
        {googleEnabled && <><div className="auth-divider"><span>or</span></div><button className="google-button" type="button" onClick={startGoogleLogin}><FcGoogle /> Continue with Google</button></>}
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
function getSafeReturnTo(value) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/shop';
}
function googleErrorMessage(code) {
  if (code === "google-account-link-required") return "This email already has an Aurelia account. Sign in with that account before linking Google."
  if (code === "google-expired") return "Google sign-in expired. Please try again."
  return "Google sign-in is unavailable. Please use email and password."
}
function AuthShell({ title, subtitle, children }) {
  return (
    <main className={`auth-page ${title === "Welcome back." ? "auth-login-page" : "auth-signup-page"}`}>
      <div className="auth-image">
        <img
          src="https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=1200&q=85"
          alt="Botanical skincare arranged on a table"
        />
      </div>
      <section className="auth-panel">
        <Link className="wordmark" to="/">
          AURELIA<span>BOTANICAL BEAUTY</span>
        </Link>
        <p className="eyebrow">A considered beginning</p>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}
