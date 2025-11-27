import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Create connection pool for Azure PostgreSQL
const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: {
    rejectUnauthorized: false, // Required for Azure PostgreSQL
  },
  max: 10, // Max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export pool for direct access if needed
export { pool };

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
