export const swaggerCustomCss = `
.swagger-ui .topbar .docs-export-links {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-left: auto;
}

.swagger-ui .topbar .docs-export-link {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border: 1px solid #49cc90;
  border-radius: 4px;
  color: #fff;
  background: #49cc90;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.swagger-ui .topbar .docs-export-link:hover {
  background: #fff;
  color: #1b1b1b;
  text-decoration: none;
}

.swagger-ui .topbar .docs-export-link + .docs-export-link {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.6);
}

.swagger-ui .topbar .docs-export-link + .docs-export-link:hover {
  background: #fff;
  color: #1b1b1b;
}
`;

export const swaggerCustomJs = `
(function () {
  var links = [
    {
      id: 'postman-export',
      label: 'Baixar coleção Postman',
      href: '/docs/postman.json',
      filename: 'aurebid.postman_collection.json'
    },
    {
      id: 'openapi-export',
      label: 'Baixar OpenAPI (JSON)',
      href: '/docs/openapi.json',
      filename: 'aurebid.openapi.json'
    }
  ];

  function addExportLinks() {
    var topbarWrapper = document.querySelector('.swagger-ui .topbar .wrapper');
    if (!topbarWrapper) return false;

    if (document.getElementById('docs-export-links')) return true;

    var container = document.createElement('div');
    container.id = 'docs-export-links';
    container.className = 'docs-export-links';

    links.forEach(function (item) {
      var link = document.createElement('a');
      link.id = item.id;
      link.className = 'docs-export-link';
      link.href = item.href;
      link.setAttribute('download', item.filename);
      link.textContent = item.label;
      container.appendChild(link);
    });

    topbarWrapper.appendChild(container);
    return true;
  }

  if (!addExportLinks()) {
    var observer = new MutationObserver(function () {
      if (addExportLinks()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(function () {
      addExportLinks();
      observer.disconnect();
    }, 5000);
  }
})();
`;
