import winston from 'winston';

/**
 * 日志记录器
 * 使用 Winston 提供结构化日志记录
 */
export class Logger {
  private logger: winston.Logger;
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { context: this.context },
      transports: [
        // 控制台输出
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
              // 处理 meta 对象，确保在终端正确显示
              let metaStr = '';
              if (Object.keys(meta).length > 0) {
                try {
                  metaStr = ' ' + JSON.stringify(meta, null, 2);
                } catch (error) {
                  metaStr = ' ' + String(meta);
                }
              }
              return `[${timestamp}] ${level}: [${context}] ${message}${metaStr}`;
            })
          )
        }),
        // 文件输出 - 所有日志
        new winston.transports.File({
          filename: 'logs/app.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        // 文件输出 - 错误日志
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    });
  }

  /**
   * 记录信息日志
   */
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * 记录警告日志
   */
  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * 记录错误日志
   */
  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  /**
   * 记录调试日志
   */
  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * 记录网络连接事件
   */
  public logConnectionEvent(event: string, details?: any): void {
    this.info(`网络连接事件: ${event}`, {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * 记录重连事件
   */
  public logReconnectEvent(attempt: number, success: boolean, error?: any): void {
    const level = success ? 'info' : 'error';
    const message = success ? '重连成功' : '重连失败';
    
    this.logger[level](`重连事件: ${message}`, {
      attempt,
      success,
      timestamp: new Date().toISOString(),
      error: error?.message || error
    });
  }

  /**
   * 记录K线数据接收事件
   */
  public logKlineData(symbol: string, price: number, volume: number, timestamp: number): void {
    this.debug('K线数据接收', {
      symbol,
      price,
      volume,
      timestamp: new Date(timestamp).toISOString(),
      receivedAt: new Date().toISOString()
    });
  }

  /**
   * 记录心跳事件
   */
  public logHeartbeatEvent(type: 'ping' | 'pong', timestamp: string): void {
    this.debug(`心跳事件: ${type}`, {
      type,
      timestamp,
      receivedAt: new Date().toISOString()
    });
  }

  /**
   * 记录订阅事件
   */
  public logSubscriptionEvent(action: 'subscribe' | 'unsubscribe' | 'resubscribe', symbols: string[], success: boolean): void {
    const level = success ? 'info' : 'error';
    const message = success ? '订阅操作成功' : '订阅操作失败';
    
    this.logger[level](`订阅事件: ${message}`, {
      action,
      symbols,
      success,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录系统状态变化
   */
  public logStatusChange(from: string, to: string, reason?: string): void {
    this.info('系统状态变化', {
      from,
      to,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 创建子日志记录器
   */
  public child(context: string): Logger {
    return new Logger(`${this.context}:${context}`);
  }

  /**
   * 获取原始 Winston 日志记录器
   */
  public getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}
