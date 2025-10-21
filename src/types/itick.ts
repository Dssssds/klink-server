/**
 * iTick WebSocket API 类型定义
 */

// 基础响应结构
export interface BaseResponse {
  code: number;
  msg: string;
}

// 连接成功响应
export interface ConnectionResponse extends BaseResponse {
  code: 1;
  msg: "Connected Successfully";
}

// 认证响应
export interface AuthResponse extends BaseResponse {
  resAc: "auth" | "subscribe" | "pong";
  msg: "authenticated" | "auth failed";
}

// 订阅响应
export interface SubscribeResponse extends BaseResponse {
  resAc: "subscribe" | "pong";
  msg: "subscribe Successfully" | "exceeding the maximum subscription limit" | "cannot be resolved action";
}

// K线数据结构
export interface KlineData {
  s: string;  // 标的代码，如 "EURUSD$GB"
  t: number;  // K线周期：1分钟、2五分钟、3十分钟、4三十分钟、5一小时、8一天、9一周、10一月
  k: {
    tu: number;    // 成交额
    c: number;     // 收盘价
    t: number;     // 时间戳
    v: number;     // 成交量
    h: number;     // 最高价
    l: number;     // 最低价
    o: number;     // 开盘价
  };
}

// 报价数据结构
export interface QuoteData {
  s: string;     // 标的代码，如 "EURUSD$GB"
  ld: number;    // 最新价格
  o: number;     // 开盘价
  h: number;     // 最高价
  l: number;     // 最低价
  t: number;     // 时间戳
  v: number;     // 成交量
  tu: number;    // 成交额
  ts: number;    // 时间戳秒
  type: "quote"; // 数据类型
}

// K线响应
export interface KlineResponse {
  code: 1;  // 成功响应
  msg: string | null;
  data: KlineData;
}

// 报价响应
export interface QuoteResponse {
  code: 1;  // 成功响应
  msg: string | null;
  data: QuoteData;
}

// 心跳请求
export interface PingMessage {
  ac: "ping";
  params: string;  // 时间戳
}

// 心跳响应
export interface PongMessage {
  resAc: "pong";
  data?: {
    params: string;  // 时间戳
  };
}

// 订阅请求
export interface SubscribeMessage {
  ac: "subscribe";
  params: string;  // 标的代码，支持多个用$分隔
  types: "quote";  // 订阅类型
}

// WebSocket消息联合类型
export type WebSocketMessage = 
  | ConnectionResponse
  | AuthResponse
  | SubscribeResponse
  | KlineResponse
  | QuoteResponse
  | PongMessage
  | { resAc: "pong" };

// 连接状态枚举
export enum ConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  AUTHENTICATED = "authenticated",
  SUBSCRIBED = "subscribed",
  ERROR = "error"
}

// 日志级别枚举
export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug"
}

// 日志消息结构
export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: Date;
  data?: any;
}
