/* 浏览器冒烟工具：用 puppeteer-core 驱动本机 Chromium 打开页面，执行脚本并收集控制台/异常。
   依赖：npm install puppeteer-core
   用法：CHROME_PATH=/path/to/chrome node test/browser-run.js <url> <script.js|-> [--shot out.png] [--wait ms]
   脚本文件内容在页面上下文中执行（async 函数体），return 值打印为 JSON。 */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
let puppeteer;
try {
    puppeteer = require("puppeteer-core");
} catch (e) {
    console.error("需要 puppeteer-core：请先 npm install puppeteer-core（或设置 NODE_PATH 指向其 node_modules）");
    process.exit(2);
}

(async () => {
    const args = process.argv.slice(2);
    const url = args[0];
    const scriptArg = args[1];
    const shotIdx = args.indexOf("--shot");
    const shot = shotIdx !== -1 ? args[shotIdx + 1] : null;
    const waitIdx = args.indexOf("--wait");
    const wait = waitIdx !== -1 ? parseInt(args[waitIdx + 1], 10) : 1500;
    const widthIdx = args.indexOf("--width");
    const width = widthIdx !== -1 ? parseInt(args[widthIdx + 1], 10) : 1280;

    const cookieIdx = args.indexOf("--cookies");
    const cookiesFile = cookieIdx !== -1 ? args[cookieIdx + 1] : null;
    const profileDir = path.join(os.tmpdir(), "ueditor-md-chrome-" + process.pid);

    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME_PATH || "/snap/bin/chromium",
        headless: "new",
        args: ["--no-sandbox", "--disable-gpu"],
        userDataDir: profileDir
    });
    const logs = [];
    try {
        const page = await browser.newPage();
        if (cookiesFile) {
            const jar = JSON.parse(fs.readFileSync(cookiesFile, "utf8"));
            const domain = new URL(url).hostname;
            const list = Object.keys(jar).map(name => ({ name: name, value: jar[name], domain: domain, path: "/" }));
            await browser.setCookie(...list);
        }
        await page.setViewport({ width: width, height: 900 });
        page.on("console", (m) => logs.push("[console." + m.type() + "] " + m.text()));
        page.on("pageerror", (e) => logs.push("[pageerror] " + (e && e.message)));
        page.on("requestfailed", (r) => logs.push("[requestfailed] " + r.url() + " " + (r.failure() && r.failure().errorText)));
        await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
        await new Promise((r) => setTimeout(r, wait));
        let result = null;
        if (scriptArg && scriptArg !== "-") {
            const body = fs.readFileSync(scriptArg, "utf8");
            // evaluate 超时保护：页面主线程被死循环冻结时 evaluate 永不返回，必须外层兜底，
            // 否则表现为工具本身挂起（回归用例 form-md-freeze 即依赖此超时报告 FREEZE）
            const evalTimeout = parseInt(process.env.EVAL_TIMEOUT || "20000", 10);
            const evalPromise = page.evaluate(new Function("return (async () => {\n" + body + "\n})();"));
            result = await Promise.race([
                evalPromise,
                new Promise((_, rej) => setTimeout(() => rej(new Error("FREEZE: page.evaluate 超时(" + evalTimeout + "ms)，页面主线程疑似被阻塞")), evalTimeout))
            ]);
        }
        if (shot) {
            await page.screenshot({ path: shot, fullPage: false });
        }
        console.log(JSON.stringify({ result: result, logs: logs }, null, 2));
    } catch (e) {
        console.log(JSON.stringify({ error: String(e && e.stack || e), logs: logs }, null, 2));
        process.exitCode = 1;
    } finally {
        await browser.close();
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (e) {
        }
    }
})();