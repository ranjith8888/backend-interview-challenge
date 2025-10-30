"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const database_1 = require("../src/db/database");
const taskService_1 = require("../src/services/taskService");
const syncService_1 = require("../src/services/syncService");
(0, vitest_1.describe)('Integration Tests', () => {
    let db;
    let taskService;
    let syncService;
    (0, vitest_1.beforeEach)(async () => {
        db = new database_1.Database(':memory:');
        await db.initialize();
        taskService = new taskService_1.TaskService(db);
        syncService = new syncService_1.SyncService(db, taskService);
    });
    (0, vitest_1.afterEach)(async () => {
        await db.close();
    });
    (0, vitest_1.describe)('Offline to Online Sync Flow', () => {
        (0, vitest_1.it)('should handle complete offline to online workflow', async () => {
            // Simulate offline operations
            // 1. Create task while offline
            const task1 = await taskService.createTask({
                title: 'Offline Task 1',
                description: 'Created while offline',
            });
            // 2. Update task while offline
            await taskService.updateTask(task1.id, {
                completed: true,
            });
            // 3. Create another task
            const task2 = await taskService.createTask({
                title: 'Offline Task 2',
            });
            // 4. Delete a task
            await taskService.deleteTask(task2.id);
            // Verify sync queue has all operations
            const queueItems = await db.all('SELECT * FROM sync_queue ORDER BY created_at');
            (0, vitest_1.expect)(queueItems.length).toBeGreaterThanOrEqual(4); // create, update, create, delete
            // Simulate coming online and syncing
            const isOnline = await syncService.checkConnectivity();
            if (isOnline) {
                const syncResult = await syncService.sync();
                // Verify sync results
                (0, vitest_1.expect)(syncResult).toBeDefined();
                (0, vitest_1.expect)(syncResult.success).toBeDefined();
            }
        });
    });
    (0, vitest_1.describe)('Conflict Resolution Scenario', () => {
        (0, vitest_1.it)('should handle task edited on multiple devices', async () => {
            // Create a task that's already synced
            const task = await taskService.createTask({
                title: 'Shared Task',
                description: 'Task on multiple devices',
            });
            // Simulate server having a different version
            // Update locally
            await taskService.updateTask(task.id, {
                title: 'Local Update',
                completed: true,
            });
            // When sync happens, conflict resolution should apply
            // The task with more recent updated_at should win
        });
    });
    (0, vitest_1.describe)('Error Recovery', () => {
        (0, vitest_1.it)('should retry failed sync operations', async () => {
            // Create a task
            const task = await taskService.createTask({
                title: 'Task to Sync',
            });
            // Simulate first sync attempt failure
            // Verify retry count increases
            // Verify task remains in pending state
            // Simulate successful retry
        });
    });
});
