import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types';
import { Database } from '../db/database';

export class TaskService {
  constructor(private db: Database) {}

  async createTask(taskData: { title: string; description?: string }): Promise<Task> {
    const taskId = uuidv4();
    const now = new Date();
    
    const task: Task = {
      id: taskId,
      title: taskData.title,
      description: taskData.description || '',
      completed: false,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      sync_status: 'pending',
      server_id: null,
      last_synced_at: null
    };

    await this.db.run(
      `INSERT INTO tasks (id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.description,
        task.completed ? 1 : 0,
        task.created_at.toISOString(),
        task.updated_at.toISOString(),
        task.is_deleted ? 1 : 0,
        task.sync_status,
        task.server_id,
        task.last_synced_at
      ]
    );

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return null;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...existingTask,
      ...updates,
      updated_at: now,
      sync_status: 'pending'
    };

    await this.db.run(
      `UPDATE tasks 
       SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [
        updatedTask.title,
        updatedTask.description,
        updatedTask.completed ? 1 : 0,
        updatedTask.updated_at.toISOString(),
        updatedTask.sync_status,
        id
      ]
    );

    return updatedTask;
  }

  async updateTaskFromSync(id: string, updates: Partial<Task>): Promise<void> {
    const now = new Date();
    
    await this.db.run(
      `UPDATE tasks 
       SET title = ?, description = ?, completed = ?, updated_at = ?, 
           sync_status = 'synced', server_id = ?, last_synced_at = ?
       WHERE id = ?`,
      [
        updates.title,
        updates.description,
        updates.completed ? 1 : 0,
        now.toISOString(),
        updates.server_id,
        now.toISOString(),
        id
      ]
    );
  }

  async deleteTask(id: string): Promise<boolean> {
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return false;
    }

    const now = new Date();
    
    await this.db.run(
      `UPDATE tasks 
       SET is_deleted = 1, updated_at = ?, sync_status = 'pending'
       WHERE id = ?`,
      [now.toISOString(), id]
    );

    return true;
  }

  async getTask(id: string): Promise<Task | null> {
    const row = await this.db.get(
      'SELECT * FROM tasks WHERE id = ? AND is_deleted = 0',
      [id]
    );

    if (!row) {
      return null;
    }

    return this.mapRowToTask(row);
  }

  async getAllTasks(): Promise<Task[]> {
    const rows = await this.db.all(
      'SELECT * FROM tasks WHERE is_deleted = 0 ORDER BY created_at DESC'
    );

    return rows.map(row => this.mapRowToTask(row));
  }

  async markAsSynced(taskId: string, serverId?: string): Promise<void> {
    const now = new Date();
    
    await this.db.run(
      `UPDATE tasks 
       SET sync_status = 'synced', last_synced_at = ?, server_id = ?, updated_at = ?
       WHERE id = ?`,
      [now.toISOString(), serverId, now.toISOString(), taskId]
    );
  }

  async markSyncError(taskId: string): Promise<void> {
    await this.db.run(
      `UPDATE tasks SET sync_status = 'error', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), taskId]
    );
  }

  async markSyncFailed(taskId: string): Promise<void> {
    await this.db.run(
      `UPDATE tasks SET sync_status = 'failed', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), taskId]
    );
  }

  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : null
    };
  }
}