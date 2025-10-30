"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const database_1 = require("../src/db/database");
const taskService_1 = require("../src/services/taskService");
const syncService_1 = require("../src/services/syncService");
const axios_1 = __importDefault(require("axios"));
// Mock axios
vitest_1.vi.mock('axios');
(0, vitest_1.describe)('SyncService', () => {
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
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('checkConnectivity', () => {
        (0, vitest_1.it)('should return true when server is reachable', async () => {
            vitest_1.vi.mocked(axios_1.default.get).mockResolvedValueOnce({ data: { status: 'ok' } });
            const isOnline = await syncService.checkConnectivity();
            (0, vitest_1.expect)(isOnline).toBe(true);
        });
        (0, vitest_1.it)('should return false when server is unreachable', async () => {
            vitest_1.vi.mocked(axios_1.default.get).mockRejectedValueOnce(new Error('Network error'));
            const isOnline = await syncService.checkConnectivity();
            (0, vitest_1.expect)(isOnline).toBe(false);
        });
    });
    (0, vitest_1.describe)('addToSyncQueue', () => {
        (0, vitest_1.it)('should add operation to sync queue', async () => {
            const task = await taskService.createTask({ title: 'Test Task' });
            await syncService.addToSyncQueue(task.id, 'update', {
                title: 'Updated Title',
            });
            const queueItems = await db.all('SELECT * FROM sync_queue WHERE task_id = ?', [task.id]);
            (0, vitest_1.expect)(queueItems.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(queueItems[queueItems.length - 1].operation).toBe('update');
        });
    });
    (0, vitest_1.describe)('sync', () => {
        (0, vitest_1.it)('should process all items in sync queue', async () => {
            // Create tasks that need syncing
            const task1 = await taskService.createTask({ title: 'Task 1' });
            const task2 = await taskService.createTask({ title: 'Task 2' });
            // Mock successful sync response
            vitest_1.vi.mocked(axios_1.default.post).mockResolvedValueOnce({
                data: {
                    processed_items: [
                        {
                            client_id: task1.id,
                            server_id: 'srv_1',
                            status: 'success',
                        },
                        {
                            client_id: task2.id,
                            server_id: 'srv_2',
                            status: 'success',
                        },
                    ],
                },
            });
            const result = await syncService.sync();
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.synced_items).toBe(2);
            (0, vitest_1.expect)(result.failed_items).toBe(0);
        });
        (0, vitest_1.it)('should handle sync failures gracefully', async () => {
            const task = await taskService.createTask({ title: 'Task' });
            // Mock failed sync
            vitest_1.vi.mocked(axios_1.default.post).mockRejectedValueOnce(new Error('Network error'));
            const result = await syncService.sync();
            (0, vitest_1.expect)(result.success).toBe(false);
            (0, vitest_1.expect)(result.failed_items).toBeGreaterThan(0);
        });
    });
    (0, vitest_1.describe)('conflict resolution', () => {
        (0, vitest_1.it)('should resolve conflicts using last-write-wins', async () => {
            // This test would verify that when there's a conflict,
            // the task with the more recent updated_at timestamp wins
            // Implementation depends on the actual conflict resolution logic
        });
    });
});
