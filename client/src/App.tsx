import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRandom } from './lib/api';
import { NavBar } from './components/NavBar';
import { StateBox } from './components/Bits';
import { useAuth } from './state/auth';
import HomePage from './pages/HomePage';
import BrowsePage from './pages/BrowsePage';
import DetailPage from './pages/DetailPage';
import WatchPage from './pages/WatchPage';
import ListPage from './pages/ListPage';
import SchedulePage from './pages/SchedulePage';
import LibraryPage from './pages/LibraryPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import AuthPage from './pages/AuthPage';
import AdminPage from './pages/AdminPage';
import { AboutPage, CopyrightPage, HelpPage, NotFoundPage, PrivacyPage, TermsPage } from './pages/StaticPages';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function RandomRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    apiRandom()
      .then((data) => navigate(`/anime/${data.anime.id}`, { replace: true }))
      .catch(() => navigate('/browse', { replace: true }));
  }, [navigate]);
  return (
    <div className="page">
      <StateBox title="Finding a random anime">Choosing a title from the live catalog.</StateBox>
    </div>
  );
}

function GenreRedirect() {
  const { genre } = useParams();
  return <Navigate to={`/browse?genre=${encodeURIComponent(genre ?? '')}`} replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="page">
        <StateBox title="Checking access">Verifying your administrator session.</StateBox>
      </div>
    );
  }
  if (!user || !isAdmin) {
    return (
      <div className="page page-narrow">
        <StateBox title="Administrator access only" action={<Link className="btn btn-primary" to="/login">Sign in</Link>}>
          This page controls providers, playback verification and reports. Sign in with an administrator account to continue.
        </StateBox>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <NavBar />
      <main id="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/search" element={<BrowsePage />} />
          <Route path="/anime/:id" element={<DetailPage />} />
          <Route path="/watch/:id/:episode" element={<WatchPage />} />
          <Route path="/trending" element={<ListPage preset="trending" />} />
          <Route path="/trending/:page" element={<ListPage preset="trending" />} />
          <Route path="/popular" element={<ListPage preset="popular" />} />
          <Route path="/popular/:page" element={<ListPage preset="popular" />} />
          <Route path="/top-rated" element={<ListPage preset="top-rated" />} />
          <Route path="/top-rated/:page" element={<ListPage preset="top-rated" />} />
          <Route path="/latest-episodes" element={<ListPage preset="latest-episodes" />} />
          <Route path="/recently-updated" element={<ListPage preset="recently-updated" />} />
          <Route path="/upcoming" element={<ListPage preset="upcoming" />} />
          <Route path="/seasonal" element={<ListPage preset="seasonal" />} />
          <Route path="/movies" element={<ListPage preset="movies" />} />
          <Route path="/hidden-gems" element={<ListPage preset="hidden-gems" />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/genres" element={<Navigate to="/browse" replace />} />
          <Route path="/genre/:genre" element={<GenreRedirect />} />
          <Route path="/random" element={<RandomRedirect />} />
          <Route path="/watchlist" element={<LibraryPage kind="watchlist" />} />
          <Route path="/favorites" element={<LibraryPage kind="favorites" />} />
          <Route path="/history" element={<LibraryPage kind="history" />} />
          <Route path="/continue-watching" element={<LibraryPage kind="continue-watching" />} />
          <Route path="/recommendations" element={<Navigate to="/browse" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<HelpPage />} />
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="/admin/providers" element={<AdminRoute><AdminPage view="providers" /></AdminRoute>} />
          <Route path="/admin/diagnostics" element={<AdminRoute><AdminPage view="overview" /></AdminRoute>} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/copyright" element={<CopyrightPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <strong className="footer-brand">aniyashi</strong>
            <p className="muted small">
              Anime discovery with live metadata and verified official playback sources. No re-hosted video, no invented sources.
            </p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link to="/browse">Browse</Link>
            <Link to="/schedule">Schedule</Link>
            <Link to="/about">About</Link>
            <Link to="/help">Help</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/copyright">Copyright</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
