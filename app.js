/**
 * YouTube Shorts Player - Pure Vanilla JavaScript (Direct Embed Architecture)
 * - Zero external SDK dependencies (bypasses www-widgetapi.js origin errors)
 * - Works both on GitHub Pages (HTTP/HTTPS) and local file:// previews
 * - Pure vertical view (9:16 locked, zero overlays)
 * - Full swipe gestures (touch, mouse drag, mouse wheel, keyboard)
 * - Click anywhere to toggle Play / Pause
 */

(function () {
  'use strict';

  // Video list used for immediate local preview or as a fallback
  const FALLBACK_VIDEOS = [
    "https://www.youtube.com/shorts/kJQP7kiw5Fk",
    "https://www.youtube.com/shorts/9bZkp7q19f0",
    "https://www.youtube.com/shorts/M7lc1UVf-VE",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/L_LUpnjgPso"
  ];

  // Application State
  let videos = [];
  let currentIndex = 0;
  let isMuted = true;
  let isPlaying = true;
  let hasUserInteracted = false;
  const mountedIframes = {};

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
   * Extract YouTube 11-char video ID from URL or raw string
   */
  function extractVideoId(entry) {
    if (!entry) return null;
    let input = (typeof entry === 'object') ? (entry.url || entry.id || '') : String(entry);
    input = input.trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    const match = input.match(/(?:shorts\/|v=|embed\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  /**
   * Load video list.
   * Browsers block fetch() on file:/// due to CORS, so we detect file: protocol
   * and load FALLBACK_VIDEOS instantly without triggering any CORS error.
   */
  async function loadVideosData() {
    if (window.location.protocol === 'file:') {
      console.info('Running via local file:// protocol. Using default video list. Deploy to GitHub Pages or run a local server (python3 -m http.server) to load custom video.json.');
      return parseVideos(FALLBACK_VIDEOS);
    }

    try {
      let response = await fetch('video.json', { cache: 'no-cache' });
      if (!response.ok) {
        response = await fetch('videos.json', { cache: 'no-cache' });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('Empty array');
      return parseVideos(data);
    } catch (err) {
      console.warn('Could not fetch video.json, using fallback list:', err.message);
      return parseVideos(FALLBACK_VIDEOS);
    }
  }

  /**
   * Normalize video URLs into video items
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
   * Render slide DOM containers
   */
  function renderSlides() {
    track.innerHTML = '';
    videos.forEach((video, index) => {
      const slide = document.createElement('div');
      slide.className = 'short-slide';
      slide.id = `slide-${index}`;

      slide.innerHTML = `
        <!-- Video thumbnail preview -->
        <img class="slide-poster" id="poster-${index}" src="${video.posterUrl}" alt="" loading="lazy" />

        <!-- IFrame mount container -->
        <div class="player-container" id="player-container-${index}"></div>

        <!-- Gesture & Click overlay -->
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
   * Mount a YouTube iframe inside slide container using standard embed URL
   */
  function mountIframe(index, shouldAutoplay) {
    if (index < 0 || index >= videos.length) return;
    if (mountedIframes[index]) {
      if (shouldAutoplay) {
        sendCommand(mountedIframes[index], 'playVideo');
        if (!isMuted) sendCommand(mountedIframes[index], 'unMute');
      }
      return;
    }

    const container = document.getElementById(`player-container-${index}`);
    if (!container) return;

    const video = videos[index];
    const iframe = document.createElement('iframe');
    iframe.id = `yt-iframe-${index}`;

    // Pass origin parameter only when running over http/https
    const originParam = window.location.protocol.startsWith('http')
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : '';

    // Standard YouTube embed URL with required parameters
    iframe.src = `https://www.youtube.com/embed/${video.id}?autoplay=${shouldAutoplay ? 1 : 0}&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${video.id}&playsinline=1&enablejsapi=1&rel=0${originParam}`;
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('tabindex', '-1');

    iframe.onload = () => {
      // Hide poster once video iframe has finished rendering
      setTimeout(() => {
        const poster = document.getElementById(`poster-${index}`);
        if (poster) poster.classList.add('hidden');
      }, 350);
    };

    container.appendChild(iframe);
    mountedIframes[index] = iframe;
  }

  /**
   * Send command to YouTube iframe via postMessage with targetOrigin '*'
   * This completely bypasses origin mismatch errors on file:// and https://
   */
  function sendCommand(iframe, func, args) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args || []
      }), '*');
    } catch (e) {
      console.warn('postMessage error:', e);
    }
  }

  /**
   * Listen to state events from YouTube iframes
   */
  window.addEventListener('message', (event) => {
    if (!event.origin.includes('youtube')) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.event === 'onStateChange') {
        if (data.info === 1) { // Playing
          isPlaying = true;
          document.getElementById(`poster-${currentIndex}`)?.classList.add('hidden');
        } else if (data.info === 2) { // Paused
          isPlaying = false;
        }
      } else if (data.event === 'infoDelivery' && data.info && data.info.playerState !== undefined) {
        if (data.info.playerState === 1) {
          isPlaying = true;
          document.getElementById(`poster-${currentIndex}`)?.classList.add('hidden');
        } else if (data.info.playerState === 2) {
          isPlaying = false;
        }
      }
    } catch (e) {}
  });

  /**
   * Toggle Play / Pause on current video
   */
  function togglePlayPause() {
    const iframe = mountedIframes[currentIndex];
    if (!iframe) return;

    // First user tap enables audio
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      isMuted = false;
      sendCommand(iframe, 'unMute');
    }

    if (isPlaying) {
      sendCommand(iframe, 'pauseVideo');
      isPlaying = false;
      showRippleAnimation(currentIndex, 'pause');
    } else {
      sendCommand(iframe, 'playVideo');
      isPlaying = true;
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
    if (mountedIframes[prevIndex]) {
      sendCommand(mountedIframes[prevIndex], 'pauseVideo');
    }

    // Animate track translation
    track.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)';
    track.style.transform = `translateY(-${currentIndex * 100}%)`;

    updateAmbientBackdrop();

    // Mount and play target video
    mountIframe(currentIndex, true);
    isPlaying = true;

    // Preload next video
    if (currentIndex + 1 < videos.length) {
      mountIframe(currentIndex + 1, false);
    }

    // Free memory of distant iframes
    cleanupDistantIframes();
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
   * Destroy iframes more than 1 slide away to keep memory ultra low
   */
  function cleanupDistantIframes() {
    Object.keys(mountedIframes).forEach((key) => {
      const idx = parseInt(key, 10);
      if (Math.abs(idx - currentIndex) > 1) {
        const iframe = mountedIframes[idx];
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        delete mountedIframes[idx];

        // Restore preview poster
        const poster = document.getElementById(`poster-${idx}`);
        if (poster) poster.classList.remove('hidden');
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

    // 1. Detect Click / Tap -> Toggle Play/Pause
    if (distanceY < 12 && distanceX < 12 && elapsedTime < 350) {
      track.style.transform = `translateY(-${currentIndex * 100}%)`;
      togglePlayPause();
      return;
    }

    // 2. Detect Swipe Up -> Next Video
    if (deltaY < -50 || (deltaY < -20 && elapsedTime < 220)) {
      if (currentIndex < videos.length - 1) {
        goToVideo(currentIndex + 1);
      } else {
        track.style.transform = `translateY(-${currentIndex * 100}%)`;
      }
      return;
    }

    // 3. Detect Swipe Down -> Previous Video
    if (deltaY > 50 || (deltaY > 20 && elapsedTime < 220)) {
      if (currentIndex > 0) {
        goToVideo(currentIndex - 1);
      } else {
        track.style.transform = `translateY(-${currentIndex * 100}%)`;
      }
      return;
    }

    // 4. Snap back if gesture wasn't a swipe
    track.style.transform = `translateY(-${currentIndex * 100}%)`;
  }

  /**
   * Handle Mouse Wheel
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
   * Keyboard Shortcuts
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
      const iframe = mountedIframes[currentIndex];
      if (iframe) {
        sendCommand(iframe, isMuted ? 'mute' : 'unMute');
      }
    }
  }

  /**
   * Application Bootstrapper
   */
  async function initApp() {
    initGestureEngine();
    videos = await loadVideosData();

    if (videos.length === 0) return;

    renderSlides();

    if (initialLoader) {
      initialLoader.classList.add('hidden');
    }

    // Check if opened via local file:/// (which triggers YouTube Error 153)
    if (window.location.protocol === 'file:') {
      showFileProtocolWarning();
    }

    // Mount first video and preload second video
    mountIframe(0, true);
    if (videos.length > 1) {
      mountIframe(1, false);
    }
  }

  /**
   * Display friendly guide if opened via file:/// without an HTTP server
   */
  function showFileProtocolWarning() {
    const warning = document.createElement('div');
    warning.className = 'protocol-warning';
    warning.innerHTML = `
      <div class="warning-card">
        <div class="warning-icon">⚠️</div>
        <h3>YouTube Embed Error 153 (file://)</h3>
        <p>YouTube's servers block video embeds loaded directly from <code>file:///</code> without an HTTP web origin.</p>
        <div class="warning-cmd">
          <code>python3 -m http.server 8080</code>
        </div>
        <p class="warning-sub">Run the command above in your terminal, then open <strong>http://localhost:8080</strong>.<br>(On GitHub Pages, this works automatically!)</p>
        <button class="dismiss-btn" onclick="this.closest('.protocol-warning').remove()">Dismiss</button>
      </div>
    `;
    document.getElementById('player-shell')?.appendChild(warning);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
