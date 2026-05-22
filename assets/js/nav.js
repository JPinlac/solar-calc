// Shared site navigation injection.
(function () {
  function depth() {
    // Returns relative path prefix to root based on current pathname.
    const parts = window.location.pathname.split('/').filter(Boolean);
    // If we're under /learn/ subdir, go up one.
    if (parts.length && parts[parts.length - 2] === 'learn') return '../';
    return './';
  }

  const root = depth();
  const path = window.location.pathname;
  function active(href) {
    const file = path.split('/').pop() || 'index.html';
    return href.endsWith(file) ? 'active' : '';
  }

  const header = `
    <header class="site-header">
      <div class="container">
        <a class="brand" href="${root}index.html">
          <span class="brand-sun">☀</span> DTE Solar <span class="brand-bolt">⚡</span> Plan
        </a>
        <nav class="nav">
          <a href="${root}index.html" class="${active('index.html')}">Overview</a>
          <a href="${root}calculator.html" class="${active('calculator.html')}">Calculator</a>
          <a href="${root}rates.html" class="${active('rates.html')}">DTE Rates</a>
          <a href="${root}configurations.html" class="${active('configurations.html')}">Systems</a>
          <a href="${root}projections.html" class="${active('projections.html')}">Projections</a>
          <a href="${root}learn/equipment.html" class="${active('equipment.html')}">Equipment</a>
          <a href="${root}learn/why-michigan.html">Learn</a>
        </nav>
      </div>
    </header>
  `;

  const footer = `
    <footer class="site-footer">
      <div class="container">
        <div>
          Educational reference for DTE Energy residential customers in Southeast Michigan.
          Not financial advice. Verify rates at <a href="https://newlook.dteenergy.com/wps/wcm/connect/dte-web/home/billing-and-payments/residential/understanding-your-bill/rates" target="_blank" rel="noopener">dteenergy.com</a>.
        </div>
        <div>Calculations assume <strong>ZERO federal tax credit</strong> (eliminated Jan 1, 2026).</div>
      </div>
    </footer>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    const headerSlot = document.getElementById('site-header');
    const footerSlot = document.getElementById('site-footer');
    if (headerSlot) headerSlot.outerHTML = header;
    if (footerSlot) footerSlot.outerHTML = footer;
  });
})();
