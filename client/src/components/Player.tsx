import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackSource } from '../lib/api';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: (() => void) | null;
  }
}

let ytLoader: Promise<any> | null = null;

function loadYouTubeApi(): Promise<any> {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytLoader) return ytLoader;
  ytLoader = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The YouTube player script did not load in time.')), 20_000);
    const done = () => {
      window.clearTimeout(timeout);
      resolve(window.YT);
    };
    const existing = document.getElementById('youtube-iframe-api');
    if (existing) {
      window.onYouTubeIframeAPIReady = done;
      return;
    }
    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Could not reach the YouTube player script. Check the network connection.'));
    };
    window.onYouTubeIframeAPIReady = done;
    document.head.appendChild(script);
  });
  return ytLoader;
}

export type PlayerState =
  | 'connecting'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'autoplay-blocked'
  | 'unavailable'
  | 'error';

const ERROR_MESSAGES: Record<number, { message: string; state: PlayerState }> = {
  2: { message: 'The player rejected the video parameters (error 2).', state: 'error' },
  5: { message: 'The browser could not play this video (HTML5 error 5).', state: 'error' },
  100: { message: 'This episode is no longer available from the publisher (error 100).', state: 'unavailable' },
  101: { message: 'The publisher does not permit embedding this episode (error 101).', state: 'unavailable' },
  150: { message: 'The publisher does not permit embedding this episode (error 150).', state: 'unavailable' },
  153: { message: 'YouTube needs a valid page referrer (error 153). Open aniyashi in a normal browser tab and retry.', state: 'error' },
};

