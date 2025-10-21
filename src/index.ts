#!/usr/bin/env node

import { HttpServer } from 'tsrpc';
import { serviceProto } from '../tsrpc.config';
import { ItickService } from './service/ItickService';
import { KlineData, QuoteData } from './types/itick';
import { Logger } from './utils/Logger';

/**
 * 主程序入口
 * 启动 iTick WebSocket K线数据订阅服务
 */

// 配置
const CONFIG = {
	// iTick API Token - 请替换为你的实际token
	ITICK_TOKEN: process.env.ITICK_TOKEN || 'd241b1072044429996d81d2d84c384f93fb6884ae460414da502d2a2b21d3306',

	// 订阅的标的列表
	SYMBOLS: process.env.SYMBOLS ? process.env.SYMBOLS.split(',') : ['EURUSD$GB,USDJPY$GB,CNYUSD$GB'],

	// 日志级别
	LOG_LEVEL: process.env.LOG_LEVEL || 'info',

	// 服务名称
	SERVICE_NAME: 'iTick K线订阅服务',

	// TSRPC 服务器端口
	TSRPC_PORT: parseInt(process.env.TSRPC_PORT || '3000'),

	// Lark 通知配置
	LARK_WEBHOOK_URL: process.env.LARK_WEBHOOK_URL || '',
};

// 创建主日志记录器
const logger = new Logger('Main');

/**
 * 优雅关闭处理
 */
function setupGracefulShutdown(service: ItickService): void {
	const shutdown = async (signal: string) => {
		logger.info(`收到 ${signal} 信号，正在优雅关闭服务...`);

		try {
			// 停止 iTick 服务
			service.stop();

			// 停止 TSRPC 服务器
			const tsrpcServer = (global as any).tsrpcServer;
			if (tsrpcServer) {
				await tsrpcServer.stop();
				logger.info('TSRPC 服务器已停止');
			}

			logger.info('服务已优雅关闭');
			process.exit(0);
		} catch (error) {
			logger.error('关闭服务时发生错误', error);
			process.exit(1);
		}
	};

	// 监听退出信号
	process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
	process.on('SIGTERM', () => shutdown('SIGTERM')); // 终止信号
	process.on('SIGQUIT', () => shutdown('SIGQUIT')); // 退出信号

	// 监听未捕获的异常
	process.on('uncaughtException', (error) => {
		logger.error('未捕获的异常', error);
		service.stop();
		process.exit(1);
	});

	// 监听未处理的Promise拒绝
	process.on('unhandledRejection', (reason, promise) => {
		logger.error('未处理的Promise拒绝', { reason, promise });
		service.stop();
		process.exit(1);
	});
}

/**
 * 设置服务事件监听器
 */
function setupServiceEventListeners(service: ItickService): void {
	// 服务启动事件
	service.on('started', () => {
		logger.info('iTick 服务启动成功');
		logger.info('开始监听K线数据...', {
			symbols: service.getSubscribedSymbols(),
		});
	});

	// 服务停止事件
	service.on('stopped', () => {
		logger.info('iTick 服务已停止');
	});

	// 身份验证事件
	service.on('authenticated', () => {
		logger.info('WebSocket 身份验证成功');
	});

	service.on('authFailed', (response) => {
		logger.error('WebSocket 身份验证失败', response);
		process.exit(1);
	});

	// 订阅事件
	service.on('subscribed', () => {
		logger.info('K线数据订阅成功');
	});

	service.on('subscribeFailed', (response) => {
		logger.error('K线数据订阅失败', response);
		process.exit(1);
	});

	// K线数据事件
	service.on('klineData', (data: KlineData) => {
		// 这里可以添加实时数据处理逻辑
		// 例如：存储到数据库、发送到其他服务等
		logger.debug('收到K线数据', {
			symbol: data.s,
			price: data.k.c,
			volume: data.k.v,
			timestamp: new Date(data.k.t).toISOString(),
		});
	});

	// 报价数据事件
	service.on('quoteData', (data: QuoteData) => {
		// 这里可以添加实时报价数据处理逻辑
		logger.info('收到报价数据', {
			symbol: data.s,
			price: data.ld,
			volume: data.v,
			timestamp: new Date(data.t).toISOString(),
		});
	});

	// 连接断开事件
	service.on('disconnected', (details) => {
		logger.warn('WebSocket 连接已断开', details);
	});

	// 最大重连次数达到事件
	service.on('maxReconnectAttemptsReached', () => {
		logger.error('达到最大重连次数，服务将停止');
		process.exit(1);
	});
}

/**
 * 启动 TSRPC 服务器
 */
async function startTSRPCServer(): Promise<void> {
	try {
		// 创建 TSRPC 服务器
		const server = new HttpServer(serviceProto, {
			port: CONFIG.TSRPC_PORT,
		});

		// 启动服务器
		await server.start();
		logger.info(`TSRPC 服务器已启动`, {
			port: CONFIG.TSRPC_PORT,
			url: `http://localhost:${CONFIG.TSRPC_PORT}`,
		});

		// 将服务器实例存储到全局变量，用于优雅关闭
		(global as any).tsrpcServer = server;
	} catch (error) {
		logger.error('启动 TSRPC 服务器失败', error);
		throw error;
	}
}

/**
 * 主函数
 */
async function main(): Promise<void> {
	// 启动 TSRPC 服务器
	await startTSRPCServer();
	try {
		// 创建服务实例
		const service = new ItickService(CONFIG.ITICK_TOKEN);

		// 设置事件监听器
		setupServiceEventListeners(service);

		// 设置优雅关闭
		setupGracefulShutdown(service);

		// 启动 iTick WebSocket 服务
		await service.start(CONFIG.SYMBOLS);

		// 保持程序运行
		logger.info('服务正在运行中，按 Ctrl+C 停止服务');
		logger.info(`API 服务地址: http://localhost:${CONFIG.TSRPC_PORT}`);
	} catch (error) {
		logger.error('启动服务失败', error);
		process.exit(1);
	}
}

// 启动应用
if (require.main === module) {
	main().catch((error) => {
		logger.error('应用启动失败', error);
		process.exit(1);
	});
}

export { CONFIG, main };
