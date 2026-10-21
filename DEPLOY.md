# iPad 真离线部署

PWA 的 Service Worker 需要 **HTTPS** 或 `localhost`。电脑上的 `http://127.0.0.1:4173` 可以测试；iPad 访问电脑的局域网 IP（如 `http://192.168.x.x:4173`）时，Service Worker 不会注册，不能真正离线。

## 最简单：Netlify Drop

1. 把项目根目录的 `math-magic-pwa.zip` 拖到 <https://app.netlify.com/drop>。
2. 等它给出 `https://xxxx.netlify.app` 地址。
3. iPad Safari 打开这个 HTTPS 地址。
4. 分享 → 添加到主屏幕。
5. 第一次联网打开，让它缓存页面、课程和图标；之后断网也能打开。
6. 播放过的音频也会缓存；想全离线，先把 14 课听一遍。

## 其他 HTTPS 方式

- Cloudflare Pages：上传 zip 或连接 Git 仓库。
- Vercel：导入文件夹。
- GitHub Pages：需要 HTTPS 的自定义域名或 GitHub Pages 默认域名。
- 自己的服务器：Nginx / Caddy 配 HTTPS，把 `math-magic/` 作为站点根目录。

## 发布后检查

- `https://你的域名/manifest.webmanifest` 能打开。
- `https://你的域名/sw.js` 返回 JavaScript。
- Safari 开发者工具 → Service Workers 能看到注册。
- 断网后重新打开，14 天航线仍显示。

## 原生打包（可选）

如果不想用 PWA，也可以后续用 Capacitor / Cordova 包成 iPad App。iOS 原生打包需要 macOS + Xcode + Apple 开发者账号；当前 Windows 环境只能先做 PWA。

## 缓存版本

发布新版本时同时改：

- `sw.js` 的 `VERSION`
- `index.html` 里的 `?v=`
- `app.js` 的 `AUDIO_VERSION`

否则 iPad 可能继续用旧缓存。
