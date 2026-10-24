/**
 * YouTube Shorts Player - Pure Vanilla JavaScript
 * Features:
 * - Dynamic data loaded strictly from videos.json (GitHub Pages ready, zero backend)
 * - Pure vertical orientation layout (9:16 locked, no auto rotate)
 * - Smooth swipe up / down gestures (Touch, Mouse drag, Wheel, Keyboard)
 * - Click/tap on video to toggle Play / Pause with pop animation
 * - Smart player lifecycle & memory management (preloading, auto cleanup)
 * - Autoplay policy compliance with tap-to-unmute audio support
 */

(function () {
  'use strict';

  // Fallback videos in case videos.json is accessed via local file:// protocol
  const FALLBACK_VIDEOS = [
    {
      "url": "https://www.youtube.com/shorts/kJQP7kiw5Fk",
      "title": "Incredible Duo Trickshots 🎯",
      "channel": "TrickShots",
      "description": "Never give up on the first try! #shorts #viral #trickshot"
    },
    {
      "url": "https://www.youtube.com/shorts/9bZkp7q19f0",
      "title": "Smooth Dance Moves 🔥",
      "channel": "DanceDaily",
      "description": "Rate this performance from 1 to 10! #shorts #dance #trending"
    },
    {
      "url": "https://www.youtube.com/shorts/M7lc1UVf-VE",
      "title": "Building the Future of Code 💻",
      "channel": "DevShorts",
      "description": "What are you building today? #shorts #programming #tech"
    },
    {
      "url": "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "title": "Timeless Classic Vibes 🎶",
      "channel": "RetroBeats",
      "description": "You already know what this is! 🕺 #shorts #music #legend"
    },
    {
      "url": "https://www.youtube.com/shorts/L_LUpnjgPso",
      "title": "Oddly Satisfying Art Moments ✨",
      "channel": "SatisfyingVisuals",
      "description": "Wait until the very end... #shorts #satisfying #art"
    }
  ];

  // Application State
  let videos = [];
  let currentIndex = 0;
  let isMuted = true;
  let hasUserInteracted = false;
  const players = {}; // Map of slideIndex -> YT.Player instance
  let ytApiReady = false;
  let progressInterval = null;

  // Gesture State
  let isDragging = false;
  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let currentX = 0;
  let startTime = 0;
  let isWheelThrottled = false;

  // DOM Elements
  const track = document.getElementById('shorts-track');
  const viewport = document.getElementById('viewport');
  const initialLoader = document.getElementById('initial-loader');
  const counterBadge = document.getElementById('counter-badge');
  const soundBtn = document.getElementById('sound-btn');
  const soundIconMuted = soundBtn.querySelector('.icon-muted');
  const soundIconSound = soundBtn.querySelector('.icon-sound');
  const unmuteBanner = document.getElementById('unmute-banner');
  const ambientGlow = document.getElementById('ambient-glow');
  const navPrevBtn = document.getElementById('nav-prev-btn');
  const navNextBtn = document.getElementById('nav-next-btn');
  const toast = document.getElementById('toast');

  /**
   * Extract an 11-character YouTube video ID from various URL patterns or raw ID
   */
  function extractVideoId(entry) {
    if (!entry) return null;
    let input = (typeof entry === 'object') ? (entry.id || entry.url || '') : String(entry);
    input = input.trim();

    // 11-char direct ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    // Standard YouTube URL formats: /shorts/ID, /watch?v=ID, youtu.be/ID, /embed/ID
    const match = input.match(/(?:shorts\/|v=|embed\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  /**
   * Format numbers (e.g. 12500 -> "12.5K")
   */
  function formatLikes(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  }

  /**
   * Load video list from videos.json (fallback if local file:// blocks fetch)
   */
  async function loadVideosData() {
    try {
      const response = await fetch('videos.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('Empty array in videos.json');
      return parseVideos(data);
    } catch (err) {
      console.warn('Could not fetch videos.json (using built-in fallback):', err.message);
      return parseVideos(FALLBACK_VIDEOS);
    }
  }

  /**
   * Normalize raw items to structured video objects
   */
  function parseVideos(rawData) {
    const list = [];
    rawData.forEach((item, index) => {
      const videoId = extractVideoId(item);
      if (videoId) {
        const title = (typeof item === 'object' && item.title) ? item.title : `YouTube Short #${index + 1}`;
        const channel = (typeof item === 'object' && item.channel) ? item.channel : 'ShortsCreator';
        const description = (typeof item === 'object' && item.description) ? item.description : '#shorts #trending';
        const posterUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        // Generate a pseudo-random like count for realistic UI
        const baseLikes = 2500 + ((index * 379) % 85000);

        list.push({
          id: videoId,
          title: title,
          channel: channel,
          description: description,
          posterUrl: posterUrl,
          likes: baseLikes,
          isLiked: false
        });
      }
    });
    return list;
  }

  /**
   * Render all slides into the vertical track
   */
  function renderSlides() {
    track.innerHTML = '';
    videos.forEach((video, index) => {
      const slide = document.createElement('div');
      slide.className = 'short-slide';
      slide.id = `slide-${index}`;

      slide.innerHTML = `
        <!-- High-res preview thumbnail poster -->
        <img class="slide-poster" id="poster-${index}" src="${video.posterUrl}" alt="${escapeHtml(video.title)}" loading="lazy" />

        <!-- Container where YT.Player is mounted -->
        <div class="player-container" id="player-container-${index}">
          <div id="yt-player-${index}"></div>
        </div>

        <!-- Spinner while buffering -->
        <div class="slide-spinner" id="spinner-${index}"></div>

        <!-- Click & gesture overlay layer -->
        <div class="gesture-layer" id="gesture-${index}">
          <div class="action-ripple" id="ripple-${index}">
            <svg class="ripple-play" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <svg class="ripple-pause" viewBox="0 0 24 24" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </div>
        </div>

        <!-- Overlay with video info & side action buttons -->
        <div class="slide-overlay">
          <div class="bottom-container">
            <div class="video-info">
              <div class="channel-info">
                <div class="channel-avatar">${escapeHtml(video.channel.charAt(0).toUpperCase())}</div>
                <span class="channel-name">@${escapeHtml(video.channel)}</span>
              </div>
              <p class="video-title">${escapeHtml(video.title)}</p>
              <p class="video-description">${escapeHtml(video.description)}</p>
              <div class="sound-track">
                <svg class="sound-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <span>Original Sound - ${escapeHtml(video.channel)}</span>
              </div>
            </div>

            <!-- Right-side actions (Like, Share, Open) -->
            <div class="side-actions">
              <div class="action-item">
                <button class="action-btn like-btn" id="like-btn-${index}" data-index="${index}" aria-label="Like video">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                </button>
                <span class="action-label" id="like-count-${index}">${formatLikes(video.likes)}</span>
              </div>

              <div class="action-item">
                <button class="action-btn share-btn" id="share-btn-${index}" data-id="${video.id}" aria-label="Share video">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                </button>
                <span class="action-label">Share</span>
              </div>

              <div class="action-item">
                <a class="action-btn external-btn" href="https://www.youtube.com/shorts/${video.id}" target="_blank" rel="noopener noreferrer" aria-label="Open on YouTube">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
                <span class="action-label">YouTube</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Video progress bar at the bottom -->
        <div class="progress-bar-container">
          <div class="progress-bar-fill" id="progress-bar-${index}"></div>
        </div>
      `;

      track.appendChild(slide);
    });

    attachSlideActionEvents();
    updateCounterBadge();
    updateAmbientBackdrop();
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Attach Like and Share button listeners
   */
  function attachSlideActionEvents() {
    videos.forEach((video, index) => {
      // Like button
      const likeBtn = document.getElementById(`like-btn-${index}`);
      if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLike(index);
        });
      }

      // Share button
      const shareBtn = document.getElementById(`share-btn-${index}`);
      if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          shareVideo(video.id);
        });
      }
    });
  }

  /**
   * Toggle Like state with visual feedback
   */
  function toggleLike(index) {
    const video = videos[index];
    const btn = document.getElementById(`like-btn-${index}`);
    const countEl = document.getElementById(`like-count-${index}`);
    if (!video || !btn || !countEl) return;

    video.isLiked = !video.isLiked;
    if (video.isLiked) {
      video.likes += 1;
      btn.classList.add('liked');
    } else {
      video.likes -= 1;
      btn.classList.remove('liked');
    }
    countEl.textContent = formatLikes(video.likes);
  }

  /**
   * Share / Copy YouTube Short URL
   */
  function shareVideo(videoId) {
    const url = `https://www.youtube.com/shorts/${videoId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('Short link copied to clipboard!'))
        .catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Short link copied to clipboard!');
    } catch (e) {
      showToast('Could not copy link');
    }
    document.body.removeChild(textarea);
  }

  /**
   * Show animated toast message
   */
  let toastTimeout = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  /**
   * Initialize or retrieve YouTube Player instance for a slide
   */
  function initPlayerForSlide(index) {
    if (index < 0 || index >= videos.length) return;
    if (players[index]) {
      // Already created
      if (index === currentIndex) {
        playActiveVideo(index);
      }
      return;
    }

    const video = videos[index];
    const containerId = `yt-player-${index}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      players[index] = new YT.Player(containerId, {
        videoId: video.id,
        playerVars: {
          autoplay: index === currentIndex ? 1 : 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          loop: 1,
          playlist: video.id, // Mandatory for YT loop
          fs: 0,
          disablekb: 1,
          enablejsapi: 1,
          iv_load_policy: 3,
          origin: window.location.origin === 'null' ? undefined : window.location.origin
        },
        events: {
          onReady: (event) => onPlayerReady(index, event),
          onStateChange: (event) => onPlayerStateChange(index, event),
          onError: (event) => onPlayerError(index, event)
        }
      });
    } catch (err) {
      console.error(`Failed to initialize YT.Player for slide ${index}:`, err);
    }
  }

  /**
   * Player onReady event
   */
  function onPlayerReady(index, event) {
    const player = event.target;
    if (isMuted) {
      player.mute();
    } else {
      player.unMute();
    }

    if (index === currentIndex) {
      player.playVideo();
    }
  }

  /**
   * Player onStateChange event
   */
  function onPlayerStateChange(index, event) {
    const poster = document.getElementById(`poster-${index}`);
    const spinner = document.getElementById(`spinner-${index}`);

    if (event.data === YT.PlayerState.PLAYING) {
      if (poster) poster.classList.add('hidden');
      if (spinner) spinner.classList.add('hidden');
      if (index === currentIndex) {
        startProgressTracking(index);
        updateAmbientBackdrop();
      }
    } else if (event.data === YT.PlayerState.BUFFERING) {
      if (spinner) spinner.classList.remove('hidden');
    } else if (event.data === YT.PlayerState.PAUSED) {
      if (spinner) spinner.classList.add('hidden');
      stopProgressTracking();
    } else if (event.data === YT.PlayerState.ENDED) {
      // Loop seamlessly
      if (players[index] && typeof players[index].seekTo === 'function') {
        players[index].seekTo(0);
        players[index].playVideo();
      }
    }
  }

  /**
   * Player onError event (embed restricted or private)
   */
  function onPlayerError(index, event) {
    console.warn(`YouTube Player error on video ${index} (${videos[index]?.id}): Code ${event.data}`);
    const slide = document.getElementById(`slide-${index}`);
    const spinner = document.getElementById(`spinner-${index}`);
    if (spinner) spinner.classList.add('hidden');

    if (slide && !slide.querySelector('.slide-error')) {
      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'slide-error';
      errorOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#ff4444" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>This video cannot be embedded (${event.data === 101 || event.data === 150 ? 'Owner restricted playback' : 'Unavailable'}).</p>
        <button class="skip-btn" id="skip-btn-${index}">Next Video ➔</button>
      `;
      slide.appendChild(errorOverlay);

      document.getElementById(`skip-btn-${index}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        nextVideo();
      });
    }
  }

  /**
   * Play active video and handle mute state
   */
  function playActiveVideo(index) {
    const player = players[index];
    if (player && typeof player.playVideo === 'function') {
      if (isMuted) {
        player.mute();
      } else {
        player.unMute();
      }
      player.playVideo();
      startProgressTracking(index);
    }
  }

  /**
   * Toggle Play / Pause on active slide
   */
  function togglePlayPause() {
    const player = players[currentIndex];
    if (!player || typeof player.getPlayerState !== 'function') return;

    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
      showRippleAnimation(currentIndex, 'pause');
    } else {
      // First interaction unmutes if needed or establishes user gesture
      if (!hasUserInteracted) {
        enableAudio();
      }
      player.playVideo();
      showRippleAnimation(currentIndex, 'play');
    }
  }

  /**
   * Show center ripple animation on tap
   */
  function showRippleAnimation(index, type) {
    const ripple = document.getElementById(`ripple-${index}`);
    if (!ripple) return;

    const playSvg = ripple.querySelector('.ripple-play');
    const pauseSvg = ripple.querySelector('.ripple-pause');

    if (type === 'play') {
      playSvg.style.display = 'block';
      pauseSvg.style.display = 'none';
    } else {
      playSvg.style.display = 'none';
      pauseSvg.style.display = 'block';
    }

    ripple.classList.remove('show');
    // Force reflow
    void ripple.offsetWidth;
    ripple.classList.add('show');

    setTimeout(() => {
      ripple.classList.remove('show');
    }, 450);
  }

  /**
   * Enable audio upon user interaction (bypasses browser autoplay lock)
   */
  function enableAudio() {
    hasUserInteracted = true;
    isMuted = false;
    updateMuteUI();
    unmuteBanner.classList.add('hidden');

    const activePlayer = players[currentIndex];
    if (activePlayer && typeof activePlayer.unMute === 'function') {
      activePlayer.unMute();
    }
  }

  /**
   * Toggle mute / unmute button
   */
  function toggleSound() {
    isMuted = !isMuted;
    if (!isMuted) hasUserInteracted = true;
    unmuteBanner.classList.add('hidden');
    updateMuteUI();

    const activePlayer = players[currentIndex];
    if (activePlayer) {
      if (isMuted && typeof activePlayer.mute === 'function') {
        activePlayer.mute();
      } else if (!isMuted && typeof activePlayer.unMute === 'function') {
        activePlayer.unMute();
      }
    }
  }

  function updateMuteUI() {
    if (isMuted) {
      soundIconMuted.style.display = 'block';
      soundIconSound.style.display = 'none';
    } else {
      soundIconMuted.style.display = 'none';
      soundIconSound.style.display = 'block';
    }
  }

  /**
   * Navigate to slide index
   */
  function goToVideo(targetIndex) {
    if (targetIndex < 0 || targetIndex >= videos.length) return;
    if (targetIndex === currentIndex) return;

    const prevIndex = currentIndex;
    currentIndex = targetIndex;

    // Pause previous video
    const prevPlayer = players[prevIndex];
    if (prevPlayer && typeof prevPlayer.pauseVideo === 'function') {
      prevPlayer.pauseVideo();
    }

    // Animate track translation
    track.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)';
    track.style.transform = `translateY(-${currentIndex * 100}%)`;

    updateCounterBadge();
    updateAmbientBackdrop();

    // Initialize or play current video
    initPlayerForSlide(currentIndex);

    // Preload next video for instant swipe response
    if (currentIndex + 1 < videos.length) {
      initPlayerForSlide(currentIndex + 1);
    }

    // Garbage-collect distant players to preserve memory and prevent sound leaks
    cleanupDistantPlayers();
  }

  function nextVideo() {
    if (currentIndex < videos.length - 1) {
      goToVideo(currentIndex + 1);
    } else {
      // Loop back to beginning if desired or bounce
      showToast('You have reached the end of the shorts!');
    }
  }

  function prevVideo() {
    if (currentIndex > 0) {
      goToVideo(currentIndex - 1);
    }
  }

  /**
   * Destroy players farther than 1 slide away and rebuild placeholder
   */
  function cleanupDistantPlayers() {
    Object.keys(players).forEach((key) => {
      const idx = parseInt(key, 10);
      if (Math.abs(idx - currentIndex) > 1) {
        if (players[idx] && typeof players[idx].destroy === 'function') {
          try {
            players[idx].destroy();
          } catch (e) {
            console.warn(e);
          }
          delete players[idx];

          // Rebuild DOM placeholder div so it can be re-initialized when visited again
          const container = document.getElementById(`player-container-${idx}`);
          if (container) {
            container.innerHTML = `<div id="yt-player-${idx}"></div>`;
          }
        }
      }
    });
  }

  /**
   * Track current video playback progress
   */
  function startProgressTracking(index) {
    stopProgressTracking();
    progressInterval = setInterval(() => {
      const player = players[index];
      if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
        const current = player.getCurrentTime();
        const duration = player.getDuration();
        if (duration > 0) {
          const pct = Math.min(100, Math.max(0, (current / duration) * 100));
          const fill = document.getElementById(`progress-bar-${index}`);
          if (fill) fill.style.width = `${pct}%`;
        }
      }
    }, 100);
  }

  function stopProgressTracking() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  /**
   * Update header badges & navigation buttons state
   */
  function updateCounterBadge() {
    if (counterBadge) {
      counterBadge.textContent = `${currentIndex + 1} / ${videos.length}`;
    }
    if (navPrevBtn) {
      navPrevBtn.disabled = currentIndex === 0;
    }
    if (navNextBtn) {
      navNextBtn.disabled = currentIndex === videos.length - 1;
    }
  }

  /**
   * Update desktop ambient glow background
   */
  function updateAmbientBackdrop() {
    if (!ambientGlow || !videos[currentIndex]) return;
    ambientGlow.style.backgroundImage = `url('${videos[currentIndex].posterUrl}')`;
  }

  /**
   * Gesture Engine (Swipe Up / Down + Click/Tap detection)
   */
  function initGestureEngine() {
    // Touch Events
    viewport.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp, { passive: false });
    window.addEventListener('touchcancel', onPointerUp, { passive: false });

    // Mouse Drag Events for Desktop
    viewport.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    // Desktop Mouse Wheel
    viewport.addEventListener('wheel', onWheel, { passive: false });

    // Keyboard Navigation
    window.addEventListener('keydown', onKeyDown);

    // Unmute Banner Click
    unmuteBanner.addEventListener('click', (e) => {
      e.stopPropagation();
      enableAudio();
    });

    // Top Sound Button
    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSound();
    });

    // Desktop Navigation Buttons
    navPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      prevVideo();
    });

    navNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nextVideo();
    });
  }

  function getEventCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
      return { y: e.touches[0].clientY, x: e.touches[0].clientX };
    }
    return { y: e.clientY, x: e.clientX };
  }

  function onPointerDown(e) {
    // Ignore clicks on buttons/links
    if (e.target.closest('button') || e.target.closest('a')) return;

    isDragging = true;
    const coords = getEventCoordinates(e);
    startY = coords.y;
    startX = coords.x;
    currentY = startY;
    currentX = startX;
    startTime = Date.now();

    viewport.classList.add('grabbing');
    track.style.transition = 'none';
  }

  function onPointerMove(e) {
    if (!isDragging) return;

    const coords = getEventCoordinates(e);
    currentY = coords.y;
    currentX = coords.x;

    const deltaY = currentY - startY;
    const deltaX = currentX - startX;

    // Prevent screen scroll if dragging vertically
    if (Math.abs(deltaY) > Math.abs(deltaX) && e.cancelable) {
      e.preventDefault();
    }

    // Apply boundary resistance if at top or bottom
    let resistance = 1.0;
    if ((currentIndex === 0 && deltaY > 0) || (currentIndex === videos.length - 1 && deltaY < 0)) {
      resistance = 0.28;
    }

    const appliedDelta = deltaY * resistance;
    track.style.transform = `translateY(calc(-${currentIndex * 100}% + ${appliedDelta}px))`;
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove('grabbing');

    const deltaY = currentY - startY;
    const deltaX = currentX - startX;
    const elapsedTime = Date.now() - startTime;
    const distanceY = Math.abs(deltaY);
    const distanceX = Math.abs(deltaX);

    // Restore smooth CSS transition
    track.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)';

    // 1. Detect Click / Tap (Movement less than 12px within 350ms)
    if (distanceY < 12 && distanceX < 12 && elapsedTime < 350) {
      track.style.transform = `translateY(-${currentIndex * 100}%)`;
      togglePlayPause();
      return;
    }

    // 2. Detect Swipe Up (Next Video)
    if (deltaY < -50 || (deltaY < -20 && elapsedTime < 220)) {
      if (currentIndex < videos.length - 1) {
        goToVideo(currentIndex + 1);
      } else {
        track.style.transform = `translateY(-${currentIndex * 100}%)`;
      }
      return;
    }

    // 3. Detect Swipe Down (Previous Video)
    if (deltaY > 50 || (deltaY > 20 && elapsedTime < 220)) {
      if (currentIndex > 0) {
        goToVideo(currentIndex - 1);
      } else {
        track.style.transform = `translateY(-${currentIndex * 100}%)`;
      }
      return;
    }

    // 4. Default: Snap back to current slide
    track.style.transform = `translateY(-${currentIndex * 100}%)`;
  }

  /**
   * Handle Mouse Wheel with smooth cooldown
   */
  function onWheel(e) {
    e.preventDefault();
    if (isWheelThrottled) return;
    if (Math.abs(e.deltaY) < 25) return;

    isWheelThrottled = true;
    if (e.deltaY > 0) {
      nextVideo();
    } else {
      prevVideo();
    }

    setTimeout(() => {
      isWheelThrottled = false;
    }, 550);
  }

  /**
   * Handle Keyboard Navigation
   */
  function onKeyDown(e) {
    if (['ArrowDown', 'PageDown', 'j', 'J'].includes(e.key)) {
      e.preventDefault();
      nextVideo();
    } else if (['ArrowUp', 'PageUp', 'k', 'K'].includes(e.key)) {
      e.preventDefault();
      prevVideo();
    } else if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (['m', 'M'].includes(e.key)) {
      e.preventDefault();
      toggleSound();
    } else if (['l', 'L'].includes(e.key)) {
      e.preventDefault();
      toggleLike(currentIndex);
    }
  }

  /**
   * Main Initialization
   */
  async function initApp() {
    initGestureEngine();
    videos = await loadVideosData();

    if (videos.length === 0) {
      initialLoader.innerHTML = '<p class="loader-text" style="color:#ff5555">No video links found in videos.json</p>';
      return;
    }

    renderSlides();

    // Check if YouTube API is already loaded
    if (ytApiReady) {
      onAllReady();
    }
  }

  function onAllReady() {
    if (initialLoader) {
      initialLoader.classList.add('hidden');
    }
    // Mount first video player and preload second
    initPlayerForSlide(0);
    if (videos.length > 1) {
      initPlayerForSlide(1);
    }
  }

  // Hook for YouTube Iframe API ready callback
  window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    if (videos.length > 0) {
      onAllReady();
    }
  };

  // Launch application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
