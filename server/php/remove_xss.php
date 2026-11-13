<?php
/**
 * Standalone XSS sanitization for UEditor Markdown output (framework-free).
 *
 * Extracted verbatim from the production project so it can be reused in any PHP app.
 * Two functions, no external dependencies (PHP builtins only):
 *   - lry_safe_css($css)              CSS property whitelist + value validation
 *   - remove_xss($string, $rich=false) HTML tag/attribute whitelist sanitizer
 *
 * Usage:
 *   require_once 'remove_xss.php';
 *   $safe = remove_xss($html);          // default safe baseline (legacy behavior)
 *   $safe = remove_xss($html, true);    // rich mode: keeps UEditor's safe rich output
 *                                       // (validated style, brush:/theme:/lry- classes,
 *                                       //  blockquote/hr/code/sup/sub/del/s/mark/kbd)
 *
 * NOTE: This is a defense-in-depth helper for server-side storage of editor HTML.
 * Always validate/authorize uploads separately; never trust client input alone.
 */

function lry_safe_css($css) {
    if (!is_string($css) || $css === '') {
        return '';
    }
    // 反斜杠转义与 CSS 注释可拼接出任意属性名，整体丢弃
    if (preg_match('#[\\\\/]#', $css) || stripos($css, '/*') !== false) {
        return '';
    }
    $num = '-?(?:\d+(?:\.\d+)?|\.\d+)';
    $len = "(?:{$num}(?:px|em|rem|pt|pc|%|ex|ch|vw|vh|cm|mm|in)|0)";
    $color = '(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\(\s*' . $num . '%?\s*,\s*' . $num . '%?\s*,\s*' . $num . '%?\s*(?:,\s*' . $num . '%?\s*)?\)|[a-zA-Z]{3,24})';
    $border_part = "(?:{$len}|none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset|thin|medium|thick|windowtext|{$color})";
    $rules = array(
        'color' => "/^{$color}$/i",
        'background-color' => "/^{$color}$/i",
        'background' => "/^{$color}$/i",
        'font-family' => "/^[\p{L}\p{N} ,'\"_.-]{1,200}$/ui",
        'font-size' => "/^(?:{$len}|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/i",
        'font-weight' => '/^(?:normal|bold|bolder|lighter|[1-9]00)$/i',
        'font-style' => '/^(?:normal|italic|oblique)$/i',
        'text-decoration' => '/^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i',
        'text-align' => '/^(?:left|right|center|justify|start|end)$/i',
        'text-indent' => "/^{$len}$/i",
        'line-height' => "/^(?:{$len}|{$num})$/i",
        'letter-spacing' => "/^{$len}$/i",
        'margin-top' => "/^{$len}$/i",
        'margin-bottom' => "/^{$len}$/i",
        'margin-left' => "/^{$len}$/i",
        'margin-right' => "/^{$len}$/i",
        'padding-left' => "/^{$len}$/i",
        'padding-right' => "/^{$len}$/i",
        'border' => "/^{$border_part}(?:\s+{$border_part}){0,2}$/i",
    );
    $bad = '/url\s*\(|expression|javascript\s*:|vbscript\s*:|@import|behaviou?r\s*:|-moz-binding|<|>|&|\x00-\x1f/i';
    $out = array();
    foreach (preg_split('/;+/', $css) as $decl) {
        $idx = strpos($decl, ':');
        if ($idx <= 0) {
            continue;
        }
        $prop = strtolower(trim(substr($decl, 0, $idx)));
        $val = trim(substr($decl, $idx + 1));
        $val = preg_replace('/\s*!important$/i', '', $val);
        if ($val === '' || strlen($val) > 200 || !isset($rules[$prop])) {
            continue;
        }
        if (preg_match($bad, $val)) {
            continue;
        }
        if (!preg_match($rules[$prop], $val)) {
            continue;
        }
        $val = str_replace('"', "'", $val);
        $val = preg_replace('/\s+/', ' ', $val);
        $out[$prop] = $prop . ':' . $val;
    }
    return implode(';', $out);
}

/**
 * URL 协议白名单（富文本模式 href/src 校验，与前端 UE.markdownSafeUrl 保持一致）。
 * 入参应为已解码、去空白、小写化的 URL。放行 http(s)/mailto/tel/ftp、
 * 相对路径/锚点/协议相对、data:image（栅格图）；其余协议一律拒绝。
 */
function lry_safe_url($url) {
    if ($url === '') {
        return true;
    }
    if (!preg_match('/^([a-z][a-z0-9+.\-]*):/', $url, $m)) {
        return true;
    }
    $proto = $m[1];
    if (in_array($proto, array('http', 'https', 'mailto', 'tel', 'ftp'), true)) {
        return true;
    }
    if ($proto === 'data') {
        return (bool) preg_match('/^data:image\/(png|jpe?g|gif|webp|bmp)(;|,)/', $url);
    }
    return false;
}

/**
 * xss过滤函数
 * @param  string  $string 要过滤的字符串
 * @param  bool    $rich  富文本模式：放行 UEditor 产出的安全富文本——
 *                        style 白名单属性+值校验、class 仅 brush:/theme:/lry- 前缀、
 *                        新增 blockquote/hr/code/sup/sub/del/s/mark/kbd 标签。
 *                        不传或 false 时行为与旧版逐字节一致（默认安全基线不变）。
 * @return string
 */
