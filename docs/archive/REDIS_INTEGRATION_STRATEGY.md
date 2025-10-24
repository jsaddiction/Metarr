# Redis Integration Strategy

## Overview

Strategy for integrating Redis as the primary job queue storage while maintaining SQLite as fallback for users without Redis infrastructure.

---

## Architecture Goals

1. **Zero-Configuration Default**: SQLite works out of the box
2. **Seamless Upgrade Path**: Easy migration from SQLite to Redis
3. **No Breaking Changes**: Existing installations continue working
4. **Performance at Scale**: Redis for high-volume production use
5. **Developer Friendly**: Simple local development without Redis

---

## Storage Abstraction Layer

Already implemented in codebase:

```typescript
// src/services/jobQueue/storage/IJobQueueStorage.ts
export interface IJobQueueStorage {
  addJob(job: JobData): Promise<number>;
  getJob(id: number): Promise<Job | null>;
  updateJob(id: number, updates: Partial<Job>): Promise<void>;
  getNextJob(): Promise<Job | null>;
  getJobs(filter?: JobFilter): Promise<Job[]>;
  deleteJob(id: number): Promise<void>;
  getJobStats(): Promise<JobStats>;
}
```

### SQLite Implementation (Default)
```typescript
// src/services/jobQueue/storage/SQLiteJobQueueStorage.ts
export class SQLiteJobQueueStorage implements IJobQueueStorage {
  // Uses local SQLite database
  // Zero configuration required
  // Good for <10k jobs/day
}
```

### Redis Implementation (Production)
```typescript
// src/services/jobQueue/storage/RedisJobQueueStorage.ts
export class RedisJobQueueStorage implements IJobQueueStorage {
  private redis: Redis;
  private sub: Redis;  // For pub/sub
  private jobIdCounter: string = 'job:id:counter';

  async addJob(job: JobData): Promise<number> {
    const id = await this.redis.incr(this.jobIdCounter);

    const jobKey = `job:${id}`;
    const queueKey = `queue:priority:${job.priority}`;

    // Store job data
    await this.redis.hset(jobKey, {
      id,
      type: job.type,
      payload: JSON.stringify(job.payload),
      priority: job.priority,
      status: 'pending',
      created_at: Date.now(),
      retry_count: job.retry_count || 0,
      max_retries: job.max_retries || 3
    });

    // Add to priority queue
    await this.redis.zadd(queueKey, Date.now(), id);

    // Publish event
    await this.redis.publish('job:created', JSON.stringify({ id, type: job.type }));

    return id;
  }

  async getNextJob(): Promise<Job | null> {
    // Check priority queues in order (1-10)
    for (let priority = 1; priority <= 10; priority++) {
      const queueKey = `queue:priority:${priority}`;

      // Atomic pop from sorted set
      const result = await this.redis.zpopmin(queueKey);
      if (result.length > 0) {
        const jobId = result[0];
        const job = await this.getJob(parseInt(jobId));

        if (job) {
          // Mark as processing
          await this.redis.hset(`job:${jobId}`, 'status', 'processing');
          await this.redis.publish('job:processing', JSON.stringify({ id: jobId }));
          return job;
        }
      }
    }

    return null;
  }
}
```

---

## Configuration

### Environment Variables

```env
# Job Queue Storage
JOB_QUEUE_STORAGE=sqlite  # Options: sqlite (default), redis

# Redis Configuration (if JOB_QUEUE_STORAGE=redis)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=metarr:
REDIS_CONNECTION_POOL_SIZE=10
REDIS_ENABLE_CLUSTER=false
```

### Runtime Detection

