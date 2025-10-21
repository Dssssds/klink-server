import { EventEmitter } from 'events';
import { ItickWebSocketClient } from '../client/ItickWebSocketClient';
import { ConnectionStatus, KlineData, QuoteData } from '../types/itick';
import { Logger } from '../utils/Logger';

/**
 * iTick 服务
 * 负责管理 WebSocket 连接、数据订阅和业务逻辑
 */
export class ItickService extends EventEmitter {
	private client: ItickWebSocketClient;
	private logger: Logger;
	private subscribedSymbols: string[] = [];
	private isRunning = false;
	private dataBuffer: KlineData[] = [];
	private quoteBuffer: QuoteData[] = [];
	private maxBufferSize = 1000;

	constructor(token: string) {
		super();
		this.logger = new Logger('ItickService');
		this.client = new ItickWebSocketClient(token);
		this.setupEventHandlers();
	}

	/**
	 * 设置事件处理器
	 */
	private setupEventHandlers(): void {
		// WebSocket 连接事件
		this.client.on('authenticated', () => {
			this.logger.info('WebSocket 身份验证成功');
			this.logger.logStatusChange('connecting', 'authenticated');
			this.emit('authenticated');
		});

		this.client.on('authFailed', (response) => {
			this.logger.error('WebSocket 身份验证失败', response);
			this.logger.logStatusChange('connecting', 'authFailed');
			this.emit('authFailed', response);
		});

		this.client.on('subscribed', () => {
			this.logger.info('K线数据订阅成功');
			this.logger.logStatusChange('authenticated', 'subscribed');
			this.emit('subscribed');
		});

		this.client.on('subscribeFailed', (response) => {
			this.logger.error('K线数据订阅失败', response);
			this.emit('subscribeFailed', response);
		});

		// K线数据事件
		this.client.on('klineData', (data: KlineData) => {
			this.handleKlineData(data);
		});

		// 报价数据事件
		this.client.on('quoteData', (data: QuoteData) => {
			this.handleQuoteData(data);
		});

		// 连接状态事件
		this.client.on('disconnected', (details) => {
			this.logger.logConnectionEvent('disconnected', details);
			this.logger.logStatusChange('subscribed', 'disconnected');
			this.emit('disconnected', details);
		});

		this.client.on('maxReconnectAttemptsReached', () => {
			this.logger.error('达到最大重连次数，服务停止');
			this.logger.logStatusChange('disconnected', 'failed');
			this.stop();
			this.emit('maxReconnectAttemptsReached');
		});
	}

	/**
	 * 启动服务
	 */
	public async start(symbols: string[] = ['EURUSD$GB']): Promise<void> {
		if (this.isRunning) {
			this.logger.warn('服务已在运行中');
			return;
		}

		try {
			this.logger.info('正在启动 iTick 服务...', { symbols });
			this.isRunning = true;
			this.subscribedSymbols = symbols;

			// 连接到 WebSocket
			await this.client.connect();
			this.logger.logConnectionEvent('connected');

			// 等待身份验证
			await this.waitForAuthentication();

			// 订阅K线数据
			this.client.subscribe(symbols);
			this.logger.logSubscriptionEvent('subscribe', symbols, true);

			this.logger.info('iTick 服务启动成功');
			this.emit('started');
		} catch (error) {
			this.logger.error('启动 iTick 服务失败', error);
			this.isRunning = false;
			throw error;
		}
	}

	/**
	 * 停止服务
	 */
	public stop(): void {
		if (!this.isRunning) {
			this.logger.warn('服务未在运行');
			return;
		}

		this.logger.info('正在停止 iTick 服务...');
		this.isRunning = false;

		// 断开 WebSocket 连接
		this.client.disconnect();
		this.logger.logConnectionEvent('disconnected');

		// 清空数据缓冲区
		this.dataBuffer = [];
		this.quoteBuffer = [];

		this.logger.info('iTick 服务已停止');
		this.emit('stopped');
	}

