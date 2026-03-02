import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neon } from '@neondatabase/serverless';

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    async adapter() {
      const sql = neon(process.env.DIRECT_URL!);
      return new PrismaNeon(sql);
    },
  },
});
