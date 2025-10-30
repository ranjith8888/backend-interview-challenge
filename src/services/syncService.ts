import axios from 'axios';
import { createHash } from 'crypto';
import { Task, SyncQueueItem, SyncResult, SyncError, BatchSyncRequest, BatchSyncResponse, CHALLENGE_CONSTRAINTS } from '../types';
import { Database } from '../db/database';
import { TaskService } from './taskService';

export class SyncService {
  private apiUrl: string;
  private maxRetries: number = 3;
  private batchSize: number;
  
  constructor(
    private db: Database,
    private taskService: TaskService,
    apiUrl: string = process.env.API_BASE_URL || 'http://localhost:3000/api'
  ) {
    this.apiUrl = apiUrl;
    this.batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '50');
  }

  async sync(): Promise<SyncResult> {
    console.log('Starting sync process...');
    
    const result: SyncResult = {
      success: true,
      synced_items: 0,
      failed_items: 0,
      errors: []
    };

    try {
      if (!await this.checkConnectivity()) {
        throw new Error('No network connectivity');
      }

      const pendingItems = await this.getPendingSyncItemsChronological();
      result.synced_items = pendingItems.length;

      if (pendingItems.length === 0) {
        console.log('No pending items to sync');
        return result;
      }

      console.log(`Processing ${pendingItems.length} pending sync items`);

      await this.markItemsAsInProgress(pendingItems);

      const batches = this.createChronologicalBatches(pendingItems);
      
      for (const batch of batches) {
        const batchResult = await this.processBatchWithChecksum(batch);
        
        result.synced_items += batchResult.synced_items;
        result.failed_items += batchResult.failed_items;
        
        if (batchResult.errors.length > 0) {
          result.errors.push(...batchResult.errors);
        }
      }

      result.success = result.failed_items === 0;
      console.log(`Sync completed: ${result.synced_items} synced, ${result.failed_items} failed`);

    } catch (error) {
      console.error('Sync process failed:', error);
      result.success = false;
      result.errors.push({
        task_id: 'global',
        operation: 'sync',
        error: error instanceof Error ? error.message : 'Unknown sync error',
        timestamp: new Date()
      });
    }

    return result;
  }

  private async getPendingSyncItemsChronological(): Promise<SyncQueueItem[]> {
    const rows = await this.db.all(
      `SELECT * FROM sync_queue 
       WHERE retry_count < ? 
       ORDER BY task_id, created_at ASC`,
      [this.maxRetries]
    );

    return rows.map(row => ({
      id: row.id,
      task_id: row.task_id,
      operation: row.operation as 'create' | 'update' | 'delete',
      data: JSON.parse(row.data),
      created_at: new Date(row.created_at),
      retry_count: row.retry_count,
      error_message: row.error_message
    }));
  }

  private async markItemsAsInProgress(items: SyncQueueItem[]): Promise<void> {
    for (const item of items) {
      await this.db.run(
        `UPDATE sync_queue SET sync_status = 'in-progress' WHERE id = ?`,
        [item.id]
      );
    }
  }

  private createChronologicalBatches(items: SyncQueueItem[]): SyncQueueItem[][] {
    const batches: SyncQueueItem[][] = [];
    let currentBatch: SyncQueueItem[] = [];

    for (const item of items) {
      if (currentBatch.length >= this.batchSize) {
        batches.push([...currentBatch]);
        currentBatch = [];
      }
      currentBatch.push(item);
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async processBatchWithChecksum(items: SyncQueueItem[]): Promise<SyncResult> {
    const batchResult: SyncResult = {
      success: true,
      synced_items: 0,
      failed_items: 0,
      errors: []
    };

    const checksum = this.createBatchChecksum(items);
    const batchRequest: BatchSyncRequest = {
      items,
      client_timestamp: new Date()
    };

    try {
      const response = await axios.post(`${this.apiUrl}/batch`, batchRequest, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-Batch-Checksum': checksum
        }
      });

      const serverResponse: BatchSyncResponse = response.data;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const processedItem = serverResponse.processed_items[i];

        if (!processedItem) {
          await this.handleSyncError(item, new Error('No response from server'));
          batchResult.failed_items++;
          continue;
        }

        switch (processedItem.status) {
          case 'success':
            await this.handleSyncSuccess(item, processedItem.server_id, processedItem.resolved_data);
            batchResult.synced_items++;
            break;
          
          case 'conflict':
            const resolvedTask = await this.resolveConflictWithPriority(
              item.data as Task,
              processedItem.resolved_data!
            );
            await this.handleSyncSuccess(item, processedItem.server_id, resolvedTask);
            batchResult.synced_items++;
            batchResult.errors.push({
              task_id: item.task_id,
              operation: item.operation,
              error: 'Conflict resolved using last-write-wins',
              timestamp: new Date()
            });
            break;
          
          case 'error':
            await this.handleSyncError(item, new Error(processedItem.error || 'Unknown error'));
            batchResult.failed_items++;
            batchResult.errors.push({
              task_id: item.task_id,
              operation: item.operation,
              error: processedItem.error || 'Unknown error',
              timestamp: new Date()
            });
            break;
        }
      }

    } catch (error) {
      console.error('Batch sync failed:', error);
      
      for (const item of items) {
        await this.handleSyncError(item, error instanceof Error ? error : new Error('Batch sync failed'));
        batchResult.failed_items++;
        batchResult.errors.push({
          task_id: item.task_id,
          operation: item.operation,
          error: error instanceof Error ? error.message : 'Batch sync failed',
          timestamp: new Date()
        });
      }
    }

    batchResult.success = batchResult.failed_items === 0;
    return batchResult;
  }

  private createBatchChecksum(items: SyncQueueItem[]): string {
    const dataString = items.map(item => 
      `${item.id}-${item.task_id}-${item.operation}-${item.created_at.getTime()}`
    ).join('|');
    
    return createHash('md5').update(dataString).digest('hex');
  }

  private async resolveConflictWithPriority(localTask: Task, serverTask: Task): Promise<Task> {
    console.log(`Resolving conflict for task ${localTask.id}`);
    
    const localTime = new Date(localTask.updated_at);
    const serverTime = new Date(serverTask.updated_at);

    let resolvedTask: Task;

    if (localTime.getTime() === serverTime.getTime()) {
      resolvedTask = this.mergeTasks(localTask, serverTask, 'client');
    } else if (localTime > serverTime) {
      resolvedTask = this.mergeTasks(localTask, serverTask, 'client');
    } else {
      resolvedTask = this.mergeTasks(serverTask, localTask, 'server');
    }

    console.log(`Conflict resolved using last-write-wins strategy`);
    return resolvedTask;
  }

  private mergeTasks(winner: Task, loser: Task, winnerSource: 'client' | 'server'): Task {
    return {
      ...loser,
      ...winner,
      id: winnerSource === 'server' ? winner.id : loser.id,
      server_id: winner.server_id,
      sync_status: 'synced',
      last_synced_at: new Date(),
      updated_at: new Date()
    };
  }

  private async handleSyncSuccess(
    item: SyncQueueItem, 
    serverId?: string, 
    resolvedTask?: Task
  ): Promise<void> {
    if (resolvedTask) {
      await this.taskService.updateTaskFromSync(item.task_id, resolvedTask);
    } else if (serverId) {
      await this.taskService.markAsSynced(item.task_id, serverId);
    }

    await this.removeFromSyncQueue(item.id);
  }

  private async handleSyncError(item: SyncQueueItem, error: Error): Promise<void> {
    const newRetryCount = item.retry_count + 1;
    
    if (newRetryCount >= this.maxRetries) {
      await this.moveToDeadLetterQueue(item, error);
      await this.taskService.markSyncFailed(item.task_id);
    } else {
      await this.db.run(
        `UPDATE sync_queue 
         SET retry_count = ?, error_message = ?
         WHERE id = ?`,
        [newRetryCount, error.message, item.id]
      );
      await this.taskService.markSyncError(item.task_id);
    }

    console.log(`Sync error for ${item.operation} on task ${item.task_id}: ${error.message}. Retry ${newRetryCount}/${this.maxRetries}`);
  }

  private async moveToDeadLetterQueue(item: SyncQueueItem, error: Error): Promise<void> {
    await this.db.run(
      `INSERT INTO sync_dead_letter_queue 
       (id, task_id, operation, data, created_at, retry_count, error_message, original_sync_queue_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `dlq_${item.id}`,
        item.task_id,
        item.operation,
        JSON.stringify(item.data),
        item.created_at.toISOString(),
        item.retry_count,
        error.message,
        item.id
      ]
    );

    await this.removeFromSyncQueue(item.id);
  }

  private async removeFromSyncQueue(syncId: string): Promise<void> {
    await this.db.run('DELETE FROM sync_queue WHERE id = ?', [syncId]);
  }

  async addToSyncQueue(taskId: string, operation: 'create' | 'update' | 'delete', data: Partial<Task>): Promise<void> {
    const syncItem: SyncQueueItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      task_id: taskId,
      operation,
      data,
      created_at: new Date(),
      retry_count: 0
    };

    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        syncItem.id,
        syncItem.task_id,
        syncItem.operation,
        JSON.stringify(syncItem.data),
        syncItem.created_at.toISOString(),
        syncItem.retry_count
      ]
    );

    console.log(`Added ${operation} operation to sync queue for task ${taskId}`);
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getSyncStatus(): Promise<{
    pending: number;
    inProgress: number;
    errors: number;
    deadLetter: number;
    lastSync: Date | null;
  }> {
    const pending = await this.db.get(
      "SELECT COUNT(*) as count FROM sync_queue WHERE retry_count < ?",
      [this.maxRetries]
    );

    const deadLetter = await this.db.get(
      "SELECT COUNT(*) as count FROM sync_dead_letter_queue"
    );

    const lastSync = await this.db.get(
      "SELECT MAX(last_synced_at) as last_sync FROM tasks WHERE last_synced_at IS NOT NULL"
    );

    return {
      pending: pending?.count || 0,
      inProgress: 0,
      errors: 0,
      deadLetter: deadLetter?.count || 0,
      lastSync: lastSync?.last_sync ? new Date(lastSync.last_sync) : null
    };
  }

  async getDeadLetterQueue(): Promise<SyncQueueItem[]> {
    const rows = await this.db.all(
      'SELECT * FROM sync_dead_letter_queue ORDER BY failed_at DESC'
    );

    return rows.map(row => ({
      id: row.id,
      task_id: row.task_id,
      operation: row.operation as 'create' | 'update' | 'delete',
      data: JSON.parse(row.data),
      created_at: new Date(row.created_at),
      retry_count: row.retry_count,
      error_message: row.error_message
    }));
  }
}