	/**
	 * 等待身份验证完成
	 */
	private waitForAuthentication(): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('身份验证超时'));
			}, 10000); // 10秒超时

			this.client.once('authenticated', () => {
				clearTimeout(timeout);
				resolve();
			});

			this.client.once('authFailed', (response) => {
				clearTimeout(timeout);
				reject(new Error(`身份验证失败: ${response.msg}`));
			});
		});
	}

	/**
	 * 处理K线数据
	 */
	private handleKlineData(data: KlineData): void {
		try {
			// 日志输出已移至 index.ts 中处理

			// 添加到缓冲区
			this.addToBuffer(data);

			// 触发数据事件
			this.emit('klineData', data);

			// 处理业务逻辑
			this.processKlineData(data);
		} catch (error) {
			this.logger.error('处理K线数据时发生错误', { error, data });
		}
	}

	/**
	 * 添加数据到缓冲区
	 */
	private addToBuffer(data: KlineData): void {
		this.dataBuffer.push(data);

		// 限制缓冲区大小
		if (this.dataBuffer.length > this.maxBufferSize) {
			this.dataBuffer.shift(); // 移除最旧的数据
		}

		// 缓冲区日志已移除，避免重复输出
	}

	/**
	 * 处理K线数据的业务逻辑
	 */
	private processKlineData(data: KlineData): void {
		// 这里可以添加具体的业务逻辑
		// 例如：数据验证、价格变化检测、趋势分析等

		const { s: symbol, k } = data;
		const { c: close, h: high, l: low, o: open, v: volume, t: timestamp } = k;

		// 简单的价格变化检测
		if (this.dataBuffer.length >= 2) {
			const previousData = this.dataBuffer[this.dataBuffer.length - 2];
			if (previousData.s === symbol) {
				const priceChange = close - previousData.k.c;
				const priceChangePercent = (priceChange / previousData.k.c) * 100;

				if (Math.abs(priceChangePercent) > 0.1) {
					// 价格变化超过0.1%
					this.logger.info('检测到显著价格变化', {
						symbol,
						previousPrice: previousData.k.c,
						currentPrice: close,
						change: priceChange,
						changePercent: priceChangePercent.toFixed(4),
					});

					this.emit('significantPriceChange', {
						symbol,
						previousPrice: previousData.k.c,
						currentPrice: close,
						change: priceChange,
						changePercent: priceChangePercent,
					});
				}
			}
		}

		// 触发数据处理事件
		this.emit('dataProcessed', {
			symbol,
			price: close,
			volume,
			timestamp: new Date(timestamp),
		});
	}

	/**
	 * 获取订阅的标的列表
	 */
	public getSubscribedSymbols(): string[] {
		return [...this.subscribedSymbols];
	}

	/**
	 * 获取连接状态
	 */
	public getConnectionStatus(): ConnectionStatus {
		return this.client.getStatus();
	}

	/**
	 * 检查服务是否正在运行
	 */
	public isServiceRunning(): boolean {
		return this.isRunning;
	}


	/**
	 * 清空数据缓冲区
	 */
	public clearDataBuffer(): void {
		this.dataBuffer = [];
		this.logger.info('数据缓冲区已清空');
	}


	/**
	 * 获取指定时间范围内的K线数据
	 */
	public getKlineDataInRange(symbol: string, startTime: number, endTime: number): KlineData[] {
		return this.dataBuffer.filter((data) => data.s === symbol && data.k.t >= startTime && data.k.t <= endTime);
	}

	/**
	 * 获取最新的K线数据（API 使用）
	 */
	public getLatestKlineData(symbol?: string, limit: number = 100): KlineData[] {
		let filteredData = this.dataBuffer;
		
		if (symbol) {
			filteredData = this.dataBuffer.filter((data) => data.s === symbol);
		}
		
		// 返回最新的数据
		return filteredData.slice(-limit);
	}

	/**
	 * 获取最新的报价数据（API 使用）
	 */
	public getLatestQuoteData(symbol?: string, limit: number = 100): QuoteData[] {
		let filteredData = this.quoteBuffer;
		
		if (symbol) {
			filteredData = this.quoteBuffer.filter((data) => data.s === symbol);
		}
		
		// 返回最新的数据
		return filteredData.slice(-limit);
	}

	/**
	 * 处理报价数据
	 */
	private handleQuoteData(data: QuoteData): void {
		try {
			// 日志输出已移至 index.ts 中处理

			// 添加到缓冲区
			this.addToQuoteBuffer(data);

			// 触发数据事件
			this.emit('quoteData', data);

			// 处理业务逻辑
			this.processQuoteData(data);

		} catch (error) {
			this.logger.error('处理报价数据时发生错误', { error, data });
		}
	}

	/**
	 * 添加报价数据到缓冲区
	 */
	private addToQuoteBuffer(data: QuoteData): void {
		this.quoteBuffer.push(data);

		// 限制缓冲区大小
		if (this.quoteBuffer.length > this.maxBufferSize) {
			this.quoteBuffer.shift(); // 移除最旧的数据
		}

		// 缓冲区日志已移除，避免重复输出
	}

	/**
	 * 处理报价数据的业务逻辑
	 */
	private processQuoteData(data: QuoteData): void {
		// 这里可以添加具体的业务逻辑
		// 例如：价格变化检测、趋势分析等
		
		const { s: symbol, ld: price, v: volume, t: timestamp } = data;

		// 简单的价格变化检测
		if (this.quoteBuffer.length >= 2) {
			const previousData = this.quoteBuffer[this.quoteBuffer.length - 2];
			if (previousData.s === symbol) {
				const priceChange = price - previousData.ld;
				const priceChangePercent = (priceChange / previousData.ld) * 100;

				if (Math.abs(priceChangePercent) > 0.1) { // 价格变化超过0.1%
					this.logger.info('检测到显著价格变化', {
						symbol,
						previousPrice: previousData.ld,
						currentPrice: price,
						change: priceChange,
						changePercent: priceChangePercent.toFixed(4)
					});
					
					this.emit('significantPriceChange', {
						symbol,
						previousPrice: previousData.ld,
						currentPrice: price,
						change: priceChange,
						changePercent: priceChangePercent
					});
				}
			}
		}

		// 触发数据处理事件
		this.emit('quoteDataProcessed', {
			symbol,
			price,
			volume,
			timestamp: new Date(timestamp)
		});
	}



	/**
	 * 清空报价数据缓冲区
	 */
	public clearQuoteBuffer(): void {
		this.quoteBuffer = [];
		this.logger.info('报价数据缓冲区已清空');
	}

	/**
	 * 重新订阅数据
	 */
	public resubscribe(symbols: string[]): void {
		if (!this.isRunning) {
			this.logger.warn('服务未运行，无法重新订阅');
			return;
		}

		this.logger.info('重新订阅K线数据', { symbols });
		this.subscribedSymbols = symbols;
		this.client.subscribe(symbols);
		this.logger.logSubscriptionEvent('subscribe', symbols, true);
	}
}
