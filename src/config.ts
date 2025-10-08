// 定义配置对象的类型接口
export interface Config {
  // 品牌名称
  brand_name: string

  // Logo 指向的主页链接
  homepage_url: string

  // 是否显示镜像文件的帮助文本
  show_help: boolean

  // 版本列表 (可选，服务器会自动提供 .versions.json 文件)
  versions?: string[]

  // 预选中的版本 (可选，服务器会自动提供 .versions.json 文件)
  default_version?: string

  // 镜像下载服务器的 URL (最关键)
  image_url: string

  // 是否在版本列表中加入快照版 (snapshot)
  show_snapshots?: boolean

  // "More info" 链接的模板 (可选)
  info_url?: string

  // "Attended Sysupgrade" 在线升级服务器地址 (可选)
  asu_url?: string
  asu_extra_packages?: string[]

  // 是否启用模块管理功能 (可选)
  enable_module_management?: boolean

  // 使用 apk v3 包索引的版本 (可选)
  apk_versions?: string[]
}

// 导出的具体配置信息
export const config: Config = {
  // 品牌名称: 设置为 OpenWrt
  brand_name: "OpenWrt",

  // 主页链接: 设置为 OpenWrt 官网
  homepage_url: "https://openwrt.org/",

  // 显示帮助文本
  show_help: true,

  // 镜像下载 URL: 设置为官方 OpenWrt 下载服务器
  // 这是解决 "Failed to fetch" 问题的核心
  image_url: "https://downloads.openwrt.org",

  // 显示快照 (snapshot) 版本
  show_snapshots: true,

  // "More info" 链接指向 OpenWrt 的硬件列表 (Table of Hardware)
  info_url: "https://openwrt.org/start?do=search&id=toh&q={title} @toh",

  // 使用官方的 Attended Sysupgrade (ASU) 服务器
  asu_url: "https://sysupgrade.openwrt.org",
  // 在线升级时默认额外包含 luci (Web管理界面)
  asu_extra_packages: ["luci"],

  // 禁用模块管理功能 (保持默认)
  enable_module_management: false,
  
  // 指定 SNAPSHOT 版本使用特定的包索引格式
  apk_versions: ["SNAPSHOT"]
}
