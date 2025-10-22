import axios from 'axios';
import { Logger } from './Logger';

/**
 * Lark 通知工具类
 * 用于发送 WebSocket 连接异常和重连失败的告警通知
 */
export class LarkNotifier {
	private webhookUrl: string;
	private logger: Logger;
	private enabled: boolean;

	constructor() {
		this.webhookUrl = 'https://open.larksuite.com/open-apis/bot/v2/hook/6044d52e-25a6-422b-a08d-afdbdb4d58ea';
		this.logger = new Logger('LarkNotifier');
		this.enabled = !!this.webhookUrl;

		if (!this.enabled) {
			this.logger.warn('Lark 通知未启用，请设置 LARK_WEBHOOK_URL 环境变量');
		}
	}

	/**
	 * 发送 WebSocket 连接错误通知
	 */
	public async sendConnectionErrorNotification(error: any, attempt?: number): Promise<void> {
		if (!this.enabled) return;

		const message = this.createConnectionErrorCard(error, attempt);
		await this.sendMessage(message);
	}

	/**
	 * 发送重连失败通知
	 */
	public async sendReconnectFailureNotification(error: any, attempt: number): Promise<void> {
		if (!this.enabled) return;

		const message = this.createReconnectFailureCard(error, attempt);
		await this.sendMessage(message);
	}

	/**
	 * 发送重连成功通知
	 */
	public async sendReconnectSuccessNotification(attempt: number): Promise<void> {
		if (!this.enabled) return;

		const message = this.createReconnectSuccessCard(attempt);
		await this.sendMessage(message);
	}

	/**
	 * 发送心跳超时通知
	 */
	public async sendHeartbeatTimeoutNotification(): Promise<void> {
		if (!this.enabled) return;

		const message = this.createHeartbeatTimeoutCard();
		await this.sendMessage(message);
	}