```typescript
// src/services/jobQueue/JobQueueService.ts
export class JobQueueService {
  private storage: IJobQueueStorage;

  constructor(config: JobQueueConfig) {
    this.storage = this.createStorage(config);
  }

  private createStorage(config: JobQueueConfig): IJobQueueStorage {
    const storageType = process.env.JOB_QUEUE_STORAGE || 'sqlite';

    switch (storageType) {
      case 'redis':
        // Check Redis availability
        if (!this.isRedisAvailable()) {
          logger.warn('Redis configured but not available, falling back to SQLite');
          return new SQLiteJobQueueStorage(config.db);
        }
        return new RedisJobQueueStorage(config.redis);

      case 'sqlite':
      default:
        return new SQLiteJobQueueStorage(config.db);
    }
  }

  private async isRedisAvailable(): Promise<boolean> {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        lazyConnect: true,
        connectTimeout: 3000
      });

      await redis.connect();
      await redis.ping();
      await redis.disconnect();
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

---

## Redis Data Structure

### Keys Pattern

```
metarr:job:{id}                    # Hash - Job data
metarr:queue:priority:{1-10}       # Sorted Set - Job IDs by priority
metarr:queue:scheduled             # Sorted Set - Scheduled jobs by timestamp
metarr:queue:failed                # List - Failed job IDs
metarr:queue:dead                  # List - Dead letter queue
metarr:job:id:counter              # String - Auto-increment ID
metarr:stats:processed             # String - Total processed count
metarr:stats:failed                # String - Total failed count
metarr:lock:job:{id}               # String - Job processing lock (TTL)
```

### Job Hash Structure

```
HSET metarr:job:123
  id "123"
  type "scan-movie"
  payload '{"movieId": 456}'
  priority "3"
  status "pending"
  created_at "1634567890123"
  started_at "1634567891000"
  completed_at "1634567892000"
  retry_count "0"
  max_retries "3"
  error_message ""
  result '{"success": true}'
```

---

## Migration Strategy

### Phase 1: Parallel Running (v1.1)
- Both SQLite and Redis implementations available
- Default remains SQLite
- Power users can opt-in to Redis
- Document Redis benefits and setup

### Phase 2: Redis Recommendation (v1.2)
- Detect high job volume and recommend Redis
- Provide migration tool: `npm run migrate:jobs-to-redis`
- Show performance comparisons in UI
- Redis becomes recommended for >10k jobs/day

### Phase 3: Redis Default (v2.0)
- Redis becomes default for new installations
- SQLite remains as fallback
- Auto-detection and fallback logic
- Clear messaging about storage backend

---

## Migration Tool

```typescript
// src/tools/migrateJobQueue.ts
export async function migrateJobsToRedis() {
  const sqliteStorage = new SQLiteJobQueueStorage(db);
  const redisStorage = new RedisJobQueueStorage(redis);

  // Get all pending/failed jobs from SQLite
  const jobs = await sqliteStorage.getJobs({
    status: ['pending', 'failed', 'processing']
  });

  console.log(`Migrating ${jobs.length} jobs to Redis...`);

  for (const job of jobs) {
    // Add to Redis
    const newId = await redisStorage.addJob({
      type: job.type,
      payload: job.payload,
      priority: job.priority,
      retry_count: job.retry_count,
      max_retries: job.max_retries
    });

    console.log(`Migrated job ${job.id} → ${newId}`);
  }

  console.log('Migration complete!');
  console.log('Update JOB_QUEUE_STORAGE=redis in your environment');
}
```

---

## Performance Characteristics

### SQLite (Default)
- **Throughput**: ~1,000 jobs/minute
- **Latency**: 5-10ms per operation
- **Concurrency**: Limited by file locks
- **Persistence**: Immediate disk writes
- **Best for**: <10k jobs/day, single server

### Redis (Production)
- **Throughput**: ~100,000 jobs/minute
- **Latency**: <1ms per operation
- **Concurrency**: Excellent (thousands of connections)
- **Persistence**: Configurable (RDB/AOF)
- **Best for**: >10k jobs/day, distributed systems

---

## Redis High Availability

### Redis Sentinel (Recommended)
```yaml
# docker-compose.yml
services:
  redis-master:
    image: redis:7-alpine
    command: redis-server --appendonly yes

  redis-slave:
    image: redis:7-alpine
    command: redis-server --slaveof redis-master 6379

  redis-sentinel:
    image: redis:7-alpine
    command: redis-sentinel /etc/redis-sentinel/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/redis-sentinel/sentinel.conf
