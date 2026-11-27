import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'lab.openchess.app',
  appName: 'OpenChessLab',
  webDir: 'dist/client',
  backgroundColor: '#f7f8f5',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#f7f8f5',
      showSpinner: false,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#f7f8f5',
    },
  },
};

export default config;
