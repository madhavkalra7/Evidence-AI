import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    // DIRECT_URL (non-pooled) required for migrate deploy
    url: process.env.DIRECT_URL!,
  },
});
