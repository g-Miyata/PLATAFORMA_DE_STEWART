/**
 * nav-menu.js - Componente de navegação compartilhado
 * Plataforma de Stewart - IFSP
 */

const NAV_ITEMS = [
  { url: 'index.html', icon: 'home', label: 'Início' },
  { url: 'actuators.html', icon: 'precision_manufacturing', label: 'Controle' },
  { url: 'kinematics.html', icon: 'straighten', label: 'Cinemática' },
  // { url: 'controller.html', icon: 'sports_esports', label: 'Joystick' },
  { url: 'joystick.html', icon: 'sports_esports', label: 'Joystick' },

  { url: 'routines.html', icon: 'autorenew', label: 'Rotinas' },
  // { url: 'motion.html', icon: 'gps_fixed', label: 'MPU-6050' },
  { url: 'accelerometer.html', icon: 'speed', label: 'Acelerômetro' },
  { url: 'settings.html', icon: 'settings', label: 'Configurações' },
  { url: 'flight-simulation.html', icon: 'flight_takeoff', label: 'Flight Sim' },
];

function createNavMenu(currentPage) {
  const navHtml = `
    <div class="bg-gray-800 rounded-2xl shadow-sm p-3 sm:p-4 mb-4 sm:mb-6 border border-gray-700">
      <div class="flex flex-wrap gap-2 justify-center text-sm sm:text-base">
        ${NAV_ITEMS.map((item) => {
          const isActive = window.location.pathname.endsWith(item.url) || (currentPage && currentPage === item.url);
          const activeClass = isActive ? 'bg-green-600 text-white font-semibold' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium';

          return `
            <a href="${item.url}" class="px-4 sm:px-6 py-2 ${activeClass} rounded-lg transition-colors flex items-center gap-2">
              <span class="material-icons text-lg">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  `;

  return navHtml;
}

function insertNavMenu(containerId = 'nav-container', currentPage = null) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = createNavMenu(currentPage);
  }
}

// Exporta para uso global
window.NAV_ITEMS = NAV_ITEMS;
window.createNavMenu = createNavMenu;
window.insertNavMenu = insertNavMenu;
