OptiSpray 产品体验离线包

打开页面
1. 将 ZIP 解压到一个文件夹。
2. 双击 Open-Product-Experience.cmd。页面会在浏览器中打开；如果本地预览尚未运行，启动器会在后台启动它。服务保持到 Windows 关机，不需要每次重新打开命令行。
3. 也可在解压目录运行：
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Offline-Review.ps1 -OpenBrowser
   此方式会在前台显示 PowerShell 窗口，结束时按 Ctrl+C。

如果省略 -OpenBrowser，启动脚本只会显示本地地址，由你自行复制到浏览器中打开。

页面由包内 site 文件夹提供，只在本机 127.0.0.1 上运行，无需联网、Node.js、npm 或远程后台服务。双击 HTML 不能直接运行，因为浏览器会阻止 file:// 页面加载本地模块和数据。

浏览产品
左侧菜单可以打开 AI Decision Assistant、航线规划、漂移预测、作业反馈和八类硬件动画。Operations 提供作业前、中、后三个阶段。右上角 Tour 可以播放 3 分钟完整版或 90 秒精简版。

案例数据
Farmland 案例的 Plan A 是南北向航线，Run-03 是该航线的完整喷洒和沉积模拟。Plan B 是东西向候选航线，可以查看计划覆盖率、时间和航段。光照、流量和喷洒压力界面中的 Example reading 是展示用示例值。

更新页面
ZIP 是可运行的页面成品，不是完整源码项目。请在项目源码中修改 product-experience.html、src\product-experience.js、src\product-experience.css 或相关数据与素材。然后在项目根目录运行：

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-offline.ps1

该命令会重新构建网站并更新 output\product-experience-offline.zip 及其解压目录。如果旧解压目录正在使用，可在命令末尾加 -ArchiveOnly，仅生成 ZIP。重新生成需要 Node.js 22.12 或更新版本，以及项目依赖。
