<<<<<<< HEAD
﻿import sqlite3 from 'sqlite3';
=======
import sqlite3 from 'sqlite3';
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
import { Task, SyncQueueItem } from '../types';

const sqlite = sqlite3.verbose();

export class Database {
  private db: sqlite3.Database;

  constructor(filename: string = ':memory:') {
<<<<<<< HEAD
    // Create data directory if it doesn't exist
    const path = require('path');
    const fs = require('fs');
    
    const dbDir = path.dirname(filename);
    if (dbDir !== '.' && dbDir !== '..' && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
=======
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
    this.db = new sqlite.Database(filename);
  }

  async initialize(): Promise<void> {
    await this.createTables();
  }

  private async createTables(): Promise<void> {
<<<<<<< HEAD
    const createTasksTable = \
=======
    const createTasksTable = `
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        server_id TEXT,
        last_synced_at DATETIME
      )
<<<<<<< HEAD
    \;

    const createSyncQueueTable = \
=======
    `;

    const createSyncQueueTable = `
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
<<<<<<< HEAD
    \;

    const createDeadLetterQueueTable = \
=======
    `;

    const createDeadLetterQueueTable = `
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
      CREATE TABLE IF NOT EXISTS sync_dead_letter_queue (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME,
        retry_count INTEGER,
        error_message TEXT,
        failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        original_sync_queue_id TEXT
      )
<<<<<<< HEAD
    \;
=======
    `;
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf

    await this.run(createTasksTable);
    await this.run(createSyncQueueTable);
    await this.run(createDeadLetterQueueTable);
  }

  run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
<<<<<<< HEAD
}
=======
}
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