function remove_xss($string, $rich = false) {
    if (!is_string($string) || $string === '') {
        return $string;
    }

    $string = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/S', '', $string);

    // 截掉尾部未闭合的标签片段（如结尾的 "<img src=x onerror=..."）：
    // 下方标签过滤正则要求以 '>' 结束，未闭合片段会整体漏过并被浏览器与后续内容拼合解析，导致事件属性注入
    $string = preg_replace('/<[^>]*$/s', '', $string);

    $allowed_tags = array(
        'a', 'b', 'strong', 'i', 'em', 'u', 'p', 'br', 'div', 'span', 'ul', 'ol', 'li', 'pre',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    );
    if ($rich) {
        $allowed_tags = array_merge($allowed_tags, array(
            'blockquote', 'hr', 'code', 'sup', 'sub', 'del', 's', 'mark', 'kbd'
        ));
    }

    $allowed_attributes = array(
        '*' => array('title', 'alt'),
        'a' => array('href', 'title', 'target', 'rel'),
        'img' => array('src', 'alt', 'title', 'width', 'height')
    );

    $string = preg_replace_callback('/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/s', function($matches) use ($allowed_tags, $allowed_attributes, $rich) {
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

        // 修复属性名包含引号绕过问题
        if (preg_match_all('/([^\s=\/>]+)(\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\"\'>\s]+)))?/s', $attr_text, $attr_matches, PREG_SET_ORDER)) {
            foreach ($attr_matches as $attr_match) {
                $name = $attr_match[1];
                $decoded_name = html_entity_decode($name, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $decoded_name = rawurldecode($decoded_name);
                // 清理属性名内控制字符（/u 遇非法 UTF-8 返回 null，回退字节级清理避免黑名单失效）
                $normalized_name = preg_replace('/[\s\x00-\x1F\x7F]+/u', '', $decoded_name);
                if ($normalized_name === null) {
                    $normalized_name = preg_replace('/[\s\x00-\x1F\x7F]+/', '', $decoded_name);
                }
                $normalized_name = strtolower($normalized_name);

                // 过滤所有on开头事件属性
                if (strpos($normalized_name, 'on') === 0) {
                    continue;
                }

                if (!in_array($normalized_name, $allowed)) {
                    // 富文本模式：style/class 放行（值须通过白名单校验，见下方）
                    if ($rich && $normalized_name === 'style') {
                        // 允许进入值校验
                    } elseif ($rich && $normalized_name === 'class') {
                        // 允许进入值校验
                    } else {
                        continue;
                    }
                }

                $value = '';
                if (isset($attr_match[3]) && $attr_match[3] !== '') {
                    $value = $attr_match[3];
                } elseif (isset($attr_match[4]) && $attr_match[4] !== '') {
                    $value = $attr_match[4];
                } elseif (isset($attr_match[5]) && $attr_match[5] !== '') {
                    $value = $attr_match[5];
                }

                // href src协议校验，解码实体和百分号编码后检测
                if ($normalized_name === 'href' || $normalized_name === 'src') {
                    $value = trim($value);
                    $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                    $decoded = rawurldecode($decoded);
                    $normalized_value = preg_replace('/[\s\x00-\x1F\x7F]+/u', '', $decoded);
                    if ($normalized_value === null) {
                        $normalized_value = preg_replace('/[\s\x00-\x1F\x7F]+/', '', $decoded);
                    }
                    $normalized_value = strtolower($normalized_value);

                    if ($rich) {
                        // 富文本模式：协议白名单，与前端 UE.markdownSafeUrl 一致（拒绝 blob/filesystem/search-ms 等）
                        if (!lry_safe_url($normalized_value)) {
                            continue;
                        }
                    } else {
                        // 默认模式：保持升级前黑名单逻辑（不传 $rich 时逐字节兼容）
                        if (preg_match('/^(javascript|vbscript|file|about|view-source):/i', $normalized_value)) {
                            continue;
                        }
                        if (strpos($normalized_value, 'data:') === 0) {
                            if (!preg_match('/^data:image\/(png|jpe?g|gif|webp|bmp)(;|,)/i', $normalized_value)) {
                                continue;
                            }
                        }
                    }
                }

                // 富文本模式：style 白名单 + 值校验 / class 前缀白名单
                if ($rich && $normalized_name === 'style') {
                    $clean_css = lry_safe_css($value);
                    if ($clean_css === '') {
                        continue;
                    }
                    $attr_values[$normalized_name] = $clean_css;
                    continue;
                }
                if ($rich && $normalized_name === 'class') {
                    $classes = preg_split('/\s+/', trim($value), -1, PREG_SPLIT_NO_EMPTY);
                    $safe_classes = array();
                    foreach ($classes as $cls) {
                        if (preg_match('/^(?:brush:[a-z0-9#+._-]{1,16}(?:;toolbar:(?:true|false))?(?:;theme:[a-z0-9_-]{1,32})?;?|theme:[a-z0-9_-]{1,32}|lry-[a-z0-9-]{1,30})$/i', $cls)) {
                            $safe_classes[] = $cls;
                        }
                    }
                    if (!$safe_classes) {
                        continue;
                    }
                    $attr_values[$normalized_name] = implode(' ', array_unique($safe_classes));
                    continue;
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