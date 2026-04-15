/**
 * Login Modal Component
 * 登录/注册弹窗组件
 * 风格与 Magnes 其他弹窗保持一致（参考模型配置弹窗）
 * @module src/components/ui/LoginModal
 * @version 1.0.0
 */

(function () {
    'use strict';

    const { React } = window;
    const { Modal } = window.MagnesComponents.UI;

    /**
     * Login Modal 组件
     * @param {Object} props - 组件属性
     * @param {boolean} props.isOpen - 是否打开
     * @param {function} props.onClose - 关闭回调
     * @param {function} props.onLoginSuccess - 登录成功回调
     * @param {boolean} props.requireApiKey - 登录成功后是否需要检查API KEY
     */
    const LoginModal = ({ isOpen, onClose, onLoginSuccess, requireApiKey = true }) => {
        const h = React.createElement;
        const { useState, useEffect } = React;

        const [isLogin, setIsLogin] = useState(true); // true=登录, false=注册
        const [username, setUsername] = useState('');
        const [password, setPassword] = useState('');
        const [confirmPassword, setConfirmPassword] = useState('');
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState('');

        // 清空表单当弹窗打开/关闭时
        useEffect(() => {
            if (isOpen) {
                setUsername('');
                setPassword('');
                setConfirmPassword('');
                setError('');
                setLoading(false);
            }
        }, [isOpen, isLogin]);

        // 检查是否已设置 API KEY（从后端获取状态）
        const hasApiKeyConfigured = async () => {
            try {
                const API = window.MagnesComponents.Utils.API;
                const response = await API.magnesFetch('/auth/status');
                const data = await response.json();
                if (data.status === 'success' && data.configs) {
                    // 检查 global_api_key 是否已配置
                    return data.configs.global_api_key?.configured === true;
                }
                return false;
            } catch (e) {
                console.error('[LoginModal] 检查 API Key 状态失败:', e);
                // 降级检查 localStorage
                const globalKey = localStorage.getItem('magnes_global_key');
                return globalKey && globalKey.trim().length > 0;
            }
        };

        // 处理登录/注册
        const handleSubmit = async (e) => {
            e.preventDefault();
            setError('');

            // 表单验证
            if (!username.trim() || !password.trim()) {
                setError('请输入用户名和密码');
                return;
            }

            if (!isLogin && password !== confirmPassword) {
                setError('两次输入的密码不一致');
                return;
            }

            if (username.length < 3) {
                setError('用户名至少需要3个字符');
                return;
            }

            if (password.length < 6) {
                setError('密码至少需要6个字符');
                return;
            }

            setLoading(true);

            try {
                const API = window.MagnesComponents.Utils.API;
                const { Storage } = window.BaseAPI || {};

                // 使用 quick-register 接口（自动登录/注册）
                const response = await API.magnesFetch('/auth/quick-register', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: username.trim(),
                        password: password
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || '登录失败，请检查用户名和密码');
                }

                // 保存 Token 和用户信息
                if (data.access_token && Storage) {
                    Storage.saveUserToken(data.access_token);
                    Storage.saveUserInfo({
                        username: username.trim(),
                        isLoggedIn: true
                    });
                }

                // 登录成功回调
                if (onLoginSuccess) {
                    onLoginSuccess(data);
                }

                // 关闭登录弹窗
                onClose();

                // 如果需要API KEY且未设置，弹出设置弹窗
                const apiKeyConfigured = await hasApiKeyConfigured();
                if (requireApiKey && !apiKeyConfigured) {
                    // 延迟一点弹出，让用户看到登录成功
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('magnes:open_settings', {
                            detail: { reason: 'api_key_required' }
                        }));
                    }, 300);
                }

            } catch (err) {
                console.error('登录/注册错误:', err);
                setError(err.message || '网络错误，请稍后重试');
            } finally {
                setLoading(false);
            }
        };

        // 切换登录/注册模式
        const toggleMode = () => {
            setIsLogin(!isLogin);
            setError('');
        };

        if (!isOpen) return null;

        return h(Modal, {
            isOpen,
            onClose,
            title: isLogin ? '登录' : '注册',
            theme: 'light'
        }, h('div', { className: 'p-8 space-y-8' }, [
            // 错误提示
            error && h('div', {
                className: 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-[13px]',
                key: 'error'
            }, error),

            // 表单
            h('form', {
                onSubmit: handleSubmit,
                className: 'space-y-6',
                key: 'form'
            }, [
                // 用户名输入
                h('div', { className: 'flex flex-col gap-2', key: 'username' }, [
                    h('label', {
                        className: 'text-[12px] text-zinc-500 font-medium uppercase tracking-wider'
                    }, '用户名'),
                    h('input', {
                        type: 'text',
                        value: username,
                        onChange: (e) => setUsername(e.target.value),
                        placeholder: '输入用户名（至少3个字符）',
                        disabled: loading,
                        className: 'border-b border-zinc-200 py-2.5 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800 placeholder:text-zinc-400'
                    })
                ]),

                // 密码输入
                h('div', { className: 'flex flex-col gap-2', key: 'password' }, [
                    h('label', {
                        className: 'text-[12px] text-zinc-500 font-medium uppercase tracking-wider'
                    }, '密码'),
                    h('input', {
                        type: 'password',
                        value: password,
                        onChange: (e) => setPassword(e.target.value),
                        placeholder: '输入密码（至少6个字符）',
                        disabled: loading,
                        className: 'border-b border-zinc-200 py-2.5 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800 placeholder:text-zinc-400'
                    })
                ]),

                // 确认密码（仅注册模式）
                !isLogin && h('div', { className: 'flex flex-col gap-2', key: 'confirm' }, [
                    h('label', {
                        className: 'text-[12px] text-zinc-500 font-medium uppercase tracking-wider'
                    }, '确认密码'),
                    h('input', {
                        type: 'password',
                        value: confirmPassword,
                        onChange: (e) => setConfirmPassword(e.target.value),
                        placeholder: '再次输入密码',
                        disabled: loading,
                        className: 'border-b border-zinc-200 py-2.5 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800 placeholder:text-zinc-400'
                    })
                ]),

                // 提交按钮
                h('button', {
                    type: 'submit',
                    disabled: loading,
                    className: 'w-full py-3 mt-4 text-[13px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed'
                }, loading ? '处理中...' : (isLogin ? '登录' : '注册'))
            ]),

            // 切换登录/注册
            h('div', {
                className: 'flex justify-center pt-4 border-t border-zinc-100',
                key: 'toggle'
            }, h('button', {
                type: 'button',
                onClick: toggleMode,
                className: 'text-[12px] text-zinc-500 hover:text-black underline transition-colors'
            }, isLogin ? '还没有账号？点击注册' : '已有账号？点击登录')),

            // 说明文字
            h('div', {
                className: 'bg-zinc-50 p-4 border border-dashed border-zinc-200',
                key: 'info'
            }, h('p', {
                className: 'text-[11px] text-zinc-500 leading-relaxed'
            }, [
                h('strong', { key: 't1' }, '提示：'),
                '登录后您的模板、历史记录和RAG数据将与账号关联。API Key 仍存储在本地浏览器中，不会上传到服务器。'
            ]))
        ]));
    };

    // 导出到全局命名空间
    if (!window.MagnesComponents) {
        window.MagnesComponents = {};
    }
    if (!window.MagnesComponents.UI) {
        window.MagnesComponents.UI = {};
    }

    window.MagnesComponents.UI.LoginModal = LoginModal;

    console.log('✅ LoginModal 组件已加载');
})();
