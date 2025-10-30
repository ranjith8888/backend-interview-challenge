import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../src/db/database';
import { TaskService } from '../src/services/taskService';
import { Task } from '../src/types';

describe('TaskService', () => {
  let db: Database;
  let taskService: TaskService;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
    taskService = new TaskService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('createTask', () => {
    it('should create a new task with default values', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
      };

      const task = await taskService.createTask(taskData);

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.completed).toBe(false);
      expect(task.is_deleted).toBe(false);
      expect(task.sync_status).toBe('pending');
      expect(task.server_id).toBeNull();
      expect(task.last_synced_at).toBeNull();
      expect(task.created_at).toBeInstanceOf(Date);
      expect(task.updated_at).toBeInstanceOf(Date);
    });

    it('should create task with only title', async () => {
      const taskData = {
        title: 'Minimal Task',
      };

      const task = await taskService.createTask(taskData);

      expect(task.title).toBe('Minimal Task');
      expect(task.description).toBe('');
      expect(task.completed).toBe(false);
    });

    it('should store task in database', async () => {
      const taskData = {
        title: 'Database Task',
        description: 'Should be stored in DB',
      };

      const task = await taskService.createTask(taskData);

      // Verify task exists in database
      const dbTask = await db.get('SELECT * FROM tasks WHERE id = ?', [task.id]);
      expect(dbTask).toBeDefined();
      expect(dbTask.title).toBe('Database Task');
      expect(dbTask.description).toBe('Should be stored in DB');
      expect(dbTask.completed).toBe(0);
      expect(dbTask.is_deleted).toBe(0);
      expect(dbTask.sync_status).toBe('pending');
    });

    it('should add task to sync queue after creation', async () => {
      const taskData = {
        title: 'Test Task',
      };

      const task = await taskService.createTask(taskData);
      
      // Check if task was added to sync queue
      const syncQueue = await db.all('SELECT * FROM sync_queue WHERE task_id = ?', [task.id]);
      expect(syncQueue.length).toBe(1);
      expect(syncQueue[0].operation).toBe('create');
      
      const queueData = JSON.parse(syncQueue[0].data);
      expect(queueData.title).toBe('Test Task');
    });
  });

  describe('getTask', () => {
    it('should retrieve an existing task', async () => {
      const createdTask = await taskService.createTask({ title: 'Retrieve Me' });
      
      const retrievedTask = await taskService.getTask(createdTask.id);

      expect(retrievedTask).toBeDefined();
      expect(retrievedTask?.id).toBe(createdTask.id);
      expect(retrievedTask?.title).toBe('Retrieve Me');
    });

    it('should return null for non-existent task', async () => {
      const task = await taskService.getTask('non-existent-id');
      expect(task).toBeNull();
    });

    it('should not return deleted tasks', async () => {
      const task = await taskService.createTask({ title: 'To Delete' });
      await taskService.deleteTask(task.id);

      const retrieved = await taskService.getTask(task.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('should update an existing task', async () => {
      const task = await taskService.createTask({ title: 'Original Title' });
      
      const updates = {
        title: 'Updated Title',
        description: 'Updated description',
        completed: true,
      };

      const updated = await taskService.updateTask(task.id, updates);

      expect(updated).toBeDefined();
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.completed).toBe(true);
      expect(updated?.sync_status).toBe('pending');
      expect(updated?.updated_at.getTime()).toBeGreaterThan(task.updated_at.getTime());
    });

    it('should handle partial updates', async () => {
      const task = await taskService.createTask({ 
        title: 'Original',
        description: 'Original description',
        completed: false
      });

      // Update only completed status
      const updated = await taskService.updateTask(task.id, { completed: true });

      expect(updated?.title).toBe('Original');
      expect(updated?.description).toBe('Original description');
      expect(updated?.completed).toBe(true);
    });

    it('should return null for non-existent task', async () => {
      const result = await taskService.updateTask('non-existent-id', { title: 'Test' });
      expect(result).toBeNull();
    });

    it('should add update operation to sync queue', async () => {
      const task = await taskService.createTask({ title: 'Task' });
      
      await taskService.updateTask(task.id, { title: 'Updated' });

      const syncItems = await db.all(
        'SELECT * FROM sync_queue WHERE task_id = ? AND operation = "update"',
        [task.id]
      );
      expect(syncItems.length).toBe(1);
    });
  });

  describe('deleteTask', () => {
    it('should soft delete a task', async () => {
      const task = await taskService.createTask({ title: 'To Delete' });
      
      const result = await taskService.deleteTask(task.id);
      expect(result).toBe(true);

      // Verify task is soft deleted in database
      const dbTask = await db.get('SELECT * FROM tasks WHERE id = ?', [task.id]);
      expect(dbTask.is_deleted).toBe(1);
      expect(dbTask.sync_status).toBe('pending');

      // Verify task cannot be retrieved via getTask
      const retrieved = await taskService.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent task', async () => {
      const result = await taskService.deleteTask('non-existent-id');
      expect(result).toBe(false);
    });

    it('should add delete operation to sync queue', async () => {
      const task = await taskService.createTask({ title: 'To Delete' });
      
      await taskService.deleteTask(task.id);

      const syncItems = await db.all(
        'SELECT * FROM sync_queue WHERE task_id = ? AND operation = "delete"',
        [task.id]
      );
      expect(syncItems.length).toBe(1);
    });
  });

  describe('getAllTasks', () => {
    it('should return all non-deleted tasks', async () => {
      // Create some tasks
      await taskService.createTask({ title: 'Task 1' });
      await taskService.createTask({ title: 'Task 2' });
      const toDelete = await taskService.createTask({ title: 'Task 3' });
      
      // Delete one task
      await taskService.deleteTask(toDelete.id);

      const tasks = await taskService.getAllTasks();
      expect(tasks.length).toBe(2);
      
      const taskTitles = tasks.map(t => t.title);
      expect(taskTitles).toContain('Task 1');
      expect(taskTitles).toContain('Task 2');
      expect(taskTitles).not.toContain('Task 3');
    });

    it('should return empty array when no tasks', async () => {
      const tasks = await taskService.getAllTasks();
      expect(tasks).toEqual([]);
    });

    it('should return tasks in descending creation order', async () => {
      await taskService.createTask({ title: 'First Task' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await taskService.createTask({ title: 'Second Task' });

      const tasks = await taskService.getAllTasks();
      expect(tasks.length).toBe(2);
      expect(tasks[0].title).toBe('Second Task');
      expect(tasks[1].title).toBe('First Task');
    });
  });

  describe('getTasksNeedingSync', () => {
    it('should return tasks with pending or error sync status', async () => {
      // Create tasks with different sync statuses
      const task1 = await taskService.createTask({ title: 'Pending Task' });
      const task2 = await taskService.createTask({ title: 'Another Pending' });
      
      // Manually update one task to 'synced' status
      await db.run('UPDATE tasks SET sync_status = ? WHERE id = ?', ['synced', task2.id]);

      // Manually update one task to 'error' status
      const task3 = await taskService.createTask({ title: 'Error Task' });
      await db.run('UPDATE tasks SET sync_status = ? WHERE id = ?', ['error', task3.id]);

      const needingSync = await taskService.getTasksNeedingSync();
      expect(needingSync.length).toBe(2); // task1 and task3
      
      const taskIds = needingSync.map(t => t.id);
      expect(taskIds).toContain(task1.id);
      expect(taskIds).toContain(task3.id);
      expect(taskIds).not.toContain(task2.id);
    });

    it('should not return deleted tasks', async () => {
      const task = await taskService.createTask({ title: 'To Delete' });
      await taskService.deleteTask(task.id);

      const needingSync = await taskService.getTasksNeedingSync();
      const taskIds = needingSync.map(t => t.id);
      expect(taskIds).not.toContain(task.id);
    });
  });

  describe('markAsSynced', () => {
    it('should update task sync status and server ID', async () => {
      const task = await taskService.createTask({ title: 'Task' });
      
      await taskService.markAsSynced(task.id, 'server-123');

      const updated = await taskService.getTask(task.id);
      expect(updated?.sync_status).toBe('synced');
      expect(updated?.server_id).toBe('server-123');
      expect(updated?.last_synced_at).toBeInstanceOf(Date);
    });

    it('should handle sync without server ID', async () => {
      const task = await taskService.createTask({ title: 'Task' });
      
      await taskService.markAsSynced(task.id);

      const updated = await taskService.getTask(task.id);
      expect(updated?.sync_status).toBe('synced');
      expect(updated?.server_id).toBeNull();
    });
  });

  describe('markSyncError', () => {
    it('should mark task sync status as error', async () => {
      const task = await taskService.createTask({ title: 'Task' });
      
      await taskService.markSyncError(task.id);

      const updated = await taskService.getTask(task.id);
      expect(updated?.sync_status).toBe('error');
    });
  });

  describe('updateTaskFromSync', () => {
    it('should update task with server data', async () => {
      const task = await taskService.createTask({ title: 'Local Task' });
      
      const serverData = {
        title: 'Server Task',
        description: 'From server',
        completed: true,
        server_id: 'server-123'
      };

      await taskService.updateTaskFromSync(task.id, serverData);

      const updated = await taskService.getTask(task.id);
      expect(updated?.title).toBe('Server Task');
      expect(updated?.description).toBe('From server');
      expect(updated?.completed).toBe(true);
      expect(updated?.server_id).toBe('server-123');
      expect(updated?.sync_status).toBe('synced');
      expect(updated?.last_synced_at).toBeInstanceOf(Date);
    });
  });
});