export function Player({
  source,
  episodeNumber,
  autoPlay,
  startAt = 0,
  onProgress,
  onPlaying,
  onEnded,
}: {
  source: PlaybackSource;
  episodeNumber: number;
  autoPlay: boolean;
  startAt?: number;
  onProgress?: (position: number, duration: number) => void;
  onPlaying?: () => void;
  onEnded?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [state, setState] = useState<PlayerState>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const isYouTube = source.playbackType === 'youtube' && Boolean(source.embedId);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    stopTimer();
    const player = playerRef.current;
    playerRef.current = null;
    if (player && typeof player.destroy === 'function') {
      try {
        player.destroy();
      } catch {
        /* player already gone */
      }
    }
    if (hostRef.current) hostRef.current.innerHTML = '';
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const position = Number(player.getCurrentTime?.() ?? 0);
      const duration = Number(player.getDuration?.() ?? 0);
      if (duration > 0) onProgress?.(position, duration);
    }, 4000);
  }, [onProgress, stopTimer]);

  // YouTube path
  useEffect(() => {
    if (!isYouTube) return;
    let cancelled = false;
    mountedRef.current = true;
    setState('connecting');
    setMessage(null);

    const initTimer = window.setTimeout(() => {
      if (!cancelled && mountedRef.current) {
        setState('error');
        setMessage('The player did not initialize. This can happen when the network blocks YouTube.');
      }
    }, 22_000);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const target = document.createElement('div');
        target.style.width = '100%';
        target.style.height = '100%';
        hostRef.current.innerHTML = '';
        hostRef.current.appendChild(target);

        playerRef.current = new YT.Player(target, {
          videoId: source.embedId,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: autoPlay ? 1 : 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: any) => {
              window.clearTimeout(initTimer);
              if (cancelled) return;
              setState('ready');
              if (startAt > 3) {
                try {
                  event.target.seekTo(startAt, true);
                } catch {
                  /* seek before metadata is harmless */
                }
              }
              if (autoPlay) {
                try {
                  event.target.playVideo();
                } catch {
                  setState('autoplay-blocked');
                }
              }
              startTimer();
            },
            onStateChange: (event: any) => {
              if (cancelled) return;
              const value = event.data;
              if (value === 1) {
                setState('playing');
                setMessage(null);
                onPlaying?.();
              } else if (value === 2) {
                setState('paused');
              } else if (value === 3) {
                setState('buffering');
              } else if (value === 0) {
                setState('ended');
                stopTimer();
                onEnded?.();
              }
            },
            onError: (event: any) => {
              window.clearTimeout(initTimer);
              const mapped = ERROR_MESSAGES[Number(event.data)];
              setState(mapped?.state ?? 'error');
              setMessage(mapped?.message ?? `Playback failed (YouTube error ${event.data}).`);
            },
          },
        });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        window.clearTimeout(initTimer);
        setState('error');
        setMessage(error.message);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      destroyPlayer();
    };
  }, [isYouTube, source.embedId, autoPlay, startAt, nonce, destroyPlayer, onEnded, onPlaying, startTimer, stopTimer]);

  // Native MP4 / HLS / DASH path
  useEffect(() => {
    if (isYouTube) return;
    mountedRef.current = true;
    setState('connecting');
    setMessage(null);
    const element = hostRef.current?.querySelector('video') as HTMLVideoElement | null;
    if (!element) return;
    const url = source.url || source.embedUrl || '';
    if (!url) {
      setState('unavailable');
      setMessage('This source did not provide a playable media URL.');
      return;
    }

    let hls: any = null;
    let cancelled = false;

    const onLoaded = () => {
      if (cancelled) return;
      setState('ready');
      if (startAt > 3) element.currentTime = startAt;
      if (autoPlay) element.play().catch(() => setState('autoplay-blocked'));
    };
    const onTimeUpdate = () => {
      if (!cancelled && element.duration > 0) onProgress?.(element.currentTime, element.duration);
    };
    const onPlay = () => {
      setState('playing');
      onPlaying?.();
    };
    const onPause = () => setState('paused');
    const onWaiting = () => setState('buffering');
    const onEnd = () => {
      setState('ended');
      onEnded?.();
    };
    const onError = () => {
      setState('error');
      setMessage('The media could not be loaded from this source.');
    };

    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element.addEventListener('waiting', onWaiting);
    element.addEventListener('ended', onEnd);
    element.addEventListener('error', onError);

    if (url.endsWith('.m3u8') && !element.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true });
            hls.loadSource(url);
            hls.attachMedia(element);
            hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
              if (data?.fatal) {
                setState('error');
                setMessage(`HLS playback failed: ${data.details ?? 'unknown error'}.`);
              }
            });
          } else {
            element.src = url;
          }
        })
        .catch(() => {
          setState('error');
          setMessage('The HLS engine could not be loaded.');
        });
    } else {
      element.src = url;
    }

    return () => {
      cancelled = true;
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
      element.removeEventListener('waiting', onWaiting);
      element.removeEventListener('ended', onEnd);
      element.removeEventListener('error', onError);
      if (hls) hls.destroy();
      element.removeAttribute('src');
      element.load();
    };
  }, [isYouTube, source.url, source.embedUrl, autoPlay, startAt, nonce, onProgress, onPlaying, onEnded]);

  const overlayVisible = state === 'error' || state === 'unavailable' || state === 'autoplay-blocked';

  return (
    <div className="player-shell">
      <div className="player-frame">
        {isYouTube ? <div ref={hostRef} className="player-host" /> : <video ref={undefined} controls playsInline preload="metadata" />}
        {overlayVisible ? (
          <div className="player-overlay" role="alert">
            <h3>{state === 'autoplay-blocked' ? 'Autoplay was blocked' : state === 'unavailable' ? 'Episode unavailable' : 'Playback error'}</h3>
            <p>{message ?? 'The browser blocked automatic playback. Press play to start.'}</p>
            <div className="player-overlay-actions">
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => {
                  setNonce((value) => value + 1);
                  setState('connecting');
                  setMessage(null);
                }}
              >
                Retry player
              </button>
              {source.watchUrl ? (
                <a className="btn btn-sm" href={source.watchUrl} target="_blank" rel="noreferrer noopener">
                  Watch on {source.channel ?? 'the publisher'}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="player-status" aria-live="polite">
        <span className="chip chip-outline">Episode {episodeNumber}</span>
        <span className={`player-state is-${state}`}>
          {state === 'connecting' && 'Connecting to the official player…'}
          {state === 'ready' && 'Ready'}
          {state === 'playing' && 'Playing'}
          {state === 'paused' && 'Paused'}
          {state === 'buffering' && 'Buffering…'}
          {state === 'ended' && 'Finished'}
          {state === 'autoplay-blocked' && 'Press play to start'}
          {state === 'unavailable' && 'Unavailable'}
          {state === 'error' && 'Playback error'}
        </span>
        <span className="muted small">
          {source.providerName}
          {source.audioLanguage ? ` · ${source.audioLanguage}` : ''}
          {source.subtitleLanguages && source.subtitleLanguages.length > 0 ? ` · subtitles: ${source.subtitleLanguages.join(', ')}` : ''}
        </span>
      </div>
    </div>
  );
}
