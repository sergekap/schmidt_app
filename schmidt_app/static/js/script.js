document.addEventListener("DOMContentLoaded", function() {
  // Forcer le scroll en haut de la page immédiatement
  window.scrollTo(0, 0);

  // ==============================
  // Inactivité
  // ==============================
  let inactivityTimer = null;
  let countdownTimer = null;
  let countdownValue = 15;
  const INACTIVITY_DELAY = 60000; // 1 min
  const COUNTDOWN_DURATION = 15;  // 15 s

  const inactivityModal   = document.getElementById('inactivityModal');
  const countdownElement  = document.getElementById('countdownTimer');
  const continueBtn       = document.getElementById('continueBtn');
  const resetBtn          = document.getElementById('resetBtn');

  function resetToInitialState() {
    if (carouselModal && carouselModal.classList.contains('active')) closeCarousel();
    if (isFullscreenMode) closeFullscreen();
    const facadesButton = document.querySelector('[data-section="facades"]');
    if (facadesButton) selectButton(facadesButton);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==============================
// Inactivité
// ==============================
let preCountdownTimer = null;   // <— NEW: interval avant le pop


function startCountdown() {
  countdownValue = COUNTDOWN_DURATION;
  countdownElement.textContent = countdownValue;

  // LOG au démarrage du modal
  //console.log(`[inactivity] Modal ouvert — décompte ${countdownValue}s`);

  countdownTimer = setInterval(() => {
    countdownValue--;
    countdownElement.textContent = countdownValue;

    // LOG chaque seconde dans le modal
    //console.log(`[inactivity] Modal — reste ${countdownValue}s`);

    if (countdownValue <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;

      //console.log("[inactivity] Modal terminé — retour à l'état initial");
      hideInactivityModal();
      resetToInitialState();
    }
  }, 1000);
}

  function isInInitialState() {
    const facadesButton = document.querySelector('[data-section="facades"]');
    const isFacadesActive = facadesButton && facadesButton.classList.contains('active');
    const isAtTop = window.pageYOffset <= 50;
    const isCarouselClosed = !carouselModal || !carouselModal.classList.contains('active');
    const isFullscreenClosed = !isFullscreenMode;
    return isFacadesActive && isAtTop && isCarouselClosed && isFullscreenClosed;
  }

  function showInactivityModal() {
    if (isInInitialState()) { resetInactivityTimer(); return; }
    inactivityModal.classList.add('active');
    startCountdown();
  }
  function hideInactivityModal() {
    inactivityModal.classList.remove('active');
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (preCountdownTimer) { clearInterval(preCountdownTimer); preCountdownTimer = null; }

  if (!inactivityModal.classList.contains('active')) {
    // Programme le pop
    inactivityTimer = setTimeout(showInactivityModal, INACTIVITY_DELAY);

    // NEW: pré-compte à rebours en console avant l’ouverture du pop
    let remaining = Math.ceil(INACTIVITY_DELAY / 1000);
    //console.log(`[inactivity] Inactif — pop dans ${remaining}s`);
    preCountdownTimer = setInterval(() => {
      remaining--;
      // LOG chaque seconde avant l'ouverture du modal
      //console.log(`[inactivity] Pop d'inactivité dans ${remaining}s`);
      if (remaining <= 0) {
        clearInterval(preCountdownTimer);
        preCountdownTimer = null;
      }
    }, 1000);
  }
}


  continueBtn.addEventListener('click', () => { hideInactivityModal(); resetInactivityTimer(); });
  resetBtn.addEventListener('click',  () => { hideInactivityModal(); resetToInitialState(); resetInactivityTimer(); });

  const activityEvents = [
    'mousedown','mousemove','mouseup','click',
    'touchstart','touchmove','touchend',
    'scroll','wheel','keydown','keyup'
  ];
  activityEvents.forEach(t => document.addEventListener(t, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();

  // ==============================
  // Scroll & navigation
  // ==============================
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    document.documentElement.style.scrollBehavior = 'auto';
    let touchStartY = 0; let isScrollingTouch = false;
    document.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; isScrollingTouch = false; }, { passive: true });
    document.addEventListener('touchmove',  e => {
      if (!isScrollingTouch) {
        const deltaY = touchStartY - e.touches[0].clientY;
        if (Math.abs(deltaY) > 10) isScrollingTouch = true;
      }
    }, { passive: true });
    let scrollTimeout;
    document.addEventListener('touchmove', () => {
      document.body.classList.add('scrolling');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => document.body.classList.remove('scrolling'), 150);
    }, { passive: true });
  }

  const navButtons          = document.querySelectorAll(".nav-button");
  const facadesSubsections  = document.querySelector(".facades-subsections");
  const plansSubsections    = document.querySelector(".plans-subsections");
  const espacesSubsections  = document.querySelector(".espaces-subsections");
  const ambiancesSubsections= document.querySelector(".ambiances-subsections");
  const scrollToTopBtn      = document.getElementById("scrollToTop");
  const scrollIndicator     = document.getElementById("scrollIndicator");

  function selectButton(selectedButton) {
    navButtons.forEach(b => b.classList.remove("active"));
    selectedButton.classList.add("active");
    const section = selectedButton.getAttribute("data-section");
    facadesSubsections.classList.remove("active");
    plansSubsections.classList.remove("active");
    espacesSubsections.classList.remove("active");
    ambiancesSubsections.classList.remove("active");
    if (section === "facades")  facadesSubsections.classList.add("active");
    if (section === "plans")    plansSubsections.classList.add("active");
    if (section === "espaces")  espacesSubsections.classList.add("active");
    if (section === "ambiances")ambiancesSubsections.classList.add("active");
    resetAnimations();
  }

  navButtons.forEach(button => {
    button.addEventListener("click", function() {
      selectButton(this);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    button.addEventListener("keydown", function(e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectButton(this);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  const facadesButton = document.querySelector('[data-section="facades"]');
  if (facadesButton && !facadesButton.classList.contains("active")) selectButton(facadesButton);

  let ticking = false; let lastScrollTime = 0; const SCROLL_THROTTLE = 16;
  function updateScrollElements() {
    const now = performance.now();
    if (now - lastScrollTime < SCROLL_THROTTLE) { ticking = false; return; }
    lastScrollTime = now;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = (scrollTop / scrollHeight) * 100;
    scrollIndicator.style.width = scrollPercent + '%';
    if (scrollTop > 300) scrollToTopBtn.classList.add('visible');
    else scrollToTopBtn.classList.remove('visible');
    animateOnScroll();
    ticking = false;
  }
  function requestScrollUpdate() { if (!ticking) { requestAnimationFrame(updateScrollElements); ticking = true; } }

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('touchmove', requestScrollUpdate, { passive: true });
  window.addEventListener('touchend',  requestScrollUpdate, { passive: true });
// Bouton "remonter en haut"
if (scrollToTopBtn) {
  // Souris / tap
  scrollToTopBtn.addEventListener('click', () => {
    resetInactivityTimer();                              // <= compter comme activité
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Mobile : on compte aussi le toucher comme activité
  scrollToTopBtn.addEventListener('touchstart', () => {
    resetInactivityTimer();
  }, { passive: true });

  scrollToTopBtn.addEventListener('touchend', () => {
    resetInactivityTimer();
  }, { passive: true });

  // Clavier (accessibilité)
  scrollToTopBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      resetInactivityTimer();                            // <= activité au clavier
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}


  function animateOnScroll() {
    const fadeElements = document.querySelectorAll('.fade-in');
    const windowHeight = window.innerHeight;
    const scrollTop = window.pageYOffset;
    fadeElements.forEach(el => {
      const top = el.offsetTop, bottom = top + el.offsetHeight;
      if ((top < scrollTop + windowHeight - 100) && (bottom > scrollTop)) el.classList.add('visible');
    });
  }
  function resetAnimations() {
    document.querySelectorAll('.fade-in').forEach(el => el.classList.remove('visible'));
    setTimeout(animateOnScroll, 100);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowUp' && e.ctrlKey)      { e.preventDefault(); window.scrollBy({ top: -100, behavior: 'smooth' }); }
    else if (e.key === 'ArrowDown' && e.ctrlKey){ e.preventDefault(); window.scrollBy({ top: 100, behavior: 'smooth' }); }
    else if (e.key === 'Home' && e.ctrlKey)     { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (e.key === 'End' && e.ctrlKey)      { e.preventDefault(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }
  });

  let isScrollingWheel = false;
  window.addEventListener('wheel', () => {
    if (!isScrollingWheel) { isScrollingWheel = true; setTimeout(()=>{ isScrollingWheel = false; }, 50); }
  }, { passive: true });

  window.addEventListener('resize', requestScrollUpdate);

  setTimeout(animateOnScroll, 100);
  window.scrollTo(0,0);
  window.addEventListener('beforeunload', ()=> window.scrollTo(0,0));
  window.addEventListener('pageshow',      ()=> window.scrollTo(0,0));

  function fixImageSources() {
    const bubbleImages = document.querySelectorAll('.bubble-image');
    const exts = ['.jpeg', '.jpg', '.png'];
    bubbleImages.forEach(async (img) => {
      const originalSrc = img.src;
      const ok = await checkImageExists(originalSrc);
      if (ok) return;
      const url = new URL(originalSrc, window.location.origin);
      const parts = url.pathname.split('/');
      const file = parts.pop();
      const dir = parts.join('/');
      const base = file.substring(0, file.lastIndexOf('.'));
      for (const ext of exts) {
        const alt = `${dir}/${base}${ext}`;
        if (await checkImageExists(alt)) { img.src = alt; break; }
      }
    });
  }

  // ==============================
  // Helpers pour comparer des URLs et virer la présentation
  // ==============================
  function stripQueryHash(u) {
    try {
      const url = new URL(u, window.location.origin);
      return url.origin + url.pathname;
    } catch {
      return String(u).split(/[?#]/)[0];
    }
  }
  function sameFile(a, b) { return stripQueryHash(a) === stripQueryHash(b); }

  // ==============================
  // BULLes -> OUVRIR LE CARROUSEL PAR ID (API)
  // ==============================
  async function fetchColorImagesById(id) {
    const r = await fetch(`/api/colors/${encodeURIComponent(id)}/images/`);
    if (!r.ok) throw new Error('GET /api/colors/<id>/images/ failed');
    return r.json();
  }

  // Délégation de clic sur les bulles
  document.addEventListener('click', async function(e) {
    const bubble = e.target.closest('.bubble');
    if (!bubble) return;

    const colorId = bubble.getAttribute('data-color-id');
    const colorName = bubble.getAttribute('data-color-name') ||
                      (bubble.querySelector('.bubble-name')?.textContent || '');

    bubble.style.transform = 'scale(0.95)';
    setTimeout(()=>{ bubble.style.transform=''; }, 150);

    try {
      const data = await fetchColorImagesById(colorId);



      const gallery = (data.gallery || []).map(g => g?.url).filter(Boolean);



      const pres = data.presentation?.url;
      const filtered = pres ? gallery.filter(u => !sameFile(u, pres)) : gallery;



      const seen = new Set();
      const unique = filtered.filter(u => {
        const k = stripQueryHash(u);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (!unique.length) { alert("Aucune image de galerie pour ce coloris."); return; }
      openCarouselWithList(colorName, unique);
    } catch (err) {
      console.error(err);
      alert("Impossible de charger les images de ce coloris.");
    }
  });

  // ==============================
  // Carrousel & plein écran
  // ==============================
  let carouselImages = [];
  let currentImageIndex = 0;
  let totalImages = 0;

  const carouselModal          = document.getElementById("carouselModal");
  const carouselOverlay        = document.getElementById("carouselOverlay");
  const carouselClose          = document.getElementById("carouselClose");
  const carouselTitleColor     = document.getElementById("carouselTitle");
  const carouselTrackContainer = document.getElementById("carouselTrackContainer");
  const carouselTrack          = document.getElementById("carouselTrack");
  const carouselThumbnails     = document.getElementById("carouselThumbnails");
  const carouselPrevBtn        = document.getElementById("carouselPrevBtn");
  const carouselNextBtn        = document.getElementById("carouselNextBtn");

  let startX = 0, startY = 0, currentX = 0, isDragging = false;
  let startTime = 0, lastMoveTime = 0, velocity = 0;

  let fullscreenModal = null;
  let isFullscreenMode = false;

  function createFullscreenModal() {
    if (fullscreenModal) { fullscreenModal.remove(); fullscreenModal = null; }
    fullscreenModal = document.createElement('div');
    fullscreenModal.className = 'fullscreen-modal';
    fullscreenModal.innerHTML = `
      <div class="fullscreen-overlay"></div>
      <div class="fullscreen-container">
        <button class="fullscreen-close" aria-label="Fermer le plein écran">×</button>
        <div class="fullscreen-image-container">
          <img class="fullscreen-image" alt="Image en plein écran">
        </div>
      </div>`;
    document.body.appendChild(fullscreenModal);

    const fullscreenOverlay   = fullscreenModal.querySelector('.fullscreen-overlay');
    const fullscreenClose     = fullscreenModal.querySelector('.fullscreen-close');
    const fullscreenContainer = fullscreenModal.querySelector(".fullscreen-container");

    fullscreenContainer.addEventListener("click", e => e.stopPropagation());
    fullscreenOverlay.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); closeFullscreen(); });
    fullscreenClose.addEventListener('click',   e => { e.preventDefault(); e.stopPropagation(); closeFullscreen(); });

    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape' && isFullscreenMode) { e.preventDefault(); closeFullscreen(); }
    }, { once: true });
  }
  function cleanupFullscreenModals() {
    document.querySelectorAll('.fullscreen-modal').forEach(m => m.remove());
    fullscreenModal = null; isFullscreenMode = false;
  }
  function openFullscreen(imageSrc) {
    cleanupFullscreenModals();
    createFullscreenModal();
    const fullscreenImage = fullscreenModal.querySelector('.fullscreen-image');
    fullscreenImage.src = imageSrc;
    fullscreenModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    isFullscreenMode = true;
  }
  function closeFullscreen() {
    if (fullscreenModal && fullscreenModal.classList.contains('active')) {
      fullscreenModal.classList.remove('active');
      setTimeout(() => {
        cleanupFullscreenModals();
        if (carouselModal && carouselModal.classList.contains('active')) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = '';
      }, 300);
    }
  }

  function openCarouselWithList(title, images) {
    carouselTitleColor.textContent = title;
    carouselImages = images.slice();
    totalImages = carouselImages.length;
    currentImageIndex = 0;
    createInfiniteCarousel();
    createThumbnails();
    carouselModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateSlideContent();
  }

  function closeCarousel() {
    carouselModal.classList.remove('active');
    document.body.style.overflow = '';
    carouselImages = [];
    currentImageIndex = 0;
    totalImages = 0;
    carouselTrack.innerHTML = '';
  }

  function createInfiniteCarousel() {
    carouselTrack.innerHTML = '';
    const slidesToCreate = Math.max(3, totalImages);
    for (let i = 0; i < slidesToCreate; i++) {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      const image = document.createElement('img');
      image.className = 'carousel-image';
      image.alt = `Image ${i + 1}`;
      const counter = document.createElement('div');
      counter.className = 'carousel-counter';
      slide.appendChild(image);
      slide.appendChild(counter);
      carouselTrack.appendChild(slide);
    }
    setupTouchEvents();
    setupCursorManagement();
  }

  function setupCursorManagement() {
    const container = carouselTrackContainer;
    container.addEventListener('mousemove', function(e) {
      const activeSlide = carouselTrack.querySelector('.carousel-slide.active');
      if (!activeSlide) return;
      const activeImage = activeSlide.querySelector('.carousel-image');
      if (!activeImage) return;
      const isOnImage = isPointInDisplayedImage(e.clientX, e.clientY, activeImage);
      activeSlide.style.cursor = isOnImage ? 'zoom-in' : 'default';
    });
    container.addEventListener('mouseleave', function() {
      const activeSlide = carouselTrack.querySelector('.carousel-slide.active');
      if (activeSlide) activeSlide.style.cursor = 'default';
    });
  }

  function updateSlideContent() {
    const slides = carouselTrack.querySelectorAll('.carousel-slide');
    slides.forEach((slide, index) => {
      const image = slide.querySelector('.carousel-image');
      const counter = slide.querySelector('.carousel-counter');
      let imageIndex;
      if (index === 0) {
        imageIndex = (currentImageIndex - 1 + totalImages) % totalImages;
        slide.className = 'carousel-slide prev';
        slide.style.cursor = 'pointer';
      } else if (index === 1) {
        imageIndex = currentImageIndex;
        slide.className = 'carousel-slide active';
        slide.onclick = null;
        slide.style.cursor = 'default';
      } else if (index === 2) {
        imageIndex = (currentImageIndex + 1) % totalImages;
        slide.className = 'carousel-slide next';
        slide.style.cursor = 'pointer';
      } else {
        slide.style.display = 'none';
        return;
      }
      slide.style.display = 'block';
      image.src = carouselImages[imageIndex];
      image.alt = `Image ${imageIndex + 1} de ${carouselTitleColor.textContent}`;
      counter.innerHTML = `<span>${imageIndex + 1}</span> / <span>${totalImages}</span>`;
    });
    updateActiveThumbnail();
  }

  function nextImage() { currentImageIndex = (currentImageIndex + 1) % totalImages; updateSlideContent(); }
  function prevImage() { currentImageIndex = (currentImageIndex - 1 + totalImages) % totalImages; updateSlideContent(); }
  function goToImage(index) { if (index !== currentImageIndex) { currentImageIndex = index; updateSlideContent(); } }

  function setupTouchEvents() {
    const c = carouselTrackContainer;
    c.addEventListener('mousedown', handleStart);
    c.addEventListener('mousemove', handleMove);
    c.addEventListener('mouseup',   handleEnd);
    c.addEventListener('mouseleave',handleEnd);
    c.addEventListener('touchstart',handleStart, { passive: false });
    c.addEventListener('touchmove', handleMove,  { passive: false });
    c.addEventListener('touchend',  handleEnd);
    c.addEventListener('selectstart', e => e.preventDefault());
  }

  function handleStart(e) {
    isDragging = true;
    startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
    startY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
    currentX = startX;
    startTime = Date.now();
    lastMoveTime = startTime;
    velocity = 0;
    e.preventDefault();
  }
  function handleMove(e) {
    if (!isDragging) return;
    const prevX = currentX;
    currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
    const deltaX = currentX - startX;
    const t = Date.now(); const dt = t - lastMoveTime;
    if (dt > 0) velocity = (currentX - prevX) / dt;
    lastMoveTime = t;
    const activeSlide = carouselTrack.querySelector('.carousel-slide.active');
    if (activeSlide) {
      const dragAmount = deltaX * 0.4;
      const resistance = Math.abs(deltaX) > 100 ? 0.7 : 1;
      activeSlide.style.transform = `translateX(${dragAmount * resistance}px)`;
      activeSlide.style.transition = 'none';
    }
    e.preventDefault();
  }

  function getImageDisplayedDimensions(img) {
    const r = img.getBoundingClientRect();
    const cw = r.width, ch = r.height;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const ir = nw/nh, cr = cw/ch;
    let dw, dh;
    if (ir > cr) { dw = cw; dh = cw/ir; }
    else { dh = ch; dw = ch*ir; }
    const ox = (cw - dw)/2, oy = (ch - dh)/2;
    return { left: r.left+ox, top: r.top+oy, right: r.left+ox+dw, bottom: r.top+oy+dh };
  }
  function isPointInDisplayedImage(x,y,img) {
    const d = getImageDisplayedDimensions(img);
    return d ? (x>=d.left && x<=d.right && y>=d.top && y<=d.bottom) : false;
  }

  function handleEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    const deltaX = currentX - startX;
    const distance = Math.abs(deltaX);
    const timeElapsed = Date.now() - startTime;

    const minSwipeThreshold = 30;
    const velocityThreshold = 0.5;
    const maxClickTime = 300;
    const maxClickDistance = 10;

    const activeSlide = carouselTrack.querySelector('.carousel-slide.active');
    if (activeSlide) { activeSlide.style.transition='none'; activeSlide.style.transform=''; }

    const isClickOrTap = distance <= maxClickDistance && timeElapsed <= maxClickTime;
    if (isClickOrTap) {
      const clickedSlide = (e.target).closest('.carousel-slide');
      if (clickedSlide) {
        if (clickedSlide.classList.contains('next')) { nextImage(); return; }
        if (clickedSlide.classList.contains('prev')) { prevImage(); return; }
        if (clickedSlide.classList.contains('active')) {
          const activeImage = clickedSlide.querySelector('.carousel-image');
          let cx, cy;
          if (e.type === 'mouseup') { cx = e.clientX; cy = e.clientY; }
          else if (e.changedTouches && e.changedTouches.length) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
          if (activeImage && cx!=null && cy!=null && isPointInDisplayedImage(cx,cy,activeImage)) {
            openFullscreen(carouselImages[currentImageIndex]);
            return;
          }
        }
      }
    }

    const isSwipe = Math.abs(velocity) > velocityThreshold || distance > minSwipeThreshold;
    if (isSwipe) { if (deltaX > 0) prevImage(); else nextImage(); }
  }

  function createThumbnails() {
    carouselThumbnails.innerHTML = '';
    carouselImages.forEach((src, i) => {
      const t = document.createElement('img');
      t.src = src; t.alt = `Miniature ${i+1}`; t.className = 'carousel-thumbnail';
      t.addEventListener('click', () => goToImage(i));
      carouselThumbnails.appendChild(t);
    });
    updateActiveThumbnail();
    setupThumbnailsScroll();
  }
  function setupThumbnailsScroll() {
    let isScrolling=false, startX=0, scrollLeft=0;
    carouselThumbnails.addEventListener('touchstart', e=>{ isScrolling=true; startX=e.touches[0].pageX - carouselThumbnails.offsetLeft; scrollLeft=carouselThumbnails.scrollLeft; }, { passive:true });
    carouselThumbnails.addEventListener('touchmove',  e=>{ if(!isScrolling) return; e.preventDefault(); const x=e.touches[0].pageX - carouselThumbnails.offsetLeft; const walk=(x-startX)*2; carouselThumbnails.scrollLeft = scrollLeft - walk; }, { passive:false });
    carouselThumbnails.addEventListener('touchend',   ()=>{ isScrolling=false; }, { passive:true });
    carouselThumbnails.addEventListener('wheel', e=>{ e.preventDefault(); carouselThumbnails.scrollLeft += e.deltaY; }, { passive:false });
  }
  function updateActiveThumbnail() {
    const thumbs = carouselThumbnails.querySelectorAll('.carousel-thumbnail');
    thumbs.forEach((t,i)=> t.classList.toggle('active', i===currentImageIndex));
    scrollToActiveThumbnail();
  }
  function scrollToActiveThumbnail() {
    const active = carouselThumbnails.querySelector('.carousel-thumbnail.active');
    if (!active) return;
    const container = carouselThumbnails;
    const left = active.offsetLeft;
    const width = active.offsetWidth;
    const cWidth = container.offsetWidth;
    const cur = container.scrollLeft;
    const visible = (left >= cur && left + width <= cur + cWidth);
    if (!visible) {
      const newLeft = left - (cWidth/2) + (width/2);
      container.scrollTo({ left: Math.max(0,newLeft), behavior: 'smooth' });
    }
  }

  // Boutons nav (souris + tactile)
  function handleNavButtonClick(e, action){ e.preventDefault(); e.stopPropagation(); action(); }
  carouselPrevBtn.addEventListener('mousedown',  e => handleNavButtonClick(e, prevImage));
  carouselPrevBtn.addEventListener('touchstart', e => handleNavButtonClick(e, prevImage));
  carouselNextBtn.addEventListener('mousedown',  e => handleNavButtonClick(e, nextImage));
  carouselNextBtn.addEventListener('touchstart', e => handleNavButtonClick(e, nextImage));

  // Fermer le carrousel
  carouselClose.addEventListener('click', closeCarousel);
  carouselOverlay.addEventListener('click', closeCarousel);
  document.addEventListener('keydown', e => { if (e.key==='Escape' && carouselModal.classList.contains('active')) closeCarousel(); });
  document.addEventListener('keydown', e => {
    if (!carouselModal.classList.contains('active')) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prevImage(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nextImage(); }
  });

  // ==============================
// Plein écran  ZOOM (zoom/pinch/double-tap bloqués)
// ==============================

function applyTransform(img){ img.style.transform = ""; }
function resetZoomAndPan(img){ img.style.transform = ""; }

let gestureListenersBound = false;

function setupFullscreenNoZoom(img){
  img.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  img.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });

  img.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });

  let lastTouchEnd = 0;
  img.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
      e.stopPropagation();
    }
    lastTouchEnd = now;
  }, { passive: false });

  if (!gestureListenersBound) {
    const preventGesture = (e) => {
      const allowBlock = (typeof isFullscreenMode !== "undefined") ? isFullscreenMode : true;
      if (!allowBlock) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("gesturestart",  preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("gestureend",    preventGesture, { passive: false });
    gestureListenersBound = true;
  }

  img.style.touchAction = "manipulation";
  // Pour tout couper : img.style.touchAction = "none";

  img.style.cursor = "default";
}

// Hook pour initialiser (sans zoom) à chaque ouverture
const _openFullscreen = openFullscreen;
openFullscreen = function(imageSrc){
  _openFullscreen(imageSrc);
  const scope = (typeof fullscreenModal !== "undefined" && fullscreenModal) ? fullscreenModal : document;
  const img = scope.querySelector?.(".fullscreen-image");
  if (img) {
    resetZoomAndPan(img);
    setupFullscreenNoZoom(img);
  }
};

const _closeFullscreen = closeFullscreen;
closeFullscreen = function(){
  const scope = (typeof fullscreenModal !== "undefined" && fullscreenModal) ? fullscreenModal : document;
  const img = scope.querySelector?.(".fullscreen-image");
  if (img) resetZoomAndPan(img);
  _closeFullscreen();
};

// Utilitaires
function checkImageExists(url) {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(true);
    i.onerror = () => resolve(false);
    i.src = url;
    setTimeout(() => resolve(false), 3000);
  });
}

fixImageSources();
});
// ============= Performance tracking =============
(function(){
  const PERF = {
    sessionId: null,
    activeSection: "facades",

    // Récupère le CSRF token depuis le cookie
    get csrftoken(){
      const m = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/);
      return m ? m[2] : "";
    },

    // Démarre une session si besoin
    async startIfNeeded(){
      if (this.sessionId) return;
      const clientId = localStorage.getItem("client_id") || (Math.random().toString(36).slice(2));
      localStorage.setItem("client_id", clientId);

      const r = await fetch("/api/perf/session-start/", {
        method: "POST",
        headers: {
          "Content-Type":"application/json",
          "X-CSRFToken": this.csrftoken
        },
        body: JSON.stringify({client_id: clientId})
      });

      if (!r.ok) {
        console.error("Erreur lors du démarrage de session:", r.status);
        return;
      }

      const j = await r.json();
      this.sessionId = j.session_id;
    },

    // Arrête la session
    async stop(opts={}){
      if(!this.sessionId) return;
      try{
        await fetch("/api/perf/session-stop/", {
          method: "POST",
          headers: {
            "Content-Type":"application/json",
            "X-CSRFToken": this.csrftoken
          },
          body: JSON.stringify({session_id: this.sessionId, ...opts})
        });
      } catch(err){
        console.warn("Erreur lors de l'arrêt de session:", err);
      } finally {
        this.sessionId = null;
      }
    },

    // Enregistre une action
    async track(action, payload){
      await this.startIfNeeded();
      if (!this.sessionId) return;
      const body = Object.assign({session_id: this.sessionId, action, section: this.activeSection}, payload||{});

      // Fire and forget
      fetch("/api/perf/track/", {
        method: "POST",
        headers: {
          "Content-Type":"application/json",
          "X-CSRFToken": this.csrftoken
        },
        body: JSON.stringify(body)
      }).catch(()=>{});
    }
  };

  // --- Gestion des événements ---

  // clic sur un bouton du header (onglet)
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest('.nav-button[data-section]');
    if (btn) {
      PERF.activeSection = btn.dataset.section;
      PERF.startIfNeeded();
      PERF.track("tab", { section: btn.dataset.section });
    }
  }, true);

  // clic sur une bulle couleur
  document.body.addEventListener("click", (e)=>{
    const bub = e.target.closest('.bubble[data-color-id]');
    if(!bub) return;
    PERF.startIfNeeded();
    PERF.track("bubble", {color_id: parseInt(bub.dataset.colorId)});
  }, true);

  // clic sur une image du carrousel
  document.body.addEventListener("click", (e)=>{
    const img = e.target.closest('.carousel-image[data-color-id]');
    if(!img) return;
    const cid = img.dataset.colorId ? parseInt(img.dataset.colorId) : null;
    PERF.startIfNeeded();
    PERF.track("image", {color_id: cid});
  }, true);

  // retour "Home" = fin de session
  const stopSelectors = [".logo-container", "#resetBtn"];
  document.body.addEventListener("click", (e)=>{
    if (stopSelectors.some(sel => e.target.closest(sel))) {
      PERF.stop();
    }
  }, true);




  // sécurité : si on ferme l’onglet
  window.addEventListener("beforeunload", ()=>{ PERF.stop(); });

})();

