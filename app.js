/**
 * YouTube Shorts Player - Pure Vanilla JavaScript (Pure Video View)
 * Features:
 * - Dynamic data loaded strictly from videos.json (GitHub Pages ready, zero backend)
 * - Zero overlay contents: only the video is displayed
 * - Pure vertical orientation layout (9:16 locked, no auto rotate)
 * - Smooth swipe up / down gestures (Touch, Mouse drag, Wheel, Keyboard)
 * - Click/tap on video to toggle Play / Pause
 * - Smart player lifecycle & memory management (preloading, auto cleanup)
 */

(function () {
  'use strict';

  // Fallback videos in case videos.json is accessed via local file:// protocol
  const FALLBACK_VIDEOS = [
    { "url": "https://www.youtube.com/shorts/kJQP7kiw5Fk" },
    { "url": "https://www.youtube.com/shorts/9bZkp7q19f0" },
    { "url": "https://www.youtube.com/shorts/M7lc1UVf-VE" },
    { "url": "https://www.youtube.com/shorts/dQw4w9WgXcQ" },
    { "url": "https://www.youtube.com/shorts/L_LUpnjgPso" }
  ];

  // Application State
  let videos = [];
  let currentIndex = 0;
  let isMuted = true;
  let hasUserInteracted = false;
  const players = {}; // Map of slideIndex -> YT.Player instance
  let ytApiReady = false;

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
  const ambientGlow = document.getElementById('ambient-glow');

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
    rawData.forEach((item) => {
      const videoId = extractVideoId(item);
      if (videoId) {
        list.push({
          id: videoId,
          posterUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        });
      }
    });
    return list;
  }

  /**
   * Render clean slides without any overlays (only the video)
   */
  function renderSlides() {
    track.innerHTML = '';
    videos.forEach((video, index) => {
      const slide = document.createElement('div');
      slide.className = 'short-slide';
      slide.id = `slide-${index}`;

      slide.innerHTML = `
        <!-- Preview thumbnail poster (hidden once playing) -->
        <img class="slide-poster" id="poster-${index}" src="${video.posterUrl}" alt="" loading="lazy" />

        <!-- Container where YT.Player is mounted -->
        <div class="player-container" id="player-container-${index}">
          <div id="yt-player-${index}"></div>
        </div>

        <!-- Transparent gesture & click layer over the video -->
        <div class="gesture-layer" id="gesture-${index}">
          <div class="action-ripple" id="ripple-${index}">
            <svg class="ripple-play" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <svg class="ripple-pause" viewBox="0 0 24 24" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </div>
        </div>
      `;

      track.appendChild(slide);
    });

    updateAmbientBackdrop();
  }

  /**
   * Initialize or retrieve YouTube Player instance for a slide
   */
  function initPlayerForSlide(index) {
    if (index < 0 || index >= videos.length) return;
    if (players[index]) {
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
          playlist: video.id, // Loop requires playlist
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

    if (event.data === YT.PlayerState.PLAYING) {
      if (poster) poster.classList.add('hidden');
      if (index === currentIndex) {
        updateAmbientBackdrop();
      }
    } else if (event.data === YT.PlayerState.ENDED) {
      // Loop video seamlessly
      if (players[index] && typeof players[index].seekTo === 'function') {
        players[index].seekTo(0);
        players[index].playVideo();
      }
    }
  }

  /**
   * Player onError event
   */
  function onPlayerError(index, event) {
    console.warn(`YouTube Player error on video ${index} (${videos[index]?.id}): Code ${event.data}`);
    const slide = document.getElementById(`slide-${index}`);

    if (slide && !slide.querySelector('.slide-error')) {
      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'slide-error';
      errorOverlay.innerHTML = `
        <p>Video unavailable (${event.data === 101 || event.data === 150 ? 'Owner restricted playback' : 'Error'}).</p>
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
    }
  }

  /**
   * Toggle Play / Pause on active slide
   */
  function togglePlayPause() {
    const player = players[currentIndex];
    if (!player || typeof player.getPlayerState !== 'function') return;

    // First user tap enables audio
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      isMuted = false;
      player.unMute();
    }

    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
      showRippleAnimation(currentIndex, 'pause');
    } else {
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
    void ripple.offsetWidth; // Force reflow
    ripple.classList.add('show');

    setTimeout(() => {
      ripple.classList.remove('show');
    }, 450);
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

          const container = document.getElementById(`player-container-${idx}`);
          if (container) {
            container.innerHTML = `<div id="yt-player-${idx}"></div>`;
          }
        }
      }
    });
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
  }

  function getEventCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
      return { y: e.touches[0].clientY, x: e.touches[0].clientX };
    }
    return { y: e.clientY, x: e.clientX };
  }

  function onPointerDown(e) {
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

    if (Math.abs(deltaY) > Math.abs(deltaX) && e.cancelable) {
      e.preventDefault();
    }

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

    // 1. Detect Click / Tap (Movement less than 12px within 350ms) -> Toggle Play/Pause
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

    // 4. Default: Snap back
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
      isMuted = !isMuted;
      const player = players[currentIndex];
      if (player) {
        if (isMuted) player.mute();
        else player.unMute();
      }
    }
  }

  /**
   * Main Initialization
   */
  async function initApp() {
    initGestureEngine();
    videos = await loadVideosData();

    if (videos.length === 0) return;

    renderSlides();

    if (ytApiReady) {
      onAllReady();
    }
  }

  function onAllReady() {
    if (initialLoader) {
      initialLoader.classList.add('hidden');
    }
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
