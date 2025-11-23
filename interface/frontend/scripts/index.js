/**
 * index.js - Script da página inicial, define os cards exibidos no carrossel
 * Plataforma de Stewart - IFSP
 */
const interfaces = [
  {
    title: 'Controle de Atuadores PID',
    icon: 'functions',
    url: 'actuators.html',
    description: 'Interface completa para controle dos 6 pistões com ajuste preciso de setpoints e monitoramento em tempo real.',
    iconColor: 'text-green-400',
    bgGradient: 'from-green-600/20 to-green-800/20',
    accentColor: '#10b981',
    features: [
      { icon: 'tune', text: 'Setpoints individuais e globais' },
      { icon: 'show_chart', text: 'Gráficos de telemetria ao vivo' },
      { icon: 'download', text: 'Exportação de dados para CSV' },
    ],
  },
  {
    title: 'Cinemática Inversa',
    icon: 'precision_manufacturing',
    url: 'kinematics.html',
    description: 'Controle avançado por pose 3D usando coordenadas espaciais e ângulos de Euler para movimentos precisos.',
    iconColor: 'text-blue-400',
    bgGradient: 'from-blue-600/20 to-blue-800/20',
    accentColor: '#3b82f6',
    features: [
      { icon: '3d_rotation', text: 'Controle por pose 3D (x, y, z)' },
      { icon: 'calculate', text: 'Cinemática inversa em tempo real' },
      { icon: 'preview', text: 'Preview antes de executar' },
    ],
  },
  {
    title: 'Controle por Joystick',
    icon: 'sports_esports',
    url: 'controller.html',
    description: 'Controle em tempo real usando gamepad/joystick com mapeamento direto dos sticks para translação e rotação.',
    iconColor: 'text-purple-400',
    bgGradient: 'from-purple-600/20 to-purple-800/20',
    accentColor: '#a855f7',
    features: [
      { icon: 'gamepad', text: 'Suporte a Xbox e PlayStation' },
      { icon: 'view_in_ar', text: 'Preview 3D em tempo real' },
      { icon: 'security', text: 'Limites de segurança (±30mm/±8°)' },
    ],
  },
  {
    title: 'Rotinas Automatizadas',
    icon: 'autorenew',
    url: 'routines.html',
    description: 'Execute sequências de movimento pré-programadas com trajetórias suaves e controle temporal preciso.',
    iconColor: 'text-orange-400',
    bgGradient: 'from-orange-600/20 to-orange-800/20',
    accentColor: '#f97316',
    features: [
      { icon: 'bar_chart', text: 'Gráficos de execução em tempo real' },
      { icon: 'speed', text: 'Controle de velocidade ajustável' },
      { icon: 'edit', text: 'Presets customizáveis' },
    ],
  },
  {
    title: 'Controle Roll Pitch Yaw',
    icon: 'speed',
    url: 'motion.html',
    description: 'Controle intuitivo usando acelerômetro e giroscópio para mapeamento direto de movimentos em 6 DOF.',
    iconColor: 'text-pink-400',
    bgGradient: 'from-pink-600/20 to-pink-800/20',
    accentColor: '#ec4899',
    features: [
      { icon: 'screen_rotation', text: 'Controle por orientação física' },
      { icon: 'compass_calibration', text: 'Leitura Roll/Pitch/Yaw' },
      { icon: 'view_in_ar', text: 'Visualização 3D ao vivo' },
    ],
  },
  {
    title: 'Configurações PID',
    icon: 'settings',
    url: 'settings.html',
    description: 'Ajuste fino de parâmetros do controlador PID, filtros e configurações gerais do sistema de controle.',
    iconColor: 'text-cyan-400',
    bgGradient: 'from-cyan-600/20 to-cyan-800/20',
    accentColor: '#06b6d4',
    features: [
      { icon: 'tune', text: 'Ajuste de ganhos' },
      { icon: 'center_focus_weak', text: 'Ajuste de deadband' },
      { icon: 'save', text: 'Persistência automática' },
    ],
  },
  {
    title: 'Simulação de Voo',
    icon: 'flight_takeoff',
    url: 'simulation.html',
    description: 'Simule o comportamento do sistema em um ambiente virtual para testes e ajustes seguros.',
    iconColor: 'text-red-400',
    bgGradient: 'from-red-600/20 to-red-800/20',
    accentColor: '#dc2626',
    features: [
      { icon: 'connect_without_contact', text: 'Conecte-se ao FlightGear' },
      { icon: 'tune', text: 'Faça um voo ou reproduza um fgtape' },
      { icon: 'visibility', text: 'Visualize a plataforma seguindo o voo' },
    ],
  },
];

function createSlideContent(interface) {
  return `
          <div class="swiper-slide px-3 pb-3">
            <a href="${interface.url}" class="block w-full">
              <div class="interface-card rounded-xl p-5 shadow-2xl">
                <!-- Header do Card -->
                <div class="text-center mb-4">
                  <div class="inline-block p-3 rounded-xl bg-gradient-to-br ${interface.bgGradient} mb-2">
                    <span class="material-icons ${interface.iconColor} icon-glow" style="font-size: 2.5rem;">${interface.icon}</span>
                  </div>
                  <h3 class="text-xl font-bold text-white mb-2">${interface.title}</h3>
                  <p class="text-gray-300 text-sm">${interface.description}</p>
                </div>

                <!-- Features -->
                <div class="space-y-2 mb-4">
                  ${interface.features
                    .map(
                      (feature) => `
                    <div class="feature-badge rounded-lg p-2.5 flex items-center gap-2">
                      <span class="material-icons ${interface.iconColor} text-lg flex-shrink-0">${feature.icon}</span>
                      <span class="text-white text-sm">${feature.text}</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>

                <!-- CTA Button -->
                <div class="text-center">
                  <div class="inline-flex items-center gap-2 bg-gradient-to-r ${interface.bgGradient} hover:opacity-90 transition-all px-6 py-2.5 rounded-lg border border-white/20 group">
                    <span class="text-white font-bold text-sm">Abrir Interface</span>
                    <span class="material-icons text-white group-hover:translate-x-1 transition-transform text-base">arrow_forward</span>
                  </div>
                </div>
              </div>
            </a>
          </div>
        `;
}

document.addEventListener('DOMContentLoaded', () => {
  // Cria os slides
  const swiperWrapper = document.querySelector('.swiper-wrapper');
  swiperWrapper.innerHTML = interfaces.map((interface) => createSlideContent(interface)).join('');

  // Inicializa o Swiper
  const swiper = new Swiper('.interfacesSwiper', {
    loop: true,
    effect: 'cube',
    grabCursor: true,
    cubeEffect: {
      shadow: true,
      slideShadows: true,
      shadowOffset: 20,
      shadowScale: 0.94,
      transition: 1000,
    },
    autoplay: {
      delay: 4000,
      disableOnInteraction: false,
    },
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
    },
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
  });
});
