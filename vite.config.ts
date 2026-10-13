// 개발 서버에 /ws 를 직접 붙인다 — `npm run dev` 하나로 화면과 멀티플레이 서버가 함께 뜬다.
// 포트 5174: game-hub 로비(5173)와 동시에 띄울 수 있게.
import { defineConfig, type Plugin } from 'vite';
import type { Server } from 'node:http';
import { attachWhiteboard } from './server/ws.ts';

function whiteboardServer(): Plugin {
  return {
    name: 'whiteboard-ws',
    configureServer(server) {
      if (server.httpServer) attachWhiteboard(server.httpServer as Server);
    },
    configurePreviewServer(server) {
      attachWhiteboard(server.httpServer as Server);
    },
  };
}

export default defineConfig({
  server: { port: 5174, host: true },
  preview: { port: 5174, host: true },
  plugins: [whiteboardServer()],
});
