import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { apiListRows, apiRandom, apiSearch, type Anime } from '../lib/api';
import { episodeCountLabel, formatLabel, playable, shortDate } from '../lib/format';
import { useAuth } from '../state/auth';
import { Cover, useDebounced } from './Bits';

const DRAWER_LINKS: { to: string; label: string }[] = [
  { to: '/home', label: 'Home' },
  { to: '/browse', label: 'Browse Anime' },
  { to: '/trending', label: 'Trending' },
  { to: '/popular', label: 'Popular' },
  { to: '/top-rated', label: 'Top Rated' },
  { to: '/latest-episodes', label: 'Latest Episodes' },
  { to: '/movies', label: 'Movies' },
  { to: '/seasonal', label: 'Currently Airing' },
  { to: '/upcoming', label: 'Upcoming' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/genres', label: 'Genres' },
  { to: '/random', label: 'Random Anime' },
  { to: '/continue-watching', label: 'Continue Watching' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/favorites', label: 'Favorites' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

export function NavBar() {
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Anime[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const debounced = useDebounced(query, 280);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const term = debounced.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }
    const controller = new AbortController();
    setLoadingSuggestions(true);
    apiSearch({ q: term, perPage: 7 })
      .then((result) => {
        if (controller.signal.aborted) return;
        setSuggestions(result.items.slice(0, 7));
        setActiveIndex(-1);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSuggestions(false);
      });
    return () => controller.abort();
  }, [debounced]);

  useEffect(() => {
    if (!user) {
      setWatchlistCount(0);
      return;
    }
    apiListRows('watchlist')
      .then((data) => setWatchlistCount(data.items.length))
      .catch(() => setWatchlistCount(0));
  }, [user]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        setOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const showSuggestions = open && query.trim().length >= 2;
  const activeSuggestion = useMemo(() => suggestions[activeIndex], [suggestions, activeIndex]);

  function submitSearch(term: string) {
    const value = term.trim();
    if (!value) return;
    setOpen(false);
    setDrawerOpen(false);
    navigate(`/browse?q=${encodeURIComponent(value)}`);
  }

  async function goRandom() {
    setDrawerOpen(false);
    try {
      const data = await apiRandom();
      navigate(`/anime/${data.anime.id}`);
    } catch {
      navigate('/browse');
    }
  }

  return (
    <>
      <header className="nav">
        <div className="nav-left">
          <button className="nav-icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" type="button">
            <span aria-hidden="true">☰</span>
          </button>
          <Link className="logo" to="/home" aria-label="aniyashi home">
            <span className="logo-mark" aria-hidden="true">
              A
            </span>
            aniyashi
          </Link>
          <nav className="nav-links" aria-label="Primary">
            <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/browse">
              Browse
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/seasonal">
              Airing
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/movies">
              Movies
            </NavLink>
            <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/schedule">
              Schedule
            </NavLink>
          </nav>
        </div>

        <div className="search-wrap" ref={boxRef}>
          <form
            className="search-field"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch(activeSuggestion ? activeSuggestion.title.display : query);
            }}
          >
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              placeholder="Search anime — Naruto, One Piece, Gundam…"
              aria-label="Search anime"
              aria-expanded={showSuggestions}
              aria-controls="search-suggestions"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, -1));
                } else if (event.key === 'Enter' && activeSuggestion) {
                  event.preventDefault();
                  setOpen(false);
                  navigate(`/anime/${activeSuggestion.id}`);
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
            {query ? (
              <button
                className="search-clear"
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                }}
              >
                ×
              </button>
            ) : null}
          </form>

          {showSuggestions ? (
            <div className="suggestions" id="search-suggestions" role="listbox">
              {loadingSuggestions && suggestions.length === 0 ? <div className="suggestion-empty">Searching the live catalog…</div> : null}
              {!loadingSuggestions && suggestions.length === 0 ? (
                <div className="suggestion-empty">No matching anime. Try another spelling.</div>
              ) : null}
              {suggestions.map((anime, index) => (
                <button
                  key={anime.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`suggestion${index === activeIndex ? ' is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/anime/${anime.id}`);
                  }}
                  type="button"
                >
                  <Cover src={anime.coverMedium ?? anime.cover} alt={anime.title.display} className="suggestion-thumb" />
                  <span className="suggestion-body">
                    <span className="suggestion-title">{anime.title.display}</span>
                    <span className="suggestion-meta">
                      {[formatLabel(anime.format), anime.seasonYear ?? anime.year, episodeCountLabel(anime.episodes)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {anime.title.english && anime.title.english !== anime.title.display ? (
                      <span className="suggestion-alt">{anime.title.english}</span>
                    ) : null}
                  </span>
                  {anime.playback && anime.playback.availableEpisodes > 0 ? <span className="chip chip-verified">Playable</span> : null}
                </button>
              ))}
              <button className="suggestion-all" type="button" onClick={() => submitSearch(query)}>
                View all results for “{query.trim()}”
              </button>
            </div>
          ) : null}
        </div>

        <div className="nav-actions">
          <Link className="nav-icon-btn" to="/continue-watching" title="Quick access: continue watching" aria-label="Continue watching">
            <span aria-hidden="true">▷</span>
          </Link>
          <Link className="nav-icon-btn" to="/schedule" title="Anime schedule" aria-label="Anime schedule">
            <span aria-hidden="true">▦</span>
          </Link>
          <button className="nav-icon-btn" onClick={goRandom} title="Random anime" aria-label="Random anime" type="button">
            <span aria-hidden="true">⤨</span>
          </button>
          <Link className="nav-icon-btn" to="/watchlist" title="Watchlist" aria-label="Watchlist">
            <span aria-hidden="true">♡</span>
            {watchlistCount > 0 ? <span className="nav-count">{watchlistCount}</span> : null}
          </Link>
          <Link className="nav-icon-btn" to="/notifications" title="Notifications" aria-label="Notifications">
            <span aria-hidden="true">◔</span>
          </Link>
          {user ? (
            <div className="user-menu">
              <button className="avatar" onClick={() => setMenuOpen((value) => !value)} type="button" aria-haspopup="menu" aria-expanded={menuOpen}>
                {(user.displayName || user.username).slice(0, 2).toUpperCase()}
              </button>
              {menuOpen ? (
                <div className="user-menu-pop" role="menu">
                  <Link role="menuitem" to="/profile" onClick={() => setMenuOpen(false)}>
                    Profile
                  </Link>
                  <Link role="menuitem" to="/watchlist" onClick={() => setMenuOpen(false)}>
                    Watchlist
                  </Link>
                  <Link role="menuitem" to="/settings" onClick={() => setMenuOpen(false)}>
                    Settings
                  </Link>
                  {isAdmin ? (
                    <Link role="menuitem" to="/admin/diagnostics" onClick={() => setMenuOpen(false)}>
                      Admin diagnostics
                    </Link>
                  ) : null}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      await logout();
                      navigate('/home');
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Link className="btn btn-sm btn-primary" to="/login">
              Sign in
            </Link>
          )}
        </div>
      </header>

      {drawerOpen ? (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} role="presentation" />
          <aside className="drawer" aria-label="Navigation">
            <div className="drawer-head">
              <span className="logo">
                <span className="logo-mark" aria-hidden="true">
                  A
                </span>
                aniyashi
              </span>
              <button className="nav-icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu" type="button">
                ×
              </button>
            </div>
            <h4>Browse</h4>
            {DRAWER_LINKS.slice(0, 12).map((link) => (
              <NavLink key={link.to} className="drawer-link" to={link.to} onClick={() => setDrawerOpen(false)}>
                {link.label}
              </NavLink>
            ))}
            <h4>My aniyashi</h4>
            {DRAWER_LINKS.slice(12).map((link) => (
              <NavLink key={link.to} className="drawer-link" to={link.to} onClick={() => setDrawerOpen(false)}>
                {link.label}
              </NavLink>
            ))}
            <h4>Site</h4>
            <NavLink className="drawer-link" to="/about" onClick={() => setDrawerOpen(false)}>
              About
            </NavLink>
            <NavLink className="drawer-link" to="/copyright" onClick={() => setDrawerOpen(false)}>
              Copyright &amp; sources
            </NavLink>
            {isAdmin ? (
              <NavLink className="drawer-link" to="/admin" onClick={() => setDrawerOpen(false)}>
                Administration
              </NavLink>
            ) : null}
          </aside>
        </>
      ) : null}
    </>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>aniyashi — Omega Infinity V5</span>
        <span className="footer-links">
          <Link to="/about">About</Link>
          <Link to="/help">Help</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/copyright">Copyright</Link>
        </span>
        <span className="muted small">Metadata by AniList · Playback from official publisher channels only</span>
      </div>
    </footer>
  );
}

export function LatestStrip({ items }: { items: { id: number; title: string; cover: string | null; episode: number; airingAt: number }[] }) {
  if (!items.length) return null;
  return (
    <ul className="latest-strip">
      {items.slice(0, 12).map((item) => (
        <li key={`${item.id}-${item.episode}`}>
          <Link to={`/anime/${item.id}`}>
            <Cover src={item.cover} alt={item.title} className="latest-thumb" />
            <span>
              <strong>{item.title}</strong>
              <em>
                EP {item.episode} · {shortDate(item.airingAt)}
              </em>
            </span>
            {playable('unverified') ? null : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
