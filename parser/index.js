// 介绍这个之前，可以先用 simplehtmlparser.js 做例子

import parseHTML from './html-parser';
import parseText from './text-parser';

import {
    addAttr,
    addHandler,
    addDirective,
    getAndRemoveAttr,
    getBindingAttr
} from './helper';

const onRE = /^@|^m-on:/
const dirRE = /^m-|^@|^:/
const forAliasRE = /(.*?)\s+(?:in|of)\s+(.*)/
const forIteratorRE = /\((\{[^}]*\}|[^,]*),([^,]*)(?:,([^,]*))?\)/

const argRE = /:(.*)$/
const bindRE = /^:|^m-bind:/
const modifierRE = /\.[^.]+/g

/**
 * Convert HTML string to AST.
 */
export default function parse (
    template,
    options
){
    // 节点栈
    const stack = []
    // 根节点，最终改回返回
    let root
    // 当前的父节点
    let currentParent

    parseHTML.parse(template, {
        // node 的开始
        start (tag, attrs, unary) {
            // unary 是否一元标签，如 <img/>

            const element = {
                type: 1,
                tag,
                // attrsList 数组形式
                attrsList: attrs,
                // attrsMap 对象形式，如 {id: 'app', 'm-text': 'xxx'}
                attrsMap: makeAttrsMap(attrs),
                parent: currentParent,
                children: []
            }

            // 处理 m-for ，生成 element.for, element.alias
            processFor(element)
            // 处理 m-if ，生成 element.if, element.else, element.elseif
            processIf(element)
            // 处理 m-once ，生成 element.once
            processOnce(element)
            // 处理 key ，生成 element.key
            processKey(element)

            // 处理属性
            // 第一，处理指令：m-bind m-on 以及其他指令的处理
            // 第二，处理普通的 html 属性，如 style class 等
            processAttrs(element)

            // tree management
            if (!root) {
                // 确定根节点
                root = element
            }
            if (currentParent) {
                // 当前有根节点
                currentParent.children.push(element)
                element.parent = currentParent
            }
            if (!unary) {
                // 不是一元标签（<img/> 等）
                currentParent = element
                stack.push(element)
            }
        },
        // node 的结束
        end () {
            // pop stack
            stack.length -= 1
            currentParent = stack[stack.length - 1]
        },
        // 字符
        chars (text) {
            if (!currentParent) return;
            const children = currentParent.children
            let expression
            // 处理字符
            expression = parseText(text)  // 如 '_s(price)+" 元"' ，_s 在 core/instance/render.js 中定义
            children.push({
                type: 2,
                expression,
                text
            })
        },
        // 注释内容
        comment (text) {
            currentParent.children.push({
                type: 3,
                text,
                isComment: true
            })
        }
    })
    return root
}

function makeAttrsMap (attrs) {
    const map = {}
    for (let i = 0, l = attrs.length; i < l; i++) {
        map[attrs[i].name] = attrs[i].value
    }
    return map
}

// 处理 m-for
function processFor (el) {
    let exp
    // 获取表达式，例如 'item in list'
    if ((exp = getAndRemoveAttr(el, 'm-for'))) {
        // inMatch 即 ['item in list', 'item', 'list']
        const inMatch = exp.match(forAliasRE)
        if (!inMatch) {
            return
        }
        el.for = inMatch[2].trim()  // 'list'
        const alias = inMatch[1].trim()  // 'item'

        // 如果是 '(item, index) in list' 情况下
        // iteratorMatch 即 ["(item, index)", "item", "index", undefined]
        const iteratorMatch = alias.match(forIteratorRE)
        if (iteratorMatch) {
            el.alias = iteratorMatch[1].trim() // 'item'
            el.iterator1 = iteratorMatch[2].trim()  // 'index'
            if (iteratorMatch[3]) {
                el.iterator2 = iteratorMatch[3].trim()
            }
        } else {
            // 普通的 'item in list' 这种情况
            el.alias = alias // 'item'
        }
    }
}

// 处理 m-if
function processIf (el) {
    // 获取表达式
    const exp = getAndRemoveAttr(el, 'm-if')
    if (exp) {
        el.if = exp
    } else {
        if (getAndRemoveAttr(el, 'm-else') != null) {
            el.else = true
        }
        const elseif = getAndRemoveAttr(el, 'm-else-if')
        if (elseif) {
            el.elseif = elseif
        }
    }
}

// 处理 m-once
function processOnce (el) {
    const once = getAndRemoveAttr(el, 'm-once')
    if (once != null) {
        el.once = true
    }
}

// 处理 key
function processKey (el) {
    const exp = getBindingAttr(el, 'key')
    if (exp) {
        el.key = exp
    }
}

function processAttrs (el) {
    // 获取属性列表
    const list = el.attrsList
    let i, l, name, rawName, value, modifiers, isProp
    for (i = 0, l = list.length; i < l; i++) {
        // 获取属性的 name 和 value
        name = rawName = list[i].name
        value = list[i].value

        if (dirRE.test(name)) {  // 如果该属性是指令，如 m- @ : 特性
            // mark element as dynamic
            el.hasBindings = true

            if (bindRE.test(name)) {  // m-bind ，如 'm-bind:class'
                name = name.replace(bindRE, '') // 去掉 name 中的 'm-bind:'
                // el.attrs.push(name, value)
                addAttr(el, name, value)
            } else if (onRE.test(name)) { // m-on ，如 'm-on:click'
                name = name.replace(onRE, '')  // 去掉 name 中的 'm-on'
                // el.events[name] = [{value: value}, ...] // 多个事件就数组形式，单个时间就普通对象形式 {value: value}
                addHandler(el, name, value)
            } else {  // 普通指令 如 m-show
                name = name.replace(dirRE, '') // 去掉指令前缀 'm-show' -> 'show'
                // el.directives.push({name, rawname, value})
                addDirective(el, name, rawName, value);
            }
        } else {  // 不是指令
            // 普通属性加入 el.attrs
            // el.attrs.push(name, value)
            addAttr(el, name, JSON.stringify(value))
        }
    }
}