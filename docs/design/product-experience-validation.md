# OptiSpray 产品体验 V3.2 验收

[资产复用矩阵](./product-experience-assets.md)列出官网与 Dashboard 的原始资源、对象、现有动画、复用方式及缺失项。

## 功能动画

| 功能 | 可操作状态 | 浏览器验收 | 连续录屏与关键帧 |
| --- | --- | --- | --- |
| 超声波测风 | 定位、分离、测量、RS485 通信、装回、重置 | 探头组独立位移并复位。测量显示探头之间的信号及 Skagit 风速，通信阶段转到控制器。 | [录屏](../../output/product-experience-evidence/wind-sensor.mp4) · [测量](../../output/product-experience-evidence/wind-measure.jpg) |
| ESP32 与喷洒液路 | 分离、连接、运行、失联、停泵、透明观察、装回 | 液路和原喷嘴轨迹同步工作。断开通信后三秒停止流动与喷洒。装回恢复原部件位置和外观。 | [录屏](../../output/product-experience-evidence/spray-system.mp4) · [运行](../../output/product-experience-evidence/pump-running.jpg) · [停泵](../../output/product-experience-evidence/pump-stopped.jpg) |
| AeroGuard 作业流程 | 飞前准备、确认、监看、田间视角、结束、保存、报告与历史 | 在离线包完成一条 Plan A 北南向作业记录并从历史回看。Plan B 东西向只有航线与计划用时，沉积与漂移为空。 | [录屏](../../output/product-experience-evidence/operation-workflow.mp4) · [飞前](../../output/product-experience-evidence/workflow-before.jpg) · [作业中](../../output/product-experience-evidence/workflow-during.jpg) · [田间](../../output/product-experience-evidence/workflow-field.jpg) · [报告](../../output/product-experience-evidence/workflow-report.jpg) · [历史](../../output/product-experience-evidence/workflow-history.jpg) |

[官网 Engineering 与产品页对照](../../output/product-experience-evidence/engineering-comparison.jpg)左侧为官网爆炸展示，右侧为产品页的测风展示。两页共用机体、部件和品牌变量，沿用各自已有的取景与环境光。

## 新增内容和保留内容

- `src/component-demonstration.js` 编排已有对象的高亮、位移、透明和复位，并绘制信号与液路。连线说明的是作用关系，泵阀、传感器管路和装机位置需要硬件依据。
- `public/dashboard/aeroguard-dashboard-standalone.html` 来自项目内原 Dashboard 的自包含产物，离线包使用同一份页面。仅给原摘要增加了空指标判断，避免当前作业还没有漂移读数时中断渲染。
- `src/product-dashboard.js` 读取原平台选线、作业阶段和播放进度。平台自己的作业调整和沉积仍在原地图计算。产品页三维侧显示同一航线和进度，仅在北南向基准播放时叠加现有 Skagit 沉积。
- `src/brand.css` 是两页共用的字体及品牌变量。机体仍来自 `src/drone.js`，农田仍来自 `src/environment.js`，Physics、Wind、Mapping 和 Lab 继续使用网站原有模拟和图表。

## 重复实现清理

产品页移除了小屏航线卡片、手写监看读数、简版报告、投影变换和相关样式及事件。规划、监看、报告与历史使用同一个 Dashboard。产品页的展示模式也与浏览模式共用一份场景和时间轴。修改前保留的原站研究资产和案例数据继续引用原路径。

## 运行检查

- Chrome 检查了三个标杆、页面内任务确认、作业归档、Plan B 空指标和展示模式。官网回归检查覆盖 Engineering 部件选择、Physics 液滴播放入口和 Lab 参数控件。
- 使用项目打包脚本生成 [离线 ZIP](../../output/product-experience-offline.zip)。解压后用包根目录的 `Start-Offline-Review.ps1` 启动，并核对 Dashboard、环境贴图、航拍、轨迹和沉积文件。
- GPS/GNSS、温湿度、光照、流量和压力仍有独立说明。型号、装机位置及机载遥测以项目硬件资料为准。研究模块的其余交互沿用原入口，第一批集中在三个标杆。
