import { ServiceProto } from "tsrpc-proto";

export interface ServiceType {
    api: {
        // 这里可以定义REST API接口
    },
    msg: {
        // 这里可以定义WebSocket消息接口
    }
}

export const serviceProto: ServiceProto<ServiceType> = {
    "version": 1,
    "services": [
        // API服务定义
    ],
    "types": {
        // 类型定义
    }
};
