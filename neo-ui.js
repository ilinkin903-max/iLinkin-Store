/* Presentation and keyboard behavior shared by Owner, Reseller and the preview. */
(() => {
  const sidebar = document.getElementById('sidebar');
  const menu = document.getElementById('menuBtn');
  const backdrop = document.getElementById('sidebarBackdrop');
  const main = document.querySelector('.main-panel');
  const mobile = matchMedia('(max-width: 1100px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
  let drawerOpen = false;

  function focusDrawer() {
    if (drawerOpen && !sidebar.contains(document.activeElement)) {
      (sidebar.querySelector('button.active') || sidebar.querySelector(focusable))?.focus({ preventScroll: true });
    }
  }

  function closeDrawer() {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('show');
  }

  function syncDrawer() {
    const open = mobile.matches && !!sidebar?.classList.contains('open');
    document.body.classList.toggle('ui-menu-open', open);
    menu?.setAttribute('aria-expanded', String(open));
    menu?.setAttribute('aria-controls', 'sidebar');
    if (sidebar) sidebar.inert = mobile.matches && !open;
    if (main) main.inert = open;
    if (open !== drawerOpen) {
      drawerOpen = open;
      // Wait for visibility and inert changes to reach the rendered tree.
      if (open) requestAnimationFrame(focusDrawer);
      else if (mobile.matches) requestAnimationFrame(() => menu?.focus({ preventScroll: true }));
    }
  }

  if (sidebar) new MutationObserver(syncDrawer).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  sidebar?.addEventListener('transitionend', event => { if (event.propertyName === 'transform') focusDrawer(); });
  mobile.addEventListener('change', () => { closeDrawer(); syncDrawer(); });
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeDrawer();
      document.getElementById('notificationPanel')?.classList.add('hidden');
      document.getElementById('notifBtn')?.setAttribute('aria-expanded', 'false');
    }
    if (event.key !== 'Tab' || !drawerOpen || document.querySelector('dialog:modal')) return;
    const nodes = [...sidebar.querySelectorAll(focusable)].filter(el => el.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  syncDrawer();

  // The wrapping mobile header can change height as a timer/title updates.
  const header = document.querySelector('.topbar');
  if (header) new ResizeObserver(() => {
    document.documentElement.style.setProperty('--ui-header-bottom', `${header.getBoundingClientRect().bottom + 12}px`);
  }).observe(header);

  const toast = document.getElementById('toast');
  if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
  const dialog = document.getElementById('modal');
  if (dialog) dialog.setAttribute('aria-labelledby', 'modalTitle');
  document.getElementById('modalClose')?.setAttribute('aria-label', 'Tutup dialog');

  // Called after a view finishes rendering, never during polling or text input.
  window.ilinkUI = {
    enter() {
      document.querySelectorAll('#nav [data-view]').forEach(button => {
        if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      const content = document.getElementById('content');
      if (!content || reducedMotion.matches || typeof content.animate !== 'function') return;
      content.getAnimations().forEach(animation => animation.cancel());
      content.animate([{ opacity: .4, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], {
        duration: 280, easing: 'cubic-bezier(.22,1,.36,1)'
      });
    }
  };
})();
