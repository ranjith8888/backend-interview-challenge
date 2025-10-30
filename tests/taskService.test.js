"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const database_1 = require("../src/db/database");
const taskService_1 = require("../src/services/taskService");
(0, vitest_1.describe)('TaskService', () => {
    let db;
    let taskService;
    (0, vitest_1.beforeEach)(async () => {
        db = new database_1.Database(':memory:');
        await db.initialize();
        taskService = new taskService_1.TaskService(db);
    });
    (0, vitest_1.afterEach)(async () => {
        await db.close();
    });
    (0, vitest_1.describe)('createTask', () => {
        (0, vitest_1.it)('should create a new task with default values', async () => {
            const taskData = {
                title: 'Test Task',
                description: 'Test Description',
            };
            const task = await taskService.createTask(taskData);
            (0, vitest_1.expect)(task).toBeDefined();
            (0, vitest_1.expect)(task.id).toBeDefined();
            (0, vitest_1.expect)(task.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
            (0, vitest_1.expect)(task.title).toBe('Test Task');
            (0, vitest_1.expect)(task.description).toBe('Test Description');
            (0, vitest_1.expect)(task.completed).toBe(false);
            (0, vitest_1.expect)(task.is_deleted).toBe(false);
            (0, vitest_1.expect)(task.sync_status).toBe('pending');
            (0, vitest_1.expect)(task.server_id).toBeNull();
            (0, vitest_1.expect)(task.last_synced_at).toBeNull();
            (0, vitest_1.expect)(task.created_at).toBeInstanceOf(Date);
            (0, vitest_1.expect)(task.updated_at).toBeInstanceOf(Date);
        });
        (0, vitest_1.it)('should create task with only title', async () => {
            const taskData = {
                title: 'Minimal Task',
            };
            const task = await taskService.createTask(taskData);
            (0, vitest_1.expect)(task.title).toBe('Minimal Task');
            (0, vitest_1.expect)(task.description).toBe('');
            (0, vitest_1.expect)(task.completed).toBe(false);
        });
        (0, vitest_1.it)('should store task in database', async () => {
            const taskData = {
                title: 'Database Task',
                description: 'Should be stored in DB',
            };
            const task = await taskService.createTask(taskData);
            // Verify task exists in database
            const dbTask = await db.get('SELECT * FROM tasks WHERE id = ?', [task.id]);
            (0, vitest_1.expect)(dbTask).toBeDefined();
            (0, vitest_1.expect)(dbTask.title).toBe('Database Task');
            (0, vitest_1.expect)(dbTask.description).toBe('Should be stored in DB');
            (0, vitest_1.expect)(dbTask.completed).toBe(0);
            (0, vitest_1.expect)(dbTask.is_deleted).toBe(0);
            (0, vitest_1.expect)(dbTask.sync_status).toBe('pending');
        });
        (0, vitest_1.it)('should add task to sync queue after creation', async () => {
            const taskData = {
                title: 'Test Task',
            };
            const task = await taskService.createTask(taskData);
            // Check if task was added to sync queue
            const syncQueue = await db.all('SELECT * FROM sync_queue WHERE task_id = ?', [task.id]);
            (0, vitest_1.expect)(syncQueue.length).toBe(1);
            (0, vitest_1.expect)(syncQueue[0].operation).toBe('create');
            const queueData = JSON.parse(syncQueue[0].data);
            (0, vitest_1.expect)(queueData.title).toBe('Test Task');
        });
    });
    (0, vitest_1.describe)('getTask', () => {
        (0, vitest_1.it)('should retrieve an existing task', async () => {
            const createdTask = await taskService.createTask({ title: 'Retrieve Me' });
            const retrievedTask = await taskService.getTask(createdTask.id);
            (0, vitest_1.expect)(retrievedTask).toBeDefined();
            (0, vitest_1.expect)(retrievedTask?.id).toBe(createdTask.id);
            (0, vitest_1.expect)(retrievedTask?.title).toBe('Retrieve Me');
        });
        (0, vitest_1.it)('should return null for non-existent task', async () => {
            const task = await taskService.getTask('non-existent-id');
            (0, vitest_1.expect)(task).toBeNull();
        });
        (0, vitest_1.it)('should not return deleted tasks', async () => {
            const task = await taskService.createTask({ title: 'To Delete' });
            await taskService.deleteTask(task.id);
            const retrieved = await taskService.getTask(task.id);
            (0, vitest_1.expect)(retrieved).toBeNull();
        });
    });
    (0, vitest_1.describe)('updateTask', () => {
        (0, vitest_1.it)('should update an existing task', async () => {
            const task = await taskService.createTask({ title: 'Original Title' });
            const updates = {
                title: 'Updated Title',
                description: 'Updated description',
                completed: true,
            };
            const updated = await taskService.updateTask(task.id, updates);
            (0, vitest_1.expect)(updated).toBeDefined();
            (0, vitest_1.expect)(updated?.title).toBe('Updated Title');
            (0, vitest_1.expect)(updated?.description).toBe('Updated description');
            (0, vitest_1.expect)(updated?.completed).toBe(true);
            (0, vitest_1.expect)(updated?.sync_status).toBe('pending');
            (0, vitest_1.expect)(updated?.updated_at.getTime()).toBeGreaterThan(task.updated_at.getTime());
        });
        (0, vitest_1.it)('should handle partial updates', async () => {
            const task = await taskService.createTask({
                title: 'Original',
                description: 'Original description',
                completed: false
            });
            // Update only completed status
            const updated = await taskService.updateTask(task.id, { completed: true });
            (0, vitest_1.expect)(updated?.title).toBe('Original');
            (0, vitest_1.expect)(updated?.description).toBe('Original description');
            (0, vitest_1.expect)(updated?.completed).toBe(true);
        });
        (0, vitest_1.it)('should return null for non-existent task', async () => {
            const result = await taskService.updateTask('non-existent-id', { title: 'Test' });
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('should add update operation to sync queue', async () => {
            const task = await taskService.createTask({ title: 'Task' });
            await taskService.updateTask(task.id, { title: 'Updated' });
            const syncItems = await db.all('SELECT * FROM sync_queue WHERE task_id = ? AND operation = "update"', [task.id]);
            (0, vitest_1.expect)(syncItems.length).toBe(1);
        });
    });
    (0, vitest_1.describe)('deleteTask', () => {
        (0, vitest_1.it)('should soft delete a task', async () => {
            const task = await taskService.createTask({ title: 'To Delete' });
            const result = await taskService.deleteTask(task.id);
            (0, vitest_1.expect)(result).toBe(true);
            // Verify task is soft deleted in database
            const dbTask = await db.get('SELECT * FROM tasks WHERE id = ?', [task.id]);
            (0, vitest_1.expect)(dbTask.is_deleted).toBe(1);
            (0, vitest_1.expect)(dbTask.sync_status).toBe('pending');
            // Verify task cannot be retrieved via getTask
            const retrieved = await taskService.getTask(task.id);
            (0, vitest_1.expect)(retrieved).toBeNull();
        });
        (0, vitest_1.it)('should return false for non-existent task', async () => {
            const result = await taskService.deleteTask('non-existent-id');
            (0, vitest_1.expect)(result).toBe(false);
        });
        (0, vitest_1.it)('should add delete operation to sync queue', async () => {
            const task = await taskService.createTask({ title: 'To Delete' });
            await taskService.deleteTask(task.id);
            const syncItems = await db.all('SELECT * FROM sync_queue WHERE task_id = ? AND operation = "delete"', [task.id]);
            (0, vitest_1.expect)(syncItems.length).toBe(1);
        });
    });
    (0, vitest_1.describe)('getAllTasks', () => {
        (0, vitest_1.it)('should return all non-deleted tasks', async () => {
            // Create some tasks
            await taskService.createTask({ title: 'Task 1' });
            await taskService.createTask({ title: 'Task 2' });
            const toDelete = await taskService.createTask({ title: 'Task 3' });
            // Delete one task
            await taskService.deleteTask(toDelete.id);
            const tasks = await taskService.getAllTasks();
            (0, vitest_1.expect)(tasks.length).toBe(2);
            const taskTitles = tasks.map(t => t.title);
            (0, vitest_1.expect)(taskTitles).toContain('Task 1');
            (0, vitest_1.expect)(taskTitles).toContain('Task 2');
            (0, vitest_1.expect)(taskTitles).not.toContain('Task 3');
        });
        (0, vitest_1.it)('should return empty array when no tasks', async () => {
            const tasks = await taskService.getAllTasks();
            (0, vitest_1.expect)(tasks).toEqual([]);
        });
        (0, vitest_1.it)('should return tasks in descending creation order', async () => {
            await taskService.createTask({ title: 'First Task' });
            await new Promise(resolve => setTimeout(resolve, 10));
            await taskService.createTask({ title: 'Second Task' });
            const tasks = await taskService.getAllTasks();
            (0, vitest_1.expect)(tasks.length).toBe(2);
            (0, vitest_1.expect)(tasks[0].title).toBe('Second Task');
            (0, vitest_1.expect)(tasks[1].title).toBe('First Task');
        });
    });
    (0, vitest_1.describe)('getTasksNeedingSync', () => {
        (0, vitest_1.it)('should return tasks with pending or error sync status', async () => {
            // Create tasks with different sync statuses
            const task1 = await taskService.createTask({ title: 'Pending Task' });
            const task2 = await taskService.createTask({ title: 'Another Pending' });
            // Manually update one task to 'synced' status
            await db.run('UPDATE tasks SET sync_status = ? WHERE id = ?', ['synced', task2.id]);
            // Manually update one task to 'error' status
            const task3 = await taskService.createTask({ title: 'Error Task' });
            await db.run('UPDATE tasks SET sync_status = ? WHERE id = ?', ['error', task3.id]);
            const needingSync = await taskService.getTasksNeedingSync();
            (0, vitest_1.expect)(needingSync.length).toBe(2); // task1 and task3
            const taskIds = needingSync.map(t => t.id);
            (0, vitest_1.expect)(taskIds).toContain(task1.id);
            (0, vitest_1.expect)(taskIds).toContain(task3.id);
            (0, vitest_1.expect)(taskIds).not.toContain(task2.id);
        });
        (0, vitest_1.it)('should not return deleted tasks', async () => {
            const task = await taskService.createTask({ title: 'To Delete' });
            await taskService.deleteTask(task.id);
            const needingSync = await taskService.getTasksNeedingSync();
            const taskIds = needingSync.map(t => t.id);
            (0, vitest_1.expect)(taskIds).not.toContain(task.id);
        });
    });
    (0, vitest_1.describe)('markAsSynced', () => {
        (0, vitest_1.it)('should update task sync status and server ID', async () => {
            const task = await taskService.createTask({ title: 'Task' });
            await taskService.markAsSynced(task.id, 'server-123');
            const updated = await taskService.getTask(task.id);
            (0, vitest_1.expect)(updated?.sync_status).toBe('synced');
            (0, vitest_1.expect)(updated?.server_id).toBe('server-123');
            (0, vitest_1.expect)(updated?.last_synced_at).toBeInstanceOf(Date);
        });
        (0, vitest_1.it)('should handle sync without server ID', async () => {
            const task = await taskService.createTask({ title: 'Task' });
            await taskService.markAsSynced(task.id);
            const updated = await taskService.getTask(task.id);
            (0, vitest_1.expect)(updated?.sync_status).toBe('synced');
            (0, vitest_1.expect)(updated?.server_id).toBeNull();
        });
    });
    (0, vitest_1.describe)('markSyncError', () => {
        (0, vitest_1.it)('should mark task sync status as error', async () => {
            const task = await taskService.createTask({ title: 'Task' });
            await taskService.markSyncError(task.id);
            const updated = await taskService.getTask(task.id);
            (0, vitest_1.expect)(updated?.sync_status).toBe('error');
        });
    });
    (0, vitest_1.describe)('updateTaskFromSync', () => {
        (0, vitest_1.it)('should update task with server data', async () => {
            const task = await taskService.createTask({ title: 'Local Task' });
            const serverData = {
                title: 'Server Task',
                description: 'From server',
                completed: true,
                server_id: 'server-123'
            };
            await taskService.updateTaskFromSync(task.id, serverData);
            const updated = await taskService.getTask(task.id);
            (0, vitest_1.expect)(updated?.title).toBe('Server Task');
            (0, vitest_1.expect)(updated?.description).toBe('From server');
            (0, vitest_1.expect)(updated?.completed).toBe(true);
            (0, vitest_1.expect)(updated?.server_id).toBe('server-123');
            (0, vitest_1.expect)(updated?.sync_status).toBe('synced');
            (0, vitest_1.expect)(updated?.last_synced_at).toBeInstanceOf(Date);
        });
    });
});
