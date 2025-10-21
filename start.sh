#!/bin/bash

# iTick WebSocket K线数据订阅服务启动脚本

echo "=========================================="
echo "iTick WebSocket K线数据订阅服务"
echo "=========================================="


# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
fi

# 构建项目
echo "正在构建项目..."
npm run build

# 启动服务
echo "正在启动服务..."
echo "订阅标的: ${SYMBOLS:-EURUSD\$GB}"
echo "日志级别: ${LOG_LEVEL:-info}"
echo ""

npm start
