import { Link } from 'react-router-dom';
import { PageHead, useDocumentTitle } from '../components/Bits';

export function AboutPage() {
  useDocumentTitle('About aniyashi');
  return (
    <div className="page page-narrow prose">
      <PageHead title="About aniyashi" />
      <p>
        aniyashi is an anime discovery and streaming browser. The catalog is served live from public metadata providers, so it is not limited to a
        hand-written sample list. Playback is only offered for episodes published by the rights holders themselves, on channels that permit embedding.
      </p>
      <h2>What aniyashi does</h2>
      <ul>
        <li>Live search across the metadata provider, with pagination, filters and suggestions.</li>
        <li>Detail pages with artwork, synopsis, studios, relations, characters and recommendations.</li>
        <li>A streaming resolver that only returns verified, embeddable official sources.</li>
        <li>Real playback progress, watchlists, favorites and history.</li>
      </ul>
      <h2>What aniyashi does not do</h2>
      <ul>
        <li>It does not scrape pirate streaming sites or re-host commercial anime.</li>
        <li>It does not invent video identifiers, sources, qualities or subtitle tracks.</li>
        <li>It does not bypass regional restrictions, DRM or embedding permissions.</li>
      </ul>
      <p>
        Availability changes over time. Every episode carries its own verification state, and an episode is never marked playable only because a URL
        exists.
      </p>
    </div>
  );
}

export function PrivacyPage() {
  useDocumentTitle('Privacy');
  return (
    <div className="page page-narrow prose">
      <PageHead title="Privacy policy" />
      <p>aniyashi stores as little as possible. This page describes exactly what is kept.</p>
      <h2>Guest use</h2>
      <p>
        Browsing, searching and playback work without an account. Guest playback progress is stored in your browser&apos;s local storage and never leaves
        your device.
      </p>
      <h2>Accounts</h2>
      <p>
        If you register, the server stores your username, email, a scrypt password hash, your role and your preferences. Watch progress, watchlists and
        favorites are linked to your account so they follow you across devices.
      </p>
      <h2>Cookies</h2>
      <p>
        One HTTP-only session cookie is used to keep you signed in. There are no advertising or analytics cookies.
      </p>
      <h2>Your controls</h2>
      <p>
        You can export your data as JSON and delete your account from the settings page. Deleting the account removes your profile, progress, lists and
        sessions.
      </p>
      <h2>Third parties</h2>
      <p>
        Metadata is fetched from public anime databases. Embedded video is served by the original publisher&apos;s player, which applies its own privacy
        policy.
      </p>
    </div>
  );
}

export function TermsPage() {
  useDocumentTitle('Terms of use');
  return (
    <div className="page page-narrow prose">
      <PageHead title="Terms of use" />
      <p>
        aniyashi is a discovery interface. It does not claim ownership of any anime, artwork or video. All video is played through the publisher&apos;s own
        embedded player under that publisher&apos;s terms.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use the service to redistribute content you do not have rights to.</li>
        <li>Do not attempt to bypass regional restrictions or access controls.</li>
        <li>Do not abuse the API with automated request floods.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        Metadata and streaming availability come from external providers and may change without notice. Episode availability states are shown honestly
        rather than assumed.
      </p>
      <h2>Accounts</h2>
      <p>You are responsible for keeping your credentials safe. Abusive accounts may be restricted by an administrator.</p>
    </div>
  );
}

export function CopyrightPage() {
  useDocumentTitle('Copyright');
  return (
    <div className="page page-narrow prose">
      <PageHead title="Copyright and content rights" />
      <p>
        aniyashi links to official publisher channels and plays their embedded players. Artwork and metadata are displayed from public metadata
        providers under their terms.
      </p>
      <h2>Reporting content</h2>
      <p>
        If you are a rights holder and believe a source listed here is not authorized, use the Report control on the watch page or contact the site
        operator. Reported sources are queued for administrator review and can be removed from the catalog.
      </p>
      <h2>No re-hosting</h2>
      <p>aniyashi does not host, mirror, transcode or redistribute commercial anime video files.</p>
    </div>
  );
}

export function HelpPage() {
  useDocumentTitle('Help');
  return (
    <div className="page page-narrow prose">
      <PageHead title="Help and frequently asked questions" />
      <h2>Why does an anime show &ldquo;No authorized source&rdquo;?</h2>
      <p>
        Metadata coverage and streaming coverage are different things. aniyashi lists every title the metadata provider knows about, but it only plays
        episodes that a rights holder publishes in an embeddable player. Most titles have no such source, and the app says so instead of showing a broken
        player.
      </p>
      <h2>Why is a source marked &ldquo;Region restricted&rdquo;?</h2>
      <p>
        Publishers limit some videos to specific countries. aniyashi never uses a proxy or VPN to work around that. You will see the restriction stated
        plainly.
      </p>
      <h2>Where is my progress stored?</h2>
      <p>
        Guests: in this browser. Signed-in users: on the server, tied to the account, so it syncs across devices.
      </p>
      <h2>How do I search a whole franchise?</h2>
      <p>
        Type the franchise name and open the full results page. Every installment is a separate record with its own episodes, so movies, OVAs and
        specials appear next to the main series.
      </p>
      <h2>Keyboard shortcuts</h2>
      <p>
        Space or K play/pause, J and L skip 10 seconds, arrows seek and change volume, F fullscreen, M mute, N next episode, Escape exits expanded modes.
      </p>
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="page page-narrow">
      <div className="state-box">
        <strong>That page does not exist</strong>
        <p>The link may be outdated. Try the catalog or search for the title you want.</p>
        <div className="state-box-action">
          <Link className="btn btn-primary" to="/browse">
            Browse anime
          </Link>
          <Link className="btn" to="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