	/**
	 * 创建连接错误卡片
	 */
	private createConnectionErrorCard(error: any, attempt?: number): any {
		const errorMessage = error?.message || '未知错误';
		const errorCode = this.extractErrorCode(errorMessage);
		const timestamp = new Date().toISOString();

		return {
			msg_type: 'interactive',
			card: {
				config: {
					wide_screen_mode: true,
				},
				header: {
					title: {
						content: '🚨 iTick WebSocket 连接异常',
						tag: 'plain_text',
					},
					template: 'red',
				},
				elements: [
					{
						tag: 'div',
						text: {
							content: `**服务:** iTick K线订阅服务\n**时间:** ${timestamp}\n**错误类型:** WebSocket 连接错误`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'hr',
					},
					{
						tag: 'div',
						text: {
							content: `**🔍 错误详情:**\n• **错误码:** ${errorCode}\n• **错误信息:** ${errorMessage}\n• **重连尝试:** ${attempt ? `第 ${attempt} 次` : '首次连接'}`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'div',
						text: {
							content: `**📊 状态信息:**\n• **服务状态:** 连接异常\n• **重连状态:** ${attempt ? '重连中' : '连接失败'}\n• **建议操作:** 检查网络连接和 API Token`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'action',
						actions: [],
					},
				],
			},
		};
	}

	/**
	 * 创建重连失败卡片
	 */
	private createReconnectFailureCard(error: any, attempt: number): any {
		const errorMessage = error?.message || '未知错误';
		const timestamp = new Date().toISOString();

		return {
			msg_type: 'interactive',
			card: {
				config: {
					wide_screen_mode: true,
				},
				header: {
					title: {
						content: '⚠️ iTick WebSocket 重连失败',
						tag: 'plain_text',
					},
					template: 'orange',
				},
				elements: [
					{
						tag: 'div',
						text: {
							content: `**服务:** iTick K线订阅服务\n**时间:** ${timestamp}\n**事件:** 重连失败`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'hr',
					},
					{
						tag: 'div',
						text: {
							content: `**🔄 重连信息:**\n• **重连次数:** 第 ${attempt} 次\n• **错误信息:** ${errorMessage}\n• **服务状态:** 停止重连`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'div',
						text: {
							content: `**🚨 影响说明:**\n• K线数据订阅已中断\n• 实时数据接收停止\n• 需要手动重启服务`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'action',
						actions: [],
					},
				],
			},
		};
	}

	/**
	 * 创建重连成功卡片
	 */
	private createReconnectSuccessCard(attempt: number): any {
		const timestamp = new Date().toISOString();

		return {
			msg_type: 'interactive',
			card: {
				config: {
					wide_screen_mode: true,
				},
				header: {
					title: {
						content: '✅ iTick WebSocket 重连成功',
						tag: 'plain_text',
					},
					template: 'green',
				},
				elements: [
					{
						tag: 'div',
						text: {
							content: `**服务:** iTick K线订阅服务\n**时间:** ${timestamp}\n**事件:** 重连成功`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'hr',
					},
					{
						tag: 'div',
						text: {
							content: `**🔄 重连信息:**\n• **重连次数:** 第 ${attempt} 次尝试\n• **连接状态:** 已恢复\n• **服务状态:** 正在重新订阅数据`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'div',
						text: {
							content: `**📊 状态信息:**\n• K线数据订阅恢复中\n• 实时数据接收即将恢复\n• 服务运行正常`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'action',
						actions: [],
					},
				],
			},
		};
	}

	/**
	 * 创建心跳超时卡片
	 */
	private createHeartbeatTimeoutCard(): any {
		const timestamp = new Date().toISOString();

		return {
			msg_type: 'interactive',
			card: {
				config: {
					wide_screen_mode: true,
				},
				header: {
					title: {
						content: '⏱️ iTick WebSocket 心跳超时',
						tag: 'plain_text',
					},
					template: 'yellow',
				},
				elements: [
					{
						tag: 'div',
						text: {
							content: `**服务:** iTick K线订阅服务\n**时间:** ${timestamp}\n**事件:** 心跳超时`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'hr',
					},
					{
						tag: 'div',
						text: {
							content: `**💓 心跳信息:**\n• **超时时长:** 10 秒\n• **检测结果:** 服务器无响应\n• **处理动作:** 主动断开连接`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'div',
						text: {
							content: `**🔄 后续处理:**\n• 连接已主动关闭\n• 将自动触发重连机制\n• 预计连接即将恢复`,
							tag: 'lark_md',
						},
					},
					{
						tag: 'action',
						actions: [],
					},
				],
			},
		};
	}

	/**
	 * 提取错误码
	 */
	private extractErrorCode(errorMessage: string): string {
		// 提取 HTTP 状态码
		const httpCodeMatch = errorMessage.match(/(\d{3})/);
		if (httpCodeMatch) {
			return httpCodeMatch[1];
		}

		// 提取其他错误码
		const codeMatch = errorMessage.match(/code[:\s]*(\d+)/i);
		if (codeMatch) {
			return codeMatch[1];
		}

		return '未知';
	}

	/**
	 * 发送消息到 Lark
	 */
	private async sendMessage(message: any): Promise<void> {
		try {
			this.logger.info('发送 Lark 通知', { webhookUrl: this.webhookUrl });

			const response = await axios.post(this.webhookUrl, message, {
				headers: {
					'Content-Type': 'application/json',
				},
				timeout: 10000, // 10秒超时
			});

			if (response.status === 200) {
				this.logger.info('Lark 通知发送成功');
			} else {
				this.logger.error('Lark 通知发送失败', {
					status: response.status,
					statusText: response.statusText,
				});
			}
		} catch (error) {
			this.logger.error('发送 Lark 通知时发生错误', error);
		}
	}

	/**
	 * 检查通知是否启用
	 */
	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * 设置 Webhook URL
	 */
	public setWebhookUrl(url: string): void {
		this.webhookUrl = url;
		this.enabled = !!url;
		this.logger.info('Lark Webhook URL 已更新', { enabled: this.enabled });
	}
}
