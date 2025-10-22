import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { AuthResponse, ConnectionStatus, KlineData, KlineResponse, PingMessage, PongMessage, QuoteData, QuoteResponse, SubscribeMessage, SubscribeResponse, WebSocketMessage } from '../types/itick';
import { LarkNotifier } from '../utils/LarkNotifier';
import { Logger } from '../utils/Logger';

/**
 * iTick WebSocket 客户端
 * 负责管理与 iTick WebSocket API 的连接
 */
export class ItickWebSocketClient extends EventEmitter {
	private ws: WebSocket | null = null;
	private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
	private token: string;
	private url: string;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private reconnectInterval: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000; // 1秒
	private maxReconnectDelay = 30000; // 最大重连延迟 30秒
	private heartbeatDelay = 60000; // 60秒 (1分钟)
	private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimeoutDelay = 10000; // 心跳超时 10秒
	private shouldReconnect = true; // 是否应该重连（区分主动/被动断开）
	private logger: Logger;
	private larkNotifier: LarkNotifier;

	constructor(token: string, url: string = 'wss://api.itick.org/forex') {
		super();
		this.token = token;
		this.url = url;
		this.logger = new Logger('ItickWebSocketClient');
		this.larkNotifier = new LarkNotifier();
	}

	/**
	 * 连接到 iTick WebSocket 服务器
	 */
	public async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.logger.info('正在连接到 iTick WebSocket 服务器...', { url: this.url });
				this.status = ConnectionStatus.CONNECTING;
				this.shouldReconnect = true; // 连接时允许重连

				this.ws = new WebSocket(this.url, {
					headers: {
						token: this.token,
					},
				});

				// 连接成功
				this.ws.on('open', () => {
					const isReconnect = this.reconnectAttempts > 0;
					this.logger.info('WebSocket 连接已建立', { isReconnect });
					this.status = ConnectionStatus.CONNECTED;
					
					// 如果是重连，触发重连成功事件
					if (isReconnect) {
						super.emit('reconnected');
					}
					
					this.reconnectAttempts = 0;
					resolve();
				});

				// 接收消息
				this.ws.on('message', (data: WebSocket.Data) => {
					try {
						const message: WebSocketMessage = JSON.parse(data.toString());
						this.handleMessage(message);
					} catch (error) {
						this.logger.error('解析 WebSocket 消息失败', { error, data: data.toString() });
					}
				});

				// 连接错误
				this.ws.on('error', async (error: Error) => {
					this.logger.error('WebSocket 连接错误', error);
					this.status = ConnectionStatus.ERROR;

					// 发送 Lark 通知
					await this.larkNotifier.sendConnectionErrorNotification(error, this.reconnectAttempts);

					reject(error);
				});

