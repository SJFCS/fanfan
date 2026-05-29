git子项目

# 需求

```bash
git remote add enhance https://github.com/1123123w/sona_enhance.git
git rebase enhance/main
git merge enhance/main
git fetch enhance
```

## 代做需

- UI调整 ❗❗❗❗❗❗❗❗❗❗  等等

- 自动返回慢，游戏结束后自动关闭页面

- xx秒自动自动匹配 （按钮菜单添加在匹配界面中，按钮开关且支持展开配置参数）|取消本次自动匹配！

- 统一在右上角添加开关，按钮上方添加取消本次自动接受，按钮本身要显示文字+延迟时间
  - 显示时间
  - 最低人数
  - 等待时间
  - 等待邀请中成员 ✅

- 自动接受
  - 控制开关
  - 取消本次自动接受，设置延迟
  - 改文字为 自动接受 后面跟剩余秒数
  - 接受，接受后可拒绝|反之亦然（改按钮的遮罩）

- 接收/拒绝后删除遮罩 支持再次点击

## 待验证

点击匹配后客户端经常卡死

--测试返回房间日志 commit


- 自动接受对局，从秒改成毫秒，且将延迟  放在一行内，设置好输入框的最大最小值
- feat: 切换模式重置自动匹配计时器
- 自动回房间❗自动点赞❗ 验证是否有bug ！回房间可以不用点赞（可以跳过的秒回）只允许 WaitingForStats、PreEndOfGame、EndOfGame 这三个阶段。只有满足时才会调用 lcu.playAgain()。

- 进入后秒退按钮
- 大乱斗秒抢英雄-添加智能选人逻辑 ✅
- 进游戏后默认打开 战绩还是推荐出装 ❗没测试
- 观战工具 ✅❗没测试
- 添加领取选中组的个数不行 ❗没测试
- 自动领取，其中任务还没验证，提示也没验证，应该是每个组下方都有提示 ❗没测试
- 自动弹窗结束后自动关闭-代码看起来没问题

## bug


## 等待上游

- 自动配置符文召唤师技能失灵--等待上游
- ui大小修复fix-lcu-window 不知道是否有效暂时不看
- 直播拦截pr 开关 目前默认开，目前是无效的，上游会修复

## 不做

- 分路抢人等 这个留给上游吧，我只做了海克斯大乱斗的抢人优化
- 好友工具（最后对局日期，添加时间，分组，批量删除）❗
- opgg合并--没必要主要是我不打排位。看看有什么功能先（ban查看（增加劣势对位），点击对方英雄看counter，智能记忆符文技能--这个有冲突目前） ❗
- 自动重连❗ 没这个需求，有时候手动退出，自动重连不是我们想要的
- 战绩页面移植阿卡丽的特色--太复杂不做
- 锁定配置是命令时非声明式，使用外部工具改状态后并不会同步状态，手动再点一次就好了，没必要做的很复杂状态判断等功能
- 无法切换模式（有惩罚的时候开始了就无法切换）这个是联盟客户端默认逻辑不是插件问题

```txt
benchEnabled 不是模式名，它只是 ChampSelectSession 里的一个开关，意思是这局选人里有没有“替补席 / 可换英雄池”。它会在大乱斗、海克斯大乱斗这类有 bench 的选人里为 true，但它本身不能用来判断是不是海克斯大乱斗。
无限火力 一般指 URF / ARURF，它也不是海克斯大乱斗；通常不该走这条 KIWI 逻辑。
BAN_PICK 阶段走 /lol-lobby-team-builder/champ-select/v1/subset-champion-list，抢“刚发下来的随机英雄”
FINALIZATION 阶段再走 benchSwap 抢共享池
识别范围收紧到 KIWI，不再靠所有 benchEnabled 模式


每秒轮询（最长约 5 分钟）

D:\\Project\\sona\\src\\lib\\features\\auto-lock-champion.ts:99：for (attempt < 300) + sleep(1000)，循环调用 lcu.getChampSelectSession()（D:\\Project\\sona\\src\\lib\\features\\auto-lock-champion.ts:101）。
D:\\Project\\sona\\src\\lib\\features\\auto-ban-champion.ts:80：for (attempt < 300) + sleep(1000/500)，循环调用 lcu.getChampSelectSession()（D:\\Project\\sona\\src\\lib\\features\\auto-ban-champion.ts:82）及相关禁用流程请求。
500ms 轮询（最长 600 次 ≈ 5 分钟）

D:\\Project\\sona\\src\\lib\\features\\opgg-build-recommendation.ts:699：window.setTimeout 递归调度（D:\\Project\\sona\\src\\lib\\features\\opgg-build-recommendation.ts:702），循环调用 lcu.getGameflowPhase()（D:\\Project\\sona\\src\\lib\\features\\opgg-build-recommendation.ts:707）+ lcu.getChampSelectSession()（D:\\Project\\sona\\src\\lib\\features\\opgg-build-recommendation.ts:713），直到本地英雄锁定。
2 秒轮询（最多 30 次 ≈ 60 秒）

D:\\Project\\sona\\src\\components\\pages\\ToolsPage.tsx:1085：for (i < 30) + setTimeout(2000)，轮询 fetch(/lol-replays/v1/metadata/${id})（D:\\Project\\sona\\src\\components\\pages\\ToolsPage.tsx:1087）等待下载完成。
D:\\Project\\sona\\src\\components\\pages\\ToolkitPage.tsx:418：同逻辑轮询 fetch(/lol-replays/v1/metadata/${id})（D:\\Project\\sona\\src\\components\\pages\\ToolkitPage.tsx:420）。
每秒重试（最多 10 次，属于“接口失败/未就绪重试”）

D:\\Project\\sona\\src\\lib\\features.ts:678：循环重试 lcu.sendChampSelectMessage(...)（D:\\Project\\sona\\src\\lib\\features.ts:680），失败则 sleep(1000)。
D:\\Project\\sona\\src\\lib\\features.ts:728：同上（D:\\Project\\sona\\src\\lib\\features.ts:730）。
2 秒重试（最多 retries+1 次，属于“接口未就绪重试”）

D:\\Project\\sona\\src\\lib\\features\\enhanced-friend-game-status.ts:79：循环重试 lcu.getFriends()（D:\\Project\\sona\\src\\lib\\features\\enhanced-friend-game-status.ts:81），失败 sleep(2000)。
D:\\Project\\sona\\src\\lib\\features\\friend-match-history.ts:114：循环重试 lcu.getFriends()（D:\\Project\\sona\\src\\lib\\features\\friend-match-history.ts:116），失败 sleep(2000)。
D:\\Project\\sona\\src\\lib\\features\\friend-smart-group.ts:49：循环重试 lcu.getFriends()（D:\\Project\\sona\\src\\lib\\features\\friend-smart-group.ts:51），失败 sleep(2000)。
```
