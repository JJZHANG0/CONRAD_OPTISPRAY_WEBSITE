# OptiSpray 产品体验资产复用矩阵

适用范围为官网 Engineering、Physics、Wind、Mapping、Lab 和 Product Experience。A 为直接复用，B 为提取或接入现有组件，C 为扩展已有实现，D 为确认缺失后新增；没有定位依据的零件不作为装机硬件展示。

| 功能 | 原资产与使用位置 | 对象与现有动画 | 复用与必要补充 | 原资产处理 |
| --- | --- | --- | --- | --- |
| 超声波测风 | `src/drone.js`、Engineering、`public/research/bench-measurement.webp` | `parts.sensor`、四个超声波探头、Engineering 局部分离及高亮 | C。复用模型、位移和高亮；加入探头之间的信号、测量与通信状态 | 原模型及实验照片保留 |
| ESP32 与接口 | `src/drone.js`、Engineering、Wind | `parts.control`、`parts.interface`；现有外壳、指示灯和爆炸图 | C。复用外壳和接口；显示 RS485 与三秒失联停泵 | 不新增裸板，不推断装机走线 |
| 药箱、喷杆、喷嘴 | `src/drone.js`、Engineering 和 Product Experience | `parts.tank`、`parts.boom`、`parts.nozzle` 与原出口坐标；已有爆炸和液滴播放 | C。分离、透明及液路播放；沿已有部件加入连线 | 保留原几何、材质和喷嘴轨迹 |
| 泵阀、流量、压力 | 官网控制与液路说明，Dashboard 的设备字段与记录 | 有关联的控制器、喷杆和药箱；缺少可确认的独立模型及安装位置 | C。用关联对象演示系统状态，流量与压力保留接口说明 | 未新增泵、压力传感器或阀门几何 |
| 温湿度、光照、GPS/GNSS | 官网 Wind、Lab、Skagit 环境及 Dashboard 的设备和航迹字段 | 无可确认的独立装机模型、型号和安装位置 | A。复用已支持的字段、作用说明和路线视图 | 保留独立入口，未新增器件外观 |
| 下洗、液滴运动、蒸发、漂移 | `src/science-view.js`、`src/lab-physics.js`、`src/skagit-ui.js`、`src/skagit-scene.js` 与 `public/research/` 现有图表 | Physics 轨迹与图表、Wind/Lab 条件计算 | A。产品章节关联原入口，继续使用原物理、科学图表和对比 | 计算和原交互保留 |
| 冠层沉积、风向与航线 | `src/skagit-data.js`、`src/skagit-map.js`、`public/skagit/`，Mapping 和 Field Route | 航拍、两条航线、液滴轨迹、沉积栅格、原航线图；`docs/design/field-route/ui-assets/` 中的作业图形 | A/C。复用共享函数和相同轨迹，按 Dashboard 已选方案和播放时钟切换 3D 视图 | Plan A 北南向有落点；Plan B 东西向只有航线及计划用时 |
| 场景与品牌 | `src/environment.js`、`src/scene.js`、`src/style.css` 与现有 `public/environment/farm-field.hdr` | 原机体、材质、地块、相机和录制构图 | A/B。抽取共用字体和品牌色，保留 Product Experience 的现有场景、农田与背景 | 官网和产品页均继续从原模块取资产 |
| AeroGuard 作业前、中、后 | Dashboard 源目录的 `assets/aeroguard-dashboard.html`、地图和平台脚本，以及其 `aeroguard-dashboard-standalone.html` | 原地块、设备、风险、选线、确认、地图、跑次、经济、效率、建议、报告、历史 | B/C。接入原站自包含产物；通过原平台 API 和状态切换展示 | 保留 Dashboard 本身，产品页移除独立重写的规划、监看、报告界面 |
| 架构、数据流、液路与作业流程 | Engineering 部件与原 Dashboard；官网已有流程 SVG 和合作说明 | 现有模型、记录工作流和服务文案 | C/D。只新增可同步到当前状态的节点及连线，复用现有页面上的原图表 | 不新增插画、背景、贴图或物理引擎 |
| 录制与展示控制 | `src/product-experience.js` 的播放、重播及相机逻辑 | 当前页面的单一场景及状态 | C。共用同一时间轴并提供展示模式 | 不另建录制版页面 |