				// 连接关闭
				this.ws.on('close', (code: number, reason: string) => {
					this.logger.warn('WebSocket 连接已关闭', { code, reason });
					this.status = ConnectionStatus.DISCONNECTED;
					this.stopHeartbeat();
					super.emit('disconnected', { code, reason });

					// 自动重连（仅在应该重连且未达到最大重连次数时）
					if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
						this.scheduleReconnect();
					} else if (!this.shouldReconnect) {
						this.logger.info('主动断开连接，不进行重连');
					}
				});
			} catch (error) {
				this.logger.error('创建 WebSocket 连接失败', error);
				reject(error);
			}
		});
	}

	/**
	 * 处理接收到的消息
	 */
	private handleMessage(message: WebSocketMessage): void {
		// this.logger.info('收到 WebSocket 消息', message);

		if ('code' in message) {
			switch (message.code) {
				case 1:
					// 成功响应或数据
					if ('resAc' in message) {
						// 认证、订阅、心跳响应
						switch ((message as any).resAc) {
							case 'auth':
								this.handleAuthResponse(message as AuthResponse);
								break;
							case 'subscribe':
								this.handleSubscribeResponse(message as SubscribeResponse);
								break;
							case 'pong':
								this.handlePongResponse(message as any);
								break;
						}
					} else if ('data' in message && message.data) {
						// K线数据、报价数据或其他数据
						if ('k' in message.data) {
							this.handleKlineData(message as KlineResponse);
						} else if ('type' in message.data && message.data.type === 'quote') {
							this.handleQuoteData(message as QuoteResponse);
						} else {
							this.logger.warn('收到未知的数据消息', message);
						}
					} else {
						// 连接成功消息
						this.logger.info('连接成功', { message: message.msg });
					}
					break;

				case 0:
					// 错误响应
					this.logger.warn('收到错误响应', message);
					break;

				default:
					this.logger.warn('收到未知类型的消息', message);
			}
		} else if ('resAc' in message && message.resAc === 'pong') {
			// 处理心跳响应
			this.handlePongResponse(message as any);
		} else {
			this.logger.warn('收到未知类型的消息', message);
		}
	}

	/**
	 * 处理认证响应
	 */
	private handleAuthResponse(response: AuthResponse): void {
		if (response.msg === 'authenticated') {
			this.logger.info('身份验证成功');
			this.status = ConnectionStatus.AUTHENTICATED;
			super.emit('authenticated');
		} else {
			this.logger.error('身份验证失败', response);
			this.status = ConnectionStatus.ERROR;
			super.emit('authFailed', response);
		}
	}

	/**
	 * 处理订阅响应
	 */
	private handleSubscribeResponse(response: SubscribeResponse): void {
		if (response.msg === 'subscribe Successfully') {
			this.logger.info('订阅成功');
			this.status = ConnectionStatus.SUBSCRIBED;
			this.startHeartbeat();
			super.emit('subscribed');
		} else {
			this.logger.error('订阅失败', response);
			super.emit('subscribeFailed', response);
		}
	}

	/**
	 * 处理K线数据
	 */
	private handleKlineData(response: KlineResponse): void {
		const klineData: KlineData = response.data;
		// 日志输出已移至 index.ts 中处理
		super.emit('klineData', klineData);
	}

	/**
	 * 处理报价数据
	 */
	private handleQuoteData(response: QuoteResponse): void {
		const quoteData: QuoteData = response.data;
		// 日志输出已移至 index.ts 中处理
		super.emit('quoteData', quoteData);
	}

	/**
	 * 处理心跳响应
	 */
	private handlePongResponse(response: PongMessage): void {
		// 清除心跳超时定时器
		if (this.heartbeatTimeout) {
			clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = null;
		}

		if (response.data && response.data.params) {
			this.logger.debug('收到心跳响应', { params: response.data.params });
		} else {
			this.logger.debug('收到心跳响应');
		}
	}

	/**
	 * 发送订阅请求
	 */
	public subscribe(symbols: string[]): void {
		if (this.status !== ConnectionStatus.AUTHENTICATED) {
			this.logger.error('尚未完成身份验证，无法订阅');
			return;
		}

		const subscribeMessage: SubscribeMessage = {
			ac: 'subscribe',
			params: symbols.join('$'),
			types: 'quote',
		};

		this.sendMessage(subscribeMessage);
		this.logger.info('发送订阅请求', { symbols });
	}

	/**
	 * 发送心跳
	 */
	private sendHeartbeat(): void {
		const pingMessage: PingMessage = {
			ac: 'ping',
			params: Date.now().toString(),
		};

		this.sendMessage(pingMessage);
		this.logger.debug('发送心跳', { timestamp: pingMessage.params });

		// 设置心跳超时检测
		this.heartbeatTimeout = setTimeout(async () => {
			this.logger.error('心跳超时，连接可能已断开，主动关闭连接');
			
			// 发送 Lark 通知
			await this.larkNotifier.sendHeartbeatTimeoutNotification();

			// 主动关闭连接，触发重连
			if (this.ws) {
				this.ws.close();
			}
		}, this.heartbeatTimeoutDelay);
	}

	/**
	 * 开始心跳
	 */
	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
		}, this.heartbeatDelay);
		this.logger.info('心跳已启动', { interval: this.heartbeatDelay });
	}

	/**
	 * 停止心跳
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
			this.logger.info('心跳已停止');
		}

		// 清除心跳超时定时器
		if (this.heartbeatTimeout) {
			clearTimeout(this.heartbeatTimeout);
			this.heartbeatTimeout = null;
		}
	}

	/**
	 * 发送消息
	 */
	private sendMessage(message: any): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			this.logger.error('WebSocket 连接未就绪，无法发送消息', message);
		}
	}

	/**
	 * 安排重连
	 */
	private scheduleReconnect(): void {
		this.reconnectAttempts++;
		// 指数退避，但不超过最大延迟
		const delay = Math.min(
			this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
			this.maxReconnectDelay
		);

		this.logger.info(`准备重连 (第 ${this.reconnectAttempts} 次尝试)`, {
			delay,
			maxAttempts: this.maxReconnectAttempts,
		});

		this.reconnectInterval = setTimeout(async () => {
			try {
				const currentAttempt = this.reconnectAttempts;
				await this.connect();
				this.logger.info('重连成功');

				// 发送 Lark 重连成功通知
				await this.larkNotifier.sendReconnectSuccessNotification(currentAttempt);
			} catch (error) {
				this.logger.error('重连失败', { error, attempt: this.reconnectAttempts });

				// 发送 Lark 通知
				await this.larkNotifier.sendReconnectFailureNotification(error, this.reconnectAttempts);

				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					this.scheduleReconnect();
				} else {
					this.logger.error('达到最大重连次数，停止重连');
					super.emit('maxReconnectAttemptsReached');
				}
			}
		}, delay);
	}

	/**
	 * 断开连接
	 */
	public disconnect(): void {
		this.logger.info('正在断开 WebSocket 连接...');
		this.shouldReconnect = false; // 主动断开，不要重连
		this.stopHeartbeat();

		if (this.reconnectInterval) {
			clearTimeout(this.reconnectInterval);
			this.reconnectInterval = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.status = ConnectionStatus.DISCONNECTED;
		this.logger.info('WebSocket 连接已断开');
	}

	/**
	 * 获取连接状态
	 */
	public getStatus(): ConnectionStatus {
		return this.status;
	}

	/**
	 * 检查是否已连接
	 */
	public isConnected(): boolean {
		return this.status === ConnectionStatus.SUBSCRIBED;
	}
}
