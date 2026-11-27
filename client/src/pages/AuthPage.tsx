import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../state/auth';
import { PageHead, useDocumentTitle } from '../components/Bits';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useDocumentTitle(mode === 'login' ? 'Sign in' : 'Create account');

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (mode === 'login') await login(identifier.trim(), password);
      else await register(username.trim(), email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError('Could not complete the request. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      <PageHead title={mode === 'login' ? 'Sign in' : 'Create your account'}>
        <span className="muted small">
          {mode === 'login' ? 'New to aniyashi?' : 'Already registered?'}{' '}
          <Link to={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link>
        </span>
      </PageHead>

      <form className="panel auth-form" onSubmit={submit}>
        <div className="panel-body">
          {error ? <div className="alert alert-error">{error}</div> : null}

          {mode === 'register' ? (
            <>
              <label className="field">
                <span>Username</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={24}
                  placeholder="otaku_1998"
                />
                {fields.username ? <em className="field-error">{fields.username}</em> : null}
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
                {fields.email ? <em className="field-error">{fields.email}</em> : null}
              </label>
            </>
          ) : (
            <label className="field">
              <span>Username or email</span>
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
              {fields.identifier ? <em className="field-error">{fields.identifier}</em> : null}
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
            {fields.password ? <em className="field-error">{fields.password}</em> : null}
          </label>

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="muted small">
            Passwords are hashed with scrypt on the server. Sessions use an HTTP-only cookie. Guest browsing and playback never require an account.
          </p>
        </div>
      </form>
    </div>
  );
}
