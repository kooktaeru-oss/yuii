/**
 * SillyPhone UI - Vanilla JS
 * Optimized for 360x600 layout
 * Bridge Version - 2026-03-22
 */

function initSillyPhoneUI() {
    try {
        if (window.frameElement) {
            window.frameElement.style.width = '400px';
            window.frameElement.style.height = '640px';
            window.frameElement.style.maxWidth = '100%';
            window.frameElement.style.maxHeight = '100vh';
            window.frameElement.style.border = 'none';
            window.frameElement.style.backgroundColor = 'transparent';
            window.frameElement.style.display = 'block';
            window.frameElement.style.margin = '0 auto';
        }

        // 尝试向父窗口注入 CSS，隐藏 <shouji> 标签并防止长文本撑破屏幕
        const targetDoc = window.parent ? window.parent.document : document;
        if (targetDoc && !targetDoc.getElementById('sillyphone-global-style')) {
            const style = targetDoc.createElement('style');
            style.id = 'sillyphone-global-style';
            style.innerHTML = `
                shouji, shouji_preset { 
                    display: none !important; 
                }
            `;
            targetDoc.head.appendChild(style);
        }
    } catch (e) {
        // Ignore cross-origin errors
    }

    const state = {
        currentPage: 'chat-list',
        currentChat: null,
        contacts: [],
        worldBook: [],
        characters: [], // 角色库，动态加载
        userAvatar: 'https://files.catbox.moe/blaehb.jpg',
        userName: '我',
        wechatId: 'wxid_sillyphone',
        userAccounts: [
            {
                id: 'user_main',
                name: '我',
                avatar: 'https://files.catbox.moe/blaehb.jpg',
                wechatId: 'wxid_sillyphone',
                momentsBg: 'https://files.catbox.moe/smqrt7.jpg',
                contacts: [],
                groups: [],
                messages: {},
                moments: []
            }
        ],
        activeAccountId: 'user_main',
        messages: {}, // 当前激活账号的消息
        moments: [], // 当前激活账号的朋友圈
        stickers: {
            '收藏': { roles: [], items: [] }
        },
        currentStickerCategory: '收藏',
        isStickerEditMode: false,
        quotedMessage: null,
        multiSelectMode: false,
        selectedMessageIds: [],
        groups: [],
        moments: [],
        settings: {
            globalBg: '',
            chatBg: '',
            momentsBg: 'https://files.catbox.moe/smqrt7.jpg',
            blur: 12,
            bubbleBlur: 12,
            navBlur: 15,
            glassOpacity: 5
        },
        presets: [], // 手机轻预设
        call: {
            active: false,
            isIncoming: false,
            contact: null,
            startTime: null,
            duration: 0,
            timerInterval: null,
            isMuted: false,
            isSpeaker: false,
            transcript: []
        },
        stUserName: null,
        sessionStartMsgId: null,
        _dataLoaded: false,  // 保护标志：防止数据加载完成前触发同步覆盖
        _useBackendSync: false // 标志：是否成功对接酒馆后端存储
    };

    // --- SillyTavern 同层同步逻辑 ---

    function getSTInterface() {
        // 尝试从 window 或 window.parent 获取酒馆的 API
        const target = window.getCurrentMessageId ? window : window.parent;

        // 尝试从 DOM 中获取 messageId (用于修复切换原始代码后 script 不执行导致找不到 ID 的 bug)
        let domMsgId = null;
        try {
            if (window.frameElement) {
                const mesEl = window.frameElement.closest('.mes');
                if (mesEl && mesEl.getAttribute('mesid')) {
                    domMsgId = parseInt(mesEl.getAttribute('mesid'), 10);
                }
            }
        } catch (e) {
            // 跨域或其他原因导致无法访问 parent DOM
        }

        return {
            getCurrentMessageId: () => {
                if (target.getCurrentMessageId) return target.getCurrentMessageId();
                if (domMsgId !== null) return domMsgId;
                return null;
            },
            getChatMessages: (id) => target.getChatMessages ? target.getChatMessages(id) : [],
            setChatMessages: (msgs, opts) => target.setChatMessages ? target.setChatMessages(msgs, opts) : null,
            generateRaw: target.generateRaw ? target.generateRaw.bind(target) : null,
            executeSlashCommands: target.executeSlashCommands ? target.executeSlashCommands.bind(target) : null
        };
    }

    function serializeMessagesToText(messages, currentMsgId) {
        let text = '';

        // 辅助函数：通过ID查找联系人名字
        const getContactNameById = (id) => {
            if (state.contacts) {
                const contact = state.contacts.find(c => c.id === id);
                if (contact) return contact.name;
            }
            if (state.groups) {
                const group = state.groups.find(g => g.id === id);
                if (group) return group.name;
            }
            return id; // 找不到则返回原ID
        };

        for (const chatId in messages) {
            if (!messages[chatId] || messages[chatId].length === 0) continue;

            // 序列化消息：保留非历史消息、属于当前回合的消息，以及没有 sourceMsgId 的消息（从文本解析恢复的）
            const currentMessages = messages[chatId].filter(msg =>
                !msg.isHistory ||
                (currentMsgId !== undefined && msg.sourceMsgId === currentMsgId) ||
                msg.sourceMsgId === undefined
            );
            if (currentMessages.length === 0) continue;

            const chatName = getContactNameById(chatId);
            const isGroup = state.groups && state.groups.some(g => g.id === chatId || g.name === chatId);

            if (isGroup) {
                text += `<multi>\n【和 ${chatName}的聊天】\n`;
            } else {
                text += `<private>\n【和${chatName}的聊天】\n`;
            }

            currentMessages.forEach(msg => {
                const sender = (msg.senderId === 'user') ? '我方消息' : (msg.senderName || msg.senderId || msg.sender || '未知');
                const content = msg.text || msg.content || '';
                const msgType = msg.msgType || (msg.type === 'system' ? 'system' : 'text');
                const time = msg.time || '';

                if (msg.quotedMsg) {
                    const quotedContent = msg.quotedMsg.text || msg.quotedMsg.content || '';
                    text += `<${sender}|${quotedContent}|${content}>\n`;
                } else if (msgType === 'photo') {
                    const desc = msg.description || '';
                    const rawPath = msg.serverPath || '';
                    const path = rawPath ? `|IMGDATA:${rawPath}` : '';
                    const fileName = msg.fileName ? `|FILENAME:${msg.fileName}` : '';
                    const avatar = msg.senderAvatar || '';
                    // 采用更加直观的 [名字|头像|图片|描述|路径|时间] 格式，增强 AI 联想力
                    text += `[${sender}|${avatar}|图片|${desc}${path}${fileName}|${time}]\n`;
                } else if (msgType === 'sticker') {
                    text += `[${sender}|图片|发送了一个表情包|${msg.label || '表情包'}|${time}]\n`;
                } else if (msgType === 'voice') {
                    const duration = msg.duration || `${Math.max(1, Math.ceil(content.length / 4))}"`;
                    text += `[${sender}|语音|${duration}|${content}|${time}]\n`;
                } else if (msgType === 'transfer' || msgType === 'redpacket' || msgType === 'red-packet') {
                    let outText = content || (msgType === 'transfer' ? '转账' : '红包');
                    text += `[${sender}|${outText}|${time}]\n`;
                } else {
                    text += `[${sender}|${content}|${time}]\n`;
                }
            });

            if (isGroup) {
                text += `</multi>\n`;
            } else {
                text += `</private>\n`;
            }
        }
        return text;
    }

    function serializeMomentsToText(moments) {
        if (!moments || moments.length === 0) return '';
        let text = '<pyq>\n';
        moments.forEach((moment, index) => {
            const author = state.contacts.find(c => c.id === moment.authorId) || { name: moment.authorName, avatar: moment.userAvatar };
            text += `<post:${index + 1}>\n`;
            text += `[${author.name}|${author.avatar || ''}|${moment.content}]\n`;
            if (moment.comments && moment.comments.length > 0) {
                moment.comments.forEach(comment => {
                    const name = comment.authorName || comment.name || '未知';
                    if (comment.replyToName) {
                        text += `[评论|${name}|${comment.replyToName}|${comment.text}]\n`;
                    } else {
                        text += `[评论|${name}|${comment.text}]\n`;
                    }
                });
            }
            text += `</post:${index + 1}>\n`;
        });
        text += '</pyq>\n';
        return text;
    }

    function getStorageKey() {
        try {
            const target = window.getCurrentMessageId ? window : window.parent;
            if (target.chat_metadata && target.chat_metadata.chat_id) {
                return 'sillyphone_data_' + target.chat_metadata.chat_id;
            }
            if (target.this_chid !== undefined) {
                return 'sillyphone_data_char_' + target.this_chid;
            }
        } catch (e) { }
        return 'sillyphone_backup_data';
    }

    function syncToSillyTavern() {
        // 保护：如果数据尚未加载完成，拒绝同步，防止用不完整的空数据覆盖酒馆中的正确数据
        if (!state._dataLoaded) {
            console.warn('[SillyPhone] 数据尚未加载完毕，跳过同步');
            return;
        }
        const st = getSTInterface();
        const msgId = st.getCurrentMessageId();
        if (msgId === null) return;

        const chat = st.getChatMessages(msgId)[0];
        if (!chat) return;

        const raw = chat.message || '';

        // 在同步前，确保当前激活账号的消息完整保留，保留当前会话的全部消息，不再截断
        const active = state.userAccounts.find(a => a.id === state.activeAccountId);
        if (active) {
            active.contacts = [...state.contacts];
            active.groups = [...state.groups];
            active.messages = { ...state.messages };
            active.moments = [...state.moments];
        }

        // 深度克隆并修剪消息记录，防止数据过大导致卡顿
        const prunedAccounts = state.userAccounts.map(acc => {
            const prunedMessages = {};
            if (acc.messages) {
                for (const chatId in acc.messages) {
                    if (Array.isArray(acc.messages[chatId])) {
                        // 每个会话保留最近 20 条消息（含历史和当前），足以维持“延续感”且不卡顿
                        prunedMessages[chatId] = [...acc.messages[chatId]];
                    }
                }
            }
            return {
                ...acc,
                messages: prunedMessages
            };
        });

        // 序列化极简状态用于持久化 (排除大体积的 userAccounts)
        const shoujiData = {
            activeAccountId: state.activeAccountId,
            settings: state.settings,
            presets: state.presets
        };

        // 获取纯净的文本同步内容（用于 AI 上下文）
        const activeAccount = prunedAccounts.find(a => a.id === state.activeAccountId) || prunedAccounts[0];
        let textContent = '';
        if (activeAccount) {
            textContent += serializeMessagesToText(activeAccount.messages, msgId);
            textContent += serializeMomentsToText(activeAccount.moments);
        }

        // 保存状态到本地 localStorage (作为备份)
        const storageData = {
            ...shoujiData,
            userAccounts: prunedAccounts,
            stickers: state.stickers
        };
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(storageData));
        } catch (e) { }

        // --- 至简同步模式 ---
        // 直接输出纯净的 <shouji> 标签，不再包含任何隐藏 JSON 或 DIV 干扰原代码
        const shoujiTag = `<shouji>\n${textContent.trim()}\n</shouji>`;

        let updatedMessage;
        if (raw.includes('<shouji>')) {
            // 兼容替换掉旧版的带有 div 的包裹，以及新版的干净 shouji 标签
            updatedMessage = raw.replace(/<div[^>]*class="sillyphone-sync-tag"[^>]*>[\s\S]*?<\/div>|<shouji>[\s\S]*?<\/shouji>/, shoujiTag);
        } else {
            updatedMessage = raw + "\n" + shoujiTag;
        }

        // --- 深度多模态接驳：构建附件元数据 ---
        let attachments = [];
        if (state.messages && state.currentChat) {
            const chatId = state.currentChat.id;
            const msgs = state.messages[chatId];
            if (Array.isArray(msgs)) {
                // 仅同步当前会话中最近的图片附件，防止酒馆后端过载
                msgs.slice(-5).forEach(m => {
                    if ((m.msgType === 'photo' || m.msgType === 'image') && (m.serverPath || m.url || m.imageData)) {
                        attachments.push({
                            type: 'image',
                            path: m.serverPath || m.url,
                            data: m.imageData || null
                        });
                    }
                });
            }
        }

        // 更新酒馆原代码，并携带多模态附件
        const originalExtra = chat.extra || {};
        st.setChatMessages([{
            message_id: msgId,
            message: updatedMessage,
            // 协议对齐：合并附件，不覆盖原有 extra 字段
            extra: { 
                ...originalExtra,
                attachments: attachments.length > 0 ? attachments : (originalExtra.attachments || [])
            }
        }], { refresh: 'none' });

        // 尝试将关键设置同步到酒馆后端 API 存储
        saveSettingsToST();
    }

    // --- 后端通讯增强：多维 CSRF 令牌探测器 ---
    function getCSRFToken() {
        try {
            const targetDoc = window.parent ? window.parent.document : document;
            let token = targetDoc.getElementById('csrf_token')?.value;
            if (token) return token;
            token = targetDoc.querySelector('meta[name="csrf-token"]')?.content ||
                targetDoc.querySelector('meta[name="csrf-token-value"]')?.content;
            if (token) return token;
            const cookieMatch = targetDoc.cookie.match(/csrf_token=([^;]+)/);
            if (cookieMatch) return cookieMatch[1];
            if (window.parent && window.parent.jQuery && window.parent.jQuery.ajaxSettings) {
                const headers = window.parent.jQuery.ajaxSettings.headers;
                if (headers && headers['X-CSRF-Token']) return headers['X-CSRF-Token'];
            }
            return '';
        } catch (e) { return ''; }
    }

    /**
     * C. 后端设置持久化 (Backend Persistence)
     */
    async function saveSettingsToST() {
        const payload = {
            extension: 'yuii-phone',
            settings: state.settings
        };

        // --- 核心修复：优先使用标准接口 ---
        const endpoint = `/api/extensions/settings`;

        // 方案 1: 优先尝试调用父窗口的 jQuery.ajax (自带 CSRF)
        if (window.parent && window.parent.jQuery) {
            window.parent.jQuery.ajax({
                url: endpoint,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(payload),
                success: () => {
                    state._useBackendSync = true;
                    console.log('[SillyPhone] 设置同步成功 (v1)');
                },
                error: (xhr) => {
                    // 如果标准路径失败，尝试 v1
                    if (xhr.status === 404) {
                        const v1Endpoint = '/api/extensions/settings/v1';
                        window.parent.jQuery.ajax({
                            url: v1Endpoint,
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify(payload),
                            success: () => console.log('[SillyPhone] 设置同步成功 (v1)'),
                            error: (xhr2) => {
                                console.warn('[SillyPhone] 所有同步接口均不可用，仅使用本地存储。');
                                state._useBackendSync = false;
                            }
                        });
                    }
                }
            });
            return;
        }

        // 方案 2: 回退到 fetch (带令牌)
        try {
            await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCSRFToken()
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.warn('[SillyPhone] Fetch 模式同步设置失败', e);
        }
    }

    async function loadSettingsFromST() {
        try {
            // 标准酒馆设置路径通常不带 /v1，先试标准的
            const response = await fetch('/api/extensions/settings?extension=yuii-phone');
            if (response.ok) {
                const data = await response.json();
                if (data && data.settings) {
                    state._useBackendSync = true;
                    return data.settings;
                }
            } else if (response.status === 404) {
                // 尝试 v1 路径兼容
                const v1Response = await fetch('/api/extensions/settings/v1?extension=yuii-phone');
                if (v1Response.ok) {
                    const v1Data = await v1Response.json();
                    if (v1Data && v1Data.settings) {
                        state._useBackendSync = true;
                        return v1Data.settings;
                    }
                }
            }
        } catch (e) {
            console.warn('[SillyPhone] 加载后端设置失败 (正常现象):', e.message);
        }
        return null;
    }

    /**
     * D. 图片后端上传 (Image Backend Upload)
     */
    async function uploadImageToST(file) {
        // --- 方案 1: 借道 Olivia's Toolkit (橄榄百宝箱) 或其它兼容桥接器 ---
        const bridgeUpload = window.parent.__uploadImageByPlugin || window.__uploadImageByPlugin;
        if (bridgeUpload) {
            console.log('[SillyPhone] 发现图片上传绿色通道，正在调用...');
            try {
                // 部分插件需要第二个参数 (配置)，Olivia's 不需要但传了也没事
                const result = await bridgeUpload(file, { path: 'phone', sendToChat: false });
                
                // 兼容多种返回格式: {url: "..."} 或 {success: true, url: "..."} 或 直接返回字符串
                if (result) {
                    const finalUrl = typeof result === 'string' ? result : (result.url || (result.success && result.data));
                    if (finalUrl) {
                        console.log('[SillyPhone] 通过绿色通道上传成功:', finalUrl);
                        return finalUrl;
                    }
                }
            } catch (e) { 
                console.error('[SillyPhone] 绿色通道上传异常:', e);
            }
        }

        // --- 方案 2: 使用父窗口 jQuery.ajax (原生绕过 CSRF) ---
        if (window.parent && window.parent.jQuery) {
            return new Promise((resolve) => {
                const formData = new FormData();
                formData.append('image', file);
                formData.append('path', 'phone');
                window.parent.jQuery.ajax({
                    url: '/api/images/upload',
                    method: 'POST',
                    processData: false,
                    contentType: false,
                    data: formData,
                    success: (res) => resolve(res && res.imgText ? res.imgText : null),
                    error: () => resolve(null)
                });
            });
        }

        // --- 方案 3: 回退到标准 fetch ---
        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('path', 'phone');
            const response = await fetch('/api/images/upload', {
                method: 'POST',
                headers: { 'X-CSRF-Token': getCSRFToken() },
                body: formData
            });
            if (response.ok) {
                const result = await response.json();
                return result.imgText || null;
            }
        } catch (e) { }
        return null;
    }

    /**
     * A. 加载可视历史 (Visual History)
     * 从状态中提取并标记历史记录，供 UI 显示
     */
    function loadVisualHistory(chatId) {
        return (state.messages[chatId] || []).filter(m => m.isHistory);
    }

    /**
     * B. 构建生成 Prompt (Generation Prompt)
     * 仅提取当前会话的消息，用于发送给 AI
     */
    function buildGenerationPrompt(chatId) {
        return (state.messages[chatId] || []).filter(m => !m.isHistory);
    }

    function parseAuthorFormat(rawText, defaultChatName = "未知会话", mode = "chat") {
        if (!rawText) rawText = '';

        // 预处理 rawText：将各类 HTML 换行和分段替换回真实的 \n，并处理转义字符
        rawText = rawText.replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p>/gi, '\n')
            .replace(/<p>/gi, '')
            .replace(/<\/p>/gi, '\n')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        const data = {
            messages: {},
            moments: []
        };

        let hasTags = false;

        // 辅助函数：解析单行消息
        const parseMessageLine = (line) => {
            if (line.startsWith('[评论|')) return null;
            const m = line.match(/^\[(.*)\]$/);
            if (!m) return null;
            const parts = m[1].split('|');
            if (parts.length < 2) return null;

            let sender = parts[0];
            let time = '';
            let dataParts = [];

            const lastPart = parts[parts.length - 1];
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(lastPart)) {
                time = lastPart;
                dataParts = parts.slice(1, -1);
            } else {
                time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                dataParts = parts.slice(1);
            }

            let msgType = 'text';
            let content = '';
            let duration = '';
            let amount = undefined;
            let remark = undefined;
            let status = undefined;
            let url = '';
            let label = '';

            if (dataParts.length === 1) {
                const body = dataParts[0];
                if (body.includes('转账') || body.includes('收账')) {
                    msgType = 'transfer';
                    content = body;
                    const amountMatch = body.match(/[\d.]+/);
                    amount = amountMatch ? parseFloat(amountMatch[0]).toFixed(2) : "0.00";
                    remark = '转账给你';
                    if (body.includes('退回')) {
                        status = 'returned';
                    } else if (body.includes('收账')) {
                        status = 'received';
                    } else {
                        status = 'unreceived';
                    }
                }
                else if (body.includes('红包')) {
                    msgType = 'redpacket';
                    content = body;
                    const amountMatch = body.match(/[\d.]+/);
                    amount = amountMatch ? parseFloat(amountMatch[0]).toFixed(2) : "0.00";
                    remark = '恭喜发财，大吉大利';
                    if (body.includes('退回')) {
                        status = 'returned';
                    } else if (body.includes('领') || body.includes('收')) {
                        status = 'received';
                    } else {
                        status = 'unreceived';
                    }
                }
                else { content = body; }
            } else if (dataParts.length >= 2) {
                const body = dataParts[0];
                if (body === '图片') { 
                    msgType = 'photo'; 
                    content = dataParts[1]; 
                    url = dataParts[1]; 
                    // 更加健壮的解析：识别 IMGDATA 和 FILENAME
                    dataParts.forEach(p => {
                        if (p.startsWith('IMGDATA:')) url = p;
                        if (p.startsWith('FILENAME:')) label = p.replace('FILENAME:', '');
                    });
                }
                else if (body === '表情包') {
                    msgType = 'sticker';
                    label = dataParts[1] || '表情包';
                    content = label;

                    // 尝试根据标签名反向查找 URL，恢复视觉显示
                    let foundUrl = '';
                    if (state.stickers) {
                        for (const catName in state.stickers) {
                            const item = state.stickers[catName].items.find(i => i.label === label);
                            if (item) {
                                foundUrl = item.url;
                                break;
                            }
                        }
                    }
                    url = foundUrl;
                }
                else if (body === '语音消息') { msgType = 'voice'; content = dataParts[1]; }
                else if (body.includes('转账') || body.includes('收账')) {
                    msgType = 'transfer';
                    content = body;
                    const amountMatch = body.match(/[\d.]+/);
                    amount = amountMatch ? parseFloat(amountMatch[0]).toFixed(2) : "0.00";
                    remark = dataParts[1] || '转账给你';
                    if (body.includes('退回')) {
                        status = 'returned';
                    } else if (body.includes('收账')) {
                        status = 'received';
                    } else {
                        status = 'unreceived';
                    }
                }
                else if (body.includes('红包')) {
                    msgType = 'redpacket';
                    content = body;
                    const amountMatch = body.match(/[\d.]+/);
                    amount = amountMatch ? parseFloat(amountMatch[0]).toFixed(2) : "0.00";
                    remark = dataParts[1] || '恭喜发财，大吉大利';
                    if (body.includes('退回')) {
                        status = 'returned';
                    } else if (body.includes('领') || body.includes('收')) {
                        status = 'received';
                    } else {
                        status = 'unreceived';
                    }
                }
                else if (body === '语音通话') { msgType = 'call'; content = dataParts[1]; }
                else if (body === '语音未接听') { msgType = 'call-missed'; content = dataParts[1]; }
                else if (body === '语音通话已挂断') { msgType = 'call-end'; duration = dataParts[1]; }
                else if (body === '撤回消息') { msgType = 'recall'; content = dataParts[1]; }
                else { content = dataParts.length > 2 ? dataParts.slice(1).join('|') : dataParts[1]; }
                
                if (dataParts.length >= 3 && body === '语音消息') {
                    duration = dataParts[1];
                    content = dataParts[2];
                }
            } else {
                content = dataParts.join('|');
            }

            return { sender, time, msgType, content, duration, amount, remark, status, url, label };
        };

        // 辅助函数：解析引用消息
        const parseQuoteLine = (line) => {
            const q = line.match(/^<(.*)>$/);
            if (!q) return null;
            const parts = q[1].split('|');
            if (parts.length < 2) return null;

            let sender = parts[0];
            let time = '';
            let quote = '';
            let content = '';

            const lastPart = parts[parts.length - 1];
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(lastPart)) {
                time = lastPart;
                if (parts.length >= 4) {
                    quote = parts[1];
                    content = parts[2];
                } else if (parts.length === 3) {
                    content = parts[1];
                }
            } else {
                time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                if (parts.length >= 3) {
                    quote = parts[1];
                    content = parts[2];
                } else if (parts.length === 2) {
                    content = parts[1];
                }
            }

            return { sender, time, type: 'quote', quote, content };
        };

        // 1. 解析私聊 <private>
        const privateMatches = rawText.matchAll(/<private>([\s\S]*?)(?:<\/private>|$)/g);
        for (const pMatch of privateMatches) {
            hasTags = true;
            const content = pMatch[1];
            const titleMatch = content.match(/【和(.*?)的聊天】/);
            const chatName = titleMatch ? titleMatch[1].trim() : defaultChatName;

            if (!data.messages[chatName]) data.messages[chatName] = [];

            // 匹配各种消息格式
            const msgLines = content.split('\n');
            msgLines.forEach(line => {
                const msgData = parseMessageLine(line);
                if (msgData) {
                    data.messages[chatName].push({
                        id: 'msg_' + Math.random().toString(36).substr(2, 9),
                        ...msgData
                    });
                }

                const quoteData = parseQuoteLine(line);
                if (quoteData) {
                    data.messages[chatName].push({
                        id: 'msg_' + Math.random().toString(36).substr(2, 9),
                        ...quoteData
                    });
                }
            });
        }

        // 2. 解析群聊 <multi>
        const qunMatches = rawText.matchAll(/<multi>([\s\S]*?)(?:<\/multi>|$)/g);
        for (const qMatch of qunMatches) {
            hasTags = true;
            const content = qMatch[1];
            const titleMatch = content.match(/【和 (.*?)的聊天】/);
            const groupName = titleMatch ? titleMatch[1].trim() : defaultChatName;

            if (!data.messages[groupName]) data.messages[groupName] = [];

            // 群聊逻辑与私聊类似，只是多了成员识别
            const msgLines = content.split('\n');
            msgLines.forEach(line => {
                const msgData = parseMessageLine(line);
                if (msgData && msgData.sender !== '群成员') {
                    data.messages[groupName].push({
                        id: 'msg_' + Math.random().toString(36).substr(2, 9),
                        ...msgData
                    });
                }

                const quoteData = parseQuoteLine(line);
                if (quoteData && quoteData.sender !== '群成员') {
                    data.messages[groupName].push({
                        id: 'msg_' + Math.random().toString(36).substr(2, 9),
                        ...quoteData
                    });
                }
            });
        }

        // 3. 解析朋友圈 <pyq>
        const pyqMatch = rawText.match(/<pyq>([\s\S]*?)(?:<\/pyq>|$)/);
        if (pyqMatch) {
            hasTags = true;
            const posts = pyqMatch[1].matchAll(/<post:\d+>([\s\S]*?)(?:<\/post:\d+>|$)/g);
            for (const p of posts) {
                const lines = p[1].trim().split('\n');
                const m = lines[0].match(/^\[(.*)\]$/);
                if (m) {
                    const parts = m[1].split('|');
                    if (parts.length >= 2) {
                        let userName = parts[0];
                        let content = '';
                        let time = '';
                        let userAvatar = '';

                        const lastPart = parts[parts.length - 1];
                        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(lastPart)) {
                            time = lastPart;
                            if (parts.length === 3) {
                                content = parts[1];
                            } else if (parts.length >= 4) {
                                if (parts[1] === '朋友圈' || parts[1] === 'pyq') {
                                    content = parts[2];
                                } else {
                                    userAvatar = parts[1];
                                    content = parts[2];
                                }
                            }
                        } else {
                            time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                            if (parts.length === 2) {
                                content = parts[1];
                            } else if (parts.length >= 3) {
                                if (parts[1] === '朋友圈' || parts[1] === 'pyq') {
                                    content = parts[2];
                                } else {
                                    userAvatar = parts[1];
                                    content = parts[2];
                                }
                            }
                        }

                        const moment = {
                            id: 'mom_' + Math.random().toString(36).substr(2, 9),
                            authorId: getContactIdByName(userName),
                            authorName: userName,
                            userAvatar: userAvatar || (state.contacts.find(c => c.name === userName)?.avatar || ''),
                            content: content,
                            time: time,
                            images: [],
                            comments: []
                        };
                        // 解析评论
                        lines.slice(1).forEach(l => {
                            const c = l.match(/^\[评论\|(.*?)\]$/);
                            if (c) {
                                const cParts = c[1].split('|');
                                const commentAuthor = cParts[0];
                                // 过滤掉角色自己评论自己，以及 AI 扮演“我”进行评论的情况
                                const isUser = commentAuthor === state.userName || commentAuthor === state.stUserName || commentAuthor === '我' || commentAuthor === 'user';

                                let commentTime = '';
                                const cLastPart = cParts[cParts.length - 1];
                                if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cLastPart)) {
                                    commentTime = cLastPart;
                                    if (cParts.length === 3) {
                                        // [评论|人名|内容|时间]
                                        if (!isUser) {
                                            moment.comments.push({ authorName: commentAuthor, text: cParts[1], time: commentTime });
                                        }
                                    } else if (cParts.length === 4) {
                                        // [评论|人名|被评论人名|内容|时间]
                                        if (commentAuthor !== cParts[1] && !isUser) {
                                            moment.comments.push({ authorName: commentAuthor, replyToName: cParts[1], text: cParts[2], time: commentTime });
                                        }
                                    }
                                } else {
                                    commentTime = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                                    if (cParts.length === 2) {
                                        // [评论|人名|内容]
                                        if (!isUser) {
                                            moment.comments.push({ authorName: commentAuthor, text: cParts[1], time: commentTime });
                                        }
                                    } else if (cParts.length === 3) {
                                        // [评论|人名|被评论人名|内容]
                                        if (commentAuthor !== cParts[1] && !isUser) {
                                            moment.comments.push({ authorName: commentAuthor, replyToName: cParts[1], text: cParts[2], time: commentTime });
                                        }
                                    }
                                }
                            }
                        });
                        data.moments.push(moment);
                    }
                }
            }
        }

        // 4. 兜底：如果没有任何标签，但包含 [名字|内容|时间] 格式，尝试直接解析
        if (!hasTags) {
            const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
            let hasParsedAny = false;

            if (!data.messages[defaultChatName]) data.messages[defaultChatName] = [];

            let currentMoment = null;

            lines.forEach(line => {
                const isComment = line.startsWith('[评论|');
                if (isComment && currentMoment) {
                    const c = line.match(/^\[评论\|(.*?)\]$/);
                    if (c) {
                        const cParts = c[1].split('|');
                        const commentAuthor = cParts[0];
                        const isUser = commentAuthor === state.userName || commentAuthor === state.stUserName || commentAuthor === '我' || commentAuthor === 'user';

                        let commentTime = '';
                        const cLastPart = cParts[cParts.length - 1];
                        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cLastPart)) {
                            commentTime = cLastPart;
                            if (cParts.length === 3) {
                                if (!isUser) {
                                    currentMoment.comments.push({ authorName: commentAuthor, text: cParts[1], time: commentTime });
                                }
                            } else if (cParts.length === 4) {
                                if (commentAuthor !== cParts[1] && !isUser) {
                                    currentMoment.comments.push({ authorName: commentAuthor, replyToName: cParts[1], text: cParts[2], time: commentTime });
                                }
                            }
                        } else {
                            commentTime = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                            if (cParts.length === 2) {
                                if (!isUser) {
                                    currentMoment.comments.push({ authorName: commentAuthor, text: cParts[1], time: commentTime });
                                }
                            } else if (cParts.length === 3) {
                                if (commentAuthor !== cParts[1] && !isUser) {
                                    currentMoment.comments.push({ authorName: commentAuthor, replyToName: cParts[1], text: cParts[2], time: commentTime });
                                }
                            }
                        }
                    }
                } else if (mode === 'moments' && !isComment) {
                    const m = line.match(/^\[(.*)\]$/);
                    if (m) {
                        const parts = m[1].split('|');
                        if (parts.length >= 2) {
                            let userName = parts[0];
                            let content = '';
                            let time = '';
                            let userAvatar = '';

                            const lastPart = parts[parts.length - 1];
                            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(lastPart)) {
                                time = lastPart;
                                if (parts.length === 3) {
                                    content = parts[1];
                                } else if (parts.length >= 4) {
                                    if (parts[1] === '朋友圈' || parts[1] === 'pyq') {
                                        content = parts[2];
                                    } else {
                                        userAvatar = parts[1];
                                        content = parts[2];
                                    }
                                }
                            } else {
                                time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                                if (parts.length === 2) {
                                    content = parts[1];
                                } else if (parts.length >= 3) {
                                    if (parts[1] === '朋友圈' || parts[1] === 'pyq') {
                                        content = parts[2];
                                    } else {
                                        userAvatar = parts[1];
                                        content = parts[2];
                                    }
                                }
                            }

                            currentMoment = {
                                id: 'mom_' + Math.random().toString(36).substr(2, 9),
                                authorId: getContactIdByName(userName),
                                authorName: userName,
                                userAvatar: userAvatar || (state.contacts.find(c => c.name === userName)?.avatar || ''),
                                content: content,
                                time: time,
                                images: [],
                                comments: []
                            };
                            data.moments.push(currentMoment);
                            hasParsedAny = true;
                        } else {
                            currentMoment = null;
                            // Fallback to message parsing
                            const msgData = parseMessageLine(line);
                            if (msgData) {
                                hasParsedAny = true;
                                data.messages[defaultChatName].push({
                                    id: 'msg_' + Math.random().toString(36).substr(2, 9),
                                    ...msgData
                                });
                            }
                            const quoteData = parseQuoteLine(line);
                            if (quoteData) {
                                hasParsedAny = true;
                                data.messages[defaultChatName].push({
                                    id: 'msg_' + Math.random().toString(36).substr(2, 9),
                                    ...quoteData
                                });
                            }
                        }
                    } else {
                        currentMoment = null;
                        // Fallback to message parsing
                        const msgData = parseMessageLine(line);
                        if (msgData) {
                            hasParsedAny = true;
                            data.messages[defaultChatName].push({
                                id: 'msg_' + Math.random().toString(36).substr(2, 9),
                                ...msgData
                            });
                        }
                        const quoteData = parseQuoteLine(line);
                        if (quoteData) {
                            hasParsedAny = true;
                            data.messages[defaultChatName].push({
                                id: 'msg_' + Math.random().toString(36).substr(2, 9),
                                ...quoteData
                            });
                        }
                    }
                } else {
                    currentMoment = null;
                    const msgData = parseMessageLine(line);
                    if (msgData) {
                        hasParsedAny = true;
                        data.messages[defaultChatName].push({
                            id: 'msg_' + Math.random().toString(36).substr(2, 9),
                            ...msgData
                        });
                    }

                    const quoteData = parseQuoteLine(line);
                    if (quoteData) {
                        hasParsedAny = true;
                        data.messages[defaultChatName].push({
                            id: 'msg_' + Math.random().toString(36).substr(2, 9),
                            ...quoteData
                        });
                    }
                }
            });

            // Re-process comments to ensure they have IDs
            if (data.moments) {
                data.moments.forEach(m => {
                    if (m.comments) {
                        m.comments.forEach(c => {
                            if (!c.id) c.id = 'c' + Date.now() + Math.random().toString(36).substr(2, 5);
                            if (!c.authorId) c.authorId = 'ai';
                        });
                    }
                });
            }

            if (!hasParsedAny) {
                delete data.messages[defaultChatName];
            }
        }

        return data;
    }

    function loadFromSillyTavern() {
        const st = getSTInterface();
        const msgId = st.getCurrentMessageId();
        if (msgId === null) return;

        // 初始化会话开始时的消息ID，用于区分历史记录
        if (state.sessionStartMsgId === null) {
            state.sessionStartMsgId = msgId;
        }

        // 尝试从 localStorage 读取最新状态
        let localDataObj = null;
        try {
            const localData = localStorage.getItem(getStorageKey());
            if (localData) {
                localDataObj = JSON.parse(localData);
            }
        } catch (e) { console.error("读取本地备份JSON失败", e); }

        // 尝试从当前层往回找最多 30 层，寻找最近的手机数据
        let combinedMessages = {};
        let combinedMoments = [];
        let settings = null;
        let userAccounts = null;

        let foundShouji = false;
        let latestRawAIMessage = null;

        // 第一遍扫描：确定用户在酒馆里的真实名字，确保身份识别严谨
        for (let i = 0; i <= 50; i++) {
            const targetId = msgId - i;
            if (targetId < 0) break;
            const chat = st.getChatMessages(targetId)[0];
            if (chat && chat.is_user && chat.name && chat.name !== '我' && chat.name !== 'user' && chat.name !== 'me') {
                state.stUserName = chat.name;
                break;
            }
        }

        // 如果本地有数据，优先使用本地的设置和账号信息
        if (localDataObj) {
            settings = localDataObj.settings;
            userAccounts = localDataObj.userAccounts;
            state.activeAccountId = localDataObj.activeAccountId;
            state.stickers = localDataObj.stickers || state.stickers;
            state.presets = localDataObj.presets || [];
        }

        for (let i = 0; i <= 30; i++) {
            const targetId = msgId - i;
            if (targetId < 0) break;

            const chat = st.getChatMessages(targetId)[0];
            if (!chat || !chat.message) continue;

            // 1. 检查是否有 <shouji> 标签
            let shoujiContent = null;
            const jsonMatch = chat.message.match(/<shouji>([\s\S]*?)<\/shouji>/);
            if (jsonMatch && jsonMatch[1]) {
                shoujiContent = jsonMatch[1];
            } else if (chat.message.includes('<shouji>')) {
                shoujiContent = chat.message.split('<shouji>')[1];
            }

            if (shoujiContent !== null) {
                foundShouji = true;

                // 判断当前扫描的层是否属于“历史记录”（即在本次打开手机之前的层）
                const isHistoryTurn = targetId < state.sessionStartMsgId;

                // 尝试提取隐藏的 JSON 备份 (兼容老数据)
                const backupMatch = shoujiContent.match(/<!-- SILLYPHONE_DATA_START\n([\s\S]*?)\nSILLYPHONE_DATA_END -->/);
                let data = null;

                if (backupMatch) {
                    try {
                        data = JSON.parse(backupMatch[1]);
                    } catch (e) { console.error("解析备份JSON失败", e); }
                } else if (!localDataObj) {
                    // 兼容旧版本：整个内容都是 JSON
                    try {
                        data = JSON.parse(shoujiContent);
                    } catch (e) { }
                }

                if (data) {
                    // 只有在没有找到更新的设置时才应用设置
                    if (!settings) {
                        settings = data.settings;
                        userAccounts = data.userAccounts;
                        state.activeAccountId = data.activeAccountId;
                        state.stickers = data.stickers || state.stickers;
                    }

                    // 标记加载的消息为历史记录
                    if (data.userAccounts) {
                        data.userAccounts.forEach(acc => {
                            if (acc.messages) {
                                for (const cid in acc.messages) {
                                    if (Array.isArray(acc.messages[cid])) {
                                        acc.messages[cid].forEach(m => m.isHistory = isHistoryTurn);
                                    }
                                }
                            }
                        });
                    }

                    // 如果是旧版本，里面可能包含 messages 和 moments
                    const active = data.userAccounts?.find(a => a.id === data.activeAccountId);
                    if (active && active.messages) {
                        for (const cid in active.messages) {
                            if (!combinedMessages[cid]) {
                                combinedMessages[cid] = active.messages[cid].map(m => ({ ...m, isHistory: isHistoryTurn }));
                            } else {
                                const existingSignatures = new Set(combinedMessages[cid].map(m => `${m.senderName || m.sender || m.senderId}|${m.type}|${m.content || m.text || m.duration || ''}`));
                                const historyToAdd = active.messages[cid].filter(m => {
                                    const sig = `${m.senderName || m.sender || m.senderId}|${m.type}|${m.content || m.text || m.duration || ''}`;
                                    if (existingSignatures.has(sig)) return false;
                                    existingSignatures.add(sig);
                                    return true;
                                }).map(m => ({ ...m, isHistory: isHistoryTurn }));
                                combinedMessages[cid] = [...historyToAdd, ...combinedMessages[cid]];
                            }
                        }
                    }
                    if (active && active.moments) {
                        if (combinedMoments.length === 0) combinedMoments = active.moments;
                    }
                }

                // 无论有没有 JSON 备份，都尝试解析文本格式的消息和朋友圈
                const textData = parseAuthorFormat(shoujiContent);

                // 辅助函数：通过名字查找联系人ID
                const getContactIdByName = (name) => {
                    if (userAccounts) {
                        const activeAcc = userAccounts.find(a => a.id === state.activeAccountId);
                        if (activeAcc && activeAcc.contacts) {
                            const contact = activeAcc.contacts.find(c => c.name === name);
                            if (contact) return contact.id;
                        }
                    }
                    if (state.contacts) {
                        const contact = state.contacts.find(c => c.name === name);
                        if (contact) return contact.id;
                    }
                    return name; // 找不到则返回原名
                };

                for (const cid in textData.messages) {
                    let effectiveCid = cid;
                    let realCid = getContactIdByName(effectiveCid);

                    // 如果 cid 是用户自己，说明 AI 搞反了视角（比如生成了【和林钰如的聊天】）
                    if (effectiveCid === state.userName || effectiveCid === '我' || effectiveCid === 'user' || effectiveCid === 'me' || effectiveCid === state.wechatId || (state.stUserName && effectiveCid === state.stUserName)) {
                        // 寻找不是用户的发送者
                        const aiMsg = textData.messages[cid].find(m => {
                            const s = m.sender;
                            return s && s !== '我' && s !== state.userName && s !== 'user' && s !== 'me' && s !== '系统消息' && s !== state.wechatId && (!state.stUserName || s !== state.stUserName);
                        });
                        if (aiMsg && aiMsg.sender) {
                            effectiveCid = aiMsg.sender;
                            realCid = getContactIdByName(effectiveCid);
                        } else if (state.currentChat) {
                            effectiveCid = state.currentChat.name;
                            realCid = state.currentChat.id;
                        }
                    }

                    // 判断是否是群聊
                    const isGroup = effectiveCid.includes('群聊') || textData.messages[cid].some(m => m.sender && m.sender !== effectiveCid && m.sender !== '我' && m.sender !== '我方消息' && m.sender !== '系统消息' && m.sender !== state.userName && m.sender !== state.wechatId);

                    const formattedMsgs = textData.messages[cid].map(m => {
                        let senderName = m.sender || effectiveCid;
                        // 严谨逻辑：仅匹配当前昵称、微信号、酒馆用户名或系统默认标识
                        const isUser = senderName === state.userName ||
                            senderName === '我' ||
                            senderName === 'user' ||
                            senderName === 'me' ||
                            senderName === state.wechatId ||
                            (state.stUserName && senderName === state.stUserName);

                        if (isUser) {
                            senderName = state.userName; // 统一使用当前用户名
                        } else if (!isGroup) {
                            // 私聊强制使用对方的名字，防止 AI 幻觉使用其他名字
                            senderName = effectiveCid; // effectiveCid 就是私聊对象的原名
                        }

                        return {
                            id: m.id || 'msg_' + Math.random().toString(36).substr(2, 9),
                            type: isUser ? 'user' : 'ai',
                            senderId: isUser ? 'user' : (getContactIdByName(senderName) || senderName),
                            senderName: senderName,
                            originalSender: m.sender,
                            avatar: m.avatar || '',
                            time: m.time,
                            text: m.content || m.text,
                            originalText: m.content || m.text,
                            msgType: m.type === 'image' ? 'photo' : (m.type === 'redpacket' ? 'red-packet' : m.type),
                            url: m.type === 'sticker' ? m.content : m.url,
                            description: m.type === 'image' ? m.content : undefined,
                            duration: m.duration,
                            amount: m.amount,
                            remark: m.remark,
                            status: m.status,
                            count: m.type === 'redpacket' ? (m.count || 1) : undefined,
                            grabRecords: m.type === 'redpacket' ? (m.grabRecords || []) : undefined,
                            remainingAmount: m.type === 'redpacket' ? (m.remainingAmount || 0) : undefined,
                            remainingCount: m.type === 'redpacket' ? (m.remainingCount || 0) : undefined,
                            quote: m.quote,
                            isHistory: isHistoryTurn,
                            sourceMsgId: targetId,
                            isRecalled: m.type === 'recall'
                        };
                    });

                    if (!combinedMessages[realCid]) {
                        combinedMessages[realCid] = formattedMsgs;
                    } else {
                        const getNormalizedType = (m) => {
                            let t = m.msgType || m.type;
                            if (t === 'ai' || t === 'user') return 'text';
                            if (t === 'image') return 'photo';
                            if (t === 'redpacket') return 'red-packet';
                            return t;
                        };
                        const existingSignatures = new Set(combinedMessages[realCid].map(m => `${m.senderName || m.sender || m.senderId}|${getNormalizedType(m)}|${m.content || m.text || m.duration || ''}`));
                        const historyToAdd = formattedMsgs.filter(m => {
                            const sig = `${m.senderName || m.sender || m.senderId}|${getNormalizedType(m)}|${m.content || m.text || m.duration || ''}`;
                            if (existingSignatures.has(sig)) return false;
                            existingSignatures.add(sig);
                            return true;
                        });
                        combinedMessages[realCid] = [...historyToAdd, ...combinedMessages[realCid]];
                    }

                    // 自动从解析的文本数据中恢复联系人和群组（如果本地没有）
                    if (isGroup) {
                        if (!state.groups.find(g => g.name === cid || g.id === realCid)) {
                            state.groups.push({
                                id: realCid,
                                name: cid,
                                avatar: 'https://files.catbox.moe/blaehb.jpg',
                                members: []
                            });
                        }
                    } else {
                        if (!state.contacts.find(c => c.name === cid || c.id === realCid)) {
                            state.contacts.push({
                                id: realCid,
                                characterId: realCid,
                                name: cid,
                                avatar: 'https://files.catbox.moe/blaehb.jpg',
                                status: 'added',
                                type: 'main',
                                time: '',
                                lastMsg: ''
                            });
                        }
                    }
                }
                if (combinedMoments.length === 0 && textData.moments.length > 0) {
                    combinedMoments = textData.moments;
                }
            } else if (!foundShouji && !chat.is_user) {
                // 如果还没找到 <shouji>，且这是一条 AI 消息，说明这是 AI 新生成的回复！
                latestRawAIMessage = chat;
            }
        }

        if (userAccounts || Object.keys(combinedMessages).length > 0) {
            // 1. 先处理账号和设置，确立身份
            if (userAccounts) {
                userAccounts.forEach(acc => {
                    const existingAcc = state.userAccounts.find(a => a.id === acc.id);
                    if (existingAcc) {
                        if (acc.contacts) {
                            acc.contacts.forEach(c => {
                                if (!existingAcc.contacts.find(ec => ec.id === c.id)) {
                                    existingAcc.contacts.push(c);
                                }
                            });
                        }
                        if (acc.groups) {
                            acc.groups.forEach(g => {
                                if (!existingAcc.groups.find(eg => eg.id === g.id)) {
                                    existingAcc.groups.push(g);
                                }
                            });
                        }
                        // 只有在当前名字是默认的“我”时，才从备份中恢复名字和头像，防止覆盖用户最新修改的设置
                        if (existingAcc.name === '我' || existingAcc.name === 'user') {
                            existingAcc.name = acc.name;
                            existingAcc.avatar = acc.avatar;
                            existingAcc.wechatId = acc.wechatId;
                            if (acc.momentsBg) existingAcc.momentsBg = acc.momentsBg;
                        }
                    } else {
                        state.userAccounts.push(acc);
                    }
                });
            }
            if (settings) {
                state.settings = { ...state.settings, ...settings };
            }

            const active = state.userAccounts.find(a => a.id === state.activeAccountId) || state.userAccounts[0];
            if (active) {
                state.activeAccountId = active.id;
                // 如果当前名字是默认的“我”或者“user”，且我们找到了酒馆里的真实名字，则自动同步
                if ((active.name === '我' || active.name === 'user') && state.stUserName) {
                    active.name = state.stUserName;
                }
                state.userName = active.name;
                state.userAvatar = active.avatar;
                state.wechatId = active.wechatId;

                // 继承合并后的联系人和群组
                state.contacts = active.contacts || [];
                state.groups = active.groups || [];
            }

            // 2. 身份确立后，再重新解析一次文本消息（如果刚才解析失败了）
            // 这里的逻辑是：如果刚才解析时 state.userName 还是旧的，
            // 那么在身份更新后，我们需要确保 combinedMessages 里的 isUser 判定是准确的。
            // 实际上，更稳妥的做法是在解析循环前就完成身份确立。
            // 我们已经在循环前通过 localStorage 尝试确立了，但 JSON 备份里的可能更新。

            // 重新扫描一遍 combinedMessages 纠正 type
            for (const cid in combinedMessages) {
                combinedMessages[cid].forEach(m => {
                    const senderName = m.originalSender || m.senderName;
                    const isUser = senderName === state.userName ||
                        senderName === '我' ||
                        senderName === 'user' ||
                        senderName === 'me' ||
                        senderName === state.wechatId ||
                        (state.stUserName && senderName === state.stUserName);

                    if (isUser) {
                        m.type = 'user';
                        m.senderId = 'user';
                        m.senderName = state.userName;
                    }
                });
            }

            // loadFromSillyTavern 只负责数据恢复，不往打字队列添加新消息。
            // 打字队列仅由 processAIReply 在收到真正的新 AI 回复时填充。
            // 如果当前有正在处理的打字队列，保留它们的 pending 状态。
            if (state.typingQueue && state.typingQueue.length > 0) {
                const pendingIds = new Set(state.typingQueue.map(q => q.id));
                for (const cid in combinedMessages) {
                    combinedMessages[cid].forEach(m => {
                        if (pendingIds.has(m.id)) {
                            m.isTypingPending = true;
                            const qIdx = state.typingQueue.findIndex(q => q.id === m.id);
                            if (qIdx !== -1) state.typingQueue[qIdx] = m;
                        }
                    });
                }
            }

            state.messages = combinedMessages;
            state.moments = combinedMoments;

            // 处理 raw AI message
            if (latestRawAIMessage && state.currentChat) {
                const chatId = state.currentChat.id;
                if (!state.messages[chatId]) state.messages[chatId] = [];

                let reply = latestRawAIMessage.message.trim();
                let aiSenderId = state.currentChat.id;

                if (state.currentChat.isGroup && latestRawAIMessage.name) {
                    const member = state.currentChat.members.find(m => m.name === latestRawAIMessage.name);
                    if (member) {
                        aiSenderId = member.id;
                    } else {
                        aiSenderId = state.currentChat.members[0]?.id || state.currentChat.id;
                    }
                }

                const msgLines = reply.split('\n');
                let textBuffer = [];

                const flushTextBuffer = () => {
                    if (textBuffer.length > 0) {
                        let text = textBuffer.join('\n').trim();
                        if (text) {
                            // 解析隐藏指令
                            const transferMatch = text.match(/\[TRANSFER:([\d.]+)\]/);
                            const redPacketMatch = text.match(/\[REDPACKET:([\d.]+)\]/);
                            const acceptMatch = text.match(/\[ACCEPT_TRANSFER\]/);
                            const returnMatch = text.match(/\[RETURN_TRANSFER\]/);
                            const leaveMatch = text.match(/\[ACTION:LEAVE\]/);

                            text = text.replace(/\[TRANSFER:[\d.]+\]/g, '')
                                .replace(/\[REDPACKET:[\d.]+\]/g, '')
                                .replace(/\[ACCEPT_TRANSFER\]/g, '')
                                .replace(/\[RETURN_TRANSFER\]/g, '')
                                .replace(/\[ACTION:LEAVE\]/g, '')
                                .trim();

                            if (text) {
                                const newMsg = {
                                    id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                                    type: 'ai',
                                    senderId: aiSenderId,
                                    time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                                    text: text,
                                    isTypingPending: true
                                };
                                state.messages[chatId].push(newMsg);
                                if (!state.typingQueue) state.typingQueue = [];
                                state.typingQueue.push(newMsg);
                            }

                            // 执行隐藏指令对应的动作
                            if (transferMatch) {
                                state.messages[chatId].push({
                                    id: 'msg_' + Date.now() + '_money',
                                    type: 'ai',
                                    senderId: aiSenderId,
                                    time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                                    msgType: 'transfer',
                                    amount: transferMatch[1],
                                    remark: '转账给你',
                                    status: 'unreceived'
                                });
                            }

                            if (redPacketMatch) {
                                state.messages[chatId].push({
                                    id: 'msg_' + Date.now() + '_money',
                                    type: 'ai',
                                    senderId: aiSenderId,
                                    time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                                    msgType: 'red-packet',
                                    amount: redPacketMatch[1],
                                    count: state.currentChat.isGroup ? Math.floor(Math.random() * 3) + 3 : 1,
                                    remark: '恭喜发财，大吉大利',
                                    status: 'unreceived',
                                    grabbedBy: []
                                });
                            }

                            if (acceptMatch) {
                                const unreceivedMsg = [...state.messages[chatId]].reverse().find(m => m.type === 'user' && (m.msgType === 'transfer' || m.msgType === 'red-packet') && m.status === 'unreceived');
                                if (unreceivedMsg) {
                                    if (unreceivedMsg.msgType === 'transfer') {
                                        unreceivedMsg.status = 'received';
                                        state.messages[chatId].push({
                                            id: 'msg_' + Date.now(),
                                            type: 'system',
                                            text: `对方已收款`,
                                            time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
                                        });
                                    } else {
                                        const targetId = unreceivedMsg.targetId || aiSenderId;
                                        grabRedPacket(unreceivedMsg, chatId, targetId);
                                    }
                                }
                            }

                            if (returnMatch) {
                                const unreceivedMsg = [...state.messages[chatId]].reverse().find(m => m.type === 'user' && (m.msgType === 'transfer' || m.msgType === 'red-packet') && m.status === 'unreceived');
                                if (unreceivedMsg) {
                                    unreceivedMsg.status = 'returned';
                                    state.messages[chatId].push({
                                        id: 'msg_' + Date.now(),
                                        type: 'system',
                                        text: `对方已退还`,
                                        time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
                                    });
                                }
                            }

                            if (leaveMatch && state.currentChat.isGroup) {
                                handleAILeaveAction(chatId, aiSenderId);
                            }
                        }
                        textBuffer = [];
                    }
                };

                msgLines.forEach(line => {
                    const partsMatch = line.match(/^\[(.*?)\]$/);
                    if (partsMatch && !line.startsWith('[TRANSFER:') && !line.startsWith('[REDPACKET:') && !line.startsWith('[ACCEPT_TRANSFER]') && !line.startsWith('[RETURN_TRANSFER]') && !line.startsWith('[ACTION:LEAVE]')) {
                        const parts = partsMatch[1].split('|');
                        if (parts.length >= 2) {
                            flushTextBuffer();
                            let formattedSenderId = state.currentChat.id;
                            let senderName = parts[0];
                            if (state.currentChat.isGroup) {
                                const member = state.currentChat.members.find(member => member.name === senderName);
                                if (member) {
                                    formattedSenderId = member.id;
                                } else {
                                    formattedSenderId = state.currentChat.members[0]?.id || state.currentChat.id;
                                }
                            }

                            // 严谨逻辑：仅匹配当前昵称、微信号、酒馆用户名或系统默认标识
                            const isUser = senderName === state.userName ||
                                senderName === '我' ||
                                senderName === 'user' ||
                                senderName === 'me' ||
                                senderName === state.wechatId ||
                                (state.stUserName && senderName === state.stUserName);

                            const lastPart = parts[parts.length - 1];
                            let timeStr;
                            let dataParts;
                            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(lastPart)) {
                                timeStr = lastPart;
                                dataParts = parts.slice(1, -1);
                            } else {
                                timeStr = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                                dataParts = parts.slice(1);
                            }

                            const msg = {
                                id: 'msg_' + Math.random().toString(36).substr(2, 9),
                                senderId: isUser ? 'user' : formattedSenderId,
                                senderName: isUser ? state.userName : senderName,
                                time: timeStr,
                                type: isUser ? 'user' : 'ai'
                            };

                            let typeStr = 'text';
                            let contentStr = '';
                            let durationStr = '';

                            if (dataParts.length === 1) {
                                contentStr = dataParts[0];
                            } else if (dataParts.length === 2) {
                                typeStr = dataParts[0];
                                contentStr = dataParts[1];
                            } else if (dataParts.length >= 3) {
                                typeStr = dataParts[0];
                                contentStr = dataParts[1];
                                durationStr = dataParts[2];
                            }

                            if (typeStr === '图片') {
                                msg.msgType = 'photo';
                                msg.url = contentStr;
                            } else if (typeStr === '表情包') {
                                msg.msgType = 'sticker';
                                msg.url = contentStr;
                            } else if (typeStr === '语音消息' || typeStr === '语音') {
                                msg.msgType = 'voice';
                                msg.duration = parseInt(contentStr) || 0;
                            } else if (typeStr.includes('转账') || typeStr.includes('收账') || contentStr.includes('转账') || contentStr.includes('收账')) {
                                msg.msgType = 'transfer';
                                msg.text = typeStr === 'text' ? contentStr : typeStr;
                                const amountMatch = (typeStr + ' ' + contentStr).match(/[\d.]+/);
                                msg.amount = amountMatch ? parseFloat(amountMatch[0]).toFixed(2) : "0.00";

                                // Check if contentStr is a time string like "23:44"
                                const isTimeStr = /^\d{1,2}:\d{2}$/.test(contentStr);
                                msg.remark = typeStr === 'text' ? '转账给你' : (isTimeStr ? '转账给你' : (contentStr || '转账给你'));

                                const fullText = typeStr + ' ' + contentStr;
                                if (fullText.includes('退回')) {
                                    msg.status = 'returned';
                                } else if (fullText.includes('收账')) {
                                    msg.status = 'received';
                                } else {
                                    msg.status = 'unreceived';
                                }
                            } else if (typeStr.includes('红包') || contentStr.includes('红包')) {
                                msg.msgType = 'red-packet';
                                msg.text = typeStr === 'text' ? contentStr : typeStr;
                                const amountMatch = (typeStr + ' ' + contentStr).match(/[\d.]+/);
                                msg.amount = amountMatch ? parseFloat(amountMatch[0]).toFixed(2) : "0.00";

                                const isTimeStr = /^\d{1,2}:\d{2}$/.test(contentStr);
                                msg.remark = typeStr === 'text' ? '恭喜发财，大吉大利' : (isTimeStr ? '恭喜发财，大吉大利' : (contentStr || '恭喜发财，大吉大利'));

                                msg.count = 1;
                                msg.grabRecords = [];
                                msg.remainingAmount = 0;
                                msg.remainingCount = 0;
                                const fullText = typeStr + ' ' + contentStr;
                                if (fullText.includes('退回')) {
                                    msg.status = 'returned';
                                } else if (fullText.includes('领') || fullText.includes('收')) {
                                    msg.status = 'received';
                                } else {
                                    msg.status = 'unreceived';
                                }
                            } else if (typeStr === '语音通话') {
                                msg.msgType = 'call';
                                msg.text = contentStr;
                            } else if (typeStr === '语音通话已挂断') {
                                msg.msgType = 'call-end';
                                msg.duration = durationStr || contentStr;
                            } else if (typeStr === '撤回消息') {
                                msg.msgType = 'recall';
                                msg.text = contentStr;
                            } else {
                                msg.text = contentStr;
                            }

                            if (msg.type !== 'user') {
                                msg.isTypingPending = true;
                                if (!state.typingQueue) state.typingQueue = [];
                                state.typingQueue.push(msg);
                            }
                            state.messages[chatId].push(msg);
                        } else {
                            textBuffer.push(line);
                        }
                    } else {
                        textBuffer.push(line);
                    }
                });

                flushTextBuffer();

                saveMessagesToLocalStorage();
                deferredSync();
            }

            applySettings();
            renderChatList();
            renderContactsList();
            renderMomentsList();

            if (typeof window.processTypingQueue === 'function') {
                window.processTypingQueue();
            }

            console.log(`[SillyPhone] 数据恢复成功，已合并跨层历史记录`);
        }
        // 标记数据已加载完毕，允许后续同步操作
        state._dataLoaded = true;
        console.log('[SillyPhone] 数据加载完成，同步保护已解除');
    }

    function applySettings() {
        const s = state.settings;
        if (s.globalBg) screen.style.backgroundImage = `url(${s.globalBg})`;
        document.getElementById('chat-bg-layer').style.backgroundImage = s.chatBg ? `url(${s.chatBg})` : '';

        const activeAccount = state.userAccounts.find(acc => acc.id === state.activeAccountId) || state.userAccounts[0];
        document.getElementById('moments-user-bg').src = s.momentsBg || activeAccount.momentsBg || 'https://files.catbox.moe/smqrt7.jpg';

        screen.style.setProperty('--blur-intensity', `${s.blur}px`);
        screen.style.setProperty('--bubble-blur', `${s.bubbleBlur}px`);
        screen.style.setProperty('--nav-blur', `${s.navBlur}px`);
        screen.style.setProperty('--glass-opacity', s.glassOpacity / 100);

        // 更新设置页 UI
        globalBgInput.value = s.globalBg || '';
        chatBgInput.value = s.chatBg || '';
        momentsBgInput.value = s.momentsBg || activeAccount.momentsBg || '';
        blurIntensityInput.value = s.blur;
        blurValueDisplay.textContent = s.blur;
        bubbleBlurIntensityInput.value = s.bubbleBlur;
        bubbleBlurValueDisplay.textContent = s.bubbleBlur;
        navBlurIntensityInput.value = s.navBlur;
        navBlurValueDisplay.textContent = s.navBlur;
        glassOpacityIntensityInput.value = s.glassOpacity;
        glassOpacityValueDisplay.textContent = s.glassOpacity / 100;
        if (pureModeToggle) pureModeToggle.checked = !!s.pureMode;


        // 更新设置页 UI

        // 更新朋友圈头部显示
        const momentsUserName = document.getElementById('moments-user-name');
        const momentsUserAvatar = document.getElementById('moments-user-avatar');

        if (momentsUserName) momentsUserName.textContent = state.userName;
        if (momentsUserAvatar) momentsUserAvatar.src = state.userAvatar;

        renderPresetList();

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // 防抖同步
    let syncTimer = null;
    function deferredSync(delay = 500) {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(syncToSillyTavern, delay);
    }

    // 获取头像 HTML (支持微信风格群头像)
    function getAvatarHtml(chat, size = 41) {
        if (!chat) return '';

        const isGroup = chat.isGroup;
        const avatar = chat.avatar;
        const isDefaultGroupAvatar = avatar === 'https://files.catbox.moe/blaehb.jpg';

        // 如果不是群聊，或者群聊有自定义头像，直接返回 img
        if (!isGroup || (!isDefaultGroupAvatar && avatar)) {
            const src = avatar || 'https://files.catbox.moe/blaehb.jpg';
            return `<img src="${src}" referrerpolicy="no-referrer" class="avatar" style="width: ${size}px; height: ${size}px; border-radius: 8px; object-fit: cover;">`;
        }

        // 微信风格群头像 (最多 9 个成员)
        const members = chat.members || [];
        const displayMembers = members.slice(0, 9);
        const count = displayMembers.length;

        if (count === 0) {
            return `<img src="${avatar}" referrerpolicy="no-referrer" class="avatar" style="width: ${size}px; height: ${size}px; border-radius: 8px; object-fit: cover;">`;
        }

        // 根据成员数量决定布局
        let gridCols = 2;
        if (count > 4) gridCols = 3;

        const gap = 1;
        const padding = 1;

        let html = `<div class="group-avatar-composite" style="width: ${size}px; height: ${size}px; background: #e0e0e0; border-radius: 8px; display: grid; grid-template-columns: repeat(${gridCols}, 1fr); gap: ${gap}px; padding: ${padding}px; box-sizing: border-box; align-content: center; justify-items: center; overflow: hidden;">`;

        displayMembers.forEach(m => {
            html += `<img src="${m.avatar}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; border-radius: 1px;">`;
        });

        html += `</div>`;
        return html;
    }

    let addFriendMode = 'direct'; // 默认直接添加模式
    let pendingApproval = null; // 存储待通过的申请

    const pages = document.querySelectorAll('.page');
    const navItems = document.querySelectorAll('.nav-item');
    const chatList = document.getElementById('chat-list');
    const messagesContainer = document.getElementById('messages');
    const island = document.getElementById('dynamic-island');
    const islandText = document.getElementById('island-text');
    let aiResponseTimer = null;
    let lastAIRequest = null;
    let isAIRequestPending = false; // AI 请求挂起状态
    const msgInput = document.getElementById('msg-input');
    const screen = document.querySelector('.screen');

    // Panels
    const toggleFunctionsBtn = document.getElementById('toggle-functions');
    const toggleVoiceBtn = document.getElementById('toggle-voice');
    const chatPanels = document.querySelectorAll('.chat-panel');
    const closePanelBtns = document.querySelectorAll('.close-panel');

    const panelFunctions = document.getElementById('panel-functions');
    const panelPhoto = document.getElementById('panel-photo');
    const panelSticker = document.getElementById('panel-sticker');
    const panelVoice = document.getElementById('panel-voice');
    const panelTransfer = document.getElementById('panel-transfer');
    const realPhotoInput = document.getElementById('real-photo-input');

    const photoDescInput = document.getElementById('photo-desc-input');
    const sendPhotoBtn = document.getElementById('send-photo-btn');
    const voiceTextInput = document.getElementById('voice-text-input');
    const sendVoiceBtn = document.getElementById('send-voice-btn');
    const transferAmountInput = document.getElementById('transfer-amount-input');
    const transferRemarkInput = document.getElementById('transfer-remark-input');
    const sendTransferBtn = document.getElementById('send-transfer-btn');

    const transferPanelTitle = document.getElementById('transfer-panel-title');
    const btnTransferLabel = document.getElementById('btn-transfer-label');
    const stickerTabs = document.getElementById('sticker-tabs');
    const stickerGrid = document.getElementById('sticker-grid');

    // 背景设置相关
    const globalBgInput = document.getElementById('global-bg-url');
    const chatBgInput = document.getElementById('chat-bg-url');
    const blurIntensityInput = document.getElementById('blur-intensity');
    const blurValueDisplay = document.getElementById('blur-value');
    const bubbleBlurIntensityInput = document.getElementById('bubble-blur-intensity');
    const bubbleBlurValueDisplay = document.getElementById('bubble-blur-value');
    const navBlurIntensityInput = document.getElementById('nav-blur-intensity');
    const navBlurValueDisplay = document.getElementById('nav-blur-value');
    const glassOpacityIntensityInput = document.getElementById('glass-opacity-intensity');
    const glassOpacityValueDisplay = document.getElementById('glass-opacity-value');

    const settingsUserNameInput = document.getElementById('settings-user-name');
    const settingsWechatIdInput = document.getElementById('settings-wechat-id');
    const settingsUserAvatarImg = document.getElementById('settings-user-avatar');
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    const switchAccountBtn = document.getElementById('switch-account-btn');
    const momentsBgInput = document.getElementById('moments-bg-url');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const toastContainer = document.getElementById('toast-container');

    // Vision API 设置
    const visionProviderSelect = document.getElementById('vision-provider');
    const visionKeyInput = document.getElementById('vision-key');
    const visionModelInput = document.getElementById('vision-model');
    const visionEndpointInput = document.getElementById('vision-endpoint');
    const fetchVisionModelsBtn = document.getElementById('fetch-vision-models-btn');

    // 照片面板增强
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const photoPreviewImg = document.getElementById('photo-preview-img');
    const removePhotoPreviewBtn = document.getElementById('remove-photo-preview');

    const redPacketTargetContainer = document.getElementById('red-packet-target-container');
    const redPacketTargetSelect = document.getElementById('red-packet-target-select');
    const redPacketCountContainer = document.getElementById('red-packet-count-container');
    const redPacketCountInput = document.getElementById('red-packet-count-input');

    // 绑定选图按钮点击
    const selectPhotoBtn = document.getElementById('select-photo-btn');
    if (selectPhotoBtn && realPhotoInput) {
        selectPhotoBtn.onclick = () => {
            realPhotoInput.click();
        };
    }

    // 预设相关
    const addPresetBtn = document.getElementById('add-preset-btn');
    const importPresetBtn = document.getElementById('import-preset-btn');
    const exportPresetBtn = document.getElementById('export-preset-btn');
    const importPresetInput = document.getElementById('import-preset-input');
    const presetList = document.getElementById('preset-list');
    const presetEditModal = document.getElementById('preset-edit-modal');
    const presetModalTitle = document.getElementById('preset-modal-title');
    const closePresetModalBtn = document.getElementById('close-preset-modal');
    const presetNameInput = document.getElementById('preset-name-input');
    const presetContentInput = document.getElementById('preset-content-input');
    const cancelPresetBtn = document.getElementById('cancel-preset-btn');
    const savePresetBtn = document.getElementById('save-preset-btn');
    let currentEditingPresetId = null;

    function showActionSheet(options) {
        const modal = document.getElementById('action-sheet-modal');
        const content = document.getElementById('action-sheet-content');
        content.innerHTML = '';

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'action-item';
            if (opt.type === 'danger') item.classList.add('danger');
            if (opt.disabled) item.classList.add('disabled');
            if (opt.isSeparator) {
                item.style.height = '1px';
                item.style.padding = '0';
                item.style.background = 'rgba(255,255,255,0.1)';
                item.style.margin = '8px 0';
                item.style.pointerEvents = 'none';
                content.appendChild(item);
                return;
            }
            item.innerHTML = opt.icon ? `<i data-lucide="${opt.icon}" size="18" style="margin-right: 10px; vertical-align: middle; opacity: 0.8;"></i><span>${opt.text}</span>` : opt.text;
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'center';

            item.onclick = () => {
                if (opt.disabled) return;
                modal.style.display = 'none';
                if (opt.onClick) opt.onClick();
            };
            content.appendChild(item);
        });

        const cancelBtn = document.createElement('div');
        cancelBtn.className = 'action-item cancel';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = () => modal.style.display = 'none';
        content.appendChild(cancelBtn);

        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function switchAccount() {
        const options = [];

        // 1. 当前账号 (只显示，不可点击)
        const currentAcc = state.userAccounts.find(acc => acc.id === state.activeAccountId);
        if (currentAcc) {
            options.push({
                text: `当前账号：${currentAcc.name}`,
                icon: 'user-check',
                disabled: true
            });
        }

        // 2. 其他可切换账号
        const otherAccounts = state.userAccounts.filter(acc => acc.id !== state.activeAccountId);
        otherAccounts.forEach(acc => {
            options.push({
                text: `切换至：${acc.name}`,
                icon: 'users',
                onClick: () => performAccountSwitch(acc.id)
            });
        });

        // 3. 分隔线
        options.push({ isSeparator: true });

        // 4. 管理操作
        options.push({
            text: '+ 新建小号',
            icon: 'user-plus',
            onClick: () => {
                showCustomPrompt('新建小号', '输入小号昵称', (name) => {
                    if (!name) return;
                    const newId = 'user_sub_' + Date.now();
                    const newAccount = {
                        id: newId,
                        name: name,
                        avatar: 'https://files.catbox.moe/blaehb.jpg',
                        wechatId: 'wxid_' + Math.random().toString(36).substr(2, 8),
                        momentsBg: 'https://files.catbox.moe/smqrt7.jpg',
                        contacts: [],
                        groups: [],
                        messages: {},
                        moments: []
                    };
                    state.userAccounts.push(newAccount);
                    showToast(`已创建小号：${name}`, 'user-plus');
                    performAccountSwitch(newId);
                });
            }
        });

        options.push({
            text: '恢复出厂设置',
            icon: 'refresh-cw',
            type: 'danger',
            onClick: () => {
                showActionSheet([
                    {
                        text: '确定恢复出厂设置 (不可撤销)',
                        icon: 'alert-triangle',
                        type: 'danger',
                        onClick: () => factoryReset()
                    }
                ]);
            }
        });

        showActionSheet(options);
    }

    function performAccountSwitch(accountId) {
        const loading = document.getElementById('account-switch-loading');
        loading.style.display = 'flex';

        // 先保存当前账号数据到 state.userAccounts
        const currentAcc = state.userAccounts.find(a => a.id === state.activeAccountId);
        if (currentAcc) {
            currentAcc.contacts = [...state.contacts];
            currentAcc.groups = [...state.groups];
            currentAcc.messages = { ...state.messages };
            currentAcc.moments = [...state.moments];
        }

        setTimeout(() => {
            state.activeAccountId = accountId;
            const active = state.userAccounts.find(a => a.id === accountId);

            state.userName = active.name;
            state.userAvatar = active.avatar;
            state.wechatId = active.wechatId;
            state.contacts = active.contacts || [];
            state.groups = active.groups || [];
            state.messages = active.messages || {};
            state.moments = active.moments || [];

            // 更新 UI
            if (settingsUserNameInput) settingsUserNameInput.value = state.userName;
            if (settingsWechatIdInput) settingsWechatIdInput.value = state.wechatId;
            if (settingsUserAvatarImg) settingsUserAvatarImg.src = state.userAvatar;

            const momentsUserName = document.getElementById('moments-user-name');
            const momentsUserAvatar = document.getElementById('moments-user-avatar');
            const momentsUserBg = document.getElementById('moments-user-bg');
            if (momentsUserName) momentsUserName.textContent = state.userName;
            if (momentsUserAvatar) momentsUserAvatar.src = state.userAvatar;
            if (momentsUserBg) momentsUserBg.src = active.momentsBg;
            if (momentsBgInput) momentsBgInput.value = active.momentsBg;

            renderChatList();
            renderContactsList();
            renderMomentsList();

            if (state.currentPage === 'chat-window') {
                switchPage('chat-list');
            }

            loading.style.display = 'none';
            showToast(`已切换至：${state.userName}`, 'user');
            saveStateToLocalStorage();
        }, 800);
    }

    function factoryReset() {
        // 清除所有数据
        state.userAccounts = [
            {
                id: 'user_main',
                name: '我',
                avatar: 'https://files.catbox.moe/blaehb.jpg',
                wechatId: 'wxid_sillyphone',
                momentsBg: 'https://files.catbox.moe/smqrt7.jpg',
                contacts: [],
                groups: [],
                messages: {},
                moments: []
            }
        ];
        state.activeAccountId = 'user_main';
        state.messages = {};
        state.moments = [];
        state.contacts = [];
        state.groups = [];
        state.stickers = { '收藏': { roles: [], items: [] } };
        state.settings = {
            globalBg: '',
            chatBg: '',
            momentsBg: 'https://files.catbox.moe/smqrt7.jpg',
            blur: 12,
            bubbleBlur: 12,
            navBlur: 15,
            glassOpacity: 5,
            pureMode: false
        };

        // 清除本地存储
        localStorage.clear();

        // 同步到 SillyTavern (清空标签内容)
        try {
            const st = getSTInterface();
            const msgId = st.getCurrentMessageId();
            if (msgId !== null) {
                const chat = st.getChatMessages(msgId)[0];
                if (chat && chat.message) {
                    const updatedMessage = chat.message.replace(/<shouji>[\s\S]*?<\/shouji>/, '').trim();
                    st.setChatMessages([{ message_id: msgId, message: updatedMessage }], { refresh: 'none' });
                }
            }
        } catch (e) {
            console.error('ST sync failed during reset:', e);
        }

        showToast('恢复出厂设置成功', 'check-circle');

        // 延迟刷新页面以应用更改
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }

    if (switchAccountBtn) {
        switchAccountBtn.onclick = switchAccount;
    }

    function showToast(text, icon = 'check-circle', duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <i data-lucide="${icon}" size="16"></i>
            <span>${text}</span>
        `;
        toastContainer.appendChild(toast);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.add('fade-out');
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, duration);
        }
        return toast;
    }

    function showCustomPrompt(title, placeholder, callback) {
        const modal = document.getElementById('custom-prompt-modal');
        const titleEl = document.getElementById('custom-prompt-title');
        const inputEl = document.getElementById('custom-prompt-input');
        const confirmBtn = document.getElementById('confirm-custom-prompt');
        const closeBtn = document.getElementById('close-custom-prompt');

        titleEl.textContent = title;
        inputEl.placeholder = placeholder;
        inputEl.value = '';
        modal.style.display = 'flex';
        inputEl.focus();

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            closeBtn.onclick = null;
            inputEl.onkeypress = null;
        };

        const handleConfirm = () => {
            const val = inputEl.value;
            cleanup();
            callback(val);
        };

        confirmBtn.onclick = handleConfirm;
        closeBtn.onclick = () => {
            cleanup();
            callback(null);
        };
        inputEl.onkeypress = (e) => {
            if (e.key === 'Enter') handleConfirm();
        };
    }

    // --- 预设管理逻辑 ---
    function renderPresetList() {
        if (!presetList) return;
        presetList.innerHTML = '';

        if (!state.presets || state.presets.length === 0) {
            presetList.innerHTML = '<div style="color: rgba(255,255,255,0.5); font-size: 12px; text-align: center; padding: 10px;">暂无预设，点击上方添加</div>';
            return;
        }

        state.presets.forEach(preset => {
            const item = document.createElement('div');
            item.className = 'preset-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.background = 'rgba(255,255,255,0.05)';
            item.style.padding = '10px';
            item.style.borderRadius = '8px';
            item.style.border = '1px solid rgba(255,255,255,0.1)';

            const leftDiv = document.createElement('div');
            leftDiv.style.display = 'flex';
            leftDiv.style.alignItems = 'center';
            leftDiv.style.gap = '10px';
            leftDiv.style.flex = '1';
            leftDiv.style.overflow = 'hidden';

            const toggleBtn = document.createElement('div');
            toggleBtn.className = `toggle-btn ${preset.enabled ? 'active' : ''}`;
            toggleBtn.style.width = '40px';
            toggleBtn.style.height = '20px';
            toggleBtn.style.borderRadius = '10px';
            toggleBtn.style.background = preset.enabled ? '#07c160' : 'rgba(255,255,255,0.2)';
            toggleBtn.style.position = 'relative';
            toggleBtn.style.cursor = 'pointer';
            toggleBtn.style.transition = 'background 0.3s';

            const toggleKnob = document.createElement('div');
            toggleKnob.style.width = '16px';
            toggleKnob.style.height = '16px';
            toggleKnob.style.borderRadius = '50%';
            toggleKnob.style.background = 'white';
            toggleKnob.style.position = 'absolute';
            toggleKnob.style.top = '2px';
            toggleKnob.style.left = preset.enabled ? '22px' : '2px';
            toggleKnob.style.transition = 'left 0.3s';
            toggleBtn.appendChild(toggleKnob);

            toggleBtn.onclick = () => {
                preset.enabled = !preset.enabled;
                syncToSillyTavern();
                renderPresetList();
            };

            const nameSpan = document.createElement('span');
            nameSpan.textContent = preset.name;
            nameSpan.style.color = 'white';
            nameSpan.style.fontSize = '14px';
            nameSpan.style.whiteSpace = 'nowrap';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';

            leftDiv.appendChild(toggleBtn);
            leftDiv.appendChild(nameSpan);

            const rightDiv = document.createElement('div');
            rightDiv.style.display = 'flex';
            rightDiv.style.gap = '8px';

            const editBtn = document.createElement('button');
            editBtn.innerHTML = '<i data-lucide="edit-2" size="14"></i>';
            editBtn.style.background = 'transparent';
            editBtn.style.border = 'none';
            editBtn.style.color = 'rgba(255,255,255,0.7)';
            editBtn.style.cursor = 'pointer';
            editBtn.onclick = () => openPresetModal(preset.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '<i data-lucide="trash-2" size="14"></i>';
            deleteBtn.style.background = 'transparent';
            deleteBtn.style.border = 'none';
            deleteBtn.style.color = '#ff4444';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.onclick = () => {
                if (confirm(`确定要删除预设 "${preset.name}" 吗？`)) {
                    state.presets = state.presets.filter(p => p.id !== preset.id);
                    syncToSillyTavern();
                    renderPresetList();
                }
            };

            rightDiv.appendChild(editBtn);
            rightDiv.appendChild(deleteBtn);

            item.appendChild(leftDiv);
            item.appendChild(rightDiv);
            presetList.appendChild(item);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function openPresetModal(presetId = null) {
        currentEditingPresetId = presetId;
        if (presetId) {
            const preset = state.presets.find(p => p.id === presetId);
            if (preset) {
                presetModalTitle.textContent = '编辑预设';
                presetNameInput.value = preset.name;
                presetContentInput.value = preset.content;
            }
        } else {
            presetModalTitle.textContent = '添加预设';
            presetNameInput.value = '';
            presetContentInput.value = '';
        }
        presetEditModal.style.display = 'flex';
    }

    function closePresetModal() {
        presetEditModal.style.display = 'none';
        currentEditingPresetId = null;
    }

    function savePreset() {
        const name = presetNameInput.value.trim();
        const content = presetContentInput.value.trim();

        if (!name) {
            showToast('请输入预设名称', 'alert-circle');
            return;
        }
        if (!content) {
            showToast('请输入预设内容', 'alert-circle');
            return;
        }

        if (!state.presets) state.presets = [];

        if (currentEditingPresetId) {
            const preset = state.presets.find(p => p.id === currentEditingPresetId);
            if (preset) {
                preset.name = name;
                preset.content = content;
            }
        } else {
            state.presets.push({
                id: 'preset_' + Date.now(),
                name: name,
                content: content,
                enabled: false
            });
        }

        syncToSillyTavern();
        renderPresetList();
        closePresetModal();
        showToast('预设已保存');
    }

    function exportPresets() {
        if (!state.presets || state.presets.length === 0) {
            showToast('没有可导出的预设', 'alert-circle');
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.presets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "sillyphone_presets.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('预设已导出');
    }

    function importPresets(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                let presetsToImport = [];

                if (Array.isArray(importedData)) {
                    presetsToImport = importedData;
                } else if (importedData && Array.isArray(importedData.items)) {
                    presetsToImport = importedData.items;
                }

                if (presetsToImport.length > 0) {
                    if (!state.presets) state.presets = [];

                    // 简单的合并逻辑，避免ID冲突
                    presetsToImport.forEach(imported => {
                        if (imported.name && imported.content) {
                            // 重新生成ID
                            state.presets.push({
                                id: 'preset_' + Date.now() + Math.random().toString(36).substr(2, 5),
                                name: imported.name,
                                content: imported.content,
                                enabled: imported.enabled !== undefined ? imported.enabled : false,
                                locked: imported.locked !== undefined ? imported.locked : false
                            });
                        }
                    });

                    syncToSillyTavern();
                    renderPresetList();
                    showToast('预设导入成功');
                } else {
                    showToast('无效的预设文件格式', 'alert-circle');
                }
            } catch (err) {
                console.error('导入预设失败:', err);
                showToast('读取文件失败', 'alert-circle');
            }
        };
        reader.readAsText(file);
        // 清空 input，允许重复导入同一个文件
        event.target.value = '';
    }

    if (addPresetBtn) addPresetBtn.onclick = () => openPresetModal();
    if (closePresetModalBtn) closePresetModalBtn.onclick = closePresetModal;
    if (cancelPresetBtn) cancelPresetBtn.onclick = closePresetModal;
    if (savePresetBtn) savePresetBtn.onclick = savePreset;
    if (exportPresetBtn) exportPresetBtn.onclick = exportPresets;
    if (importPresetBtn) importPresetBtn.onclick = () => importPresetInput.click();
    if (importPresetInput) importPresetInput.onchange = importPresets;

    // --- 结束预设管理逻辑 ---

    function showCharacterSelect(title, callback, filterType = 'all') {
        const modal = document.getElementById('character-select-modal');
        const listEl = document.getElementById('char-select-list');
        const titleEl = document.getElementById('char-select-title');
        const selectAllBtn = document.getElementById('char-select-all');
        const confirmBtn = document.getElementById('confirm-char-select');
        const closeBtn = document.getElementById('close-char-select');
        const hintEl = document.getElementById('char-select-hint');

        titleEl.textContent = title;
        selectAllBtn.checked = false;
        hintEl.style.display = 'inline';
        modal.style.display = 'flex';

        // 合并联系人和世界书角色
        const friends = state.contacts.filter(c => c.status === 'added').map(c => ({ ...c, isContact: true }));
        const worldChars = state.worldBook.map(c => ({ ...c, isContact: false }));

        let allChars = [];
        if (filterType === 'friends') {
            allChars = friends;
        } else {
            allChars = [...friends, ...worldChars];
        }

        let html = '';
        allChars.forEach(c => {
            html += `
                <div class="char-select-item" style="display: flex; align-items: center; padding: 10px 20px; gap: 12px; cursor: pointer; transition: background 0.2s;">
                    <input type="checkbox" class="char-checkbox" data-name="${c.name}" style="width: 18px; height: 18px; cursor: pointer;">
                    <img src="${c.avatar}" referrerpolicy="no-referrer" style="width: 41px; height: 41px; border-radius: 8px; object-fit: cover; opacity: ${c.isContact ? 1 : 0.6};">
                    <div style="flex: 1; display: flex; flex-direction: column;">
                        <span style="color: white; font-size: 14px;">${c.name}</span>
                        ${!c.isContact ? `<span style="font-size: 10px; color: rgba(255,255,255,0.3);">世界书角色 (非好友)</span>` : ''}
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;

        // 点击行也可以选中
        document.querySelectorAll('.char-select-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = item.querySelector('.char-checkbox');
                    cb.checked = !cb.checked;
                }
            };
        });

        // 全选逻辑
        selectAllBtn.onchange = () => {
            document.querySelectorAll('.char-checkbox').forEach(cb => {
                cb.checked = selectAllBtn.checked;
            });
        };

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            closeBtn.onclick = null;
            selectAllBtn.onchange = null;
        };

        confirmBtn.onclick = () => {
            const selected = Array.from(document.querySelectorAll('.char-checkbox:checked'))
                .map(cb => cb.dataset.name);
            cleanup();
            callback(selected.length > 0 ? selected.join(' ') : '');
        };

        closeBtn.onclick = () => {
            cleanup();
            callback(null);
        };
    }

    // 格式化消息内容，识别 (IMG:...) 格式并渲染为卡片，同时处理 @ 提及高亮
    function formatContent(text) {
        if (!text) return '';

        // 1. 处理 @ 提及高亮 (类似 QQ 空间/微信)
        // 匹配 @ 后面跟非空白字符，直到遇到空格或标点符号
        text = text.replace(/@([^\s@\n\r\t,.:;!?，。：；！？]+)/g, '<span class="mention-highlight">@$1</span>');

        // 2. 匹配 (IMG:描述内容)
        const imgRegex = /\(IMG:(.*?)\)/g;
        if (imgRegex.test(text)) {
            return text.replace(imgRegex, (match, desc) => {
                // 将描述内容存入 data 属性，方便点击时获取
                const safeDesc = desc.replace(/"/g, '&quot;');
                return `<div class="text-img-card" data-full-text="${safeDesc}" onclick="window.openTextImgDetail(this)">
                    <div class="text-img-header">
                        <i data-lucide="image" size="10"></i>
                        <span>IMAGE DESCRIPTION</span>
                    </div>
                    <div class="text-img-body">${desc}</div>
                </div>`;
            });
        }
        return text;
    }

    // 全局函数，方便 HTML 字符串中的 onclick 调用
    window.openTextImgDetail = (el) => {
        const fullText = el.dataset.fullText;
        const modal = document.getElementById('text-img-detail-modal');
        const content = document.getElementById('text-img-full-content');
        content.textContent = fullText;
        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    document.getElementById('close-text-img-modal').onclick = () => {
        document.getElementById('text-img-detail-modal').style.display = 'none';
    };

    function applyBlur(val) {
        document.documentElement.style.setProperty('--blur-val', `${val}px`);
    }

    function applyBubbleBlur(val) {
        document.documentElement.style.setProperty('--bubble-blur-val', `${val}px`);
    }

    function applyNavBlur(val) {
        document.documentElement.style.setProperty('--nav-blur', `${val}px`);
    }

    function applyGlassOpacity(val) {
        document.documentElement.style.setProperty('--glass-opacity', val);
    }

    function saveSettings() {
        const globalBg = globalBgInput.value.trim();
        const chatBg = chatBgInput.value.trim();
        const blurVal = blurIntensityInput.value;
        const bubbleBlurVal = bubbleBlurIntensityInput.value;
        const navBlurVal = navBlurIntensityInput.value;
        const glassOpacityVal = glassOpacityValueDisplay.textContent;
        const newUserName = settingsUserNameInput.value.trim() || '我';
        const newWechatId = settingsWechatIdInput.value.trim() || 'wxid_sillyphone';
        const newUserAvatar = settingsUserAvatarImg.src;
        const newMomentsBg = momentsBgInput.value.trim() || 'https://files.catbox.moe/smqrt7.jpg';

        state.settings.globalBg = globalBg;
        state.settings.chatBg = chatBg;
        state.settings.blur = parseInt(blurVal);
        state.settings.bubbleBlur = parseInt(bubbleBlurVal);
        state.settings.navBlur = parseInt(navBlurVal);
        state.settings.glassOpacity = parseFloat(glassOpacityVal) * 100;
        state.settings.momentsBg = newMomentsBg;


        state.userName = newUserName;
        state.userAvatar = newUserAvatar;
        state.wechatId = newWechatId;

        // 更新当前账号信息
        const activeAccount = state.userAccounts.find(acc => acc.id === state.activeAccountId);
        if (activeAccount) {
            activeAccount.name = newUserName;
            activeAccount.avatar = newUserAvatar;
            activeAccount.wechatId = newWechatId;
            activeAccount.momentsBg = newMomentsBg;
            activeAccount.contacts = [...state.contacts];
            activeAccount.groups = [...state.groups];
        }

        // 更新朋友圈头部显示
        const momentsUserName = document.getElementById('moments-user-name');
        const momentsUserAvatar = document.getElementById('moments-user-avatar');
        const momentsUserBg = document.getElementById('moments-user-bg');

        if (momentsUserName) momentsUserName.textContent = state.userName;
        if (momentsUserAvatar) momentsUserAvatar.src = state.userAvatar;
        if (momentsUserBg) momentsUserBg.src = newMomentsBg;

        // 更新朋友圈中自己的信息
        state.moments.forEach(m => {
            if (m.authorId === 'user') {
                m.authorName = newUserName;
                m.authorAvatar = newUserAvatar;
            }
        });

        // 如果在朋友圈或聊天窗口，刷新一下
        if (state.currentPage === 'moments') {
            renderMomentsList();
        } else if (state.currentPage === 'chat-window' && state.currentChat) {
            renderMessages(state.currentChat.id);
        }

        applySettings();
        showToast('设置已保存', 'save');
        saveStateToLocalStorage();
    }

    function saveMoments() {
        localStorage.setItem('moments', JSON.stringify(state.moments));
        deferredSync(); // 同步到同层
    }

    function switchPage(pageId) {
        console.log('[SillyPhone] switchPage:', pageId, 'currentChat:', state.currentChat ? state.currentChat.id : 'null');
        if (pageId !== 'chat-window' && pageId !== 'chat-info') {
            closeAllPanels();
            state.currentChat = null;
            try {
                sessionStorage.removeItem('sillyphone-currentChatId');
            } catch (e) { }
        }
        pages.forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`page-${pageId}`);
        if (target) target.classList.add('active');

        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });
        state.currentPage = pageId;

        // 保存当前页面状态，防止切换原始代码后重置
        try {
            sessionStorage.setItem('sillyphone-currentPage', pageId);
        } catch (e) { }

        if (pageId === 'contacts') {
            renderContactsList();
        }

        if (pageId === 'moments') {
            renderMomentsList();
        }

        if (pageId === 'chat-list') {
            renderChatList();
        }

        // 进入聊天窗口、聊天详情、朋友圈或我的好友时隐藏底栏，离开时显示
        const bottomNav = document.querySelector('.bottom-nav');
        const pageChatWindow = document.getElementById('page-chat-window');
        const mainContent = document.getElementById('main-content');
        if (pageId === 'chat-window' || pageId === 'chat-info' || pageId === 'my-friends') {
            bottomNav.style.display = 'none';
            mainContent.classList.remove('has-bottom-nav');

            // 处理上帝视角 (仅聊天窗口)
            if (pageId === 'chat-window') {
                if (state.currentChat && state.currentChat.isGroup && state.currentChat.godMode) {
                    pageChatWindow.classList.add('god-mode-active');
                } else {
                    pageChatWindow.classList.remove('god-mode-active');
                }
            }
        } else {
            bottomNav.style.display = 'flex';
            mainContent.classList.add('has-bottom-nav');
            pageChatWindow.classList.remove('god-mode-active');
        }
    }

    function updateAddFriendUI() {
        const input = document.getElementById('friend-search-input');
        const tip = document.getElementById('add-friend-tip');
        const directBtn = document.getElementById('tab-direct-add');
        const idBtn = document.getElementById('tab-id-add');
        const confirmBtn = document.getElementById('confirm-add-friend-btn');

        if (addFriendMode === 'direct') {
            input.placeholder = '输入角色姓名/账号名';
            tip.textContent = '提示：适用于开场即认识的角色，添加后直接出现在列表。';
            directBtn.style.background = 'rgba(255,255,255,0.9)';
            directBtn.style.color = '#1a1a1a';
            idBtn.style.background = 'rgba(255,255,255,0.05)';
            idBtn.style.color = 'white';
            confirmBtn.textContent = '立即添加';
        } else {
            input.placeholder = '输入电话号或微信号';
            tip.textContent = '提示：适用于剧情中后期认识的角色，需发送申请等待通过。';
            idBtn.style.background = 'rgba(255,255,255,0.9)';
            idBtn.style.color = '#1a1a1a';
            directBtn.style.background = 'rgba(255,255,255,0.05)';
            directBtn.style.color = 'white';
            confirmBtn.textContent = '发送申请';
        }

        document.getElementById('search-result-container').innerHTML = '';
    }

    function searchAndAddFriend() {
        const input = document.getElementById('friend-search-input');
        const query = input.value.trim();
        const container = document.getElementById('search-result-container');
        container.innerHTML = '';

        if (!query) return;

        let results = [];

        if (addFriendMode === 'direct') {
            // 直接添加模式：尝试匹配，如果没有匹配也提供一个默认的添加选项
            let matched = false;
            state.characters.forEach(char => {
                if (char.realName === query) {
                    const mainAcc = char.accounts.find(a => a.type === 'main');
                    if (mainAcc && !results.find(r => r.id === mainAcc.id)) {
                        results.push({ ...mainAcc, characterId: char.id, characterRealName: char.realName, matchType: 'direct' });
                        matched = true;
                    }
                }
                char.accounts.forEach(acc => {
                    if (acc.name === query) {
                        if (!results.find(r => r.id === acc.id)) {
                            results.push({ ...acc, characterId: char.id, characterRealName: char.realName, matchType: 'direct' });
                            matched = true;
                        }
                    }
                });
            });

            // 如果没有匹配到，或者为了让用户可以直接添加任意名字，我们始终提供一个基于输入名字的选项
            if (!matched) {
                results.push({
                    id: 'custom_' + Date.now(),
                    characterId: 'custom_' + Date.now(),
                    name: query,
                    avatar: 'https://files.catbox.moe/blaehb.jpg',
                    type: 'main',
                    role: '自定义角色',
                    matchType: 'direct'
                });
            }
        } else {
            // ID 添加模式：必须精确匹配
            state.characters.forEach(char => {
                char.accounts.forEach(acc => {
                    if (acc.phone === query || acc.wechat === query) {
                        if (!results.find(r => r.id === acc.id)) {
                            results.push({ ...acc, characterId: char.id, characterRealName: char.realName, matchType: 'id' });
                        }
                    }
                });
            });
        }

        if (results.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--c-text-sec); margin-top: 20px; font-size: 11px; opacity: 0.6;">未找到匹配结果</p>';
            return;
        }

        results.forEach(res => {
            const isAlreadyAdded = state.contacts.find(c => c.id === res.id && c.status === 'added');
            const isAlreadyRequested = state.contacts.find(c => c.id === res.id && c.status === 'pending');

            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.style.cssText = 'background: rgba(255,255,255,0.05); border-radius: 14px; padding: 12px; display: flex; align-items: center; margin-top: 10px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.2s;';
            div.innerHTML = `
                <img src="${res.avatar}" referrerpolicy="no-referrer" style="width: 41px; height: 41px; border-radius: 50%; margin-right: 12px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 13px; color: white;">${res.name}</div>
                    <div style="font-size: 10px; color: var(--c-text-sec); margin-top: 2px;">${res.role}</div>
                </div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.8); font-weight: 600;">
                    ${isAlreadyAdded ? '已在列表' : (isAlreadyRequested ? '已发送申请' : (res.id.startsWith('custom_') ? '直接添加' : '匹配成功'))}
                </div>
            `;
            container.appendChild(div);

            div.onclick = () => {
                document.querySelectorAll('.search-result-item').forEach(i => i.style.borderColor = 'rgba(255,255,255,0.1)');
                div.style.borderColor = 'rgba(255,255,255,0.5)';
                state.selectedSearchRes = res;
            };

            if (results.length === 1) {
                div.style.borderColor = 'rgba(255,255,255,0.5)';
                state.selectedSearchRes = res;
            }
        });
    }

    function handleConfirmAddFriend() {
        const input = document.getElementById('friend-search-input');
        const query = input.value.trim();

        if (addFriendMode === 'direct') {
            if (!query) {
                showToast('请输入角色姓名', 'alert-circle');
                return;
            }

            let res = state.selectedSearchRes;
            // 如果没有选中任何结果，直接使用输入框的内容创建一个自定义角色
            if (!res) {
                res = {
                    id: 'custom_' + Date.now(),
                    characterId: 'custom_' + Date.now(),
                    name: query,
                    avatar: 'https://files.catbox.moe/blaehb.jpg',
                    type: 'main',
                    role: '自定义角色'
                };
            }

            const isAlreadyAdded = state.contacts.find(c => c.id === res.id || (c.name === res.name && c.id.startsWith('custom_')));
            if (isAlreadyAdded) {
                showToast('该账号已在联系人中', 'info');
                return;
            }

            state.contacts.push({
                id: res.id,
                characterId: res.characterId,
                name: res.name,
                avatar: res.avatar,
                status: 'added',
                type: res.type,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                lastMsg: '我们已经是好友了，开始聊天吧！'
            });
            showToast(`已成功添加 ${res.name}`, 'user-check');

            document.getElementById('add-friend-modal').style.display = 'none';
            document.getElementById('friend-search-input').value = '';
            state.selectedSearchRes = null;
            renderContactsList();
            renderChatList();
            saveStateToLocalStorage();
            return;
        }

        if (!state.selectedSearchRes) {
            showToast('请先选择匹配结果', 'alert-circle');
            return;
        }

        const res = state.selectedSearchRes;
        const isAlreadyAdded = state.contacts.find(c => c.id === res.id);
        if (isAlreadyAdded) {
            showToast('该账号已在联系人中', 'info');
            return;
        }

        // ID 添加：发送申请，直接加入联系人列表并标记为 pending
        if (!state.contacts.find(c => c.id === res.id)) {
            const newContact = {
                ...res,
                status: 'pending',
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                lastMsg: '等待对方通过申请'
            };
            state.contacts.push(newContact);
            showToast(`已向 ${res.name} 发送好友申请`, 'send');
            // 触发 AI 审批通知
            triggerFriendApprovalNotification(newContact);
        } else {
            showToast('请勿重复发送申请', 'info');
        }

        document.getElementById('add-friend-modal').style.display = 'none';
        document.getElementById('friend-search-input').value = '';
        state.selectedSearchRes = null;
        renderContactsList();
        renderChatList();
        saveStateToLocalStorage();
    }

    // 群聊创建逻辑
    const createGroupBtn = document.getElementById('create-group-btn');
    const createGroupModal = document.getElementById('create-group-modal');
    const closeCreateGroupModal = document.getElementById('close-create-group-modal');
    const confirmCreateGroupBtn = document.getElementById('confirm-create-group-btn');
    const memberSelectList = document.getElementById('group-member-select-list');
    const groupNameInput = document.getElementById('group-name-input');
    const godModeToggle = document.getElementById('god-mode-toggle');

    let selectedMembers = [];

    createGroupBtn.onclick = () => {
        createGroupModal.style.display = 'flex';
        renderMemberSelection();
    };

    closeCreateGroupModal.onclick = () => {
        createGroupModal.style.display = 'none';
        selectedMembers = [];
        groupNameInput.value = '';
    };

    function renderMemberSelection() {
        memberSelectList.innerHTML = '';
        state.contacts.filter(c => c.status === 'added').forEach(c => {
            const item = document.createElement('div');
            item.className = 'member-select-item';
            item.innerHTML = `
                <img src="${c.avatar}" referrerpolicy="no-referrer" class="member-select-avatar">
                <span class="member-select-name">${c.name}</span>
                <i data-lucide="check" size="14" class="check-icon" style="display: none; color: white;"></i>
            `;
            item.onclick = () => {
                const index = selectedMembers.indexOf(c.id);
                if (index > -1) {
                    selectedMembers.splice(index, 1);
                    item.classList.remove('selected');
                    item.querySelector('.check-icon').style.display = 'none';
                } else {
                    selectedMembers.push(c.id);
                    item.classList.add('selected');
                    item.querySelector('.check-icon').style.display = 'block';
                }
                if (typeof lucide !== 'undefined') lucide.createIcons();
            };
            memberSelectList.appendChild(item);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    confirmCreateGroupBtn.onclick = () => {
        const name = groupNameInput.value.trim();
        if (!name) {
            showToast('请输入群聊名称', 'alert-circle');
            return;
        }
        if (selectedMembers.length < 1) {
            showToast('请至少选择一个成员', 'alert-circle');
            return;
        }

        const groupId = 'group_' + Date.now();
        const members = selectedMembers.map(id => state.contacts.find(c => c.id === id));

        // 将自己加入群聊成员列表 (上帝视角不加入)
        if (!godModeToggle.checked) {
            members.push({
                id: 'user',
                name: state.userName || '我',
                avatar: state.userAvatar || 'https://files.catbox.moe/blaehb.jpg',
                isUser: true
            });
        }

        const newGroup = {
            id: groupId,
            name: name,
            avatar: 'https://files.catbox.moe/blaehb.jpg', // 默认群头像
            isGroup: true,
            godMode: godModeToggle.checked,
            members: members,
            time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
            lastMsg: '群聊已创建'
        };

        state.groups.push(newGroup);
        state.messages[groupId] = [
            { type: 'system', text: `${godModeToggle.checked ? '上帝视角已开启。' : ''}群聊已创建，快来聊天吧！` }
        ];

        showToast('群聊创建成功', 'check');
        createGroupModal.style.display = 'none';
        selectedMembers = [];
        groupNameInput.value = '';
        godModeToggle.checked = false;

        renderChatList();
        renderGroupsList(); // 同时刷新群组列表
        saveStateToLocalStorage();
        switchPage('chat-list');
    };

    // 事件绑定
    document.getElementById('add-friend-btn').onclick = () => {
        document.getElementById('add-friend-modal').style.display = 'flex';
        updateAddFriendUI();
    };
    document.getElementById('close-add-friend-modal').onclick = () => {
        document.getElementById('add-friend-modal').style.display = 'none';
    };
    document.getElementById('tab-direct-add').onclick = () => {
        addFriendMode = 'direct';
        updateAddFriendUI();
    };
    document.getElementById('tab-id-add').onclick = () => {
        addFriendMode = 'id';
        updateAddFriendUI();
    };
    document.getElementById('friend-search-input').oninput = searchAndAddFriend;
    document.getElementById('confirm-add-friend-btn').onclick = handleConfirmAddFriend;
    document.getElementById('groups-back-btn').onclick = () => switchPage('contacts');
    document.getElementById('back-from-my-friends').onclick = () => switchPage('contacts');

    function renderGroupsList() {
        const list = document.getElementById('groups-list');
        if (!list) return;
        list.innerHTML = '';

        if (state.groups.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 50px; color: var(--c-text-sec); opacity: 0.5; font-size: 13px;">暂无群聊</div>';
            return;
        }

        state.groups.forEach(g => {
            const item = document.createElement('div');
            item.className = 'contact-item';
            item.innerHTML = `
                ${getAvatarHtml(g, 35)}
                <div style="display: flex; flex-direction: column; flex: 1;">
                    <span class="contact-name">${g.remark || g.name}</span>
                    <span style="font-size: 10px; color: var(--c-text-sec);">${g.members.length} 位成员 ${g.godMode ? '· 上帝视角' : ''}</span>
                </div>
            `;
            item.onclick = () => openChat(g);
            list.appendChild(item);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function renderChatList() {
        chatList.innerHTML = '';

        // 合并单聊和群聊
        const allChats = [
            ...state.contacts.filter(c => c.status === 'added'),
            ...state.groups
        ];

        // 按时间排序 (简单处理)
        allChats.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

        allChats.forEach(c => {
            let lastMsgText = c.lastMsg || '暂无消息';
            let lastMsgTime = c.time || '';
            const msgs = state.messages[c.id];
            if (msgs && msgs.length > 0) {
                const lastMsg = msgs[msgs.length - 1];
                lastMsgTime = lastMsg.time || lastMsgTime;
                if (lastMsg.msgType === 'photo') {
                    lastMsgText = '[图片]';
                } else if (lastMsg.msgType === 'sticker') {
                    lastMsgText = '[表情]';
                } else if (lastMsg.msgType === 'voice') {
                    const durationVal = parseInt(lastMsg.duration) || Math.max(1, Math.ceil((lastMsg.text || '').length / 4)) || 5;
                    lastMsgText = `[语音] ${durationVal}"`;
                } else if (lastMsg.msgType === 'video') {
                    lastMsgText = '[视频通话]';
                } else if (lastMsg.msgType === 'transfer') {
                    lastMsgText = '[转账]';
                } else if (lastMsg.msgType === 'red-packet') {
                    lastMsgText = '[红包]';
                } else if (lastMsg.msgType === 'system') {
                    lastMsgText = lastMsg.text;
                } else {
                    lastMsgText = lastMsg.text;
                }
            }

            const card = document.createElement('div');
            card.className = 'chat-card';
            card.innerHTML = `
                ${getAvatarHtml(c)}
                <div class="card-info">
                    <div class="card-top">
                        <span class="card-name">${c.remark || c.name}</span>
                        <span class="card-time">${lastMsgTime}</span>
                    </div>
                    <div class="card-msg">${lastMsgText}</div>
                </div>
            `;
            card.onclick = () => openChat(c);
            chatList.appendChild(card);
        });
    }

    // --- 朋友圈功能 ---
    function renderMomentsList() {
        const momentsList = document.getElementById('moments-list');
        if (!momentsList) return;

        momentsList.innerHTML = '';

        state.moments.forEach(moment => {
            const item = document.createElement('div');
            item.className = 'moment-item';

            // 长按删除朋友圈
            let momentPressTimer;
            const startMomentPress = (e) => {
                // 如果点击的是按钮，不触发长按
                if (e.target.closest('button') || e.target.closest('.text-img-card')) return;
                momentPressTimer = setTimeout(() => {
                    showActionSheet([
                        { text: '删除动态', danger: true, onClick: () => deleteMoment(moment.id) }
                    ]);
                }, 600);
            };
            const endMomentPress = () => clearTimeout(momentPressTimer);
            item.onmousedown = startMomentPress;
            item.onmouseup = endMomentPress;
            item.ontouchstart = startMomentPress;
            item.ontouchend = endMomentPress;

            const imagesHtml = (moment.images && moment.images.length > 0) ? `
                <div class="moment-images ${moment.images.length === 1 ? 'single' : ''}">
                    ${moment.images.map(img => {
                const isData = img.startsWith('data:') || img.startsWith('http');
                if (isData) {
                    return `<img src="${img}" referrerpolicy="no-referrer" class="previewable-img">`;
                } else {
                    const safeDesc = img.replace(/"/g, '&quot;');
                    return `
                                <div class="text-img-card" data-full-text="${safeDesc}" onclick="window.openTextImgDetail(this)">
                                    <div class="text-img-header">
                                        <i data-lucide="image" size="10"></i>
                                        <span>IMAGE DESCRIPTION</span>
                                    </div>
                                    <div class="text-img-body">${img}</div>
                                </div>
                            `;
                }
            }).join('')}
                </div>
            ` : '';

            const commentsHtml = (moment.comments && moment.comments.length > 0) ? `
                <div class="comments-list">
                    ${moment.comments.map(c => {
                const name = c.authorName || c.name || '未知';
                const replyTo = c.replyToName || c.replyTo || '';
                return `
                        <div class="comment-item" data-moment-id="${moment.id}" data-comment-id="${c.id}" data-author-id="${c.authorId}" data-author-name="${name}" data-reply-to="${replyTo}">
                            <div class="comment-content-wrapper">
                                <span class="comment-author">${name}</span>
                                ${replyTo ? `<span class="comment-reply">回复</span><span class="comment-author">${replyTo}</span>` : ''}
                                <span class="comment-text">: ${formatContent(c.text)}</span>
                            </div>
                            ${c.authorId === 'user' ? `
                                <button class="ai-comment-trigger" title="要求对方回复我">
                                    <i data-lucide="sparkles" size="12"></i>
                                </button>
                            ` : ''}
                        </div>
                    `}).join('')}
                </div>
            ` : '';

            const interactionsHtml = commentsHtml ? `
                <div class="moment-interactions">
                    ${commentsHtml}
                </div>
            ` : '';

            // 查找对应的联系人头像
            let displayAvatar = moment.authorAvatar;
            if (!displayAvatar) {
                if (moment.authorName === '我' || moment.authorName === state.userName || moment.authorName === 'user') {
                    displayAvatar = state.userAvatar;
                } else {
                    const contact = state.contacts.find(c => c.name === moment.authorName);
                    displayAvatar = contact ? contact.avatar : 'https://files.catbox.moe/blaehb.jpg';
                }
            }

            item.innerHTML = `
                <img src="${displayAvatar}" referrerpolicy="no-referrer" class="moment-avatar">
                <div class="moment-content">
                    <div class="moment-author">${moment.authorName}</div>
                    <div class="moment-text">${formatContent(moment.content)}</div>
                    ${imagesHtml}
                    <div class="moment-footer">
                        <span class="moment-time">${moment.time}</span>
                        <div class="moment-actions">
                            <button class="action-btn ai-moment-btn" data-id="${moment.id}" title="触发互动">
                                <i data-lucide="sparkles" size="16"></i>
                            </button>
                            <button class="action-btn comment-btn" data-id="${moment.id}">
                                <i data-lucide="message-square" size="16"></i>
                                <span>${(moment.comments && moment.comments.length) || ''}</span>
                            </button>
                        </div>
                    </div>
                    ${interactionsHtml}
                </div>
            `;

            momentsList.appendChild(item);

            // 为评论添加点击事件
            item.querySelectorAll('.comment-item').forEach(commentEl => {
                const authorId = commentEl.dataset.authorId;
                const momentId = commentEl.dataset.momentId;
                const commentId = commentEl.dataset.commentId;
                const authorName = commentEl.dataset.authorName;

                commentEl.onclick = (e) => {
                    e.stopPropagation();

                    if (authorId === 'user') {
                        // 点击自己的评论：弹出修改/删除菜单
                        showActionSheet([
                            { text: '修改评论', onClick: () => openEditCommentModal(momentId, commentId) },
                            { text: '删除评论', danger: true, onClick: () => deleteComment(momentId, commentId) }
                        ]);
                    } else {
                        // 点击他人的评论：弹出回复框
                        const moment = state.moments.find(m => m.id === momentId);

                        // 检查评论作者是否是好友
                        // 朋友圈发布者默认是好友，或者评论者在通讯录中且已添加
                        const contact = state.contacts.find(c => c.name === authorName || c.id === authorName);
                        const isFriend = (authorName === moment.authorName) || (contact && contact.status === 'added');

                        if (!isFriend) {
                            showToast('只有好友才能回复哦', 'info');
                            return;
                        }

                        openCommentModal(momentId, authorName);
                    }
                };
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
        attachMomentEvents();
    }

    function deleteMoment(id) {
        state.moments = state.moments.filter(m => m.id !== id);
        saveMoments(); // 永久保存到本地
        renderMomentsList();
        showToast('已永久删除动态');
    }

    function deleteComment(momentId, commentId) {
        const moment = state.moments.find(m => m.id === momentId);
        if (moment) {
            moment.comments = moment.comments.filter(c => c.id !== commentId);
            saveMoments(); // 永久保存到本地
            renderMomentsList();
            showToast('已永久删除评论');
        }
    }

    let editingCommentInfo = null;
    function openEditCommentModal(momentId, commentId) {
        const moment = state.moments.find(m => m.id === momentId);
        if (!moment) return;
        const comment = moment.comments.find(c => c.id === commentId);
        if (!comment) return;

        editingCommentInfo = { momentId, commentId };
        const modal = document.getElementById('moment-comment-modal');
        const title = modal.querySelector('.modal-title');
        const input = document.getElementById('moment-comment-input');
        const btn = document.getElementById('confirm-comment-btn');

        title.textContent = '修改评论';
        input.value = comment.text;
        btn.textContent = '保存修改';

        modal.style.display = 'flex';
        input.focus();
    }

    // 点击外部关闭 Action Sheet
    document.getElementById('action-sheet-modal').onclick = (e) => {
        if (e.target.id === 'action-sheet-modal') {
            document.getElementById('action-sheet-modal').style.display = 'none';
        }
    };

    function attachMomentEvents() {
        // 互动按钮 (针对特定动态触发回复)
        // AI 互动按钮 (点击直接触发随机互动)
        document.querySelectorAll('.ai-moment-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const moment = state.moments.find(m => m.id === id);
                if (!moment) return;

                const authorCircle = moment.authorCircle || (state.contacts.find(c => c.name === moment.authorName)?.circle);
                const blockedIds = moment.blockedIds || [];
                const mentionedIds = moment.mentionedIds || [];

                const mentions = mentionedIds.map(mid => {
                    const c = state.contacts.find(contact => contact.id === mid);
                    return c ? c.name : null;
                }).filter(n => n !== null);

                const isUserMoment = moment.authorName === state.userName || moment.authorName === state.stUserName || moment.authorName === '我' || moment.authorName === 'user';

                const commentsContext = moment.comments && moment.comments.length > 0
                    ? `\n已有评论记录：\n${moment.comments.map(c => `${c.authorName}${c.replyToName ? ' 回复 ' + c.replyToName : ''}: ${c.text}`).join('\n')}`
                    : '';

                let promptText = `[系统提示: 朋友圈互动]\n动态作者: ${moment.authorName}\n动态内容：“${moment.content}”${commentsContext}`;
                if (mentions.length > 0) {
                    promptText += `\n[强制响应]: 请务必让被@到的好友【${mentions.join('】和【')}】进行回复。`;
                }

                if (isUserMoment) {
                    promptText += `\n这是“我”（{{user}}）发的朋友圈。请挑选 1~3 个角色进行评论。（具体格式请严格遵守世界书设定）`;
                } else {
                    promptText += `\n这是 ${moment.authorName} 发的朋友圈。请挑选 1~2 个角色进行评论，或让 ${moment.authorName} 回复现有评论。（具体格式请严格遵守世界书设定）`;
                }

                setIslandState('loading');
                showToast('好友正在响应...', 'sparkles');

                setTimeout(() => {
                    setIslandState('default');
                    sendMessage({
                        text: promptText,
                        isSilent: true
                    }, moment.id);
                }, 1500);
            };
        });

        // 评论响应按钮 (针对我的评论要求对方回复)
        document.querySelectorAll('.ai-comment-trigger').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const item = btn.closest('.comment-item');
                const momentId = item.dataset.momentId;
                const replyTo = item.dataset.replyTo; // 这里的 replyTo 是我回复的那个人
                const moment = state.moments.find(m => m.id === momentId);

                const commentId = item.dataset.commentId;
                const comment = moment.comments.find(c => c.id === commentId);
                const commentText = comment ? comment.text : '';

                const isUserMoment = moment.authorName === state.userName || moment.authorName === state.stUserName || moment.authorName === '我' || moment.authorName === 'user';

                const commentsContext = moment.comments && moment.comments.length > 0
                    ? `\n已有评论记录：\n${moment.comments.map(c => `${c.authorName}${c.replyToName ? ' 回复 ' + c.replyToName : ''}: ${c.text}`).join('\n')}`
                    : '';

                let promptText = '';

                if (isUserMoment) {
                    const targetNPC = replyTo || '该角色';
                    promptText = `[系统提示: 朋友圈互动]\n动态内容：“${moment.content}”${commentsContext}\n\n在“我”（{{user}}）的朋友圈下，“我”回复了 ${targetNPC}：“${commentText}”。\n请让 ${targetNPC} 结合上下文，对“我”的这句话做出最新的回应。\n【重要指令】请直接输出 ${targetNPC} 的回复内容，不要加任何前缀，不要重复历史记录，不要输出任何格式代码，只输出回复的纯文本！`;
                } else {
                    if (replyTo && replyTo !== '') {
                        promptText = `[系统提示: 朋友圈互动]\n动态内容：“${moment.content}”${commentsContext}\n\n“我”（{{user}}）在 ${moment.authorName} 的朋友圈下，回复了 ${replyTo}：“${commentText}”。\n请让 ${replyTo} 对“我”的这句话做出最新的回应。\n【重要指令】请直接输出 ${replyTo} 的回复内容，不要加任何前缀，不要重复历史记录，不要输出任何格式代码，只输出回复的纯文本！`;
                    } else {
                        promptText = `[系统提示: 朋友圈互动]\n动态内容：“${moment.content}”${commentsContext}\n\n“我”（{{user}}）在 ${moment.authorName} 的朋友圈下发表了评论：“${commentText}”。\n请让 ${moment.authorName} 对“我”的这句话做出最新的回应，或者挑选 1 个共同好友来调侃/回复“我”。\n【重要指令】请直接输出回复内容，不要加任何前缀，不要重复历史记录，不要输出任何格式代码，只输出回复的纯文本！如果是由其他好友回复，请在开头加上“好友名字：”。`;
                    }
                }

                setIslandState('loading');
                showToast('好友正在响应...', 'sparkles');

                setTimeout(() => {
                    setIslandState('default');
                    sendMessage({
                        text: promptText,
                        isSilent: true
                    }, moment.id);
                }, 1500);
            };
        });

        // 评论按钮 (对动态本身评论)

        // 评论按钮 (对动态本身评论)
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                // 朋友圈发布者默认是好友，允许直接评论
                openCommentModal(id);
            };
        });

        // 图片预览
        document.querySelectorAll('.previewable-img').forEach(img => {
            img.onclick = () => {
                const modal = document.getElementById('image-preview-modal');
                const previewImg = document.getElementById('preview-img');
                previewImg.src = img.src;
                modal.style.display = 'flex';
            };
        });
    }

    let activeMomentId = null;
    let activeReplyTo = null;
    function openCommentModal(momentId, replyToName = null) {
        editingCommentInfo = null;
        activeMomentId = momentId;
        activeReplyTo = replyToName;
        const input = document.getElementById('moment-comment-input');
        input.placeholder = replyToName ? `回复 ${replyToName}:` : '说点什么...';
        document.getElementById('moment-comment-modal').style.display = 'flex';
        input.focus();
    }

    document.getElementById('close-comment-modal').onclick = () => {
        document.getElementById('moment-comment-modal').style.display = 'none';
        editingCommentInfo = null;
        document.getElementById('moment-comment-modal').querySelector('.modal-title').textContent = '发表评论';
        document.getElementById('confirm-comment-btn').textContent = '发送';
    };

    document.getElementById('confirm-comment-btn').onclick = () => {
        const input = document.getElementById('moment-comment-input');
        const text = input.value.trim();
        if (!text) return;

        if (editingCommentInfo) {
            // 修改现有评论
            const moment = state.moments.find(m => m.id === editingCommentInfo.momentId);
            if (moment) {
                const comment = moment.comments.find(c => c.id === editingCommentInfo.commentId);
                if (comment) {
                    comment.text = text;
                    saveMoments();
                    renderMomentsList();
                    showToast('修改成功');
                }
            }
            editingCommentInfo = null;
        } else {
            // 发表新评论
            const moment = state.moments.find(m => m.id === activeMomentId);
            if (moment) {
                moment.comments.push({
                    id: 'c' + Date.now(),
                    authorId: 'user',
                    authorName: '我',
                    replyToName: activeReplyTo,
                    text: text
                });
                saveMoments();
                renderMomentsList();
                showToast(activeReplyTo ? '回复成功' : '评论成功');
            }
        }

        input.value = '';
        document.getElementById('moment-comment-modal').style.display = 'none';
        // 重置弹窗标题和按钮
        document.getElementById('moment-comment-modal').querySelector('.modal-title').textContent = '发表评论';
        document.getElementById('confirm-comment-btn').textContent = '发送';
    };

    document.getElementById('image-preview-modal').onclick = () => {
        document.getElementById('image-preview-modal').style.display = 'none';
    };

    // 发布朋友圈相关
    const postMomentModal = document.getElementById('post-moment-modal');
    const cancelPostMomentBtn = document.getElementById('cancel-post-moment');
    const confirmPostMomentBtn = document.getElementById('confirm-post-moment');
    const postMomentText = document.getElementById('post-moment-text');
    const postMomentImagesContainer = document.getElementById('post-moment-images-container');
    const addMomentImageBtn = document.getElementById('add-moment-image-btn');
    const momentImageInput = document.getElementById('moment-image-input');

    let pendingMomentImages = [];
    let blockedIds = [];
    let mentionedIds = [];

    // 朋友圈背景修改
    const momentsUserBg = document.getElementById('moments-user-bg');
    if (momentsUserBg) {
        momentsUserBg.onclick = () => {
            showCustomPrompt('修改朋友圈背景', '输入背景图片 URL', (url) => {
                if (!url) return;
                const activeAccount = state.userAccounts.find(acc => acc.id === state.activeAccountId);
                if (activeAccount) {
                    activeAccount.momentsBg = url;
                    momentsUserBg.src = url;

                    // 如果是主账号，同步到全局设置
                    if (state.activeAccountId === 'user_main') {
                        state.settings.momentsBg = url;
                    }

                    // 更新设置页面的输入框
                    const momentsBgInput = document.getElementById('moments-bg-url');
                    if (momentsBgInput) momentsBgInput.value = url;

                    showToast('朋友圈背景已更新', 'image');
                    deferredSync();
                }
            });
        };
    }

    document.getElementById('post-moment-btn').onclick = () => {
        postMomentModal.style.display = 'flex';
        document.querySelector('.bottom-nav').style.display = 'none'; // 隐藏底栏
        postMomentText.value = '';
        pendingMomentImages = [];
        blockedIds = [];
        mentionedIds = [];
        document.getElementById('visibility-status').textContent = '全部可见';
        document.getElementById('mention-status').textContent = '不提醒';
        renderPendingMomentImages();
    };

    cancelPostMomentBtn.onclick = () => {
        postMomentModal.style.display = 'none';
        document.querySelector('.bottom-nav').style.display = 'flex'; // 恢复底栏
    };

    // 谁可以看设置
    document.getElementById('btn-visibility-settings').onclick = () => {
        showCharacterSelect('选择屏蔽的好友', (targetNames) => {
            if (targetNames === null) return;
            if (targetNames.trim() === '') {
                blockedIds = [];
                document.getElementById('visibility-status').textContent = '全部可见';
            } else {
                const names = targetNames.trim().split(/\s+/);
                blockedIds = names.map(name => {
                    const c = state.contacts.find(contact => contact.name === name);
                    return c ? c.id : null;
                }).filter(id => id !== null);
                document.getElementById('visibility-status').textContent = `屏蔽 ${names.length} 人`;
            }
        }, 'friends');
    };

    // 提醒谁看设置
    document.getElementById('btn-mention-friends').onclick = () => {
        showCharacterSelect('选择提醒的好友', (targetNames) => {
            if (targetNames === null) return;
            if (targetNames.trim() === '') {
                mentionedIds = [];
                document.getElementById('mention-status').textContent = '不提醒';
            } else {
                const names = targetNames.trim().split(/\s+/);
                mentionedIds = names.map(name => {
                    const c = state.contacts.find(contact => contact.name === name);
                    return c ? c.id : null;
                }).filter(id => id !== null);
                document.getElementById('mention-status').textContent = `@ ${names.length} 人`;
            }
        }, 'friends');
    };

    addMomentImageBtn.onclick = () => {
        momentImageInput.click();
    };

    if (momentImageInput) {
        momentImageInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showToast('正在上传到服务器...', 'loader');
            const serverPath = await uploadImageToST(file);

            if (serverPath) {
                pendingMomentImages.push({
                    url: serverPath,
                    fileName: file.name,
                    isServer: true
                });
                showToast('上传成功');
            } else {
                // 如果上传失败，回退到预览模式 (不推荐，但保证用户能选上)
                const reader = new FileReader();
                reader.onload = (event) => {
                    pendingMomentImages.push({
                        url: event.target.result,
                        isServer: false
                    });
                };
                reader.readAsDataURL(file);
                showToast('上传失败，已转为临时离线模式', 'alert-circle');
            }
            renderPendingMomentImages();
            momentImageInput.value = '';
        };
    }

    function renderPendingMomentImages() {
        // 移除所有现有的预览图
        const previews = postMomentImagesContainer.querySelectorAll('.moment-img-preview');
        previews.forEach(p => p.remove());

        // 插入新的预览图
        pendingMomentImages.forEach((imgSrc, index) => {
            const div = document.createElement('div');
            div.className = 'moment-img-preview';
            div.style.cssText = 'aspect-ratio: 1; position: relative; border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; padding: 8px;';

            const isData = imgSrc.startsWith('data:') || imgSrc.startsWith('http');
            if (isData) {
                const img = document.createElement('img');
                img.src = imgSrc;
                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                div.appendChild(img);
            } else {
                const text = document.createElement('div');
                text.textContent = imgSrc;
                text.style.cssText = 'font-size: 10px; color: rgba(255,255,255,0.6); text-align: center; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;';
                div.appendChild(text);
            }

            const deleteBtn = document.createElement('div');
            deleteBtn.innerHTML = '<i data-lucide="x" size="14"></i>';
            deleteBtn.style.cssText = 'position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.5); color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                pendingMomentImages.splice(index, 1);
                renderPendingMomentImages();
            };

            div.appendChild(deleteBtn);

            postMomentImagesContainer.insertBefore(div, addMomentImageBtn);
        });

        // 如果达到9张，隐藏添加按钮
        if (pendingMomentImages.length >= 9) {
            addMomentImageBtn.style.display = 'none';
        } else {
            addMomentImageBtn.style.display = 'flex';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    confirmPostMomentBtn.onclick = () => {
        const content = postMomentText.value.trim();
        if (!content && pendingMomentImages.length === 0) {
            showToast('写点什么或发张照片吧');
            return;
        }

        state.moments.unshift({
            id: 'm' + Date.now(),
            authorId: 'user',
            authorName: state.userName,
            authorAvatar: state.userAvatar,
            content: content,
            images: pendingMomentImages.map(img => img.url),
            imageDetails: [...pendingMomentImages],
            blockedIds: [...blockedIds],
            mentionedIds: [...mentionedIds],
            time: '刚刚',
            likes: [],
            comments: []
        });

        saveMoments();
        postMomentModal.style.display = 'none';
        document.querySelector('.bottom-nav').style.display = 'flex'; // 恢复底栏
        renderMomentsList();
        showToast('发布成功', 'check-circle');
    };

    // 朋友圈返回
    document.getElementById('back-from-moments').onclick = () => {
        switchPage('chat-list');
    };

    // 长按头像触发批量删除 (清空动态)
    const momentsAvatar = document.getElementById('moments-user-avatar');
    let avatarPressTimer;
    const startAvatarPress = () => {
        avatarPressTimer = setTimeout(() => {
            showBulkDeleteSelect();
        }, 800);
    };
    const endAvatarPress = () => clearTimeout(avatarPressTimer);
    if (momentsAvatar) {
        momentsAvatar.onmousedown = startAvatarPress;
        momentsAvatar.onmouseup = endAvatarPress;
        momentsAvatar.ontouchstart = startAvatarPress;
        momentsAvatar.ontouchend = endAvatarPress;
    }

    function showBulkDeleteSelect() {
        // 获取当前朋友圈中所有的作者（去重）
        const authors = [];
        const seenIds = new Set();

        state.moments.forEach(m => {
            if (!seenIds.has(m.authorId)) {
                seenIds.add(m.authorId);
                let displayAvatar = m.authorAvatar;
                if (!displayAvatar) {
                    if (m.authorName === '我' || m.authorName === state.userName || m.authorName === 'user') {
                        displayAvatar = state.userAvatar;
                    } else {
                        const contact = state.contacts.find(c => c.name === m.authorName);
                        displayAvatar = contact ? contact.avatar : 'https://files.catbox.moe/blaehb.jpg';
                    }
                }
                authors.push({
                    id: m.authorId,
                    name: m.authorName,
                    avatar: displayAvatar
                });
            }
        });

        if (authors.length === 0) {
            showToast('朋友圈空空如也', 'info');
            return;
        }

        const modal = document.getElementById('character-select-modal');
        const listEl = document.getElementById('char-select-list');
        const titleEl = document.getElementById('char-select-title');
        const selectAllBtn = document.getElementById('char-select-all');
        const confirmBtn = document.getElementById('confirm-char-select');
        const closeBtn = document.getElementById('close-char-select');
        const hintEl = document.getElementById('char-select-hint');

        titleEl.textContent = '批量删除动态';
        selectAllBtn.checked = false;
        hintEl.style.display = 'none';
        modal.style.display = 'flex';

        let html = '';
        authors.forEach(a => {
            html += `
                <div class="char-select-item" style="display: flex; align-items: center; padding: 10px 20px; gap: 12px; cursor: pointer; transition: background 0.2s;">
                    <input type="checkbox" class="char-checkbox" data-id="${a.id}" data-name="${a.name}" style="width: 18px; height: 18px; cursor: pointer;">
                    <img src="${a.avatar}" referrerpolicy="no-referrer" style="width: 41px; height: 41px; border-radius: 8px; object-fit: cover;">
                    <div style="flex: 1; display: flex; flex-direction: column;">
                        <span style="color: white; font-size: 14px;">${a.name}${a.id === 'user' ? ' (我)' : ''}</span>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;

        // 点击行也可以选中
        listEl.querySelectorAll('.char-select-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = item.querySelector('.char-checkbox');
                    cb.checked = !cb.checked;
                }
            };
        });

        // 全选逻辑
        selectAllBtn.onchange = () => {
            listEl.querySelectorAll('.char-checkbox').forEach(cb => {
                cb.checked = selectAllBtn.checked;
            });
        };

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            closeBtn.onclick = null;
            selectAllBtn.onchange = null;
        };

        confirmBtn.onclick = () => {
            const selectedIds = Array.from(listEl.querySelectorAll('.char-checkbox:checked'))
                .map(cb => cb.dataset.id);

            if (selectedIds.length === 0) {
                cleanup();
                return;
            }

            const selectedNames = Array.from(listEl.querySelectorAll('.char-checkbox:checked'))
                .map(cb => cb.dataset.name);

            showActionSheet([
                {
                    text: `永久删除 ${selectedNames.join('、')} 的所有动态`,
                    danger: true,
                    onClick: () => {
                        state.moments = state.moments.filter(m => !selectedIds.includes(m.authorId));
                        saveMoments();
                        renderMomentsList();
                        showToast('已永久删除选中好友的所有动态');
                        cleanup();
                    }
                }
            ]);
        };

        closeBtn.onclick = () => {
            cleanup();
        };
    }

    function renderContactsList() {
        const contactsList = document.getElementById('contacts-list');
        if (!contactsList) return;
        contactsList.innerHTML = '';

        const tools = [
            {
                name: '群聊', icon: 'users', action: () => {
                    switchPage('groups');
                    renderGroupsList();
                }
            },
            {
                name: '我的好友', icon: 'user', action: () => {
                    switchPage('my-friends');
                    renderMyFriendsList();
                }
            }
        ];

        tools.forEach(t => {
            const item = document.createElement('div');
            item.className = 'contact-item';
            item.innerHTML = `
                <div class="contact-icon-box">
                    <i data-lucide="${t.icon}" size="20"></i>
                </div>
                <span class="contact-name">${t.name}</span>
            `;
            item.onclick = t.action;
            contactsList.appendChild(item);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function renderMyFriendsList() {
        const myFriendsList = document.getElementById('my-friends-list');
        if (!myFriendsList) return;
        myFriendsList.innerHTML = '';

        state.contacts.forEach(c => {
            const item = document.createElement('div');
            item.className = 'contact-item';
            item.innerHTML = `
                <img src="${c.avatar}" referrerpolicy="no-referrer" class="contact-avatar">
                <div style="display: flex; flex-direction: column;">
                    <span class="contact-name">${c.remark || c.name}</span>
                    ${c.status === 'pending' ? '<span style="font-size: 10px; color: #fbbf24;">待确认</span>' : ''}
                </div>
                ${c.status === 'pending' ? `
                    <button class="accept-btn" style="margin-left: auto; background: #10b981; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px;">通过</button>
                ` : ''}
            `;

            if (c.status === 'pending') {
                const acceptBtn = item.querySelector('.accept-btn');
                acceptBtn.onclick = (e) => {
                    e.stopPropagation();
                    c.status = 'added';
                    showToast(`${c.name} 已通过申请`, 'user-check');
                    renderMyFriendsList();
                    renderChatList();
                };
            } else {
                item.onclick = () => openChat(c);
            }
            myFriendsList.appendChild(item);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function openChat(contact) {
        closeAllPanels();
        state.currentChat = contact;
        state.multiSelectMode = false;
        state.selectedMessageIds = [];
        state.quotedMessage = null;

        try {
            sessionStorage.setItem('sillyphone-currentChatId', contact.id);
        } catch (e) { }

        const multiSelectToolbar = document.getElementById('chat-multi-select-toolbar');
        const quotePreview = document.getElementById('chat-quote-preview');
        const inputBar = document.querySelector('.input-bar');

        if (multiSelectToolbar) multiSelectToolbar.style.display = 'none';
        if (quotePreview) quotePreview.style.display = 'none';
        if (inputBar) inputBar.style.display = 'flex';

        // 应用备注名或原名
        let displayName = contact.remark || contact.name;
        if (contact.isGroup && contact.members) {
            displayName += ` (${contact.members.length})`;
        }
        document.getElementById('chat-name').textContent = displayName;

        // 应用局部背景
        const bgLayer = document.getElementById('chat-bg-layer');
        if (contact.chatBg) {
            bgLayer.style.backgroundImage = `url(${contact.chatBg})`;
            bgLayer.style.filter = `blur(${contact.chatBlur || 0}px)`;
            bgLayer.style.opacity = '1';
        } else {
            bgLayer.style.backgroundImage = '';
            bgLayer.style.filter = 'none';
            bgLayer.style.opacity = '0';
        }

        // 查找所属角色信息
        const character = state.characters.find(char => char.id === contact.characterId);
        if (character) {
            state.currentChat.characterRealName = character.realName;
            const account = character.accounts.find(acc => acc.id === contact.id);
            if (account) {
                state.currentChat.accountRole = account.role;
                state.currentChat.accountType = account.type;
            }
        }

        const btnTransferLabel = document.getElementById('btn-transfer-label');
        if (btnTransferLabel) {
            btnTransferLabel.textContent = contact.isGroup ? '红包' : '转账';
        }

        const btnTransferIcon = document.querySelector('#btn-transfer .panel-icon');
        if (btnTransferIcon) {
            btnTransferIcon.innerHTML = `<i data-lucide="${contact.isGroup ? 'gift' : 'banknote'}" size="24"></i>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        checkExpiredMoney(contact.id);
        renderMessages(contact.id);
        switchPage('chat-window');
    }

    function checkExpiredMoney(chatId) {
        if (!state.messages[chatId]) return;
        const now = Date.now();
        const EXPIRE_TIME = 24 * 60 * 60 * 1000; // 24 hours
        let changed = false;
        const sysMsgs = [];

        state.messages[chatId].forEach(m => {
            if ((m.msgType === 'red-packet' || m.msgType === 'transfer') && m.status === 'unreceived') {
                const timestamp = parseInt(m.id.split('_')[1]);
                if (!isNaN(timestamp) && now - timestamp > EXPIRE_TIME) {
                    m.status = 'returned';
                    changed = true;

                    sysMsgs.push({
                        id: 'msg_' + Date.now() + Math.random(),
                        type: 'system',
                        text: m.msgType === 'transfer' ? '转账已过期，已退还' : '红包已过期',
                        time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
                    });
                }
            }
        });

        if (changed) {
            state.messages[chatId].push(...sysMsgs);
            saveMessagesToLocalStorage();
        }
    }

    // --- 语音通话逻辑 ---
    const callOverlay = document.getElementById('call-overlay');
    const callAvatar = document.getElementById('call-avatar');
    callAvatar.onclick = () => {
        triggerAIResponse();
    };
    const callName = document.getElementById('call-name');
    const callStatus = document.getElementById('call-status');
    const callTimer = document.getElementById('call-timer');
    const callTextDisplay = document.getElementById('call-text-display');
    const callInputContainer = document.getElementById('call-input-container');
    const callMsgInput = document.getElementById('call-msg-input');
    const callSendBtn = document.getElementById('call-send-btn');
    const callHangupBtn = document.getElementById('call-hangup-btn');
    const callMuteBtn = document.getElementById('call-mute-btn');
    const callSpeakerBtn = document.getElementById('call-speaker-btn');
    const transcriptModal = document.getElementById('transcript-modal');
    const transcriptContent = document.getElementById('transcript-content');
    const closeTranscriptModal = document.getElementById('close-transcript-modal');

    function startCall(contact, isIncoming = false) {
        state.call.active = true;
        state.call.isIncoming = isIncoming;
        state.call.contact = contact;
        state.call.startTime = null;
        state.call.duration = 0;
        state.call.transcript = [];
        state.call.isMuted = false;
        state.call.isSpeaker = false;

        callAvatar.src = contact.avatar;
        callName.textContent = contact.name;
        callStatus.textContent = isIncoming ? '收到来电...' : '正在呼叫...';
        callTimer.style.display = 'none';
        callTimer.textContent = '00:00';
        callTextDisplay.innerHTML = '';
        callInputContainer.style.display = 'none';

        // 重置按钮状态
        callMuteBtn.classList.remove('active');
        callSpeakerBtn.classList.remove('active');
        callMuteBtn.querySelector('span').textContent = '静音';
        callSpeakerBtn.querySelector('span').textContent = '免提';

        callOverlay.style.display = 'flex';

        // 自动接听
        setTimeout(() => {
            if (state.call.active) {
                acceptCall();
            }
        }, 2000);
    }

    function acceptCall() {
        state.call.startTime = Date.now();
        callStatus.textContent = '通话中';
        callTimer.style.display = 'block';
        callInputContainer.style.display = 'none';

        state.call.timerInterval = setInterval(updateCallTimer, 1000);

        addCallTranscript('系统', '通话已接通');
    }

    function updateCallTimer() {
        if (!state.call.startTime) return;
        const diff = Math.floor((Date.now() - state.call.startTime) / 1000);
        state.call.duration = diff;

        const mins = Math.floor(diff / 60).toString().padStart(2, '0');
        const secs = (diff % 60).toString().padStart(2, '0');
        callTimer.textContent = `${mins}:${secs}`;
    }

    function endCall() {
        if (!state.call.active) return;

        clearInterval(state.call.timerInterval);
        const durationStr = callTimer.textContent;

        // 添加到通话记录
        addCallTranscript('系统', `通话已结束 (${durationStr})`);

        // 发送结束消息
        const chatId = state.call.contact.id;
        const endMsg = {
            msgType: 'call-ended',
            duration: durationStr,
            transcript: [...state.call.transcript],
            text: `语音通话已结束 (${durationStr})`
        };

        // 如果是当前聊天，直接发送
        if (state.currentChat && state.currentChat.id === chatId) {
            sendMessage(endMsg);
        } else {
            // 否则存入对应聊天的消息记录
            if (!state.messages[chatId]) state.messages[chatId] = [];
            state.messages[chatId].push({
                id: 'msg_' + Date.now(),
                type: 'ai', // 对方挂断或系统记录
                senderId: chatId,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                ...endMsg
            });
            saveMessagesToLocalStorage();
        }

        state.call.active = false;
        state.call.startTime = null;

        // 延迟 1 秒关闭，让用户看到结束提示
        setTimeout(() => {
            callOverlay.style.display = 'none';
            showToast(`通话结束，时长 ${durationStr}`);
        }, 1000);
    }

    function addCallTranscript(sender, text) {
        const time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
        state.call.transcript.push({ sender, text, time });
        renderCallTranscript();
    }

    function renderCallTranscript() {
        callTextDisplay.innerHTML = '';
        state.call.transcript.forEach(item => {
            const line = document.createElement('div');
            line.className = 'transcript-line';
            line.innerHTML = `<span class="name">${item.sender}:</span> <span class="text">${item.text}</span>`;
            callTextDisplay.appendChild(line);
        });

        // 确保滚动到最底部
        setTimeout(() => {
            callTextDisplay.scrollTop = callTextDisplay.scrollHeight;
        }, 50);
    }

    function showTranscript(transcript) {
        transcriptContent.innerHTML = '';
        if (transcript.length === 0) {
            transcriptContent.innerHTML = '<div style="text-align:center; opacity:0.5; padding:20px;">暂无通话记录</div>';
        } else {
            transcript.forEach(item => {
                const line = document.createElement('div');
                line.style.marginBottom = '10px';
                line.innerHTML = `
                    <div style="font-weight:600; font-size:11px; color:rgba(255,255,255,0.4);">${item.time} ${item.sender}</div>
                    <div style="margin-top:2px;">${item.text}</div>
                `;
                transcriptContent.appendChild(line);
            });
        }
        transcriptModal.style.display = 'flex';
    }

    callHangupBtn.onclick = endCall;

    callSendBtn.onclick = () => {
        const text = callMsgInput.value.trim();
        if (!text) return;

        // 同时作为普通消息发送（同步给 AI，但不自动触发响应）
        // sendMessage 内部已经处理了通话记录的添加
        sendMessage({ text, isSilent: true, noTrigger: true });

        callMsgInput.value = '';
    };

    callMsgInput.onkeypress = (e) => {
        if (e.key === 'Enter') callSendBtn.click();
    };

    callMuteBtn.onclick = () => {
        state.call.isMuted = !state.call.isMuted;
        callMuteBtn.classList.toggle('active', state.call.isMuted);
        callMuteBtn.querySelector('span').textContent = state.call.isMuted ? '取消静音' : '静音';
        showToast(state.call.isMuted ? '已静音' : '麦克风已开启');
    };

    callSpeakerBtn.onclick = () => {
        state.call.isSpeaker = !state.call.isSpeaker;
        callSpeakerBtn.classList.toggle('active', state.call.isSpeaker);
        callSpeakerBtn.querySelector('span').textContent = state.call.isSpeaker ? '关闭免提' : '免提';

        // 免提开启时显示输入框，关闭时隐藏
        callInputContainer.style.display = state.call.isSpeaker ? 'flex' : 'none';

        showToast(state.call.isSpeaker ? '免提已开启' : '免提已关闭');
    };

    closeTranscriptModal.onclick = () => {
        transcriptModal.style.display = 'none';
    };

    // 绑定顶部电话按钮
    document.getElementById('chat-call-btn').onclick = () => {
        if (!state.currentChat) return;
        startCall(state.currentChat);
    };

    // 绑定面板电话按钮
    document.getElementById('btn-voice-call').onclick = () => {
        if (!state.currentChat) return;
        startCall(state.currentChat);
    };

    document.getElementById('btn-video-call').onclick = () => {
        showToast('视频通话功能开发中...', 'video');
    };

    function setIslandState(status, text) {
        const chatName = document.getElementById('chat-name');
        const callAvatar = document.getElementById('call-avatar');

        // 重置状态
        island.classList.remove('active', 'notification');
        islandText.style.color = '';
        if (callAvatar) callAvatar.classList.remove('responding');

        if (status === 'loading') {
            island.classList.add('active');
            islandText.textContent = '...';
            if (callAvatar) callAvatar.classList.add('responding');
            if (state.currentChat) {
                chatName.textContent = '对方正在输入...';
            }
        } else if (status === 'notification') {
            island.classList.add('notification');
            islandText.textContent = text;
        } else {
            islandText.textContent = '';
            if (state.currentChat) {
                chatName.textContent = state.currentChat.remark || state.currentChat.name;
            }
        }
    }

    function triggerFriendApprovalNotification(req) {
        // 3-5 秒后自动通过
        setTimeout(() => {
            // 角色自动通过验证
            req.status = 'added';

            // 添加到联系人列表
            if (!state.contacts.find(c => c.id === req.id)) {
                state.contacts.push({
                    id: req.id,
                    characterId: req.characterId,
                    name: req.name,
                    avatar: req.avatar,
                    status: 'added',
                    type: req.type,
                    time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                    lastMsg: '我们已经是好友了，开始聊天吧！'
                });
            }

            pendingApproval = req;
            setIslandState('notification', `${req.name} 已通过验证`);

            // 刷新列表显示状态
            renderContactsList();
            renderChatList();
            if (state.currentPage === 'my-friends') renderMyFriendsList();
            saveStateToLocalStorage();

            // 8秒后自动消失
            setTimeout(() => {
                if (pendingApproval === req) {
                    setIslandState('default');
                    pendingApproval = null;
                }
            }, 8000);
        }, 3000 + Math.random() * 2000);
    }

    function handleIslandClick() {
        // 如果是审批通知，点击进入聊天
        if (pendingApproval) {
            const res = pendingApproval;
            const contact = state.contacts.find(c => c.id === res.id);

            setIslandState('default');
            pendingApproval = null;

            if (contact) {
                openChat(contact);
            }
            return;
        }

        // 如果正在请求 AI，再次点击则取消响应
        if (isAIRequestPending) {
            isAIRequestPending = false;
            setIslandState('default');
            showToast('已取消响应', 'x');

            // 尝试停止酒馆生成
            const st = getSTInterface();
            if (st.executeSlashCommands) {
                st.executeSlashCommands('/stop');
            }
            return;
        }

        // 上帝视角下的灵动岛交互：触发群内角色随机对话
        if (state.currentPage === 'chat-window' && state.currentChat && state.currentChat.isGroup && state.currentChat.godMode) {
            triggerAIResponse("[系统指令：请让群里的角色进行随机对话，模拟角色之间的互动。不要带括号，直接输出对话内容。]");
            return;
        }

        // 普通聊天界面：手动触发 AI 回复
        if (state.currentPage === 'chat-window' && state.currentChat) {
            triggerAIResponse();
            return;
        }

        if (state.currentPage === 'moments') {
            // 在朋友圈页面点击灵动岛：触发发布新动态或互动
            showCharacterSelect('选择发朋友圈角色', (targetNames) => {
                if (targetNames === null) return; // 取消

                let promptText = '';
                if (targetNames.trim() === '') {
                    promptText = "[系统提示: 用户在朋友圈页面点击了灵动岛] 请从当前联系人中随机挑选 1 到 2 个角色，发布一条符合他们人设的新朋友圈动态。发布动态后，请随机挑选 1 到 3 个其他角色（必须是不同的角色，绝对不能是“我”或“{{user}}”）在动态下方发表评论。接着，让发布动态的角色根据性格，选择性地回复其中 1 到 2 条评论，模拟真实的朋友圈互动。";
                } else {
                    const names = targetNames.trim().split(/\s+/).join('】和【');
                    promptText = `[系统提示: 用户在朋友圈页面点击了灵动岛] 请指定由【${names}】分别发布一条符合他们人设的新朋友圈动态。发布动态后，请随机挑选 1 到 3 个其他角色（必须是不同的角色，绝对不能是“我”或“{{user}}”）在动态下方发表评论。接着，让发布动态的角色根据性格，选择性地回复其中 1 到 2 条评论，模拟真实的朋友圈互动。`;
                }

                triggerAIResponse(promptText);
            }, 'friends'); // 只允许好友发朋友圈
        } else {
            // 在其他页面点击：触发通用 AI 响应
            triggerAIResponse();
        }
    }

    function closeAllPanels() {
        chatPanels.forEach(p => p.classList.remove('active'));
    }

    function togglePanel(panel) {
        const isActive = panel.classList.contains('active');
        closeAllPanels();
        if (!isActive) panel.classList.add('active');
    }

    function handleMoneyBubbleClick(m, chatId) {
        const isUser = m.senderId === 'user';
        const isTransfer = m.msgType === 'transfer';
        const isGroup = state.currentChat.isGroup;

        if (isTransfer) {
            // 转账逻辑
            if (isUser) {
                // 自己发的转账
                if (m.status === 'received') {
                    showToast('对方已收款', 'check-circle');
                } else if (m.status === 'returned') {
                    showToast('对方已退还', 'corner-up-left');
                } else {
                    showToast('等待对方收款', 'clock');
                }
            } else {
                // 别人发的转账
                if (m.status === 'received') {
                    showToast('你已收款', 'check-circle');
                } else if (m.status === 'returned') {
                    showToast('你已退还', 'corner-up-left');
                } else {
                    // 弹出确认收款/退还弹窗
                    showTransferActionModal(m, chatId);
                }
            }
        } else {
            // 红包逻辑
            const hasGrabbed = m.grabRecords && m.grabRecords.find(r => r.id === 'user');
            if (m.status === 'received' || m.status === 'empty' || hasGrabbed || isUser) {
                // 已经领过或者领完了，或者是自己发的，查看详情
                showRedPacketDetailsModal(m, chatId);
            } else if (m.status === 'returned') {
                showToast('红包已退回', 'corner-up-left');
            } else {
                // 还没领，显示详情页，用户可以手动点击“抢红包”按钮
                showRedPacketDetailsModal(m, chatId);
            }
        }
    }

    function showTransferActionModal(m, chatId) {
        const modal = document.getElementById('modal-transfer-action');
        const amountEl = document.getElementById('transfer-action-amount');
        const remarkEl = document.getElementById('transfer-action-remark');
        const receiveBtn = document.getElementById('btn-accept-transfer');
        const returnBtn = document.getElementById('btn-return-transfer');

        amountEl.textContent = `¥${m.amount}`;
        remarkEl.textContent = m.remark || '转账给你';

        modal.style.display = 'flex';

        const closeModal = () => modal.style.display = 'none';

        receiveBtn.onclick = () => {
            m.status = 'received';
            const receiveMsg = {
                id: 'msg_' + Date.now(),
                type: 'user',
                senderId: 'user',
                senderName: state.userName,
                senderAvatar: state.userAvatar,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                msgType: 'transfer',
                text: `收账${m.amount}元`,
                amount: m.amount,
                remark: '已收款',
                status: 'received'
            };
            state.messages[chatId].push(receiveMsg);
            saveMessagesToLocalStorage();
            renderMessages(chatId);
            closeModal();
            deferredSync();
        };

        returnBtn.onclick = () => {
            m.status = 'returned';
            const returnMsg = {
                id: 'msg_' + Date.now(),
                type: 'user',
                senderId: 'user',
                senderName: state.userName,
                senderAvatar: state.userAvatar,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
                msgType: 'transfer',
                text: `已退回收账`,
                amount: m.amount,
                remark: '已退还',
                status: 'returned'
            };
            state.messages[chatId].push(returnMsg);
            saveMessagesToLocalStorage();
            renderMessages(chatId);
            closeModal();
            deferredSync();
        };
    }

    function grabRedPacket(m, chatId, grabberId) {
        // 初始化红包领取记录
        if (!m.grabRecords) {
            m.grabRecords = [];
            m.remainingAmount = parseFloat(m.amount);
            m.remainingCount = parseInt(m.count) || 1;
        }

        // 检查是否已经领过
        if (m.grabRecords.find(r => r.id === grabberId)) {
            if (grabberId === 'user') showToast('你已经领取过这个红包了', 'info');
            return;
        }

        // 检查是否还有剩余
        if (m.remainingCount <= 0) {
            if (grabberId === 'user') showToast('手慢了，红包派完了', 'frown');
            m.status = 'empty';
            saveMessagesToLocalStorage();
            renderMessages(chatId);
            return;
        }

        let grabAmount = 0;
        if (m.remainingCount === 1) {
            grabAmount = m.remainingAmount;
        } else {
            // 二倍均值法，同时保证剩下的人至少能拿到 0.01
            const maxSafe = m.remainingAmount - 0.01 * (m.remainingCount - 1);
            const average = m.remainingAmount / m.remainingCount;
            const max = Math.min(maxSafe, average * 2);

            grabAmount = Math.random() * max;
            grabAmount = Math.max(0.01, grabAmount); // 至少0.01
            grabAmount = parseFloat(grabAmount.toFixed(2));
        }

        m.remainingAmount = parseFloat((m.remainingAmount - grabAmount).toFixed(2));
        m.remainingCount--;

        const grabberName = grabberId === 'user' ? '你' : (state.currentChat.members.find(mem => mem.id === grabberId)?.name || '某人');

        m.grabRecords.push({
            id: grabberId,
            name: grabberName,
            amount: grabAmount,
            time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
        });

        // 如果是用户领的，或者红包被领完了，更新状态并添加系统消息
        if (grabberId === 'user') {
            m.status = m.remainingCount === 0 ? 'empty' : 'received';
            const senderName = m.senderId === 'user' ? '自己' : (state.currentChat.isGroup ? (state.currentChat.members.find(mem => mem.id === m.senderId)?.name || '对方') : state.currentChat.name);
            const sysMsg = {
                id: 'msg_' + Date.now(),
                type: 'system',
                text: `你领取了${senderName}的红包`,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
            };
            state.messages[chatId].push(sysMsg);
            showRedPacketDetailsModal(m, chatId);
        } else {
            // AI 领取了红包
            const senderName = m.senderId === 'user' ? '你' : (state.currentChat.isGroup ? (state.currentChat.members.find(mem => mem.id === m.senderId)?.name || '某人') : state.currentChat.name);
            const sysMsg = {
                id: 'msg_' + Date.now(),
                type: 'system',
                text: `${grabberName}领取了${senderName}的红包`,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
            };
            state.messages[chatId].push(sysMsg);

            if (m.remainingCount === 0) {
                m.status = 'empty';
                if (m.senderId === 'user') {
                    const sysMsg2 = {
                        id: 'msg_' + Date.now() + 1,
                        type: 'system',
                        text: `你的红包已被领完`,
                        time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
                    };
                    state.messages[chatId].push(sysMsg2);
                }
            }

            // AI 领取红包后的反应
            setTimeout(() => {
                const average = parseFloat(m.amount) / parseInt(m.count);
                const prompt = `[系统指令：角色 ${grabberName} 刚才领取了红包，金额为 ${grabAmount} 元（平均金额为 ${average} 元）。请发表一句符合人设的简短感言。直接输出内容，不要带括号。]`;
                triggerAIResponse(prompt, grabberId, chatId);
            }, 1000);
        }

        saveMessagesToLocalStorage();
        renderMessages(chatId);
    }

    function showRedPacketDetailsModal(m, chatId) {
        const modal = document.getElementById('modal-redpacket-details');
        const listEl = document.getElementById('rp-detail-list');
        const closeBtn = document.getElementById('btn-close-redpacket');
        const senderNameEl = document.getElementById('rp-detail-sender');
        const remarkEl = document.getElementById('rp-detail-remark');
        const statusEl = document.getElementById('rp-detail-status');
        const myAmountContainer = document.getElementById('rp-detail-my-amount-container');
        const myAmountEl = document.getElementById('rp-detail-my-amount');

        const senderName = m.senderId === 'user' ? '你' : (state.currentChat.isGroup ? (state.currentChat.members.find(mem => mem.id === m.senderId)?.name || '对方') : state.currentChat.name);
        senderNameEl.textContent = `${senderName}的红包`;
        remarkEl.textContent = m.remark || '恭喜发财，大吉大利';

        const avatarEl = document.getElementById('rp-detail-avatar');
        if (avatarEl) {
            if (m.senderId === 'user') {
                avatarEl.src = state.userAvatar;
            } else if (state.currentChat.isGroup) {
                const member = state.currentChat.members.find(mem => mem.id === m.senderId);
                avatarEl.src = member ? member.avatar : state.currentChat.avatar;
            } else {
                avatarEl.src = state.currentChat.avatar;
            }
        }

        const totalCount = parseInt(m.count) || 1;
        const grabbedCount = m.grabRecords ? m.grabRecords.length : 0;

        if (m.status === 'returned') {
            statusEl.textContent = '该红包已超过24小时。如已领取，可在红包记录中查看。';
        } else if (m.targetId && m.targetId !== 'all' && m.targetId !== 'user' && grabbedCount === 0) {
            const targetName = state.currentChat.members ? (state.currentChat.members.find(mem => mem.id === m.targetId)?.name || '专属') : '专属';
            statusEl.textContent = `该红包仅限 ${targetName} 领取`;
        } else {
            statusEl.textContent = `已领取 ${grabbedCount}/${totalCount} 个`;
        }

        listEl.innerHTML = '';

        const myRecord = m.grabRecords ? m.grabRecords.find(r => r.id === 'user') : null;
        const grabBtnContainer = document.getElementById('rp-detail-grab-btn-container');
        const grabBtn = document.getElementById('rp-detail-grab-btn');
        const remainingCount = m.remainingCount !== undefined ? m.remainingCount : totalCount;

        if (myRecord) {
            myAmountContainer.style.display = 'block';
            myAmountEl.textContent = myRecord.amount.toFixed(2);
            grabBtnContainer.style.display = 'none';
        } else {
            myAmountContainer.style.display = 'none';
            // 如果还没领，且红包未领完、未过期，且（不是专属红包或者专属红包是发给自己的），则显示抢红包按钮
            if (m.status === 'unreceived' && remainingCount > 0 && (!m.targetId || m.targetId === 'all' || m.targetId === 'user')) {
                grabBtnContainer.style.display = 'block';
                grabBtn.onclick = () => {
                    grabRedPacket(m, chatId, 'user');
                    modal.style.display = 'none';
                };
            } else {
                grabBtnContainer.style.display = 'none';
            }
        }

        if (m.grabRecords && m.grabRecords.length > 0) {
            // 找出最佳手气
            let bestAmount = 0;
            let bestId = null;
            if (m.remainingCount === 0 && totalCount > 1) {
                m.grabRecords.forEach(r => {
                    if (r.amount > bestAmount) {
                        bestAmount = r.amount;
                        bestId = r.id;
                    }
                });
            }

            m.grabRecords.forEach(r => {
                const isBest = r.id === bestId;
                listEl.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; color: white;">
                        <div>
                            <div style="font-size: 14px;">${r.name}</div>
                            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">${r.time}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 16px;">${r.amount.toFixed(2)}元</div>
                            ${isBest ? '<div style="font-size: 12px; color: rgba(255, 180, 60, 1);"><i data-lucide="crown" size="12" style="margin-right: 2px;"></i>手气最佳</div>' : ''}
                        </div>
                    </div>
                `;
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            listEl.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); padding: 20px;">暂无领取记录</div>';
        }

        modal.style.display = 'flex';

        closeBtn.onclick = () => modal.style.display = 'none';
    }

    function renderMessages(chatId) {
        let msgs = state.messages[chatId] || [];
        let hasChanges = false;
        const now = Date.now();
        const newSysMsgs = [];

        // 预处理：将收款/退回消息与之前的转账消息关联，避免被错误标记为过期
        for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (m.msgType === 'transfer' && (m.status === 'received' || m.status === 'returned')) {
                // 往前找最近的一个未收款的转账消息
                for (let j = i - 1; j >= 0; j--) {
                    const prevMsg = msgs[j];
                    if (prevMsg.msgType === 'transfer' && prevMsg.status === 'unreceived' && prevMsg.senderId !== m.senderId) {
                        prevMsg.status = m.status;
                        if (!m.amount || m.amount === "0.00") {
                            m.amount = prevMsg.amount;
                        }
                        hasChanges = true;
                        break;
                    }
                }
            }
        }

        // 移除过期红包/转账 (24小时自动退款) 逻辑，由用户手动控制状态。


        if (hasChanges) {
            msgs = msgs.concat(newSysMsgs);
            state.messages[chatId] = msgs;
            saveMessagesToLocalStorage();
        }

        messagesContainer.innerHTML = '';
        lastSenderId = null;
        let historyDividerShown = false;

        msgs.forEach((m, index) => {
            if (m.isTypingPending) return; // 跳过打字队列中的消息
            if (m.isSilent) return; // 跳过静默消息（通话消息等）

            // 插入历史记录分割线
            if (!m.isHistory && !historyDividerShown && index > 0 && msgs[index - 1].isHistory) {
                const divider = document.createElement('div');
                divider.className = 'history-divider';
                divider.innerHTML = '<span>以上为历史记录</span>';
                messagesContainer.appendChild(divider);
                historyDividerShown = true;
                lastSenderId = null; // 分割线后重新显示头像
            }

            const wrapper = document.createElement('div');
            const isUser = m.type === 'user';

            // 处理撤回消息：显示为居中的系统消息
            if (m.isRecalled) {
                const sysWrapper = document.createElement('div');
                sysWrapper.className = 'system-msg-wrapper';
                const sysMsg = document.createElement('div');
                sysMsg.className = 'system-msg';
                const senderName = m.senderId === 'user' ? '你' : (state.currentChat.isGroup ? (state.currentChat.members.find(mem => mem.id === m.senderId)?.name || '对方') : state.currentChat.name);
                sysMsg.innerHTML = `<span>${senderName} 撤回了一条消息</span>`;

                // 上帝视角：点击非用户撤回的消息查看内容
                if (m.senderId !== 'user') {
                    sysMsg.style.cursor = 'pointer';
                    sysMsg.title = '点击查看撤回内容 (上帝视角)';
                    sysMsg.onclick = () => {
                        let content = m.text || '';
                        if (m.msgType === 'photo') content = `[图片] ${m.url || m.description || ''}`;
                        if (m.msgType === 'voice') content = `[语音] ${m.text || ''}`;
                        if (m.msgType === 'sticker') content = `[表情包] ${m.url || ''}`;

                        if (sysMsg.dataset.revealed === 'true') {
                            sysMsg.innerHTML = `<span>${senderName} 撤回了一条消息</span>`;
                            sysMsg.dataset.revealed = 'false';
                        } else {
                            sysMsg.innerHTML = `<span>${senderName} 撤回的内容：<br/><span style="opacity: 0.8; font-style: italic; word-break: break-all;">${content}</span></span>`;
                            sysMsg.dataset.revealed = 'true';
                        }
                    };
                }

                // 如果是用户撤回的文本消息，提供“重新编辑”
                if (m.senderId === 'user' && (!m.msgType || m.msgType === 'voice')) {
                    const editLink = document.createElement('span');
                    editLink.className = 'edit-link';
                    editLink.textContent = '重新编辑';
                    editLink.onclick = () => {
                        msgInput.value = m.text;
                        msgInput.focus();
                    };
                    sysMsg.appendChild(editLink);
                }

                sysWrapper.appendChild(sysMsg);
                messagesContainer.appendChild(sysWrapper);
                lastSenderId = null; // 撤回消息后，下一个消息需要显示头像
                return;
            }

            // 处理通用系统消息
            if (m.type === 'system') {
                const sysWrapper = document.createElement('div');
                sysWrapper.className = 'system-msg-wrapper';
                const sysMsg = document.createElement('div');
                sysMsg.className = 'system-msg';
                sysMsg.innerHTML = `<span>${m.text}</span>`;
                sysWrapper.appendChild(sysMsg);
                messagesContainer.appendChild(sysWrapper);
                lastSenderId = null;
                return;
            }

            wrapper.className = `message-wrapper ${isUser ? 'user' : 'ai'}`;

            const avatar = document.createElement('img');
            avatar.className = 'msg-avatar';
            avatar.referrerPolicy = 'no-referrer';

            if (isUser) {
                avatar.src = m.senderAvatar || m.avatar || state.userAvatar || 'https://files.catbox.moe/blaehb.jpg';
            } else if (state.currentChat.isGroup) {
                // 群聊中根据 senderId 找头像
                const member = state.currentChat.members.find(mem => mem.id === (m.senderId || m.sender));
                avatar.src = (member ? member.avatar : null) || m.avatar || state.currentChat.avatar || 'https://files.catbox.moe/blaehb.jpg';
            } else {
                // 使用当前聊天的头像 (可能已被修改)
                avatar.src = state.currentChat.avatar || m.avatar || 'https://files.catbox.moe/blaehb.jpg';
            }
            wrapper.appendChild(avatar);

            const bubbleContainer = document.createElement('div');
            bubbleContainer.className = 'bubble-container';

            // 群聊显示发送者名字
            if (state.currentChat.isGroup && !isUser) {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'msg-sender-name';
                const member = state.currentChat.members.find(mem => mem.id === m.senderId);
                nameSpan.textContent = member ? member.name : '未知';
                bubbleContainer.appendChild(nameSpan);
            }

            const div = document.createElement('div');
            div.className = `bubble ${isUser ? 'user' : 'ai'} ${m.msgType || ''}`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'bubble-content';

            if (m.msgType === 'photo' || m.msgType === 'image') {
                const isImageSource = m.url && (m.url.startsWith('http') || m.url.startsWith('data:image') || m.url.startsWith('IMGDATA:'));
                if (isImageSource || m.serverPath) {
                    let displayUrl = m.url || m.serverPath;
                    if (displayUrl && displayUrl.startsWith('IMGDATA:')) {
                        // 转换 ST 内部路径为 API 接口
                        displayUrl = `/api/images/get?path=${encodeURIComponent(displayUrl.replace('IMGDATA:', ''))}`;
                    }
                    contentDiv.innerHTML = `
                        <div class="sticker-content">
                            <img src="${displayUrl}" referrerpolicy="no-referrer" class="sticker-img" style="border-radius: 8px; max-width: 200px; cursor: pointer;" onclick="if(this.src.includes('/api/images/get')) window.open(this.src, '_blank')">
                        </div>
                    `;
                } else {
                    contentDiv.innerHTML = formatContent(`(IMG:${m.description || m.url || m.content || '一张照片'})`);
                }
            } else if (m.msgType === 'sticker') {
                let displayUrl = m.url;
                // 增强匹配逻辑：优先全匹配标签，再匹配文件名
                if (displayUrl && !displayUrl.startsWith('http')) {
                    let foundUrl = null;
                    // 第一遍：全匹配标签
                    for (const catName in state.stickers) {
                        const cat = state.stickers[catName];
                        const found = cat.items.find(s => s.label === displayUrl);
                        if (found) {
                            foundUrl = found.url;
                            break;
                        }
                    }
                    // 第二遍：模糊匹配（包含标签或文件名）
                    if (!foundUrl) {
                        for (const catName in state.stickers) {
                            const cat = state.stickers[catName];
                            const found = cat.items.find(s =>
                                (s.url && displayUrl.includes(s.url.split('/').pop())) ||
                                (s.label && displayUrl.includes(s.label))
                            );
                            if (found) {
                                foundUrl = found.url;
                                break;
                            }
                        }
                    }

                    if (foundUrl) {
                        displayUrl = foundUrl;
                    } else {
                        const match = displayUrl.match(/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/);
                        if (match) {
                            displayUrl = 'https://files.catbox.moe/' + match[0];
                        }
                    }
                }
                const safeUrlText = (m.url || '').replace(/'/g, "\\'").replace(/"/g, "&quot;");
                contentDiv.innerHTML = `
                    <div class="sticker-content">
                        <img src="${displayUrl}" referrerpolicy="no-referrer" class="sticker-img" onerror="this.outerHTML='<div style=\\'padding: 8px; color: #888; font-style: italic; font-size: 12px;\\'>[表情包: ${safeUrlText}]</div>'">
                    </div>
                `;
            } else if (m.msgType === 'voice') {
                const calculatedDuration = Math.max(1, Math.ceil((m.text || '').length / 4));
                const durationVal = parseInt(m.duration) || calculatedDuration || 5;
                const bubbleWidth = Math.min(240, 80 + durationVal * 5); // 根据时长动态计算宽度
                div.style.minWidth = bubbleWidth + 'px';

                contentDiv.innerHTML = `
                    <div class="voice-bar">
                        <div class="voice-wave"></div>
                        <span>${durationVal}"</span>
                    </div>
                    <div class="voice-text">${formatContent(m.text)}</div>
                `;
                div.onclick = (e) => {
                    e.stopPropagation();
                    div.classList.toggle('expanded');
                };
            } else if (m.msgType === 'transfer' || m.msgType === 'red-packet') {
                const isTransfer = m.msgType === 'transfer';
                const isReceived = m.status === 'received';
                const isReturned = m.status === 'returned';
                const isEmpty = m.status === 'empty';

                if (isReceived || isReturned || isEmpty) {
                    div.classList.add('received');
                }

                let iconName = isTransfer ? 'arrow-right-left' : 'gift';
                if (isReceived || isEmpty) {
                    iconName = 'check';
                }
                if (isReturned) {
                    iconName = 'corner-up-left';
                }

                let iconColor = 'white';
                if (isReceived || isReturned || isEmpty) {
                    iconColor = 'rgba(255, 255, 255, 0.6)';
                }

                let titleText = isTransfer ? `¥${m.amount}` : m.remark;
                let subText = isTransfer ? m.remark : '点击领取';

                if (isTransfer) {
                    if (isReceived) subText = '已收款';
                    if (isReturned) subText = '已退还';
                } else {
                    if (isReceived) subText = '已被领取';
                    if (isEmpty) subText = '已被领完';
                    if (isReturned) subText = '已退回';
                }

                contentDiv.innerHTML = `
                    <div class="transfer-card">
                        <div class="transfer-top">
                            <div class="transfer-icon">
                                <i data-lucide="${iconName}" size="20" color="${iconColor}"></i>
                            </div>
                            <div class="transfer-info">
                                <span class="transfer-amount">${titleText}</span>
                                <span class="transfer-remark">${subText}</span>
                            </div>
                        </div>
                        <div class="transfer-bottom">
                            ${isTransfer ? '微信转账' : '微信红包'}
                        </div>
                    </div>
                `;

                div.onclick = (e) => {
                    e.stopPropagation();
                    if (state.multiSelectMode) return;
                    handleMoneyBubbleClick(m, chatId);
                };
            } else if (m.msgType === 'call-ended') {
                contentDiv.innerHTML = `
                    <div class="call-ended-bubble">
                        <i data-lucide="phone" size="16"></i>
                        <span>语音通话已结束 (${m.duration || '00:00'})</span>
                    </div>
                `;
                div.onclick = (e) => {
                    e.stopPropagation();
                    if (state.multiSelectMode) return;
                    showTranscript(m.transcript || []);
                };
            } else if (m.msgType === 'call-missed' || m.type === 'call-missed') {
                const missReason = (m.text || m.content || '').trim();
                contentDiv.innerHTML = `
                    <div class="call-ended-bubble">
                        <i data-lucide="phone-missed" size="16"></i>
                        <span>语音未接听${missReason ? ` (${missReason})` : ''}</span>
                    </div>
                `;
            } else {
                contentDiv.innerHTML = formatContent(m.text || m.content || '');
            }
            div.appendChild(contentDiv);

            // 长按消息菜单
            let pressTimer;
            const startPress = (e) => {
                if (state.multiSelectMode) return;
                pressTimer = setTimeout(() => {
                    const options = [
                        { text: '引用', onClick: () => quoteMessage(chatId, index) }
                    ];

                    if (isUser && !m.isRecalled) {
                        options.push({ text: '撤回', onClick: () => recallMessage(chatId, index) });
                        if (!m.msgType || m.msgType === 'voice') {
                            options.push({ text: '编辑', onClick: () => openEditMessageModal(chatId, index) });
                        }
                    }

                    options.push({ text: '删除', danger: true, onClick: () => deleteMessage(chatId, index) });
                    options.push({ text: '多选', onClick: () => enableMultiSelect(chatId, index) });

                    showActionSheet(options);
                }, 600);
            };
            const handleEndPress = () => clearTimeout(pressTimer);

            div.onmousedown = startPress;
            div.onmouseup = handleEndPress;
            div.ontouchstart = startPress;
            div.ontouchend = handleEndPress;

            // 多选模式点击逻辑
            if (state.multiSelectMode) {
                wrapper.classList.add('multi-select-mode');
                const msgId = m.id || `msg_${index}`;
                if (state.selectedMessageIds.includes(msgId)) {
                    wrapper.classList.add('selected');
                }
                wrapper.onclick = () => {
                    const idx = state.selectedMessageIds.indexOf(msgId);
                    if (idx > -1) {
                        state.selectedMessageIds.splice(idx, 1);
                    } else {
                        state.selectedMessageIds.push(msgId);
                    }
                    updateMultiSelectToolbar();
                    renderMessages(chatId);
                };
            }

            bubbleContainer.appendChild(div);

            // 处理引用显示 (微信风格：放在气泡下方)
            if (m.quotedMsg || (m.type === 'quote' && m.quote)) {
                const quoteDiv = document.createElement('div');
                quoteDiv.className = 'quoted-msg-container';
                if (m.quotedMsg) {
                    quoteDiv.textContent = `${m.quotedMsg.senderName}：${m.quotedMsg.text}`;
                } else {
                    quoteDiv.textContent = m.quote;
                }
                bubbleContainer.appendChild(quoteDiv);
            }

            wrapper.appendChild(bubbleContainer);
            messagesContainer.appendChild(wrapper);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    window.processTypingQueue = function () {
        if (!state.typingQueue || state.typingQueue.length === 0) {
            state.isTypingNow = false;
            if (typeof isAIRequestPending !== 'undefined' && !isAIRequestPending) {
                setIslandState('default');
            }
            return;
        }

        setIslandState('loading');

        if (state.isTypingNow) return;

        const nextMsg = state.typingQueue[0];
        if (!nextMsg) return;

        state.isTypingNow = true;

        if (state.currentChat) renderMessages(state.currentChat.id);

        let delay = 1500;
        if (nextMsg.msgType === 'voice' && nextMsg.duration) {
            delay = Math.min(nextMsg.duration * 1000, 5000) + 500;
        } else if (nextMsg.text) {
            delay = Math.max(1000, Math.min(nextMsg.text.length * 100, 4000));
        } else if (nextMsg.msgType === 'photo' || nextMsg.msgType === 'sticker') {
            delay = 2000;
        }
        delay += Math.floor(Math.random() * 500);

        setTimeout(() => {
            nextMsg.isTypingPending = false;
            state.typingQueue.shift();
            state.isTypingNow = false;

            saveMessagesToLocalStorage();

            if (state.currentChat) renderMessages(state.currentChat.id);

            window.processTypingQueue();
        }, delay);
    };

    let currentEditingMsg = null;
    function openEditMessageModal(chatId, msgIndex) {
        const msg = state.messages[chatId][msgIndex];
        if (msg.msgType && msg.msgType !== 'voice') return; // 只允许编辑文本和语音翻译文本

        currentEditingMsg = { chatId, msgIndex };
        const modal = document.getElementById('edit-message-modal');
        const input = document.getElementById('edit-message-input');
        input.value = msg.text || '';
        modal.style.display = 'flex';
    }

    function saveEditMessage() {
        if (!currentEditingMsg) return;
        const { chatId, msgIndex } = currentEditingMsg;
        const input = document.getElementById('edit-message-input');
        const newText = input.value.trim();

        state.messages[chatId][msgIndex].text = newText;
        saveMessagesToLocalStorage();

        document.getElementById('edit-message-modal').style.display = 'none';
        renderMessages(chatId);
        showToast('修改已保存');
    }

    function quoteMessage(chatId, index) {
        const msg = state.messages[chatId][index];
        state.quotedMessage = {
            id: msg.id || `msg_${index}`,
            text: msg.msgType === 'photo' ? '[图片]' : (msg.msgType === 'sticker' ? '[表情]' : msg.text),
            senderName: msg.senderId === 'user' ? '我' : (state.currentChat.isGroup ? (state.currentChat.members.find(m => m.id === msg.senderId)?.name || '未知') : state.currentChat.name)
        };
        updateQuotePreview();
    }

    function updateQuotePreview() {
        const preview = document.getElementById('chat-quote-preview');
        const text = document.getElementById('quote-text');
        if (state.quotedMessage) {
            text.textContent = `${state.quotedMessage.senderName}: ${state.quotedMessage.text}`;
            preview.style.display = 'flex';
        } else {
            preview.style.display = 'none';
        }
    }

    document.getElementById('cancel-quote').onclick = () => {
        state.quotedMessage = null;
        updateQuotePreview();
    };

    function recallMessage(chatId, index) {
        state.messages[chatId][index].isRecalled = true;
        saveMessagesToLocalStorage();
        renderMessages(chatId);
        showToast('已撤回消息');
    }

    function removeMessagesFromRawCode(messagesToRemove) {
        if (!messagesToRemove || messagesToRemove.length === 0) return;

        const st = getSTInterface();
        if (!st.getChatMessages || !st.setChatMessages) return;

        // Group messages by sourceMsgId
        const messagesBySource = {};
        messagesToRemove.forEach(msg => {
            if (msg.isHistory && msg.sourceMsgId !== undefined) {
                if (!messagesBySource[msg.sourceMsgId]) {
                    messagesBySource[msg.sourceMsgId] = [];
                }
                messagesBySource[msg.sourceMsgId].push(msg);
            }
        });

        // Update each source message
        const updates = [];
        for (const sourceIdStr in messagesBySource) {
            const sourceId = parseInt(sourceIdStr, 10);
            const chat = st.getChatMessages(sourceId)[0];
            if (!chat || !chat.message) continue;

            let newRaw = chat.message;
            let changed = false;

            messagesBySource[sourceId].forEach(msg => {
                const sender = msg.originalSender || msg.senderName || msg.senderId || msg.sender || '未知';
                const content = msg.originalText !== undefined ? msg.originalText : (msg.text || msg.content || msg.url || msg.amount || '');
                const time = msg.time || '';
                const msgType = msg.msgType || (msg.type === 'system' ? 'system' : 'text');

                let linesToTry = [];
                if (msgType === 'text') {
                    linesToTry.push(`[${sender}|${content}]`);
                    linesToTry.push(`[${sender}|${content}|${time}]`);
                } else if (msgType === 'image' || msgType === 'photo') {
                    linesToTry.push(`[${sender}|图片|${msg.url || content}]`);
                    linesToTry.push(`[${sender}|图片|${msg.url || content}|${time}]`);
                } else if (msgType === 'sticker') {
                    linesToTry.push(`[${sender}|表情包|${msg.url || content}]`);
                    linesToTry.push(`[${sender}|表情包|${msg.url || content}|${time}]`);
                } else if (msgType === 'voice') {
                    if (msg.duration) {
                        linesToTry.push(`[${sender}|语音消息|${msg.duration}|${content}]`);
                        linesToTry.push(`[${sender}|语音消息|${msg.duration}|${content}|${time}]`);
                    }
                    linesToTry.push(`[${sender}|语音消息|${content}]`);
                    linesToTry.push(`[${sender}|语音消息|${content}|${time}]`);
                } else if (msgType === 'transfer' || msgType === 'redpacket' || msgType === 'red-packet') {
                    linesToTry.push(`[${sender}|${content}]`);
                    linesToTry.push(`[${sender}|${content}|${time}]`);
                } else if (msgType === 'call') {
                    linesToTry.push(`[${sender}|语音通话|${content}]`);
                    linesToTry.push(`[${sender}|语音通话|${content}|${time}]`);
                } else if (msgType === 'call-end') {
                    linesToTry.push(`[${sender}|语音通话已挂断|${msg.duration || content || '00:00'}]`);
                    linesToTry.push(`[${sender}|语音通话已挂断|${msg.duration || content || '00:00'}|${time}]`);
                } else if (msgType === 'recall') {
                    linesToTry.push(`[${sender}|撤回消息|${content}]`);
                    linesToTry.push(`[${sender}|撤回消息|${content}|${time}]`);
                } else if (msgType === 'quote') {
                    linesToTry.push(`<${sender}|${msg.quote || ''}|${content}>`);
                    linesToTry.push(`<${sender}|${msg.quote || ''}|${content}|${time}>`);
                }

                for (const line of linesToTry) {
                    if (newRaw.includes(line + '\n')) {
                        newRaw = newRaw.replace(line + '\n', '');
                        changed = true;
                        break;
                    } else if (newRaw.includes(line)) {
                        newRaw = newRaw.replace(line, '');
                        changed = true;
                        break;
                    }
                }
            });

            if (changed && newRaw !== chat.message) {
                updates.push({ message_id: sourceId, message: newRaw });
            }
        }

        if (updates.length > 0) {
            st.setChatMessages(updates, { refresh: 'none' });
        }
    }

    function deleteMessage(chatId, index) {
        const msg = state.messages[chatId][index];
        state.messages[chatId].splice(index, 1);
        removeMessagesFromRawCode([msg]);
        saveMessagesToLocalStorage();
        renderMessages(chatId);
        showToast('已永久删除消息');
    }

    function enableMultiSelect(chatId, initialIndex) {
        state.multiSelectMode = true;
        state.selectedMessageIds = [];
        const msg = state.messages[chatId][initialIndex];
        state.selectedMessageIds.push(msg.id || `msg_${initialIndex}`);

        document.getElementById('chat-multi-select-toolbar').style.display = 'flex';
        document.querySelector('.input-bar').style.display = 'none';
        updateMultiSelectToolbar();
        renderMessages(chatId);
    }

    function updateMultiSelectToolbar() {
        document.getElementById('chat-selected-count').textContent = `已选择 ${state.selectedMessageIds.length} 项`;
    }

    document.getElementById('cancel-chat-multi-select').onclick = () => {
        state.multiSelectMode = false;
        state.selectedMessageIds = [];
        document.getElementById('chat-multi-select-toolbar').style.display = 'none';
        document.querySelector('.input-bar').style.display = 'flex';
        renderMessages(state.currentChat.id);
    };

    document.getElementById('confirm-chat-multi-delete').onclick = () => {
        if (state.selectedMessageIds.length === 0) return;

        showActionSheet([
            {
                text: `永久删除 ${state.selectedMessageIds.length} 条消息`,
                danger: true,
                onClick: () => {
                    const chatId = state.currentChat.id;
                    const msgsToRemove = state.messages[chatId].filter((m, index) => {
                        const msgId = m.id || `msg_${index}`;
                        return state.selectedMessageIds.includes(msgId);
                    });

                    state.messages[chatId] = state.messages[chatId].filter((m, index) => {
                        const msgId = m.id || `msg_${index}`;
                        return !state.selectedMessageIds.includes(msgId);
                    });

                    removeMessagesFromRawCode(msgsToRemove);

                    state.multiSelectMode = false;
                    state.selectedMessageIds = [];
                    saveMessagesToLocalStorage();
                    document.getElementById('chat-multi-select-toolbar').style.display = 'none';
                    document.querySelector('.input-bar').style.display = 'flex';
                    renderMessages(chatId);
                    showToast('已永久删除选中消息');
                }
            }
        ]);
    };

    function sendMessage(msgData, targetId = null) {
        const chatId = state.currentChat ? state.currentChat.id : (msgData.isSilent ? 'system_queue' : null);
        if (!chatId) return;
        if (!state.messages[chatId]) state.messages[chatId] = [];

        const newMessage = {
            id: 'msg_' + Date.now(),
            type: 'user',
            senderId: 'user',
            senderName: state.userName,
            senderAvatar: state.userAvatar,
            time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0'),
            ...msgData
        };

        // 处理引用
        if (state.quotedMessage) {
            newMessage.quotedMsg = { ...state.quotedMessage };
            state.quotedMessage = null;
            updateQuotePreview();
        }

        state.messages[chatId].push(newMessage);
        saveMessagesToLocalStorage();
        renderMessages(chatId);
        closeAllPanels();

        // 如果在通话中，将消息加入通话记录
        if (state.call.active) {
            state.call.transcript.push({
                sender: '我',
                text: newMessage.text,
                time: newMessage.time
            });
            renderCallTranscript();
        }

        // 只有系统消息才自动触发 AI，用户发送的消息需要手动点击灵动岛或通话头像
        if (msgData.isSilent && !msgData.noTrigger) {
            triggerAIResponse(msgData.text, targetId);
        }
    }



    async function triggerAIResponse(customPrompt = null, targetId = null, chatId = null) {
        if (isAIRequestPending) return;

        isAIRequestPending = true;
        setIslandState('loading');

        const activeChatId = chatId || (state.currentChat ? state.currentChat.id : 'system_queue');
        if (!state.messages[activeChatId]) state.messages[activeChatId] = [];

        // --- 识图逻辑集成 (超级扫描器 3.0：深度对齐) ---
        // 扫描最近的消息，寻找最近的一张照片作为多模态附件
        const recentMsgs = state.messages[activeChatId].slice(-6);
        let multimodalAttachment = null;
        let lastUserMsgText = null;
        let targetImgMsg = null; 

        for (let i = recentMsgs.length - 1; i >= 0; i--) {
            const msg = recentMsgs[i];
            
            if (!customPrompt && msg.type === 'user' && msg.text && !lastUserMsgText) {
                lastUserMsgText = msg.text;
            }

            if (!multimodalAttachment) {
                let url = msg.imageData || msg.url || msg.serverPath;

                // 1. 尝试从 attachments 缓存中抓取
                if (!url && msg.extra && msg.extra.attachments) {
                    const att = msg.extra.attachments.find(a => a.type === 'image');
                    if (att) url = att.path || att.url;
                }

                if (!url) continue;

                const isImage = msg.msgType === 'photo' || msg.msgType === 'image' || 
                              url.startsWith('data:') || url.startsWith('IMGDATA:') || 
                              url.includes('/api/images/get') || url.includes('user/images/');

                if (isImage) {
                    console.log('[SillyPhone] 发现图片特征:', url);
                    if (url.startsWith('data:')) {
                        multimodalAttachment = url;
                        targetImgMsg = msg;
                    } else {
                        try {
                            // 橄榄百宝箱或其它插件返回的路径处理
                            let fetchUrl = url;
                            if (url.startsWith('IMGDATA:')) {
                                fetchUrl = `/api/images/get?path=${encodeURIComponent(url.replace('IMGDATA:', ''))}`;
                            } else if (!url.startsWith('http') && !url.startsWith('data:')) {
                                // 移除可能的导出前缀 (如 /) 并确保 path 参数存在
                                let cleanPath = url.startsWith('/') ? url.substring(1) : url;
                                // 如果路径本身就是 api/images/get，则直接使用，否则包裹一层
                                if (cleanPath.startsWith('api/images/get')) {
                                    fetchUrl = '/' + cleanPath;
                                } else {
                                    fetchUrl = `/api/images/get?path=${encodeURIComponent(cleanPath)}`;
                                }
                            }

                            const response = await fetch(fetchUrl);
                            if (response.ok) {
                                const blob = await response.blob();
                                multimodalAttachment = await new Promise(r => {
                                    const rd = new FileReader();
                                    rd.onloadend = () => r(rd.result);
                                    rd.readAsDataURL(blob);
                                });
                                targetImgMsg = msg;
                                console.log('[SillyPhone] 后端图片拉取成功');
                            }
                        } catch (e) { 
                            console.error('[SillyPhone] 拉取异常:', e);
                        }
                    }
                    // 兜底补丁
                    if (!multimodalAttachment && msg.imageData) multimodalAttachment = msg.imageData;
                }
            }
        }
        // --- 识图逻辑结束 ---

        // --- 构造结构化图片对象 (对齐酒馆标准多模态格式) ---
        let structuralImage = null;
        if (multimodalAttachment) {
            structuralImage = {
                type: 'image',
                role: 'user',
                // 关键点：使用内容数组格式，直接适配后端多模态检测
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: multimodalAttachment }
                    }
                ],
                text: '[图片]', // 简化的兜底文本描述
                imageData: multimodalAttachment,
                fileName: (targetImgMsg ? targetImgMsg.fileName : null) || 'image.jpg',
                imageDescription: '发送了一张图片',
                extra: {}
            };
        }

        const mode = state.currentPage === 'moments' ? 'moments' : 'chat';

        // 注入全局系统约束
        const userNames = [state.userName, state.stUserName, '我', 'user', 'me', state.wechatId].filter(Boolean);
        const userNameStr = userNames.join('、');

        const globalConstraints = '';

        // 使用构建生成 Prompt 的函数，过滤掉历史记录
        const currentSessionMessages = buildGenerationPrompt(activeChatId);
        let lastMessages = currentSessionMessages.slice(-6).map(m => {
            const { time, ...rest } = m;
            return rest;
        });

        // --- 结构化上下文注入 (关键：将 Context 中的图片消息替换为 Image-Type) ---
        if (structuralImage) {
            // 找到最后一条图片消息的位置（或者是 '[图片]' 占位符）
            const lastPhotoIdx = [...lastMessages].reverse().findIndex(m => m.msgType === 'photo' || m.text === '[图片]' || m.text === '(IMG)');
            if (lastPhotoIdx !== -1) {
                const realIdx = lastMessages.length - 1 - lastPhotoIdx;
                // 仅替换必要的字段，保留发送者等信息，但类型改为 image
                lastMessages[realIdx] = {
                    ...lastMessages[realIdx],
                    ...structuralImage
                };
            }
        }

        // 核心 Prompt 构建优化
        let userPrompt = customPrompt || lastUserMsgText || (mode === 'moments' ? '请回复朋友圈...' : '请回复...');
        
        // 规则实现：如果用户只发了图 (Prompt 只是占位符)，则清空文字 Prompt，依赖结构化输入
        const isOnlyImage = structuralImage && (userPrompt === '[图片]' || userPrompt === '(IMG)' || !lastUserMsgText);
        if (isOnlyImage) {
            userPrompt = ""; 
        }

        const requestData = {
            source: 'yuii-phone',
            type: 'YUII_AI_REQUEST',
            requestId: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            prompt: userPrompt,
            multimodal_prompt: null, // 新增：显式多模态字段
            targetId: targetId || activeChatId,
            mode: mode,
            context: lastMessages,
            chatId: activeChatId,
            structuralImage: structuralImage,
            // 协议对齐：如果存在结构化图片，将其放入 extra.attachments 中同步
            extra: structuralImage ? {
                attachments: [{
                    type: 'image',
                    path: targetImgMsg ? (targetImgMsg.serverPath || targetImgMsg.url) : null,
                    data: structuralImage.imageData
                }]
            } : {}
        };

        // --- 核心修复：构造专用的多模态 Prompt 数组 (对齐 ctrl 老师的 content 结构) ---
        if (structuralImage) {
            let mmp = [];
            
            // 1. 获取清理后的文本
            const rawText = (customPrompt || lastUserMsgText || "").trim();
            const cleanText = rawText.replace(/\[图片(:[^\]]*)?\]|\(IMG:[^\)]*\)|\(IMG\)/g, "").trim();

            // 2. 构造多模态数组：文本在首，图片在后
            if (cleanText && cleanText !== '[图片]' && cleanText !== '(IMG)') {
                mmp.push({ type: 'text', text: cleanText });
            }
            
            mmp.push({
                type: 'image_url',
                image_url: { url: structuralImage.imageData }
            });

            // 赋值给专用字段
            requestData.multimodal_prompt = mmp;
            
            // 覆盖原 prompt 字段为纯净文本，避免冗余
            requestData.prompt = cleanText === '[图片]' || cleanText === '(IMG)' ? "" : cleanText;
            
            console.log('[SillyPhone] 多模态协议对齐完毕:', requestData.multimodal_prompt);
        }

        lastAIRequest = requestData;

        console.log('[SillyPhone] 发送 AI 请求 (携带结构化输入):', requestData);

        const st = getSTInterface();

        // 动态注入当前角色绑定的表情包清单
        let stickerPrompt = "";
        if (mode === 'chat' && state.currentChat && !state.currentChat.isGroup) {
            const charName = state.currentChat.name;
            const availableLabels = [];
            for (const catName in state.stickers) {
                const cat = state.stickers[catName];
                // 检查该分类是否绑定了当前角色
                if (cat.roles && cat.roles.includes(charName)) {
                    cat.items.forEach(item => {
                        if (item.label) availableLabels.push(item.label);
                    });
                }
            }
            if (availableLabels.length > 0) {
                stickerPrompt = `\n[系统提示：你当前可用的表情包标签如下，请在需要时使用：${availableLabels.join('、')}。发送格式：[角色昵称|表情包|标签名]]`;
            }
        }

        // 尝试使用同层原生 API 进行生成
        // 动态读取轻预设，在生成时临时注入，绝不污染聊天记录
        let dynamicPresetPrompt = '';
        if (state.presets && state.presets.length > 0) {
            const activePresets = state.presets.filter(p => p.enabled);
            if (activePresets.length > 0) {
                dynamicPresetPrompt = `\n[系统底层约束，请严格遵守以下规则：]\n${activePresets.map(p => p.content).join('\n\n')}\n`;
            }
        }

        // 尝试使用同层原生 API 进行生成 (优先尝试 generateRaw，无论是否有图)
        if (st.generateRaw) {
            try {
                // 确保在生成前同步最新状态到聊天记录
                syncToSillyTavern();

                const rawRequestData = {
                    user_input: (userPrompt + stickerPrompt + globalConstraints + dynamicPresetPrompt).trim(),
                    should_silence: true
                };

                // --- 注入多模态附件 (深度对齐 3.0) ---
                if (multimodalAttachment) {
                    console.log('[SillyPhone] 正在注入多模态二进制数据');
                    try {
                        const base64Data = multimodalAttachment.includes(',') ? multimodalAttachment.split(',')[1] : multimodalAttachment;
                        const mime = multimodalAttachment.includes(';') ? multimodalAttachment.split(';')[0].split(':')[1] : 'image/jpeg';
                        
                        // 1. 标准 images 属性 (对应 Image 1 中的 inlineData)
                        rawRequestData.images = [{ data: base64Data, mime: mime }];
                        
                        // 2. 移除 user_input 中的视觉提示词文本，防止 AI 看到冗余的 [系统提示] 而非真实图片
                        rawRequestData.user_input = (userPrompt + stickerPrompt + globalConstraints + dynamicPresetPrompt).trim() || "[图片]";
                        
                        // 3. 兼容某些转发器需要的 extra 结构
                        rawRequestData.extra = {
                            attachments: [{ type: 'image', data: multimodalAttachment }]
                        };
                    } catch (e) { console.error('[SillyPhone] 附件格式化失败:', e); }
                }



                const replyText = String(await st.generateRaw(rawRequestData) || '').trim();

                // 检查是否已被取消
                if (!isAIRequestPending) return;

                isAIRequestPending = false;
                if (replyText) {
                    processAIReply(replyText, activeChatId, mode, targetId || activeChatId);
                    // 启动打字队列，逐条弹出消息
                    if (state.typingQueue && state.typingQueue.length > 0 && typeof window.processTypingQueue === 'function') {
                        window.processTypingQueue();
                    } else {
                        setIslandState('default');
                    }
                } else {
                    setIslandState('default');
                    showToast('生成返回为空', 'x-circle');
                }
            } catch (error) {
                console.error('[SillyPhone] 同层生成失败:', error);
                isAIRequestPending = false;
                setIslandState('default');
                showToast('生成失败: ' + error.message, 'x-circle');
            }
            return;
        } else if (st.executeSlashCommands) {
            try {
                syncToSillyTavern();
                let genPrompt = customPrompt || (mode === 'moments' ? '请回复朋友圈...' : '请回复...');
                genPrompt += stickerPrompt + globalConstraints + dynamicPresetPrompt;

                await st.executeSlashCommands(`/gen ${String(genPrompt).replace(/\n/g, " ")}`);
                // Slash 命令生成后，通常会通过其他机制（如监听 DOM 或轮询）获取结果
                // 这里为了兼容性，我们仍然发送 postMessage 兜底
            } catch (error) {
                console.error('[SillyPhone] Slash 命令执行失败:', error);
                isAIRequestPending = false;
                setIslandState('default');
            }
        }

        // 兜底：如果没有同层 API，则发送 postMessage 给桥接脚本
        if (dynamicPresetPrompt) {
            requestData.customPrompt = (requestData.customPrompt || '') + dynamicPresetPrompt;
        }

        // 兜底：如果没有同层 API，则发送 postMessage 给桥接脚本
        window.parent.postMessage(requestData, '*');

        if (aiResponseTimer) clearTimeout(aiResponseTimer);
        aiResponseTimer = setTimeout(() => {
            if (isAIRequestPending) {
                isAIRequestPending = false;
                setIslandState('default');
                showToast('响应超时，请重试', 'x-circle');
                aiResponseTimer = null;
            }
        }, 60000);
    }

    let selectedStickers = new Set();

    function enterStickerEditMode() {
        state.isStickerEditMode = true;
        selectedStickers.clear();
        document.getElementById('sticker-batch-actions').style.display = 'flex';
        updateSelectedCount();
        renderStickers(state.currentStickerCategory);
    }

    function exitStickerEditMode() {
        state.isStickerEditMode = false;
        selectedStickers.clear();
        document.getElementById('sticker-batch-actions').style.display = 'none';
        renderStickers(state.currentStickerCategory);
    }

    function updateSelectedCount() {
        document.getElementById('selected-count').innerText = `已选择 ${selectedStickers.size} 项`;
    }

    function renderStickers(categoryName) {
        stickerGrid.innerHTML = '';
        const category = state.stickers[categoryName];
        const list = category ? category.items : [];

        if (list.length === 0) {
            stickerGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: rgba(255,255,255,0.3); font-size: 12px;">暂无表情包，点击右上角添加</div>';
            return;
        }

        list.forEach((sticker, idx) => {
            const item = document.createElement('div');
            const isSelected = selectedStickers.has(idx);
            item.className = `sticker-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `
                <img src="${sticker.url}" referrerpolicy="no-referrer">
                <span class="sticker-item-label">${sticker.label}</span>
            `;

            let pressTimer;
            const startPress = () => {
                pressTimer = setTimeout(() => {
                    if (!state.isStickerEditMode) enterStickerEditMode();
                }, 600);
            };
            const endPress = () => clearTimeout(pressTimer);

            item.onmousedown = startPress;
            item.onmouseup = endPress;
            item.ontouchstart = startPress;
            item.ontouchend = endPress;

            item.onclick = () => {
                if (state.isStickerEditMode) {
                    if (selectedStickers.has(idx)) {
                        selectedStickers.delete(idx);
                    } else {
                        selectedStickers.add(idx);
                    }
                    updateSelectedCount();
                    renderStickers(categoryName);
                } else {
                    sendMessage({
                        msgType: 'sticker',
                        url: sticker.url,
                        label: sticker.label,
                        text: sticker.label + (sticker.url ? sticker.url.split('/').pop() : '')
                    });
                }
            };
            stickerGrid.appendChild(item);
        });
    }

    function renderStickerTabs() {
        stickerTabs.innerHTML = '';
        const currentRole = state.currentChat ? state.currentChat.name : null;

        // 显示所有分类，收藏永远在第一位
        const categories = Object.keys(state.stickers).sort((a, b) => {
            if (a === '收藏') return -1;
            if (b === '收藏') return 1;
            return a.localeCompare(b);
        });

        categories.forEach((catName, index) => {
            const tab = document.createElement('div');
            const cat = state.stickers[catName];
            // 如果没有当前激活的分类，默认选第一个
            const isActive = state.currentStickerCategory === catName || (!state.currentStickerCategory && index === 0);
            if (isActive) state.currentStickerCategory = catName;

            tab.className = `sticker-tab ${isActive ? 'active' : ''}`;

            let roleInfo = '';
            if (cat.roles && cat.roles.length > 0) {
                roleInfo = `<span class="role-tag">${cat.roles.length > 1 ? '多角色' : cat.roles[0]}</span>`;
            }

            tab.innerHTML = `${catName}${roleInfo}`;

            // 点击切换
            tab.onclick = () => {
                if (state.isStickerEditMode) exitStickerEditMode();
                state.currentStickerCategory = catName;
                renderStickerTabs();
                renderStickers(catName);
            };

            // 长按管理分类
            let pressTimer;
            const startPress = () => {
                pressTimer = setTimeout(() => openRoleBindingModal(catName), 600);
            };
            const endPress = () => clearTimeout(pressTimer);

            tab.onmousedown = startPress;
            tab.onmouseup = endPress;
            tab.ontouchstart = startPress;
            tab.ontouchend = endPress;

            stickerTabs.appendChild(tab);
        });

        // 初始加载当前分类的内容
        if (state.currentStickerCategory) {
            renderStickers(state.currentStickerCategory);
        }
        updateCategorySelect();
    }

    function updateCategorySelect() {
        const select = document.getElementById('sticker-category-select');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '';
        Object.keys(state.stickers).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
        const newOpt = document.createElement('option');
        newOpt.value = 'new';
        newOpt.textContent = '+ 新分类';
        select.appendChild(newOpt);
        select.value = currentVal || '收藏';
    }

    function addSticker() {
        const input = document.getElementById('new-sticker-input');
        const select = document.getElementById('sticker-category-select');
        const newCatInput = document.getElementById('new-category-name');

        let categoryName = select.value;
        if (categoryName === 'new') {
            categoryName = newCatInput.value.trim();
            if (!categoryName) {
                showToast('请输入新分类名称', 'alert-circle');
                return;
            }
        }

        const rawText = input.value.trim();
        if (!rawText) return;

        // 支持批量添加：语义:URL 语义:URL ...
        // 使用正则匹配 语义:URL 模式，支持 URL 中包含特殊字符
        const stickerPairs = rawText.split(/\s+/).filter(p => p.includes(':'));

        if (stickerPairs.length === 0) {
            showToast('格式错误，请使用 语义:URL', 'alert-circle');
            return;
        }

        if (!state.stickers[categoryName]) {
            state.stickers[categoryName] = { roles: [], items: [] };
        }

        let addedCount = 0;
        stickerPairs.forEach(pair => {
            const colonIndex = pair.indexOf(':');
            const label = pair.substring(0, colonIndex);
            const url = pair.substring(colonIndex + 1);
            if (label && url) {
                state.stickers[categoryName].items.push({ label, url });
                addedCount++;
            }
        });

        // 持久化
        localStorage.setItem('all-stickers', JSON.stringify(state.stickers));

        input.value = '';
        newCatInput.value = '';
        newCatInput.style.display = 'none';
        document.getElementById('add-sticker-form').style.display = 'none';
        renderStickerTabs();
        showToast(`成功添加 ${addedCount} 个表情包`);
    }

    let currentBindingCategory = null;
    function openRoleBindingModal(categoryName) {
        currentBindingCategory = categoryName;
        const modal = document.getElementById('role-binding-modal');
        const roleList = document.getElementById('role-list');
        const nameInput = document.getElementById('edit-category-name');
        const deleteBtn = document.getElementById('delete-category-btn');

        roleList.innerHTML = '';
        nameInput.value = categoryName;

        // 收藏分类不允许删除和改名
        if (categoryName === '收藏') {
            nameInput.disabled = true;
            deleteBtn.style.display = 'none';
        } else {
            nameInput.disabled = false;
            deleteBtn.style.display = 'block';
        }

        const cat = state.stickers[categoryName];
        const boundRoles = cat.roles || [];

        state.contacts.forEach(contact => {
            const item = document.createElement('label');
            item.className = 'role-item';
            const checked = boundRoles.includes(contact.name) ? 'checked' : '';
            item.innerHTML = `
                <input type="checkbox" value="${contact.name}" ${checked}>
                <span>${contact.name}</span>
            `;
            roleList.appendChild(item);
        });

        modal.style.display = 'flex';
    }

    function saveRoleBinding() {
        if (!currentBindingCategory) return;
        const roleList = document.getElementById('role-list');
        const nameInput = document.getElementById('edit-category-name');
        const newName = nameInput.value.trim();

        if (!newName) {
            showToast('分类名称不能为空');
            return;
        }

        const checkboxes = roleList.querySelectorAll('input[type="checkbox"]');
        const selectedRoles = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        const catData = state.stickers[currentBindingCategory];

        if (newName !== currentBindingCategory) {
            // 改名逻辑
            if (state.stickers[newName]) {
                showToast('分类名称已存在');
                return;
            }
            delete state.stickers[currentBindingCategory];
            state.stickers[newName] = catData;
            state.currentStickerCategory = newName;
        }

        state.stickers[newName].roles = selectedRoles;
        localStorage.setItem('all-stickers', JSON.stringify(state.stickers));

        document.getElementById('role-binding-modal').style.display = 'none';
        renderStickerTabs();
        showToast('设置已保存');
    }

    function deleteCategory() {
        if (!currentBindingCategory || currentBindingCategory === '收藏') return;
        if (!confirm(`确定要删除分类 "${currentBindingCategory}" 吗？此操作将同时删除该分类下的所有表情包。`)) return;

        delete state.stickers[currentBindingCategory];
        localStorage.setItem('all-stickers', JSON.stringify(state.stickers));

        state.currentStickerCategory = '收藏';
        document.getElementById('role-binding-modal').style.display = 'none';
        renderStickerTabs();
        showToast('分类已删除');
    }

    function loadUserStickers() {
        const saved = localStorage.getItem('all-stickers');
        if (saved) {
            state.stickers = JSON.parse(saved);
        }
    }

    navItems.forEach(item => {
        item.onclick = () => switchPage(item.dataset.page);
    });

    document.getElementById('back-btn').onclick = () => switchPage('chat-list');
    toggleFunctionsBtn.onclick = () => togglePanel(panelFunctions);
    toggleVoiceBtn.onclick = () => togglePanel(panelVoice);

    document.getElementById('btn-photo').onclick = () => togglePanel(panelPhoto);
    document.getElementById('btn-sticker').onclick = () => {
        togglePanel(panelSticker);
        renderStickerTabs();
    };
    document.getElementById('btn-transfer').onclick = () => {
        togglePanel(panelTransfer);
        if (state.currentChat && state.currentChat.isGroup) {
            transferPanelTitle.textContent = '发红包';
            sendTransferBtn.textContent = '塞钱进红包';
            sendTransferBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            sendTransferBtn.style.border = '1px solid rgba(255, 255, 255, 0.3)';
            redPacketTargetContainer.style.display = 'block';
            redPacketCountContainer.style.display = 'flex';

            // 填充群成员
            let optionsHtml = '<option value="all" style="background: #333; color: white;">所有人可领</option>';
            state.currentChat.members.forEach(member => {
                if (member.id !== 'user') {
                    optionsHtml += `<option value="${member.id}" style="background: #333; color: white;">指定给: ${member.name}</option>`;
                }
            });
            redPacketTargetSelect.innerHTML = optionsHtml;

            redPacketTargetSelect.onchange = () => {
                if (redPacketTargetSelect.value === 'all') {
                    redPacketCountContainer.style.display = 'flex';
                } else {
                    redPacketCountContainer.style.display = 'none';
                }
            };
        } else {
            transferPanelTitle.textContent = '转账';
            sendTransferBtn.textContent = '转账';
            sendTransferBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            sendTransferBtn.style.border = '1px solid rgba(255, 255, 255, 0.3)';
            redPacketTargetContainer.style.display = 'none';
            redPacketCountContainer.style.display = 'none';
        }
    };

    sendTransferBtn.onclick = () => {
        const amount = parseFloat(transferAmountInput.value);
        if (isNaN(amount) || amount <= 0) {
            showToast('请输入有效的金额', 'alert-circle');
            return;
        }

        let remark = transferRemarkInput.value.trim();
        const isGroup = state.currentChat && state.currentChat.isGroup;

        let targetId = 'all';
        let count = 1;

        if (isGroup) {
            targetId = redPacketTargetSelect.value;
            if (targetId === 'all') {
                count = parseInt(redPacketCountInput.value);
                if (isNaN(count) || count <= 0) {
                    showToast('请输入有效的红包个数', 'alert-circle');
                    return;
                }
                if (count > state.currentChat.members.length) {
                    showToast('红包个数不能超过群人数', 'alert-circle');
                    return;
                }
                if (amount / count < 0.01) {
                    showToast('单个红包金额不可低于0.01元', 'alert-circle');
                    return;
                }
                remark = remark || '恭喜发财，大吉大利';
            } else {
                remark = remark || '专属红包';
            }
        } else {
            remark = remark || '转账';
        }

        const msgData = {
            msgType: isGroup ? 'red-packet' : 'transfer',
            amount: amount.toFixed(2),
            remark: remark,
            status: 'unreceived', // unreceived, received, returned, empty
            count: count,
            grabRecords: [], // 初始化领取记录
            remainingAmount: isGroup ? parseFloat(amount.toFixed(2)) : 0,
            remainingCount: isGroup ? count : 0
        };

        if (isGroup) {
            msgData.targetId = targetId;
        }

        sendMessage(msgData);

        transferAmountInput.value = '';
        transferRemarkInput.value = '';
        redPacketCountInput.value = '';
        closeAllPanels();
    };

    sendPhotoBtn.onclick = async () => {
        const descriptionInput = photoDescInput.value.trim();
        const file = realPhotoInput.files[0];
        const base64Data = photoPreviewImg.src.startsWith('data:') ? photoPreviewImg.src : null;

        if (!descriptionInput && !file && !base64Data) return;

        let serverPath = null;
        let fileName = file ? file.name : null;
        let finalDescription = descriptionInput;

        // --- 识图逻辑已移除 (改为直接发送) ---
        // 插件已不再独立调用外部 API 进行识图，现在由酒馆后台原生多模态支持。
        if (file) {
            showToast('正在发送图片...', 'loader');
            serverPath = await uploadImageToST(file);
        }


        const photoMsg = {
            msgType: 'photo',
            text: finalDescription ? `[图片:${finalDescription}]` : '[图片]',
            serverPath: serverPath,
            fileName: fileName,
            description: finalDescription,
            imageData: base64Data // 核心修复：直接将 Base64 注入消息对象，彻底终结 404 识图失败
        };

        if (serverPath) {
            photoMsg.url = serverPath;
        } else if (base64Data) {
            photoMsg.url = base64Data;
        }

        sendMessage(photoMsg);
        setIslandState('default');

        // 重置
        photoDescInput.value = '';
        photoPreviewContainer.style.display = 'none';
        photoPreviewImg.src = '';
        realPhotoInput.value = '';
    };

    // 真实照片监听
    if (realPhotoInput) {
        realPhotoInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('图片太大了 (Max 5MB)', 'alert-circle');
                realPhotoInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                photoPreviewImg.src = event.target.result;
                photoPreviewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        };
    }

    if (removePhotoPreviewBtn) {
        removePhotoPreviewBtn.onclick = () => {
            photoPreviewContainer.style.display = 'none';
            photoPreviewImg.src = '';
            realPhotoInput.value = '';
        };
    }

    sendVoiceBtn.onclick = () => {
        const text = voiceTextInput.value.trim();
        if (!text) return;

        // 根据字数估算时长 (约每秒 3.5 个字)
        const durationSec = Math.max(1, Math.ceil(text.length / 3.5) + Math.floor(Math.random() * 2));
        sendMessage({ msgType: 'voice', text, duration: durationSec + '"' });

        voiceTextInput.value = '';
    };

    closePanelBtns.forEach(btn => {
        btn.onclick = closeAllPanels;
    });

    msgInput.onfocus = closeAllPanels;

    function sendMessageFromInput() {
        const text = msgInput.value.trim();
        if (!text) return;
        sendMessage({ text });
        msgInput.value = '';
    }

    document.getElementById('send-btn').onclick = sendMessageFromInput;
    msgInput.onkeypress = (e) => e.key === 'Enter' && sendMessageFromInput();

    if (fetchVisionModelsBtn) {
        fetchVisionModelsBtn.onclick = fetchVisionModels;
    }

    island.onclick = handleIslandClick;
    saveSettingsBtn.onclick = saveSettings;

    const avatarModal = document.getElementById('avatar-modal');
    const avatarInput = document.getElementById('new-avatar-url-input');

    if (changeAvatarBtn) {
        changeAvatarBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            avatarChangeTarget = 'user';
            avatarInput.value = state.userAvatar;
            avatarModal.style.display = 'flex';
        };
    }

    const closeAvatarModal = document.getElementById('close-avatar-modal');
    if (closeAvatarModal) {
        closeAvatarModal.onclick = () => {
            avatarModal.style.display = 'none';
        };
    }

    const cancelAvatarBtn = document.getElementById('cancel-avatar-change');
    if (cancelAvatarBtn) {
        cancelAvatarBtn.onclick = () => {
            avatarModal.style.display = 'none';
        };
    }

    const chatInfoBtn = document.getElementById('chat-info-btn');
    const chatInfoAvatar = document.getElementById('chat-info-avatar');
    const chatInfoRemark = document.getElementById('chat-info-remark');
    const chatInfoBg = document.getElementById('chat-info-bg');
    const chatInfoBlur = document.getElementById('chat-info-blur');
    const chatInfoBlurValue = document.getElementById('chat-info-blur-value');
    const saveChatInfoBtn = document.getElementById('save-chat-info-btn');
    const backFromChatInfo = document.getElementById('back-from-chat-info');
    const changeChatAvatar = document.getElementById('change-chat-avatar');

    let avatarChangeTarget = 'user'; // 'user' or 'chat'

    if (chatInfoBtn) {
        chatInfoBtn.onclick = () => {
            if (!state.currentChat) return;

            const isGroup = state.currentChat.isGroup;

            // 填充当前设置
            chatInfoAvatar.src = state.currentChat.avatar || 'https://files.catbox.moe/blaehb.jpg';
            chatInfoRemark.value = state.currentChat.remark || '';
            chatInfoBg.value = state.currentChat.chatBg || '';
            chatInfoBlur.value = state.currentChat.chatBlur || 0;
            chatInfoBlurValue.textContent = `${state.currentChat.chatBlur || 0}px`;

            // 更新标签
            document.getElementById('avatar-label').textContent = isGroup ? '群头像' : '聊天头像';
            document.getElementById('remark-label').textContent = isGroup ? '群聊名称' : '备注名';

            // 处理群聊特有显示
            const avatarItem = document.getElementById('change-chat-avatar');
            const remarkItem = document.getElementById('chat-info-remark').closest('.info-item');
            const groupMemberSection = document.getElementById('group-member-section');
            const groupAnnouncementItem = document.getElementById('group-announcement-item');
            const myGroupNicknameItem = document.getElementById('my-group-nickname-item');
            const dangerZone = document.getElementById('danger-zone');
            const deleteBtn = document.getElementById('delete-and-exit-btn');

            // 危险区域处理
            dangerZone.style.display = 'flex';
            if (isGroup) {
                avatarItem.style.display = 'none'; // 群聊不需要群头像设置

                if (state.currentChat.godMode) {
                    // 上帝视角：隐藏群聊名称、群公告、我在本群的昵称、群成员
                    remarkItem.style.display = 'none';
                    groupMemberSection.style.display = 'none';
                    groupAnnouncementItem.style.display = 'none';
                    myGroupNicknameItem.style.display = 'none';
                    deleteBtn.style.display = 'block';
                    deleteBtn.textContent = '删除此群聊';
                } else {
                    remarkItem.style.display = 'flex';
                    groupMemberSection.style.display = 'block';
                    groupAnnouncementItem.style.display = 'flex';
                    myGroupNicknameItem.style.display = 'flex';
                    deleteBtn.style.display = 'block';
                    deleteBtn.textContent = '删除并退出';

                    // 填充群公告和我的昵称
                    document.getElementById('chat-info-announcement').value = state.currentChat.announcement || '';
                    document.getElementById('chat-info-my-nickname').value = state.currentChat.myNickname || '';

                    renderMemberGrid();
                }
            } else {
                avatarItem.style.display = 'flex';
                remarkItem.style.display = 'flex';
                groupMemberSection.style.display = 'none';
                groupAnnouncementItem.style.display = 'none';
                myGroupNicknameItem.style.display = 'none';
                deleteBtn.style.display = 'block';
                deleteBtn.textContent = '删除聊天';
            }

            switchPage('chat-info');
            console.log('[SillyPhone] Switched to chat-info, currentChat is:', state.currentChat ? state.currentChat.id : 'null');
        };
    }

    function renderMemberGrid() {
        const grid = document.getElementById('chat-info-member-grid');
        if (!grid || !state.currentChat || !state.currentChat.members) return;

        grid.innerHTML = '';

        // 渲染成员
        state.currentChat.members.forEach(member => {
            const item = document.createElement('div');
            item.className = 'member-item';
            item.innerHTML = `
                <img src="${member.avatar}" referrerpolicy="no-referrer" class="member-avatar">
                <span class="member-name">${member.name}</span>
            `;
            grid.appendChild(item);
        });

        // 添加按钮
        const addBtn = document.createElement('div');
        addBtn.className = 'member-item';
        addBtn.innerHTML = `
            <div class="member-btn"><i data-lucide="plus" size="20"></i></div>
            <span class="member-name">添加</span>
        `;
        addBtn.onclick = () => {
            addMembersToGroup();
        };
        grid.appendChild(addBtn);

        // 删除按钮 (仅群主/管理员可见，这里简单处理)
        const removeBtn = document.createElement('div');
        removeBtn.className = 'member-item';
        removeBtn.innerHTML = `
            <div class="member-btn"><i data-lucide="minus" size="20"></i></div>
            <span class="member-name">移出</span>
        `;
        removeBtn.onclick = () => {
            removeMembersFromGroup();
        };
        grid.appendChild(removeBtn);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function addMembersToGroup() {
        if (!state.currentChat || !state.currentChat.isGroup) return;

        // 过滤掉已经在群里的联系人
        const currentMemberIds = state.currentChat.members.map(m => m.id);
        const availableContacts = state.contacts.filter(c => !currentMemberIds.includes(c.id));

        if (availableContacts.length === 0) {
            showToast('所有联系人已在群中', 'info');
            return;
        }

        showCharacterSelect('选择要添加的成员', (selectedNames) => {
            if (selectedNames.length === 0) return;

            const newMembers = state.contacts.filter(c => selectedNames.includes(c.name));
            if (newMembers.length === 0) return;

            // 添加到群成员
            state.currentChat.members.push(...newMembers);

            // 生成系统消息
            const names = newMembers.map(m => m.name).join('、');
            const sysMsg = {
                id: 'msg_' + Date.now(),
                type: 'system',
                text: `你邀请 "${names}" 加入了群聊`,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
            };

            if (!state.messages[state.currentChat.id]) state.messages[state.currentChat.id] = [];
            state.messages[state.currentChat.id].push(sysMsg);

            saveMessagesToLocalStorage();
            saveStateToLocalStorage();
            renderMemberGrid();
            renderMessages(state.currentChat.id);

            // 角色反应
            triggerMemberChangeReaction(state.currentChat.id, 'add', names);
        });
    }

    function removeMembersFromGroup() {
        if (!state.currentChat || !state.currentChat.isGroup) return;

        // 只能移除除了自己以外的成员
        const removableMembers = state.currentChat.members.filter(m => m.id !== 'user');

        if (removableMembers.length === 0) {
            showToast('群里没有其他成员可以移除', 'info');
            return;
        }

        // 创建一个简单的成员选择列表
        const options = removableMembers.map(m => ({
            text: m.name,
            onClick: () => {
                // 移除成员
                state.currentChat.members = state.currentChat.members.filter(mem => mem.id !== m.id);

                // 生成系统消息
                const sysMsg = {
                    id: 'msg_' + Date.now(),
                    type: 'system',
                    text: `你将 "${m.name}" 移出了群聊`,
                    time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
                };

                if (!state.messages[state.currentChat.id]) state.messages[state.currentChat.id] = [];
                state.messages[state.currentChat.id].push(sysMsg);

                saveMessagesToLocalStorage();
                saveStateToLocalStorage();
                renderMemberGrid();
                renderMessages(state.currentChat.id);

                // 角色反应
                triggerMemberChangeReaction(state.currentChat.id, 'remove', m.name);
            }
        }));

        showActionSheet(options);
    }

    function triggerMemberChangeReaction(chatId, type, names) {
        if (!state.currentChat || !state.currentChat.isGroup) return;

        const otherMembers = state.currentChat.members.filter(m => m.id !== 'user');
        if (otherMembers.length === 0) return;

        const reactor = otherMembers[Math.floor(Math.random() * otherMembers.length)];
        const prompt = `[系统指令：角色 ${reactor.name} 看到 ${names} ${type === 'add' ? '加入' : '离开'} 了群聊，请发表一句符合人设的简短感言。直接输出内容，不要带括号。]`;

        // 延迟触发 AI 请求
        setTimeout(() => {
            triggerAIResponse(prompt, reactor.id, chatId);
        }, 1000);
    }

    function handleAILeaveAction(chatId, aiSenderId) {
        const chat = state.groups.find(g => g.id === chatId);
        if (!chat) return;

        const leavingAI = chat.members.find(m => m.id === aiSenderId);
        if (!leavingAI) return;

        // 1. 生成系统消息：离开了群聊
        const leaveSysMsg = {
            id: 'msg_' + Date.now() + '_leave',
            type: 'system',
            text: `"${leavingAI.name}" 离开了群聊`,
            time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
        };
        state.messages[chatId].push(leaveSysMsg);

        // 2. 从成员列表中移除
        chat.members = chat.members.filter(m => m.id !== aiSenderId);

        // 3. 刷新 UI
        if (state.currentChat && state.currentChat.id === chatId) {
            renderMemberGrid();
            renderMessages(chatId);
            // 更新标题中的人数
            let displayName = state.currentChat.remark || state.currentChat.name;
            if (state.currentChat.isGroup && state.currentChat.members) {
                displayName += ` (${state.currentChat.members.length})`;
            }
            document.getElementById('chat-name').textContent = displayName;
        }
        renderChatList();
        saveStateToLocalStorage();
        saveMessagesToLocalStorage();

        // 4. 触发其他人的反应
        triggerMemberChangeReaction(chatId, 'remove', leavingAI.name);

        // 5. 设定延迟重新拉回
        const rejoinDelay = 8000 + Math.random() * 5000; // 8-13秒后拉回
        setTimeout(() => {
            // 随机选一个人拉回
            const otherMembers = chat.members.filter(m => m.id !== 'user');
            if (otherMembers.length === 0) return;
            const inviter = otherMembers[Math.floor(Math.random() * otherMembers.length)];

            // 生成系统消息：邀请加入了群聊
            const joinSysMsg = {
                id: 'msg_' + Date.now() + '_join',
                type: 'system',
                text: `"${inviter.name}" 邀请 "${leavingAI.name}" 加入了群聊`,
                time: new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0')
            };
            state.messages[chatId].push(joinSysMsg);

            // 添加回成员列表
            chat.members.push(leavingAI);

            // 刷新 UI
            if (state.currentChat && state.currentChat.id === chatId) {
                renderMemberGrid();
                renderMessages(chatId);
                let displayName = state.currentChat.remark || state.currentChat.name;
                if (state.currentChat.isGroup && state.currentChat.members) {
                    displayName += ` (${state.currentChat.members.length})`;
                }
                document.getElementById('chat-name').textContent = displayName;
            }
            renderChatList();
            saveStateToLocalStorage();
            saveMessagesToLocalStorage();

            // 6. 触发离开者的“回归感言”
            setTimeout(() => {
                const prompt = `[系统指令：角色 ${leavingAI.name} 刚才退群后又被拉回来了，请发表一句符合人设的“回归感言”。直接输出内容，不要带括号。]`;
                triggerAIResponse(prompt, leavingAI.id, chatId);
            }, 2000);

        }, rejoinDelay);
    }

    if (backFromChatInfo) {
        backFromChatInfo.onclick = () => {
            switchPage('chat-window');
        };
    }

    if (changeChatAvatar) {
        changeChatAvatar.onclick = () => {
            avatarChangeTarget = 'chat';
            avatarInput.value = chatInfoAvatar.src;
            avatarModal.style.display = 'flex';
        };
    }

    if (chatInfoBlur) {
        chatInfoBlur.oninput = () => {
            chatInfoBlurValue.textContent = `${chatInfoBlur.value}px`;
        };
    }

    if (saveChatInfoBtn) {
        saveChatInfoBtn.onclick = () => {
            if (!state.currentChat) return;

            const newAvatar = chatInfoAvatar.src;
            const newRemark = chatInfoRemark.value.trim();
            const newBg = chatInfoBg.value.trim();
            const newBlur = parseInt(chatInfoBlur.value);

            // 更新状态
            state.currentChat.avatar = newAvatar;
            state.currentChat.remark = newRemark;
            state.currentChat.chatBg = newBg;
            state.currentChat.chatBlur = newBlur;

            // 群聊特有字段
            if (state.currentChat.isGroup) {
                state.currentChat.announcement = document.getElementById('chat-info-announcement').value.trim();
                state.currentChat.myNickname = document.getElementById('chat-info-my-nickname').value.trim();
            }

            // 同步到联系人列表/群组列表
            const contact = state.contacts.find(c => c.id === state.currentChat.id);
            if (contact) {
                contact.avatar = newAvatar;
                contact.remark = newRemark;
                contact.chatBg = newBg;
                contact.chatBlur = newBlur;
            } else {
                const group = state.groups.find(g => g.id === state.currentChat.id);
                if (group) {
                    group.avatar = newAvatar;
                    group.remark = newRemark;
                    group.chatBg = newBg;
                    group.chatBlur = newBlur;
                    group.announcement = state.currentChat.announcement;
                    group.myNickname = state.currentChat.myNickname;
                }
            }

            // 重新应用设置
            let displayName = newRemark || state.currentChat.name;
            if (state.currentChat.isGroup && state.currentChat.members) {
                displayName += ` (${state.currentChat.members.length})`;
            }
            document.getElementById('chat-name').textContent = displayName;
            const bgLayer = document.getElementById('chat-bg-layer');
            if (newBg) {
                bgLayer.style.backgroundImage = `url(${newBg})`;
                bgLayer.style.filter = `blur(${newBlur}px)`;
                bgLayer.style.opacity = '1';
            } else {
                bgLayer.style.backgroundImage = '';
                bgLayer.style.filter = 'none';
                bgLayer.style.opacity = '0';
            }

            // 刷新界面
            renderChatList();
            renderMessages(state.currentChat.id);

            switchPage('chat-window');
            showToast('聊天设置已保存', 'check');

            // 持久化
            saveStateToLocalStorage();
        };
    }

    // 危险区域操作
    const clearChatHistoryBtn = document.getElementById('clear-chat-history-btn');
    const deleteAndExitBtn = document.getElementById('delete-and-exit-btn');

    if (clearChatHistoryBtn) {
        clearChatHistoryBtn.onclick = (e) => {
            e.preventDefault();
            console.log('[SillyPhone] 点击清空聊天记录按钮', state.currentChat);
            if (!state.currentChat) {
                showToast('当前无活跃聊天', 'x-circle');
                return;
            }
            // 彻底删除聊天记录
            const msgsToRemove = [...(state.messages[state.currentChat.id] || [])];
            state.messages[state.currentChat.id] = [];
            removeMessagesFromRawCode(msgsToRemove);
            renderMessages(state.currentChat.id);
            showToast('聊天记录已清空', 'check');
            saveStateToLocalStorage();
            saveMessagesToLocalStorage();
            switchPage('chat-window');
        };
    }

    if (deleteAndExitBtn) {
        deleteAndExitBtn.onclick = (e) => {
            e.preventDefault();
            console.log('[SillyPhone] 点击删除按钮', state.currentChat);
            if (!state.currentChat) {
                showToast('当前无活跃聊天', 'x-circle');
                return;
            }
            const isGroup = state.currentChat.isGroup;
            const chatId = state.currentChat.id;

            if (isGroup) {
                state.groups = state.groups.filter(g => g.id !== chatId);
            } else {
                // 如果是单聊，从联系人列表中移除
                state.contacts = state.contacts.filter(c => c.id !== chatId);
            }

            // 移除消息记录
            const msgsToRemove = [...(state.messages[chatId] || [])];
            delete state.messages[chatId];
            removeMessagesFromRawCode(msgsToRemove);

            state.currentChat = null;

            // 关键：保存并刷新所有列表
            saveStateToLocalStorage();
            saveMessagesToLocalStorage();

            renderChatList();
            renderContactsList(); // 确保联系人列表也刷新

            switchPage('chat-list');
            showToast(isGroup ? '已删除并退出群聊' : '已删除聊天', 'check');
        };
    }

    function saveMessagesToLocalStorage() {
        const key = `all-messages-${state.activeAccountId}`;
        localStorage.setItem(key, JSON.stringify(state.messages));
        deferredSync(); // 同步到同层
    }

    function saveStateToLocalStorage() {
        const dataToSave = {
            userAccounts: state.userAccounts,
            activeAccountId: state.activeAccountId,
            settings: state.settings,
            stickers: state.stickers,
            contacts: state.contacts,
            groups: state.groups,
            moments: state.moments
        };
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(dataToSave));
            // 兼容旧版本全局存储
            localStorage.setItem('sillyphone-state', JSON.stringify(dataToSave));
        } catch (e) {
            console.error("Failed to save state to localStorage", e);
        }
        deferredSync();
    }

    // 初始化时加载持久化数据
    function loadStateFromLocalStorage() {
        try {
            let saved = localStorage.getItem(getStorageKey());
            if (!saved) {
                saved = localStorage.getItem('sillyphone-state');
            }
            if (saved) {
                const data = JSON.parse(saved);
                if (data.userAccounts) state.userAccounts = data.userAccounts;
                if (data.activeAccountId) state.activeAccountId = data.activeAccountId;
                if (data.settings) state.settings = { ...state.settings, ...data.settings };
                if (data.stickers) state.stickers = data.stickers;
                if (data.contacts) state.contacts = data.contacts;
                if (data.groups) state.groups = data.groups;
                if (data.moments) state.moments = data.moments;

                // 尝试从 all-messages 加载，如果不存在则从 userAccounts 中恢复
                const msgKey = `all-messages-${state.activeAccountId}`;
                const savedMsgs = localStorage.getItem(msgKey);
                if (savedMsgs) {
                    state.messages = JSON.parse(savedMsgs);
                } else {
                    const active = state.userAccounts.find(a => a.id === state.activeAccountId);
                    if (active && active.messages) {
                        state.messages = active.messages;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load state from localStorage", e);
        }
        loadFromSillyTavern();

        // 恢复之前所在的页面和聊天
        try {
            const savedPage = sessionStorage.getItem('sillyphone-currentPage');
            const savedChatId = sessionStorage.getItem('sillyphone-currentChatId');

            if (savedPage) {
                switchPage(savedPage);
                if (savedPage === 'chat-window' && savedChatId) {
                    let chatToOpen = state.contacts.find(c => c.id === savedChatId) ||
                        state.groups.find(g => g.id === savedChatId);
                    if (chatToOpen) {
                        openChat(chatToOpen);
                    } else {
                        switchPage('chat-list');
                    }
                }
            }
        } catch (e) { }
    }

    const confirmAvatarBtn = document.getElementById('confirm-avatar-change');
    if (confirmAvatarBtn) {
        confirmAvatarBtn.onclick = () => {
            const newUrl = avatarInput.value.trim();
            if (newUrl) {
                if (avatarChangeTarget === 'user') {
                    settingsUserAvatarImg.src = newUrl;
                    state.userAvatar = newUrl; // 立即更新状态，确保聊天窗口同步

                    const activeAccount = state.userAccounts.find(acc => acc.id === state.activeAccountId);
                    if (activeAccount) {
                        activeAccount.avatar = newUrl;
                    }

                    // 更新朋友圈中自己的头像
                    state.moments.forEach(m => {
                        if (m.authorId === 'user') {
                            m.authorAvatar = newUrl;
                        }
                    });
                } else {
                    chatInfoAvatar.src = newUrl;
                }

                avatarModal.style.display = 'none';
                showToast('头像已更改', 'image');
                saveStateToLocalStorage();
            }
        };
    }

    blurIntensityInput.oninput = (e) => {
        const val = e.target.value;
        blurValueDisplay.textContent = val;
        applyBlur(val);
    };

    bubbleBlurIntensityInput.oninput = (e) => {
        const val = e.target.value;
        bubbleBlurValueDisplay.textContent = val;
        applyBubbleBlur(val);
    };

    navBlurIntensityInput.oninput = (e) => {
        const val = e.target.value;
        navBlurValueDisplay.textContent = val;
        applyNavBlur(val);
    };

    glassOpacityIntensityInput.oninput = (e) => {
        const val = (e.target.value / 100).toFixed(2);
        glassOpacityValueDisplay.textContent = val;
        applyGlassOpacity(val);
    };

    document.getElementById('add-sticker-trigger').onclick = () => {
        const form = document.getElementById('add-sticker-form');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    };

    document.getElementById('confirm-add-sticker').onclick = addSticker;

    document.getElementById('sticker-category-select').onchange = (e) => {
        document.getElementById('new-category-name').style.display = e.target.value === 'new' ? 'block' : 'none';
    };

    document.getElementById('cancel-batch-delete').onclick = exitStickerEditMode;

    document.getElementById('confirm-batch-delete').onclick = () => {
        if (selectedStickers.size === 0) return;
        if (!confirm(`确定要删除选中的 ${selectedStickers.size} 个表情包吗？`)) return;

        const category = state.stickers[state.currentStickerCategory];
        // 从后往前删，避免索引错乱
        const sortedIndices = Array.from(selectedStickers).sort((a, b) => b - a);
        sortedIndices.forEach(idx => {
            category.items.splice(idx, 1);
        });

        localStorage.setItem('all-stickers', JSON.stringify(state.stickers));
        exitStickerEditMode();
        showToast('已删除选中表情包');
    };

    document.getElementById('delete-category-btn').onclick = deleteCategory;
    document.getElementById('close-role-modal').onclick = () => {
        document.getElementById('role-binding-modal').style.display = 'none';
    };

    document.getElementById('save-role-binding').onclick = saveRoleBinding;

    document.getElementById('close-edit-modal').onclick = () => {
        document.getElementById('edit-message-modal').style.display = 'none';
    };

    document.getElementById('save-edit-message').onclick = saveEditMessage;

    function handleAIMomentsAction(momentId, actionType) {
        const prompt = `(系统指令：请以角色的身份，对 ID 为 ${momentId} 的朋友圈动态进行 ${actionType === 'like' ? '点赞并简短评论' : '回复'}。请直接输出回复内容，不要带括号)`;
        triggerAIResponse(prompt, momentId);
    }

    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.source !== 'yuii-phone-bridge') return;

        if (data.type === 'YUII_AI_REPLY') {
            if (isAIRequestPending) {
                isAIRequestPending = false;
                if (aiResponseTimer) clearTimeout(aiResponseTimer);

                if (data.replyText) {
                    const mode = data.mode || (lastAIRequest ? lastAIRequest.mode : null);
                    const targetId = data.targetId || (lastAIRequest ? lastAIRequest.targetId : null);
                    const chatId = data.chatId || (lastAIRequest ? lastAIRequest.chatId : null);

                    processAIReply(data.replyText, chatId, mode, targetId);

                    // 启动打字队列，逐条弹出消息
                    if (state.typingQueue && state.typingQueue.length > 0 && typeof window.processTypingQueue === 'function') {
                        window.processTypingQueue();
                    } else {
                        setIslandState('default');
                    }
                } else {
                    // 没有回复文本，尝试从 SillyTavern 加载
                    loadFromSillyTavern();
                    if (!state.typingQueue || state.typingQueue.length === 0) {
                        setIslandState('default');
                    }
                }
            }
        }

        if (data.type === 'YUII_AI_ERROR') {
            if (isAIRequestPending) {
                isAIRequestPending = false;
                if (aiResponseTimer) clearTimeout(aiResponseTimer);
                setIslandState('default');
                showToast('生成失败: ' + data.error, 'x-circle');
            }
        }
    });

    // 辅助函数：通过名字查找联系人ID
    function getContactIdByName(name) {
        if (state.contacts) {
            const contact = state.contacts.find(c => c.name === name);
            if (contact) return contact.id;
        }
        if (state.groups) {
            const group = state.groups.find(g => g.name === name);
            if (group) return group.id;
        }
        return name; // 找不到则返回原名
    }

    function processAIReply(text, chatId, mode, targetId) {
        // 兜底逻辑：如果缺少上下文，尝试从当前状态获取
        mode = mode || (state.currentPage === 'moments' ? 'moments' : 'chat');
        chatId = chatId || (state.currentChat ? state.currentChat.id : null);
        targetId = targetId || chatId;

        if (mode === 'moments') {
            const moment = state.moments.find(m => m.id === targetId);
            if (moment) {
                let hasNewComment = false;
                let hasMatchedFormat = false;

                // 1. 尝试解析所有 [评论|...] 格式
                const commentRegex = /\[评论\|(.*?)\]/g;
                let match;
                while ((match = commentRegex.exec(text)) !== null) {
                    hasMatchedFormat = true;
                    const cParts = match[1].split('|');
                    let senderName = '好友';
                    let replyToName = null;
                    let cleanText = '';

                    const cLastPart = cParts[cParts.length - 1];
                    const hasTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(cLastPart);

                    if (hasTime) {
                        if (cParts.length === 3) {
                            senderName = cParts[0];
                            cleanText = cParts[1];
                        } else if (cParts.length >= 4) {
                            senderName = cParts[0];
                            replyToName = cParts[1];
                            cleanText = cParts[2];
                        } else {
                            continue;
                        }
                    } else {
                        if (cParts.length === 2) {
                            senderName = cParts[0];
                            cleanText = cParts[1];
                        } else if (cParts.length >= 3) {
                            senderName = cParts[0];
                            replyToName = cParts[1];
                            cleanText = cParts[2];
                        } else {
                            continue;
                        }
                    }

                    const isUser = senderName === state.userName || senderName === state.stUserName || senderName === '我' || senderName === 'user';
                    if (isUser) {
                        // 忽略 AI 伪造的用户评论
                        continue;
                    }

                    const isDuplicate = moment.comments.some(c => c.authorName === senderName && c.text === cleanText);
                    if (!isDuplicate) {
                        moment.comments.push({
                            id: 'c' + Date.now() + Math.random().toString(36).substr(2, 5),
                            authorId: 'ai',
                            authorName: senderName,
                            replyToName: replyToName,
                            text: cleanText
                        });
                        hasNewComment = true;
                    }
                }

                // 2. 如果没有匹配到任何 [评论|...]，尝试解析 [人名|内容|时间]
                if (!hasNewComment && !hasMatchedFormat) {
                    const msgRegex = /\[(.*?)\]/g;
                    while ((match = msgRegex.exec(text)) !== null) {
                        if (match[0].startsWith('[评论|')) continue;
                        hasMatchedFormat = true;
                        const mParts = match[1].split('|');
                        if (mParts.length >= 2) {
                            let senderName = mParts[0];
                            let cleanText = mParts[1];
                            let replyToName = null;

                            const replyMatch = cleanText.match(/^回复\s*([^：:]+)[：:]\s*(.*)/);
                            if (replyMatch) {
                                replyToName = replyMatch[1];
                                cleanText = replyMatch[2];
                            }

                            const isUser = senderName === state.userName || senderName === state.stUserName || senderName === '我' || senderName === 'user';
                            if (isUser) {
                                // 忽略 AI 伪造的用户评论
                                continue;
                            }

                            const isDuplicate = moment.comments.some(c => c.authorName === senderName && c.text === cleanText);
                            if (!isDuplicate) {
                                moment.comments.push({
                                    id: 'c' + Date.now() + Math.random().toString(36).substr(2, 5),
                                    authorId: 'ai',
                                    authorName: senderName,
                                    replyToName: replyToName,
                                    text: cleanText
                                });
                                hasNewComment = true;
                            }
                        }
                    }
                }

                // 3. 终极兜底解析：角色名: 内容
                if (!hasNewComment && !hasMatchedFormat) {
                    const lines = text.split('\n');
                    lines.forEach(line => {
                        const lineMatch = line.match(/^([^：:\[\]]+)[：:]\s*(.*)/);
                        if (lineMatch) {
                            hasMatchedFormat = true;
                            let senderName = lineMatch[1];
                            let cleanText = lineMatch[2];
                            let replyToName = null;

                            const replyMatch = cleanText.match(/^回复\s*([^：:]+)[：:]\s*(.*)/);
                            if (replyMatch) {
                                replyToName = replyMatch[1];
                                cleanText = replyMatch[2];
                            }

                            const isUser = senderName === state.userName || senderName === state.stUserName || senderName === '我' || senderName === 'user';
                            if (isUser) {
                                // 忽略 AI 伪造的用户评论
                                return;
                            }

                            const isDuplicate = moment.comments.some(c => c.authorName === senderName && c.text === cleanText);
                            if (!isDuplicate) {
                                moment.comments.push({
                                    id: 'c' + Date.now() + Math.random().toString(36).substr(2, 5),
                                    authorId: 'ai',
                                    authorName: senderName,
                                    replyToName: replyToName,
                                    text: cleanText
                                });
                                hasNewComment = true;
                            }
                        }
                    });
                }

                // 4. 终极无格式兜底：如果完全没有解析出任何东西，且不包含 <pyq>，直接把整段话当做回复
                if (!hasNewComment && !hasMatchedFormat && !text.includes('<pyq>') && !text.includes('<post')) {
                    let cleanText = text.trim();
                    // 去掉可能存在的引号和前缀
                    cleanText = cleanText.replace(/^["'「”]+|["'」”]+$/g, '');
                    cleanText = cleanText.replace(/^(回复)?.*?[：:]\s*/, ''); // 去掉可能的 "XXX回复:" 前缀

                    if (cleanText.length > 0) {
                        // 推断发送者
                        let fallbackSender = moment.authorName;
                        let fallbackReplyTo = null;
                        if (moment.comments && moment.comments.length > 0) {
                            const lastComment = moment.comments[moment.comments.length - 1];
                            const isLastUser = lastComment.authorName === state.userName || lastComment.authorName === state.stUserName || lastComment.authorName === '我' || lastComment.authorName === 'user';
                            if (isLastUser) {
                                fallbackSender = lastComment.replyToName || moment.authorName;
                                fallbackReplyTo = state.userName;
                            } else {
                                fallbackSender = moment.authorName;
                                fallbackReplyTo = lastComment.authorName;
                            }
                        }

                        const isDuplicate = moment.comments.some(c => c.text === cleanText);
                        if (!isDuplicate) {
                            moment.comments.push({
                                id: 'c' + Date.now() + Math.random().toString(36).substr(2, 5),
                                authorId: 'ai',
                                authorName: fallbackSender,
                                replyToName: fallbackReplyTo,
                                text: cleanText
                            });
                            hasNewComment = true;
                        }
                    }
                }

                if (hasNewComment) {
                    saveMoments();
                    renderMomentsList();
                    showToast('朋友圈收到新回复', 'sparkles');
                } else {
                    console.warn('[SillyPhone] AI 生成了重复的评论或无法解析:', text);
                    showToast('AI 重复了之前的话，请重试', 'alert-circle');
                }
                return; // 处理完回复直接返回
            }
        }

        // 尝试解析 <shouji> 格式（包含朋友圈和消息）
        const defaultChatName = state.currentChat ? state.currentChat.name : (chatId === 'system_queue' ? '系统' : chatId);
        const parsedData = parseAuthorFormat(text, defaultChatName, mode);
        let hasProcessedAnything = false;

        // 1. 处理解析出的朋友圈动态
        if (parsedData.moments && parsedData.moments.length > 0) {
            let hasUpdates = false;
            // 倒序遍历，确保最新的在最上面（假设 AI 按顺序输出 post:1, post:2）
            [...parsedData.moments].reverse().forEach(newM => {
                // 查找是否已经存在相同作者和内容的朋友圈
                const existingM = state.moments.find(m => m.authorName === newM.authorName && m.content === newM.content);
                if (existingM) {
                    // 如果存在，只合并新评论
                    newM.comments.forEach(newC => {
                        const commentExists = existingM.comments.some(c =>
                            c.authorName === newC.authorName && c.text === newC.text
                        );
                        if (!commentExists) {
                            existingM.comments.push(newC);
                            hasUpdates = true;
                        }
                    });
                } else {
                    // 如果不存在，作为新朋友圈插入到最前面
                    state.moments.unshift(newM);
                    hasUpdates = true;
                }
            });

            if (hasUpdates) {
                saveMoments();
                renderMomentsList();
                showToast('朋友圈有新动态', 'sparkles');
                hasProcessedAnything = true;
            }
        }

        // 2. 处理解析出的聊天消息
        for (const cid in parsedData.messages) {
            if (parsedData.messages[cid].length > 0) {
                hasProcessedAnything = true;
                let effectiveCid = cid;
                let realCid = getContactIdByName(effectiveCid);

                // 如果 cid 是用户自己，说明 AI 搞反了视角
                if (effectiveCid === state.userName || effectiveCid === '我' || effectiveCid === 'user' || effectiveCid === 'me' || effectiveCid === state.wechatId || (state.stUserName && effectiveCid === state.stUserName)) {
                    const aiMsg = parsedData.messages[cid].find(m => {
                        const s = m.sender;
                        return s && s !== '我' && s !== state.userName && s !== 'user' && s !== 'me' && s !== '系统消息' && s !== state.wechatId && (!state.stUserName || s !== state.stUserName);
                    });
                    if (aiMsg && aiMsg.sender) {
                        effectiveCid = aiMsg.sender;
                        realCid = getContactIdByName(effectiveCid);
                    } else if (state.currentChat) {
                        effectiveCid = state.currentChat.name;
                        realCid = state.currentChat.id;
                    }
                }

                if (!state.messages[realCid]) state.messages[realCid] = [];
                const getNormalizedType = (m) => {
                    let t = m.msgType || m.type;
                    if (t === 'ai' || t === 'user') return 'text';
                    if (t === 'image') return 'photo';
                    if (t === 'redpacket') return 'red-packet';
                    return t;
                };
                const existingSignatures = new Set(state.messages[realCid].map(m => `${m.senderName || m.sender || m.senderId}|${getNormalizedType(m)}|${m.content || m.text || m.duration || ''}`));
                const newMsgs = parsedData.messages[cid].filter(m => {
                    const sig = `${m.senderName || m.sender || m.senderId}|${getNormalizedType(m)}|${m.content || m.text || m.duration || ''}`;
                    if (existingSignatures.has(sig)) return false;
                    existingSignatures.add(sig);
                    return true;
                });

                const formattedMsgs = newMsgs.map(m => {
                    let senderName = m.sender || effectiveCid;
                    const isUser = senderName === state.userName ||
                        senderName === '我' ||
                        senderName === 'user' ||
                        senderName === 'me' ||
                        senderName === state.wechatId ||
                        (state.stUserName && senderName === state.stUserName);

                    if (isUser) {
                        senderName = state.userName;
                    } else if (state.currentChat && !state.currentChat.isGroup && realCid === state.currentChat.id) {
                        senderName = state.currentChat.name;
                    }

                    const formattedMsg = {
                        id: m.id || 'msg_' + Math.random().toString(36).substr(2, 9),
                        type: isUser ? 'user' : 'ai',
                        senderId: isUser ? 'user' : (getContactIdByName(senderName) || senderName),
                        senderName: senderName,
                        originalSender: m.sender,
                        avatar: m.avatar || '',
                        time: m.time,
                        text: m.content || m.text,
                        originalText: m.content || m.text,
                        msgType: m.type === 'image' ? 'photo' : (m.type === 'redpacket' ? 'red-packet' : m.type),
                        url: m.type === 'sticker' ? m.content : m.url,
                        description: m.type === 'image' ? m.content : undefined,
                        duration: m.duration,
                        amount: m.amount,
                        remark: m.remark,
                        status: m.status,
                        count: m.type === 'redpacket' ? (m.count || 1) : undefined,
                        grabRecords: m.type === 'redpacket' ? (m.grabRecords || []) : undefined,
                        remainingAmount: m.type === 'redpacket' ? (m.remainingAmount || 0) : undefined,
                        remainingCount: m.type === 'redpacket' ? (m.remainingCount || 0) : undefined,
                        quote: m.quote,
                        isRecalled: m.type === 'recall'
                    };

                    if (formattedMsg.type !== 'user') {
                        formattedMsg.isTypingPending = true;
                        if (!state.typingQueue) state.typingQueue = [];
                        state.typingQueue.push(formattedMsg);
                    }
                    return formattedMsg;
                }).filter(m => m.type !== 'user');

                state.messages[realCid].push(...formattedMsgs);
            }
        }

        if (hasProcessedAnything) {
            saveMessagesToLocalStorage();
            if (state.currentPage === 'chat-window' && chatId) {
                renderMessages(chatId);
            }
            return;
        }

        // 检查是否是上帝模式或群聊，尝试解析多行对话
        const isGroup = state.currentChat && state.currentChat.isGroup;
        const isGodMode = state.currentChat && state.currentChat.godMode;

        // 清理可能残留的标签
        let cleanText = text.replace(/<shouji>[\s\S]*?(?:<\/shouji>|$)/g, '').replace(/<horae>[\s\S]*?(?:<\/horae>|$)/g, '').trim();
        if (!cleanText) {
            cleanText = text;
        }

        if (isGroup || isGodMode) {
            if (!chatId || !state.messages[chatId]) return;
            const lines = cleanText.split('\n').filter(l => l.trim());
            let processedAny = false;

            lines.forEach(line => {
                const match = line.match(/^([^：:]+)[：:]\s*(.*)/);
                if (match) {
                    const senderName = match[1].trim();
                    const content = match[2].trim();
                    const contact = state.contacts.find(c => c.name === senderName);
                    const senderId = contact ? contact.id : chatId;
                    const time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');
                    state.messages[chatId].push({
                        id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5),
                        type: 'ai',
                        senderId: senderId,
                        senderName: senderName,
                        time: time,
                        text: content
                    });
                    processedAny = true;
                }
            });

            if (processedAny) {
                saveMessagesToLocalStorage();
                renderMessages(chatId);
                showToast('收到新消息', 'message-square');
                return;
            }
        }

        // 普通单人聊天或解析失败的兜底
        if (!chatId || !state.messages[chatId]) return;
        const time = new Date().getHours() + ':' + new Date().getMinutes().toString().padStart(2, '0');

        const newMessage = {
            id: 'msg_' + Date.now(),
            type: 'ai',
            senderId: chatId,
            time: time,
            text: cleanText
        };

        state.messages[chatId].push(newMessage);
        saveMessagesToLocalStorage();
        renderMessages(chatId);
        showToast('收到新消息', 'message-square');
    }

    // 响应式缩放逻辑
    function handleResize() {
        const screenEl = document.querySelector('.screen');
        if (!screenEl) return;

        const baseWidth = 360;
        const baseHeight = 600;

        // 考虑 body 的 padding (20px * 2 = 40px)
        const availableWidth = window.innerWidth - 40;
        const availableHeight = window.innerHeight - 40;

        const scaleX = availableWidth / baseWidth;
        const scaleY = availableHeight / baseHeight;

        // 取最小的缩放比例，但不超过 1（不放大）
        const scale = Math.min(scaleX, scaleY, 1);

        screenEl.style.transform = `scale(${scale})`;
        screenEl.style.transformOrigin = 'center center';
    }

    window.addEventListener('resize', handleResize);
    handleResize();

    // 初始化函数
    async function init() {
        // 1. 优先尝试从酒馆后端加载设置
        const backendData = await loadSettingsFromST();
        if (backendData) {
            if (backendData.settings) state.settings = { ...state.settings, ...backendData.settings };
            if (backendData.presets) state.presets = backendData.presets;
            if (backendData.activeAccountId) state.activeAccountId = backendData.activeAccountId;
            console.log('[SillyPhone] 已从酒馆后端恢复设置');
        }

        // 2. 加载本地存储 (聊天、表情包、头像)
        loadUserStickers();

        const localData = localStorage.getItem(getStorageKey());
        if (localData) {
            try {
                const saved = JSON.parse(localData);
                // 如果后端没读到，则用本地设置兜底
                if (!backendData) {
                    if (saved.settings) state.settings = { ...state.settings, ...saved.settings };
                    if (saved.presets) state.presets = saved.presets;
                    if (saved.activeAccountId) state.activeAccountId = saved.activeAccountId;
                }

                if (saved.userAccounts) {
                    state.userAccounts = saved.userAccounts;
                    const active = state.userAccounts.find(a => a.id === state.activeAccountId) || state.userAccounts[0];
                    if (active) {
                        state.contacts = active.contacts || [];
                        state.groups = active.groups || [];
                        state.messages = active.messages || {};
                        state.moments = active.moments || [];
                    }
                }
                state._dataLoaded = true;
            } catch (e) { }
        } else {
            state._dataLoaded = true;
        }

        applySettings();
        renderChatList();
        handleResize();
    }

    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSillyPhoneUI);
} else {
    // 如果是动态注入（如酒馆正则），DOM 已经加载完毕，直接执行
    initSillyPhoneUI();
}
