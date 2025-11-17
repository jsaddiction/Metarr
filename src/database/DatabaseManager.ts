import { DatabaseConfig, DatabaseConnection, DatabaseType, SqlParam } from '../types/database.js';
import { SqliteConnection } from './connections/SqliteConnection.js';
import { PostgresConnection } from './connections/PostgresConnection.js';
import { MySqlConnection } from './connections/MySqlConnection.js';
import { logger } from '../middleware/logging.js';
import { DatabaseError, ErrorCode } from '../errors/index.js';

export class DatabaseManager {
  private connection: DatabaseConnection | null = null;
  private config: DatabaseConfig;
  private reconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_MS = 1000;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    switch (this.config.type) {
      case 'sqlite3':
        this.connection = new SqliteConnection(this.config);
        break;
      case 'postgres':
        this.connection = new PostgresConnection(this.config);
        break;
      case 'mysql':
        this.connection = new MySqlConnection(this.config);
        break;
      default:
        throw new DatabaseError(
          `Unsupported database type: ${this.config.type}`,
          ErrorCode.DATABASE_CONNECTION_FAILED,
          false,
          {
            service: 'DatabaseManager',
            operation: 'connect',
            metadata: { requestedType: this.config.type }
          }
        );
    }

    await this.connection.connect?.();
  }

  async disconnect(): Promise<void> {
    // Stop health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  /**
   * Start periodic health checks
   * Validates connection and attempts reconnection if needed
   */
  startHealthCheck(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.validateConnection();
      } catch (error) {
        logger.error('Database health check failed', {
          error: error instanceof Error ? error.message : String(error),
        });

        // Attempt reconnection
        await this.reconnect();
      }
    }, intervalMs);

    // Prevent interval from blocking process exit
    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }

    logger.info('Database health check started', { intervalMs });
  }

  /**
   * Validate database connection by running a simple query
   */
  async validateConnection(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }

    try {
      // Simple query that works across all database types
      await this.connection.query('SELECT 1 as ping', []);
      return true;
    } catch (error) {
      logger.warn('Database connection validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Attempt to reconnect to database with exponential backoff
   */
  private async reconnect(): Promise<void> {
    if (this.reconnecting) {
      return; // Already attempting reconnection
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    try {
      logger.info('Attempting database reconnection', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
      });

      // Close existing connection if any
      if (this.connection) {
        try {
          await this.connection.close();
        } catch (error) {
          // Ignore close errors
        }
        this.connection = null;
      }

      // Wait with exponential backoff
      const delay = this.RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Attempt reconnection
      await this.connect();

      // Validate the new connection
      const isValid = await this.validateConnection();
      if (isValid) {
        logger.info('Database reconnection successful', {
          attempt: this.reconnectAttempts,
        });
        this.reconnectAttempts = 0; // Reset counter on success
      } else {
        throw new DatabaseError(
          'Connection validation failed after reconnect',
          ErrorCode.DATABASE_CONNECTION_FAILED,
          true, // Can retry reconnection
          {
            service: 'DatabaseManager',
            operation: 'reconnect',
            metadata: { attempt: this.reconnectAttempts }
          }
        );
      }
    } catch (error) {
      logger.error('Database reconnection failed', {
        attempt: this.reconnectAttempts,
        error: error instanceof Error ? error.message : String(error),
      });

      // Retry if under max attempts
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        setTimeout(() => this.reconnect(), 1000);
      }
    } finally {
      this.reconnecting = false;
    }
  }

  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new DatabaseError(
        'Database not connected. Call connect() first.',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        {
          service: 'DatabaseManager',
          operation: 'getConnection'
        }
      );
    }
    return this.connection;
  }

  /**
   * Get connection with automatic reconnection attempt
   */
  async getConnectionSafe(): Promise<DatabaseConnection> {
    if (!this.connection) {
      logger.warn('Database not connected, attempting to connect');
      await this.connect();
    }

    // Validate connection before returning
    const isValid = await this.validateConnection();
    if (!isValid) {
      logger.warn('Database connection invalid, attempting reconnection');
      await this.reconnect();
    }

    return this.getConnection();
  }

  async query<T = any>(sql: string, params?: SqlParam[]): Promise<T[]> {
    const connection = this.getConnection();
    return connection.query<T>(sql, params);
  }

  async execute(sql: string, params?: SqlParam[]): Promise<{ affectedRows: number; insertId?: number }> {
    const connection = this.getConnection();
    return connection.execute(sql, params);
  }

  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    const connection = this.getConnection();

    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  getDatabaseType(): DatabaseType {
    return this.config.type;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
