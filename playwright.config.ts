import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',timeout:150000,expect:{timeout:10000},workers:1,
  use:{actionTimeout:10000,baseURL:'http://127.0.0.1:5174',headless:true,viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']}},
  webServer:[
    {command:'node --import tsx apps/server/src/index.ts',url:'http://127.0.0.1:2680/health',env:{PORT:'2680',SERVER_TEST_MODE:'1',ROUND_DURATION_SECONDS:'90'},reuseExistingServer:false,timeout:30000},
    {command:'npm run dev -w @pharmacy/client -- --port 5174',url:'http://127.0.0.1:5174',env:{VITE_SERVER_URL:'ws://127.0.0.1:2680'},reuseExistingServer:false,timeout:30000}
  ]
});
