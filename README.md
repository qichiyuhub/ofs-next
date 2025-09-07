# OpenWrt Firmware Selector Next

现代化的 OpenWrt 固件选择器，支持自定义构建、软件包管理和模块配置。

## 特性

- 智能设备搜索 - 快速找到你的设备型号
- 软件包管理 - 添加/移除软件包，支持多种软件源
- 模块配置 - 可选的模块管理系统
- 配置管理 - 保存、导入、导出配置文件
- 多语言支持 - 支持多种语言界面
- 响应式设计 - 完美适配桌面和移动设备
- 自动部署 - 支持 GitHub Pages 自动部署

## 技术栈

- **前端框架**: Vue 3 + TypeScript + Composition API
- **UI 组件**: Vuetify 3
- **状态管理**: Pinia
- **构建工具**: Vite
- **包管理**: pnpm
- **代码质量**: ESLint + Prettier
- **测试**: Vitest
- **部署**: GitHub Actions

## 快速开始

### 环境要求

- Node.js >= 20.19.0 || >= 22.12.0
- pnpm >= 8.0.0

### 安装依赖

```bash
pnpm install
```

### 开发环境

```bash
pnpm dev
```

访问 [http://localhost:5173](http://localhost:5173)

### 构建生产版本

```bash
pnpm build
```

### 预览生产构建

```bash
pnpm preview
```

## 项目结构

```
src/
├── components/          # Vue 组件
│   ├── CustomBuild.vue     # 自定义构建
│   ├── FirmwareSelector.vue # 固件选择器
│   ├── PackageManager.vue   # 软件包管理
│   └── ...
├── stores/             # Pinia 状态管理
│   ├── firmware.ts        # 固件相关状态
│   ├── package.ts         # 软件包状态
│   ├── config.ts          # 配置管理
│   └── ...
├── services/           # API 服务
│   ├── api.ts            # API 接口
│   ├── asu.ts            # ASU 构建服务
│   └── packageManager.ts # 软件包管理服务
├── types/              # TypeScript 类型定义
└── config.ts           # 应用配置
```

## 配置

### 基本配置

编辑 `src/config.ts` 来自定义应用：

```typescript
export const config: Config = {
  brand_name: "ImmortalWrt",        // 品牌名称
  site_name: "固件选择器",           // 站点名称
  image_url: "https://...",          // 固件镜像 URL
  asu_url: "https://...",            // ASU 构建服务 URL
  show_help: true,                   // 显示帮助信息
  show_snapshots: true,              // 显示快照版本
  enable_module_management: false,    // 启用模块管理
  versions: ["24.10.2", "24.10.1"], // 支持的版本列表
  default_version: "24.10.2",       // 默认版本
}
```

### 自定义域名

如果需要部署到自定义域名，在项目根目录创建 `CNAME` 文件：

```
your-domain.com
```

## 部署

### GitHub Pages

1. 启用 GitHub Actions
   - 进入 `Settings > Pages`
   - Source 选择 `GitHub Actions`

2. 推送代码到 main 分支
   ```bash
   git push origin main
   ```
   
   GitHub Actions 会自动构建和部署

### 其他平台

- **Vercel**: 连接 GitHub 仓库，自动检测配置
- **Netlify**: 拖拽 `dist` 文件夹或连接 Git
- **Cloudflare Pages**: 连接仓库，构建命令 `pnpm build`

## 开发指南

### 添加新的软件源

1. 编辑 `src/services/packageManager.ts`
2. 添加源 URL 和解析逻辑
3. 更新类型定义

### 自定义主题

修改 `src/plugins/vuetify.ts` 中的主题配置：

```typescript
const vuetify = createVuetify({
  theme: {
    themes: {
      light: {
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          // ...
        }
      }
    }
  }
})
```

### 添加新语言

1. 在 `public/langs/` 目录添加语言文件
2. 更新 `src/stores/i18n.ts` 中的语言列表

## 测试

```bash
# 运行单元测试
pnpm test:unit

# 运行测试并监听文件变化
pnpm test:unit --watch

# 生成覆盖率报告
pnpm test:unit --coverage
```

## 代码质量

```bash
# 检查代码规范
pnpm lint

# 自动修复代码问题
pnpm lint --fix

# 格式化代码
pnpm format

# TypeScript 类型检查
pnpm type-check
```

## 可用脚本

| 脚本 | 描述 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm preview` | 预览生产构建 |
| `pnpm test:unit` | 运行单元测试 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 代码检查 |
| `pnpm format` | Prettier 代码格式化 |

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 致谢

- [OpenWrt](https://openwrt.org/) - 开源路由器固件
- [ASU](https://github.com/openwrt/asu) - 自动构建服务
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Vuetify](https://vuetifyjs.com/) - Material Design 组件库