```

### Redis Cluster (Advanced)
```typescript
// Support for Redis Cluster
const redis = new Redis.Cluster([
  { host: 'redis-1', port: 6379 },
  { host: 'redis-2', port: 6379 },
  { host: 'redis-3', port: 6379 }
]);
```

---

## Monitoring & Metrics

### Redis Metrics to Track
```typescript
interface RedisMetrics {
  // Connection
  connected: boolean;
  latency: number;

  // Queue sizes
  pendingJobs: number;
  processingJobs: number;
  failedJobs: number;

  // Performance
  jobsPerMinute: number;
  avgProcessingTime: number;

  // Redis info
  memoryUsage: number;
  connectedClients: number;
  opsPerSecond: number;
}
```

### Health Check
```typescript
async checkRedisHealth(): Promise<HealthStatus> {
  try {
    const start = Date.now();
    await this.redis.ping();
    const latency = Date.now() - start;

    const info = await this.redis.info();
    const memory = this.parseRedisInfo(info, 'used_memory_human');

    return {
      status: 'healthy',
      latency,
      memory,
      queueSizes: await this.getQueueSizes()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}
```

---

## Development Setup

### Local Development (No Redis)
```bash
# Default - uses SQLite
npm run dev
```

### Local Development (With Redis)
```bash
# Start Redis container
docker run -d -p 6379:6379 redis:7-alpine

# Configure environment
export JOB_QUEUE_STORAGE=redis

# Start development
npm run dev
```

### Docker Compose Development
```yaml
version: '3.8'
services:
  metarr:
    build: .
    environment:
      - JOB_QUEUE_STORAGE=redis
      - REDIS_HOST=redis
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

---

## Testing Strategy

### Unit Tests
```typescript
describe.each([
  ['SQLite', () => new SQLiteJobQueueStorage(db)],
  ['Redis', () => new RedisJobQueueStorage(redis)]
])('%s Job Queue Storage', (name, createStorage) => {
  let storage: IJobQueueStorage;

  beforeEach(async () => {
    storage = createStorage();
  });

  it('should add and retrieve jobs', async () => {
    const id = await storage.addJob({
      type: 'test',
      payload: { test: true },
      priority: 5
    });

    const job = await storage.getJob(id);
    expect(job).toBeDefined();
    expect(job?.type).toBe('test');
  });

  // Test all interface methods...
});
```

### Load Testing
```typescript
// tools/loadTestJobQueue.ts
async function loadTest(storage: IJobQueueStorage) {
  const startTime = Date.now();
  const jobCount = 10000;

  // Add jobs
  for (let i = 0; i < jobCount; i++) {
    await storage.addJob({
      type: 'load-test',
      payload: { index: i },
      priority: Math.floor(Math.random() * 10) + 1
    });
  }

  // Process jobs
  let processed = 0;
  while (processed < jobCount) {
    const job = await storage.getNextJob();
    if (job) {
      await storage.updateJob(job.id, { status: 'completed' });
      processed++;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`Processed ${jobCount} jobs in ${duration}ms`);
  console.log(`Throughput: ${jobCount / (duration / 1000)} jobs/sec`);
}
```

---

## Documentation for Users

### When to Use Redis

Use Redis when:
- Processing >10,000 jobs per day
- Running multiple Metarr instances
- Need real-time job processing
- Want better job queue visibility
- Require job scheduling features

### Setup Guide

1. **Install Redis**
   ```bash
   # Docker
   docker run -d -p 6379:6379 redis:7-alpine

   # Ubuntu/Debian
   sudo apt install redis-server

   # macOS
   brew install redis
   ```

2. **Configure Metarr**
   ```env
   JOB_QUEUE_STORAGE=redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

3. **Migrate Existing Jobs** (optional)
   ```bash
   npm run migrate:jobs-to-redis
   ```

4. **Verify Setup**
   - Check System > Status page
   - Look for "Job Queue: Redis (Connected)"
   - Monitor job processing performance