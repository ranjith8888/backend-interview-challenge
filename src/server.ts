<<<<<<< HEAD
﻿import express from 'express';
=======
import express from 'express';
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
import cors from 'cors';
import dotenv from 'dotenv';
import { Database } from './db/database';
import { createTaskRouter } from './routes/tasks';
import { createSyncRouter } from './routes/sync';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

<<<<<<< HEAD
app.use(cors());
app.use(express.json());

// Use different database path for production
const dbPath = process.env.NODE_ENV === 'production' 
  ? (process.env.DATABASE_URL || './data/tasks.sqlite3')
  : './data/tasks.sqlite3';

const db = new Database(dbPath);

app.use('/api/tasks', createTaskRouter(db));
app.use('/api', createSyncRouter(db));

app.use(errorHandler);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Task Sync API is running!',
    endpoints: {
      tasks: '/api/tasks',
      sync: '/api/sync',
      status: '/api/status',
      health: '/api/health'
    },
    timestamp: new Date().toISOString()
  });
});

=======
// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
const db = new Database(process.env.DATABASE_URL || './data/tasks.sqlite3');

// Routes
app.use('/api/tasks', createTaskRouter(db));
app.use('/api', createSyncRouter(db));

// Error handling
app.use(errorHandler);

// Start server
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
async function start() {
  try {
    await db.initialize();
    console.log('Database initialized');
    
    app.listen(PORT, () => {
<<<<<<< HEAD
      console.log(\Server running on port \\);
      console.log(\API available at http://localhost:\\);
      console.log(\Environment: \\);
=======
      console.log(`Server running on port ${PORT}`);
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

<<<<<<< HEAD
=======
// Graceful shutdown
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await db.close();
  process.exit(0);
<<<<<<< HEAD
});
=======
});
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
