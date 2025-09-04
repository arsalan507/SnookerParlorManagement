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

    // Run additional migrations for existing databases
    await runAdditionalMigrations(db);

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

async function runAdditionalMigrations(db) {
  console.log('🔧 Running additional migrations...');

  try {
    // Check if loyalty_points column exists in customers table
    const loyaltyColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'loyalty_points'
    `);

    if (loyaltyColumnExists.count === 0) {
      console.log('📝 Adding loyalty_points column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0');
      console.log('✅ Added loyalty_points column');
    }

    // Check if membership_expiry_date column exists
    const expiryColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'membership_expiry_date'
    `);

    if (expiryColumnExists.count === 0) {
      console.log('📝 Adding membership_expiry_date column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN membership_expiry_date INTEGER');
      console.log('✅ Added membership_expiry_date column');
    }

    // Check if membership_status column exists
    const statusColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'membership_status'
    `);

    if (statusColumnExists.count === 0) {
      console.log('📝 Adding membership_status column to customers table...');
      await db.exec(`ALTER TABLE customers ADD COLUMN membership_status TEXT DEFAULT 'ACTIVE' CHECK (membership_status IN ('ACTIVE','EXPIRED','SUSPENDED'))`);
      console.log('✅ Added membership_status column');
    }

    // Check if date_of_birth column exists
    const dobColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'date_of_birth'
    `);

    if (dobColumnExists.count === 0) {
      console.log('📝 Adding date_of_birth column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN date_of_birth INTEGER');
      console.log('✅ Added date_of_birth column');
    }

    // Check if address column exists
    const addressColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'address'
    `);

    if (addressColumnExists.count === 0) {
      console.log('📝 Adding address column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN address TEXT');
      console.log('✅ Added address column');
    }

    // Check if emergency_contact column exists
    const emergencyColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'emergency_contact'
    `);

    if (emergencyColumnExists.count === 0) {
      console.log('📝 Adding emergency_contact column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN emergency_contact TEXT');
      console.log('✅ Added emergency_contact column');
    }

    // Check if id_card_number column exists
    const idCardColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'id_card_number'
    `);

    if (idCardColumnExists.count === 0) {
      console.log('📝 Adding id_card_number column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN id_card_number TEXT');
      console.log('✅ Added id_card_number column');
    }

    // Check if photo_url column exists
    const photoColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'photo_url'
    `);

    if (photoColumnExists.count === 0) {
      console.log('📝 Adding photo_url column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN photo_url TEXT');
      console.log('✅ Added photo_url column');
    }

    // Check if membership_start_date column exists
    const membershipStartColumnExists = await db.get(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('customers')
      WHERE name = 'membership_start_date'
    `);

    if (membershipStartColumnExists.count === 0) {
      console.log('📝 Adding membership_start_date column to customers table...');
      await db.exec('ALTER TABLE customers ADD COLUMN membership_start_date INTEGER');
      console.log('✅ Added membership_start_date column');
    }

  } catch (error) {
    console.error('❌ Additional migrations failed:', error);
    // Don't throw error here as it might be due to table not existing yet
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