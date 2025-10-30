import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';
import { BatchSyncRequest, BatchSyncResponse } from '../types';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const syncResult = await syncService.sync();
      
      res.json({
        success: syncResult.success,
        synced_items: syncResult.synced_items,
        failed_items: syncResult.failed_items,
        errors: syncResult.errors
      });
    } catch (error) {
      console.error('Sync failed:', error);
      res.status(500).json({
        error: 'Sync failed',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.get('/status', async (req: Request, res: Response) => {
    try {
      const syncStatus = await syncService.getSyncStatus();
      const isOnline = await syncService.checkConnectivity();
      
      res.json({
        pending_sync_count: syncStatus.pending,
        last_sync_timestamp: syncStatus.lastSync?.toISOString() || null,
        is_online: isOnline,
        sync_queue_size: syncStatus.pending
      });
    } catch (error) {
      console.error('Failed to get sync status:', error);
      res.status(500).json({
        error: 'Failed to get sync status',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const batchRequest: BatchSyncRequest = req.body;
      
      if (!batchRequest.items || !Array.isArray(batchRequest.items)) {
        return res.status(400).json({
          error: 'Invalid batch request: items array is required',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      const processedItems = [];
      
      for (const item of batchRequest.items) {
        try {
          let result;
          
          switch (item.operation) {
            case 'create':
              result = await processCreateOperation(item);
              break;
            case 'update':
              result = await processUpdateOperation(item);
              break;
            case 'delete':
              result = await processDeleteOperation(item);
              break;
            default:
              throw new Error(`Unknown operation: ${item.operation}`);
          }
          
          processedItems.push(result);
        } catch (error) {
          processedItems.push({
            client_id: item.task_id,
            server_id: null,
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const response: BatchSyncResponse = {
        processed_items: processedItems
      };

      res.json(response);
    } catch (error) {
      console.error('Batch sync failed:', error);
      res.status(500).json({
        error: 'Batch sync failed',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.get('/health', async (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

async function processCreateOperation(item: any) {
  const serverId = `srv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  return {
    client_id: item.task_id,
    server_id: serverId,
    status: 'success' as const,
    resolved_data: {
      id: serverId,
      title: item.data.title,
      description: item.data.description || '',
      completed: false,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      sync_status: 'synced',
      server_id: serverId,
      last_synced_at: now
    }
  };
}

async function processUpdateOperation(item: any) {
  const serverId = item.data.server_id || `srv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  const hasConflict = Math.random() < 0.1;
  
  if (hasConflict) {
    const serverData = {
      id: serverId,
      title: `Server ${item.data.title}`,
      description: item.data.description ? `Server ${item.data.description}` : '',
      completed: !item.data.completed,
      created_at: item.data.created_at,
      updated_at: new Date(Date.now() - 1000 * 60 * 5),
      is_deleted: false,
      sync_status: 'synced',
      server_id: serverId,
      last_synced_at: now
    };
    
    return {
      client_id: item.task_id,
      server_id: serverId,
      status: 'conflict' as const,
      resolved_data: serverData
    };
  }
  
  return {
    client_id: item.task_id,
    server_id: serverId,
    status: 'success' as const,
    resolved_data: {
      id: serverId,
      title: item.data.title,
      description: item.data.description || '',
      completed: item.data.completed || false,
      created_at: item.data.created_at,
      updated_at: now,
      is_deleted: false,
      sync_status: 'synced',
      server_id: serverId,
      last_synced_at: now
    }
  };
}

async function processDeleteOperation(item: any) {
  return {
    client_id: item.task_id,
    server_id: item.data.server_id || null,
    status: 'success' as const,
    resolved_data: null
  };
}