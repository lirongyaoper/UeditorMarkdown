var contentImport = {};
var g = $G;

contentImport.data = {
    result: null,
};

contentImport.init = function (opt, callbacks) {
    addUploadButtonListener();
    addOkListener();
};

/**
 * 异步上传图片，成功返回完整 URL，失败返回 null
 */
function upload(blob) {
    return new Promise(function (resolve) {
        var xhr = new XMLHttpRequest();
        var fd = new FormData();
        var url = editor.getOpt('imageUrlPrefix');
        var actionUrl = editor.getActionUrl(editor.getOpt('imageActionName'));
        var type = 'png';
        if (blob.type) {
            type = blob.type.substr('image/'.length);
        }
        fd.append(editor.getOpt('imageFieldName') || 'upfile', blob, blob.name || ('blob.' + type));
        fd.append('type', 'ajax');
        xhr.open('post', actionUrl, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
                return;
            }
            if (xhr.status == 200) {
                var json = null;
                try {
                    json = JSON.parse(xhr.responseText);
                } catch (e) {
                    try {
                        json = (new Function('return ' + xhr.responseText))();
                    } catch (e2) {
                    }
                }
                if (json && json.state == 'SUCCESS' && json.url) {
                    resolve(url + json.url);
                    return;
                }
            }
            resolve(null);
        };
        xhr.onerror = function () {
            resolve(null);
        };
        xhr.send(fd);
    });
}

var uploadFailCount = 0;

function processWord(file) {
    $('.file-tip').html('正在转换Word文件，请稍后...');
    $('.file-result').html('').hide();
    var reader = new FileReader();
    reader.onload = function (loadEvent) {
        uploadFailCount = 0;
        mammoth.convertToHtml({
            arrayBuffer: loadEvent.target.result
        }, {
            convertImage: mammoth.images.imgElement(function (image) {
                return image.readAsArrayBuffer().then(function (imageBuffer) {
                    const blob = new Blob([imageBuffer], {type: image.contentType});
                    // 异步上传，失败时退回本地 blob 预览地址并在插入时提示
                    return upload(blob).then(function (uploadedUrl) {
                        if (!uploadedUrl) {
                            uploadFailCount++;
                        }
                        return {
                            src: uploadedUrl || URL.createObjectURL(blob),
                            alt: '文档图片'
                        };
                    });
                });
            })
        })
            .then(function displayResult(result) {
                var tip = '转换成功';
                if (uploadFailCount > 0) {
                    tip += '（有 ' + uploadFailCount + ' 张图片上传失败，已用临时预览地址代替，保存后请检查）';
                }
                $('.file-tip').html(tip);
                contentImport.data.result = result.value;
                $('.file-result').html(result.value).show();
            }, function (error) {
                $('.file-tip').html('Word文件转换失败:' + error);
            });
    };
    reader.onerror = function (loadEvent) {
        $('.file-tip').html('Word文件转换失败:' + loadEvent);
    };
    reader.readAsArrayBuffer(file);
}

/**
 * 读取文本文件，自动识别编码：
 * - BOM 判定 UTF-8 / UTF-16LE / UTF-16BE（Windows 记事本另存常见）
 * - 无 BOM 时优先严格 UTF-8，失败退回 GB18030（兼容 GBK/GB2312）
 */
