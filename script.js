document.addEventListener('DOMContentLoaded', function() {
    
    // Header-Scroll-Effekt
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Fade-In-Animationen beim Scrollen
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, {
        threshold: 0.1
    });

    const elementsToAnimate = document.querySelectorAll('.animate-on-scroll');
    elementsToAnimate.forEach(el => {
        observer.observe(el);
    });

    // Logik für den "VANILLA JS" SLIDER
    const slider = document.getElementById('before-after-slider');
    const before = document.getElementById('before-image');
    const beforeImage = before.getElementsByTagName('img')[0];
    const resizer = document.getElementById('resizer');

    if (slider && before && beforeImage && resizer) {
        let active = false;
        const setBeforeImageWidth = () => { let width = slider.offsetWidth; beforeImage.style.width = width + 'px'; };
        setBeforeImageWidth();
        window.addEventListener('resize', setBeforeImageWidth);
        resizer.addEventListener('mousedown', function() { active = true; });
        document.body.addEventListener('mouseup', function() { active = false; });
        document.body.addEventListener('mouseleave', function() { active = false; });
        document.body.addEventListener('mousemove', function(e) { if (!active) return; let x = e.pageX; x -= slider.getBoundingClientRect().left; slideIt(x); pauseEvent(e); });
        resizer.addEventListener('touchstart', function() { active = true; });
        document.body.addEventListener('touchend', function() { active = false; });
        document.body.addEventListener('touchcancel', function() { active = false; });
        document.body.addEventListener('touchmove', function(e) { if (!active) return; let x; if (e.changedTouches && e.changedTouches.length > 0) { x = e.changedTouches[0].pageX; } else { return; } x -= slider.getBoundingClientRect().left; slideIt(x); pauseEvent(e); });
        function slideIt(x) { let transform = Math.max(0, Math.min(x, slider.offsetWidth)); before.style.width = transform + "px"; resizer.style.left = transform + "px"; }
        function pauseEvent(e) { if (e.stopPropagation) e.stopPropagation(); if (e.preventDefault) e.preventDefault(); e.cancelBubble = true; e.returnValue = false; return false; }
    }

    // LOGIK FÜR MODALS (POP-UPS)
    const impressumLink = document.getElementById('impressum-link');
    const privacyLink = document.getElementById('privacy-link');
    const termsLink = document.getElementById('terms-link');
    const impressumModal = document.getElementById('impressum-modal');
    const privacyModal = document.getElementById('privacy-modal');
    const termsModal = document.getElementById('terms-modal');
    const allModals = document.querySelectorAll('.modal-overlay');

    function openModal(modal) { if (modal) modal.classList.add('visible'); }
    function closeModal(modal) { if (modal) modal.classList.remove('visible'); }

    if (impressumLink && impressumModal) {
        impressumLink.addEventListener('click', (e) => { e.preventDefault(); openModal(impressumModal); });
    }
    if (privacyLink && privacyModal) {
        privacyLink.addEventListener('click', (e) => { e.preventDefault(); openModal(privacyModal); });
    }
    if (termsLink && termsModal) {
        termsLink.addEventListener('click', (e) => { e.preventDefault(); openModal(termsModal); });
    }

    allModals.forEach(modal => {
        const closeButton = modal.querySelector('.modal-close');
        if (closeButton) { closeButton.addEventListener('click', () => { closeModal(modal); }); }
        modal.addEventListener('click', (e) => { if (e.target === modal) { closeModal(modal); } });
    });
});