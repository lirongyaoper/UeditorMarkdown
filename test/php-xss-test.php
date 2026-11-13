<?php
/* remove_xss 回归测试（2026-11-09 三轮升级）
 * 1) 不传 $rich 时输出与升级前逐字节一致（对照实现为升级前的旧逻辑副本）
 * 2) $rich=true：安全富文本放行 + XSS 向量拦截
 * 运行：php docs/ueditor-markdown/test/php-xss-test.php
 */

/* ---------- 旧版 remove_xss 副本（升级前实现，做逐字节对照） ---------- */
function legacy_remove_xss($string) {
    if (!is_string($string) || $string === '') {
        return $string;
    }
    $string = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/S', '', $string);
    $string = preg_replace('/<[^>]*$/s', '', $string);
    $allowed_tags = array(
        'a', 'b', 'strong', 'i', 'em', 'u', 'p', 'br', 'div', 'span', 'ul', 'ol', 'li', 'pre',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    );
    $allowed_attributes = array(
        '*' => array('title', 'alt'),
        'a' => array('href', 'title', 'target', 'rel'),
        'img' => array('src', 'alt', 'title', 'width', 'height')
    );
    $string = preg_replace_callback('/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/s', function($matches) use ($allowed_tags, $allowed_attributes) {
        $closing = $matches[1];
        $tag = strtolower($matches[2]);
        $attr_text = $matches[3];
        if (!in_array($tag, $allowed_tags)) {
            return '';
        }
        if ($closing) {
            return '</' . $tag . '>';
        }
        $allowed = isset($allowed_attributes[$tag]) ? array_merge($allowed_attributes['*'], $allowed_attributes[$tag]) : $allowed_attributes['*'];
        $attr_text = trim($attr_text);
        $safe_attrs = '';
        $attr_values = array();
        if (preg_match_all('/([^\s=\/>]+)(\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^"\'>\s]+)))?/s', $attr_text, $attr_matches, PREG_SET_ORDER)) {
            foreach ($attr_matches as $attr_match) {
                $name = $attr_match[1];
                $decoded_name = html_entity_decode($name, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $decoded_name = rawurldecode($decoded_name);
                $normalized_name = strtolower(preg_replace('/[\s\x00-\x1F\x7F]+/u', '', $decoded_name));
                if (strpos($normalized_name, 'on') === 0) {
                    continue;
                }
                if (!in_array($normalized_name, $allowed)) {
                    continue;
                }
                $value = '';
                if (isset($attr_match[3]) && $attr_match[3] !== '') {
                    $value = $attr_match[3];
                } elseif (isset($attr_match[4]) && $attr_match[4] !== '') {
                    $value = $attr_match[4];
                } elseif (isset($attr_match[5]) && $attr_match[5] !== '') {
                    $value = $attr_match[5];
                }
                if ($normalized_name === 'href' || $normalized_name === 'src') {
                    $value = trim($value);
                    $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    $decoded = rawurldecode($decoded);
                    $normalized_value = strtolower(preg_replace('/[\s\x00-\x1F\x7F]+/u', '', $decoded));
                    if (preg_match('/^(javascript|vbscript|file|about|view-source):/i', $normalized_value)) {
                        continue;
                    }
                    if (strpos($normalized_value, 'data:') === 0) {
                        if (!preg_match('/^data:image\/(png|jpe?g|gif|webp|bmp)(;|,)/i', $normalized_value)) {
                            continue;
                        }
                    }
                }
                $attr_values[$normalized_name] = $value;
            }
        }
        if ($tag === 'a' && isset($attr_values['target']) && strtolower(trim($attr_values['target'])) === '_blank') {
            $rel_values = isset($attr_values['rel']) ? preg_split('/\s+/', trim($attr_values['rel']), -1, PREG_SPLIT_NO_EMPTY) : array();
            $lower_rels = array_map('strtolower', $rel_values);
            if (!in_array('noopener', $lower_rels, true)) {
                $rel_values[] = 'noopener';
            }
            $attr_values['rel'] = trim(implode(' ', array_unique($rel_values)));
        }
        $safe_attrs = '';
        foreach ($attr_values as $name => $value) {
            $safe_attrs .= ' ' . $name . '="' . htmlspecialchars($value, ENT_QUOTES | ENT_HTML5) . '"';
        }
        return '<' . $tag . $safe_attrs . '>';
    }, $string);
    return $string;
}

require_once dirname(__DIR__) . '/server/php/remove_xss.php';

$pass = 0; $fail = 0;
function ok($name, $cond, $extra = '') {
    global $pass, $fail;
    if ($cond) { $pass++; }
    else { $fail++; echo "  FAIL $name" . ($extra !== '' ? " → [$extra]" : '') . "\n"; }
}
function section($t) { echo "== $t ==\n"; }

/* ---------- 1) 不传 rich：逐字节一致 ---------- */
section('兼容性：不传 $rich 与旧版逐字节一致');
$corpus = array(
    '<p>普通段落 <strong>粗体</strong></p>',
    '<p style="color:red">样式被剥掉</p>',
    '<span class="foo">class 被剥掉</span>',
    '<a href="https://a.com" target="_blank">链接</a>',
    '<a href="javascript:alert(1)">xss</a>',
    '<img src="https://a.com/i.png" onerror="alert(1)" alt="a">',
    '<img src="jav&#x09;ascript:alert(1)">',
    '<script>alert(1)</script>ok',
    '<blockquote>引用被删</blockquote><hr><code>c</code><sup>s</sup><sub>b</sub><del>d</del><mark>m</mark><kbd>k</kbd>',
    '<pre class="brush:js;toolbar:false;">let a=1;</pre>',
    '<div onclick=alert(1)>x</div>',
    '<table><tr><td colspan="2">t</td></tr></table>',
    '中文内容混排 <b>加粗</b> & 实体 &amp; 转义',
    '<p>未闭合 <img src=x onerror=',
    '',
    "换行\n与\t制表",
    '<iframe src="https://evil.com"></iframe><p>after</p>',
    '<math><mtext></math><img src onerror=alert(1)>',
    '<a href="data:image/png;base64,AAAA">png</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">html</a>',
);
foreach ($corpus as $i => $case) {
    $old = legacy_remove_xss($case);
    $new = remove_xss($case);
    ok("corpus #$i 一致", $old === $new, "old=[" . $old . "] new=[" . $new . "]");
}
// 随机变异对照
mt_srand(20261109);
$chars = '<>="\'abc img src onerror style class ; : ( ) / script p span div #f00 ';
for ($i = 0; $i < 300; $i++) {
    $s = '';
    $len = mt_rand(5, 120);
    for ($j = 0; $j < $len; $j++) {
        $s .= $chars[mt_rand(0, strlen($chars) - 1)];
    }
    $old = legacy_remove_xss($s);
    $new = remove_xss($s);
    if ($old !== $new) {
        ok("随机变异 #$i 一致", false, "input=[$s] old=[$old] new=[$new]");
    }
}
$pass++; // 随机变异全部通过时计入
echo "  （300 组随机变异对照完成）\n";

/* ---------- 2) rich 模式：放行 ---------- */
section('rich 模式：安全富文本放行');
ok('span 颜色放行',
    remove_xss('<p><span style="color:#ff0000">红字</span></p>', true) === '<p><span style="color:#ff0000">红字</span></p>',
    remove_xss('<p><span style="color:#ff0000">红字</span></p>', true));
ok('背景色+字号放行',
    strpos(remove_xss('<span style="background-color:#ff0;font-size:18px">x</span>', true), 'background-color:#ff0;font-size:18px') !== false);
ok('对齐样式放行',
    strpos(remove_xss('<p style="text-align:center">x</p>', true), 'text-align:center') !== false);
ok('字体放行',
    strpos(remove_xss('<span style="font-family:SimSun, serif">x</span>', true), "font-family:SimSun, serif") !== false);
ok('代码块 class 放行',
    remove_xss('<pre class="brush:js;toolbar:false;theme:monokai;">let a=1;</pre>', true) === '<pre class="brush:js;toolbar:false;theme:monokai;">let a=1;</pre>',
    remove_xss('<pre class="brush:js;toolbar:false;theme:monokai;">let a=1;</pre>', true));
ok('lry- class 放行',
    strpos(remove_xss('<p class="lry-toc">[TOC]</p>', true), 'class="lry-toc"') !== false);
ok('提示块标签放行',
    remove_xss('<blockquote class="lry-alert lry-alert-note"><p>x</p></blockquote>', true) === '<blockquote class="lry-alert lry-alert-note"><p>x</p></blockquote>');
ok('上下标/删除线/mark/kbd/hr/code 放行',
    remove_xss('<p>a<sup>2</sup><sub>i</sub> <del>d</del><s>s</s><mark>m</mark><kbd>Ctrl</kbd></p><hr><pre><code>x</code></pre>', true)
        === '<p>a<sup>2</sup><sub>i</sub> <del>d</del><s>s</s><mark>m</mark><kbd>Ctrl</kbd></p><hr><pre><code>x</code></pre>');
ok('公式定界符文本放行',
    strpos(remove_xss('<p>\\(x^2\\)</p>', true), '\\(x^2\\)') !== false);

/* ---------- 3) rich 模式：拦截 ---------- */
section('rich 模式：XSS 向量拦截');
$attacks = array(
    '<span style="width:expression(alert(1))">x</span>' => 'expression',
    '<span style="background:url(javascript:alert(1))">x</span>' => 'url(',
    '<span style="color:red;background:url(https://evil.com/x.png)">x</span>' => 'url(',
    '<span style="color:@import \'x.css\'">x</span>' => '@import',
    '<span style="color:\\65\\78\\70ression(alert(1))">x</span>' => '65',
    '<span style="color:red/*x*/">x</span>' => '/*',
    '<span style="behavior:url(#default#time2)">x</span>' => 'behavior',
    '<span style="-moz-binding:url(http://evil.com/x.xml)">x</span>' => '-moz-binding',
    '<p style="text-align:center" onmouseover="alert(1)">x</p>' => 'onmouseover',
    '<p class="lry-toc evil-class">x</p>' => 'evil-class',
    '<span class="lry-x" style="color:red" onclick=alert(1)>x</span>' => 'onclick',
    '<a href="jav&#x09;ascript:alert(1)">x</a>' => 'javascript',
    '<img src="https://a.com/x.png" onerror="alert(1)">' => 'onerror',
    '<script>alert(1)</script>' => 'script',
    '<span style="color:red"><script>alert(1)</script></span>' => 'script',
    '<iframe src="https://evil.com"></iframe>' => 'iframe',
    '<span style="margin:expression(alert(1))">x</span>' => 'expression',
    '<span style="font-family:foo;background-image:url(x)">x</span>' => 'background-image',
    '<span style="color:red;width:99999px">x</span>' => 'width:99999px',
    '<div style="text-align:center"><svg onload=alert(1)></svg></div>' => 'svg',
);
foreach ($attacks as $input => $needle) {
    $out = remove_xss($input, true);
    ok("拦截 [$needle]", stripos($out, $needle) === false, "out=[$out]");
}
// style 部分危险时：安全部分保留、危险部分剔除
$out = remove_xss('<span style="color:#f00;width:expression(alert(1))">x</span>', true);
ok('危险声明剔除、安全声明保留', $out === '<span style="color:#f00">x</span>', $out);

/* ---------- 4) 非法 UTF-8 协议黑名单绕过回归（default + rich 双模式） ---------- */
section('非法 UTF-8 协议黑名单绕过回归');
$utf8_attacks = array(
    '<a href="javascript:alert(1)//%FF">x</a>' => 'javascript:',
    '<a href="vbscript:msgbox(1)//%FF">x</a>' => 'vbscript:',
    '<a href="data:text/html,<script>alert(1)</script>//%FF">x</a>' => 'data:text/html',
    '<img src=x onerror%FF=alert(1)>' => 'onerror',
);
foreach ($utf8_attacks as $input => $needle) {
    ok("default 拦截 [$needle]", stripos(remove_xss($input, false), $needle) === false);
    ok("rich 拦截 [$needle]", stripos(remove_xss($input, true), $needle) === false);
}
ok('合法 https 保留', strpos(remove_xss('<a href="https://example.com/">x</a>', true), 'https://example.com/') !== false);
ok('合法 data:image 保留', strpos(remove_xss('<img src="data:image/png;base64,AAAA">', true), 'data:image/png') !== false);

/* ---------- 5) rich 模式协议白名单（与前端 UE.markdownSafeUrl 一致） ---------- */
section('rich 模式协议白名单一致性');
$proto_attacks = array(
    '<a href="blob:https://evil.com/uuid">x</a>' => 'blob:',
    '<a href="filesystem:https://evil.com/temporary/x">x</a>' => 'filesystem:',
    '<a href="search-ms:query=evil">x</a>' => 'search-ms:',
    '<a href="livescript:alert(1)">x</a>' => 'livescript:',
    '<img src="data:image/svg+xml;base64,AAAA">' => 'svg+xml',
);
foreach ($proto_attacks as $input => $needle) {
    ok("rich 拦截 [$needle]", stripos(remove_xss($input, true), $needle) === false, remove_xss($input, true));
}
ok('rich mailto 放行', strpos(remove_xss('<a href="mailto:a@b.com">x</a>', true), 'mailto:a@b.com') !== false);
ok('rich tel 放行', strpos(remove_xss('<a href="tel:+1234567890">x</a>', true), 'tel:+1234567890') !== false);
ok('rich 相对路径放行', strpos(remove_xss('<a href="/docs/page">x</a>', true), '/docs/page') !== false);
ok('rich 锚点放行', strpos(remove_xss('<a href="#section">x</a>', true), '#section') !== false);

echo "\n========================================\n";
echo "结果：$pass 通过 / $fail 失败\n";
exit($fail ? 1 : 0);