function readTextFileAutoEncoding(file, callback) {
    var reader = new FileReader();
    reader.onload = function () {
        var buffer = reader.result;
        var bytes = new Uint8Array(buffer);
        // BOM 判定（UTF-16 BOM 前两字节均为 0xFF/0xFE 特征）
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            try {
                callback(new TextDecoder('utf-16le').decode(buffer), 'utf-16le');
            } catch (e) {
                callback(null);
            }
            return;
        }
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            try {
                callback(new TextDecoder('utf-16be').decode(buffer), 'utf-16be');
            } catch (e) {
                callback(null);
            }
            return;
        }
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            try {
                callback(new TextDecoder('utf-8').decode(buffer), 'utf-8-bom');
            } catch (e) {
                callback(null);
            }
            return;
        }
        // 无 BOM：UTF-16 无 BOM 时若大量出现 0x00 交替字节也按 UTF-16 处理
        var zeroEven = 0, zeroOdd = 0, sample = Math.min(bytes.length, 512);
        for (var i = 0; i < sample; i++) {
            if (bytes[i] === 0) {
                (i % 2 === 0 ? zeroEven++ : zeroOdd++);
            }
        }
        if (sample >= 64 && (zeroOdd > sample * 0.3 || zeroEven > sample * 0.3)) {
            try {
                var enc = zeroOdd > zeroEven ? 'utf-16le' : 'utf-16be';
                callback(new TextDecoder(enc).decode(buffer), enc);
                return;
            } catch (e) {
            }
        }
        try {
            callback(new TextDecoder('utf-8', {fatal: true}).decode(buffer), 'utf-8');
        } catch (e) {
            // UTF-8 严格解码失败，按 GB18030 处理（中文 Windows 记事本常见）
            try {
                callback(new TextDecoder('gb18030').decode(buffer), 'gb18030');
            } catch (e2) {
                callback(new TextDecoder('utf-8').decode(buffer), 'utf-8');
            }
        }
    };
    reader.onerror = function () {
        callback(null);
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Markdown HTML 后处理（与 ueditor.all.js 的 UE.postprocessMarkdownHtml 保持一致；
 * 父页面有新版本时优先复用）
 */
function postprocessMarkdownHtml(html) {
    if (window.parent && window.parent.UE && window.parent.UE.postprocessMarkdownHtml) {
        return window.parent.UE.postprocessMarkdownHtml(html);
    }
    // 本地兜底实现
    html = html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/gi, function (all, attrs, code) {
        var lang = 'plain';
        var m = (attrs || '').match(/(?:^|\s)(?:language-|lang-)([a-z0-9#+._-]+)/i);
        if (m) {
            lang = m[1].toLowerCase();
        }
        return '<pre class="brush:' + lang + ';toolbar:false;">' + code + '</pre>';
    });
    html = html.replace(/<input[^>]*type="checkbox"[^>]*>/gi, function (input) {
        return /checked/i.test(input) ? '\u2611 ' : '\u2610 ';
    });
    return html;
}

function processMarkdown(markdown) {
    if (!markdown || !markdown.replace(/\s/g, '')) {
        $('.file-tip').html('内容为空，请输入 Markdown 文本');
        return;
    }
    var html = '';
    var meta = null;
    var parentUE = window.parent && window.parent.UE;
    if (parentUE && parentUE._markdownConvert && window.showdown) {
        // 优先复用父页面公共核心（统一配置 + 消毒 + front matter 提取）
        var parsed = parentUE._markdownConvert(markdown);
        html = parsed.html;
        meta = parsed.meta;
    }
    if (!html) {
        // 本地兜底：与旧版一致的转换路径
        var converter = new showdown.Converter({
            tables: true,              // 表格解析
            strikethrough: true,       // 删除线 ~~text~~
            tasklists: true,           // 任务列表 - [x]
            simplifiedAutoLink: true,  // 自动识别URL链接
            parseImgDimensions: true,  // 图片尺寸 ![alt](url =100x200)
            excludeTrailingPunctuationFromURLs: true, // 链接尾部标点不并入URL
            ghCompatibleHeaderId: true, // 标题生成锚点id
            requireSpaceBeforeHeadingText: true, // #后必须空格（#话题 不是标题）
            literalMidWordUnderscores: true,     // snake_case 不转斜体
            disableForced4SpacesIndentedSublists: true, // 两空格缩进子列表
            encodeEmails: false,
            metadata: true             // YAML front matter
        });
        try {
            html = postprocessMarkdownHtml(converter.makeHtml(markdown));
            meta = converter.getMetadata(false);
        } catch (e) {
            $('.file-tip').html('Markdown 转换失败：' + e);
            return;
        }
    }
    var tips = ['转换成功，确认后插入编辑器'];
    if (meta) {
        var metaKeys = [];
        for (var k in meta) {
            if (meta.hasOwnProperty(k)) {
                metaKeys.push(k);
            }
        }
        if (metaKeys.length) {
            tips.push('已识别 front matter（' + metaKeys.join('、') + '，不会插入正文）');
        }
    }
    // 相对路径图片提示（外站文档常见 ./img/x.png，插入后在本站无法显示）
    if (/!\[[^\]\n]*\]\((?!\w+:\/\/|#)[^)\n]+\)/.test(markdown)) {
        tips.push('含相对路径图片，请改用绝对地址或插入后用图片上传替换');
    }
    $('.file-tip').html(tips.join('；'));
    contentImport.data.result = html;
    $('.file-result').html(html).show();
}

function processMarkdownFile(file) {
    $('.file-tip').html('正在转换Markdown文件，请稍后...');
    $('.file-result').html('').hide();
    readTextFileAutoEncoding(file, function (text, encoding) {
        if (text === null || text === undefined) {
            $('.file-tip').html('Markdown文件读取失败');
            return;
        }
        processMarkdown(text);
        var encNote = {
            'gb18030': '已按 GB18030 编码读取',
            'utf-16le': '已按 UTF-16LE 编码读取',
            'utf-16be': '已按 UTF-16BE 编码读取',
            'utf-8-bom': '已按带 BOM 的 UTF-8 编码读取'
        }[encoding];
        if (encNote && contentImport.data.result) {
            $('.file-tip').html(encNote + '并转换成功');
        }
    });
}

var MD_EXTS = ['md', 'markdown', 'mkd', 'mdown'];

function addUploadButtonListener() {
    g('contentImport').addEventListener('change', function () {
        var file = this.files[0];
        // 重置 input，保证再次选择同一文件也能触发 change
        this.value = '';
        if (!file) {
            return;
        }
        var fileName = file.name;
        var fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
        if (fileExt == 'docx') {
            processWord(file);
        } else if (fileExt == 'doc') {
            // mammoth 仅支持 docx，提前给出明确提示
            $('.file-tip').html('暂不支持旧版 .doc 格式，请先用 Word 另存为 .docx 后导入');
            $('.file-result').html('').hide();
        } else if (MD_EXTS.indexOf(fileExt) !== -1) {
            processMarkdownFile(file);
        } else {
            $('.file-tip').html('不支持的文件格式:' + fileExt + '（支持 docx / md / markdown）');
        }
    });
    g('fileInputConfirm').addEventListener('click', function () {
        processMarkdown(g('fileInputContent').value);
    });
}

function addOkListener() {
    dialog.onok = function () {
        if (!contentImport.data.result) {
            alert('请先上传文件或粘贴 Markdown 内容');
            return false;
        }
        editor.fireEvent('saveScene');
        editor.execCommand("inserthtml", contentImport.data.result);
        editor.fireEvent('saveScene');
    };
    dialog.oncancel = function () {
    };
}
