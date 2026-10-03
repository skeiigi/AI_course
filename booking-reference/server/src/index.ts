/**
 * Точка входа: поднимает сервис и слушает порт.
 *
 * Запуск в разработке: npm run dev --workspace server
 * Запуск собранного кода: npm run start --workspace server
 */

import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp({ dbFile: config.dbFile, webDir: config.webDir, logger: true });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Интерфейс и API: http://127.0.0.1:${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Корректное завершение: докер и терминал присылают сигналы, по ним
// закрываем соединения и файл базы, а не обрываем процесс на середине.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
