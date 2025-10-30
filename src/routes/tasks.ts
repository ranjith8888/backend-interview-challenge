import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { SyncService } from '../services/syncService';
import { Database } from '../db/database';

interface CreateTaskRequest {
  title: string;
  description?: string;
}

interface UpdateTaskRequest {
  title?: string;
  description?: string;
  completed?: boolean;
}

function validateCreateTask(data: any): data is CreateTaskRequest {
  return typeof data.title === 'string' && data.title.trim().length > 0 &&
         (data.description === undefined || typeof data.description === 'string');
}

function validateUpdateTask(data: any): data is UpdateTaskRequest {
  return (data.title === undefined || (typeof data.title === 'string' && data.title.trim().length > 0)) &&
         (data.description === undefined || typeof data.description === 'string') &&
         (data.completed === undefined || typeof data.completed === 'boolean');
}

export function createTaskRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      res.status(500).json({
        error: 'Failed to fetch tasks',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }
      res.json(task);
    } catch (error) {
      console.error('Failed to fetch task:', error);
      res.status(500).json({
        error: 'Failed to fetch task',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      if (!validateCreateTask(req.body)) {
        return res.status(400).json({
          error: 'Invalid task data. Title is required and must be a non-empty string.',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      const taskData = {
        title: req.body.title.trim(),
        description: req.body.description?.trim() || ''
      };

      const task = await taskService.createTask(taskData);
      await syncService.addToSyncQueue(task.id, 'create', task);

      res.status(201).json(task);
    } catch (error) {
      console.error('Failed to create task:', error);
      res.status(500).json({
        error: 'Failed to create task',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      if (!validateUpdateTask(req.body)) {
        return res.status(400).json({
          error: 'Invalid task data. Title must be a non-empty string if provided.',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      const existingTask = await taskService.getTask(req.params.id);
      if (!existingTask) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      const updates: UpdateTaskRequest = {};
      if (req.body.title !== undefined) updates.title = req.body.title.trim();
      if (req.body.description !== undefined) updates.description = req.body.description.trim();
      if (req.body.completed !== undefined) updates.completed = req.body.completed;

      const updatedTask = await taskService.updateTask(req.params.id, updates);
      
      if (!updatedTask) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      await syncService.addToSyncQueue(req.params.id, 'update', updatedTask);

      res.json(updatedTask);
    } catch (error) {
      console.error('Failed to update task:', error);
      res.status(500).json({
        error: 'Failed to update task',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const existingTask = await taskService.getTask(req.params.id);
      if (!existingTask) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      const success = await taskService.deleteTask(req.params.id);
      if (!success) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      await syncService.addToSyncQueue(req.params.id, 'delete', existingTask);

      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete task:', error);
      res.status(500).json({
        error: 'Failed to delete task',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  return router;
}