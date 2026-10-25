import {defineConfig} from '@playwright/test';
import development from './playwright.config';
// Exercise the hosted architecture: built files and WebSockets on one port.
export default defineConfig({
  ...development,
  use:{...development.use,baseURL:'http://127.0.0.1:2691'},
  webServer:{
    command:'npm start',
    url:'http://127.0.0.1:2691/health',
    env:{PORT:'2691',NODE_ENV:'production',SERVER_TEST_MODE:'1',ROUND_DURATION_SECONDS:'90'},
    reuseExistingServer:false,
    timeout:30000,
  },
});
