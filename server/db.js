import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'parlor.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let dbInstance = null;

export async function getDB() {
  if (!dbInstance) {
    dbInstance = await open({ 
      filename: DB_PATH, 
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });
    await dbInstance.exec('PRAGMA foreign_keys = ON;');
    await dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  return dbInstance;
}

export async function closeDB() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

export async function migrate() {
  console.log('🔄 Running database migrations...');
  const db = await getDB();
  
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    await db.exec(schema);

    // Seed tables if empty - Custom configuration: 4 English + 4 French
    const tableCount = await db.get('SELECT COUNT(*) as count FROM tables');
    if (tableCount.count === 0) {
      console.log('🌱 Seeding initial tables...');
      const tables = [
        // Tables 1-4: English @ ₹300/hr
        ...Array.from({length: 4}, (_, i) => ({ 
          id: i + 1, 
          type: 'ENGLISH', 
          hourly_rate: 300 
        })),
        // Tables 5-8: French @ ₹200/hr
        ...Array.from({length: 4}, (_, i) => ({ 
          id: i + 5, 
          type: 'FRENCH', 
          hourly_rate: 200 
        }))
      ];

      const stmt = await db.prepare(`
        INSERT INTO tables (id, type, hourly_rate, status, light_on) 
        VALUES (?, ?, ?, 'AVAILABLE', 0)
      `);
      
      for (const table of tables) {
        await stmt.run(table.id, table.type, table.hourly_rate);
      }
      await stmt.finalize();
      console.log('✅ Tables seeded successfully');
    }

    console.log('✅ Database migration completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Database backup utility
export async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, `backup-${timestamp}.db`);
  
  try {
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`✅ Database backed up to: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}