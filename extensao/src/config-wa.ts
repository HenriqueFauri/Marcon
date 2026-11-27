// Configuração da WA-JS, lida por ela ao carregar (por isso este arquivo vem antes do wa.js no
// manifesto). Sem telemetria (a biblioteca manda eventos ao Google Analytics por padrão), sem os
// servidores de terceiros de prévia de link, sem nome de aparelho e sem "powered by".
(window as unknown as { WPPConfig: Record<string, unknown> }).WPPConfig = {
  disableGoogleAnalytics: true,
  googleAnalyticsId: null,
  linkPreviewApiServers: [],
  deviceName: false,
  poweredBy: null,
};
