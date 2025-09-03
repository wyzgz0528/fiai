import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    // 启用压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除 console
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        // 更细粒度的代码分割
        manualChunks: {
          // React 核心
          react: ['react', 'react-dom'],
          'react-router': ['react-router-dom'],

          // Ant Design 分割
          'antd-core': ['antd'],
          'antd-icons': ['@ant-design/icons'],

          // 图表库单独分割
          charts: ['echarts', 'echarts-for-react'],

          // 工具库
          utils: ['dayjs', 'axios']
        },
        // 优化文件名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    proxy: {
      '/api': {
  target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
