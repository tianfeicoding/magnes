(function () {
    const { React } = window;
    const { useEffect, useState, useCallback } = React;
    const Icons = window.MagnesComponents?.UI?.Icons || {};
    const RefreshCw = Icons.RefreshCw || (() => null);
    const Check = Icons.Check || (() => null);
    const X = Icons.X || (() => null);

    const formatDate = (value) => {
        if (!value) return '未知时间';
        try {
            return new Date(value).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return value;
        }
    };

    const sourceLabel = {
        user_saved: '用户保存',
        auto_mined: '系统沉淀',
        imported: '外部导入'
    };

    const renderStepText = (step, index) => {
        if (typeof step === 'string') return step;
        if (!step || typeof step !== 'object') return `步骤 ${index + 1}`;
        return step.label || step.name || step.action || step.description || `步骤 ${index + 1}`;
    };

    const readManifestArray = (manifest, key) => {
        const value = manifest?.[key];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    };

    const SkillCard = ({ candidate, mode = 'draft', onApprove, onReject, onRename, onUseSkill, onSetSkillEnabled, busyId }) => {
        const isDraft = mode === 'draft';
        const manifest = candidate.manifest || {};
        const steps = Array.isArray(candidate.workflowSteps)
            ? candidate.workflowSteps
            : readManifestArray(manifest, 'workflow_steps');
        const usageSummary = readManifestArray(manifest, 'usage_summary');
        const triggers = isDraft
            ? (Array.isArray(candidate.triggerExamples) ? candidate.triggerExamples : [])
            : (usageSummary.length > 0 ? usageSummary : readManifestArray(manifest, 'triggers'));
        const tools = Array.isArray(candidate.requiredTools)
            ? candidate.requiredTools
            : readManifestArray(manifest, 'tools');
        const busy = busyId === candidate.id;
        const [isEditingName, setIsEditingName] = useState(false);
        const [draftName, setDraftName] = useState(candidate.proposedName || candidate.name || '');

        useEffect(() => {
            setDraftName(candidate.proposedName || candidate.name || '');
        }, [candidate.proposedName, candidate.name]);

        const displayName = candidate.proposedName || candidate.name || (isDraft ? '未命名技能草稿' : '未命名技能');

        const saveName = async () => {
            const nextName = draftName.trim();
            if (!nextName || nextName === candidate.proposedName) {
                setDraftName(candidate.proposedName || '');
                setIsEditingName(false);
                return;
            }
            if (isDraft) {
                await onRename(candidate.id, nextName);
            }
            setIsEditingName(false);
        };

        const handleNameKeyDown = async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await saveName();
            }
            if (e.key === 'Escape') {
                setDraftName(candidate.proposedName || '');
                setIsEditingName(false);
            }
        };

        return (
            <div className="border border-black bg-white p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-black text-white text-[10px] font-bold uppercase">
                                {isDraft ? 'DRAFT' : 'ENABLED'}
                            </span>
                            <span className="text-[11px] font-bold text-zinc-500">
                                {sourceLabel[candidate.source] || candidate.source || '未知来源'}
                            </span>
                            <span className="text-[11px] text-zinc-400">{formatDate(candidate.createdAt)}</span>
                        </div>
                        {isEditingName ? (
                            <input
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                                onBlur={saveName}
                                onKeyDown={handleNameKeyDown}
                                disabled={busy}
                                autoFocus
                                className="w-full max-w-[360px] border border-black bg-white px-2 py-1 text-lg font-bold text-black leading-tight outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-50"
                                placeholder={isDraft ? '输入技能草稿名称' : '输入技能名称'}
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => isDraft && !busy && setIsEditingName(true)}
                                disabled={busy}
                                title={isDraft ? '点击改名' : ''}
                                className={`block max-w-[360px] text-left text-lg font-bold text-black leading-tight truncate border-b border-transparent disabled:opacity-50 disabled:hover:border-transparent ${isDraft ? 'hover:border-black' : ''}`}
                            >
                                {displayName}
                            </button>
                        )}
                        {!isDraft && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="px-2 py-0.5 border border-black bg-white text-black font-bold">
                                    已生成 SKILL.md
                                </span>
                                <span className={`px-2 py-0.5 border border-black font-bold ${candidate.enabled === false ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                    {candidate.enabled === false ? '已停用' : '已启用'}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Confidence</div>
                        <div className="text-xl font-black text-black">
                            {Math.round((candidate.confidence || 0) * 100)}%
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="border border-zinc-200 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">怎么使用</div>
                        {triggers.length > 0 ? (
                            <div className="space-y-1">
                                {triggers.slice(0, 5).map((item, index) => (
                                    <div key={index} className="text-[12px] text-black leading-relaxed break-words">{item}</div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[12px] text-zinc-400">暂无触发说明</div>
                        )}
                    </div>

                    <div className="border border-zinc-200 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">工作流步骤</div>
                        {steps.length > 0 ? (
                            <div className="space-y-1">
                                {steps.slice(0, 8).map((step, index) => (
                                    <div key={index} className="text-[12px] text-black flex gap-2">
                                        <span className="font-bold">{index + 1}.</span>
                                        <span className="line-clamp-2">{renderStepText(step, index)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[12px] text-zinc-400">暂无结构化步骤</div>
                        )}
                    </div>

                    <div className="border border-zinc-200 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">依赖工具</div>
                        {tools.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {tools.slice(0, 6).map((tool, index) => (
                                    <span key={index} className="px-2 py-1 border border-black text-[10px] font-bold bg-zinc-50">
                                        {tool}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="text-[12px] text-zinc-400">暂无工具依赖</div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                    <div className="text-[11px] text-zinc-400">
                        {isDraft ? '草稿' : '技能'} ID: {candidate.skillId || candidate.id}
                    </div>
                    {isDraft ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onReject(candidate.id)}
                                disabled={busy}
                                className="px-3 py-2 border border-black bg-white text-black text-[12px] font-bold hover:bg-zinc-50 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <X size={14} /> 忽略
                            </button>
                            <button
                                onClick={() => onApprove(candidate.id)}
                                disabled={busy}
                                className="px-3 py-2 border border-black bg-black text-white text-[12px] font-bold hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Check size={14} /> 启用草稿
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onUseSkill(candidate)}
                                disabled={busy || candidate.enabled === false}
                                className="px-3 py-2 border border-black bg-black text-white text-[12px] font-bold hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1.5"
                            >
                                <Check size={14} /> 使用技能
                            </button>
                            {candidate.enabled === false ? (
                                <button
                                    onClick={() => onSetSkillEnabled(candidate, true)}
                                    disabled={busy}
                                    className="px-3 py-2 border border-black bg-white text-black text-[12px] font-bold hover:bg-zinc-50 disabled:opacity-40 flex items-center gap-1.5"
                                >
                                    <Check size={14} /> 启用
                                </button>
                            ) : (
                                <button
                                    onClick={() => onSetSkillEnabled(candidate, false)}
                                    disabled={busy}
                                    className="px-3 py-2 border border-black bg-white text-black text-[12px] font-bold hover:bg-zinc-50 disabled:opacity-40 flex items-center gap-1.5"
                                >
                                    <X size={14} /> 停用
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const SkillLibraryPanel = ({ toast, setActiveTab }) => {
        const [activeSection, setActiveSection] = useState('enabled');
        const [drafts, setDrafts] = useState([]);
        const [enabledSkills, setEnabledSkills] = useState([]);
        const [loading, setLoading] = useState(false);
        const [busyId, setBusyId] = useState(null);
        const [error, setError] = useState('');

        const loadSkills = useCallback(async () => {
            const API = window.MagnesComponents.Utils.API;
            setLoading(true);
            setError('');
            try {
                const result = activeSection === 'enabled'
                    ? await API.Skills.listInstalled()
                    : await API.Skills.listCandidates({ status: 'draft' });
                const list = Array.isArray(result?.data) ? result.data : [];
                if (activeSection === 'enabled') {
                    setEnabledSkills(list);
                } else {
                    setDrafts(list);
                }
            } catch (e) {
                console.error('[SkillLibraryPanel] 加载技能列表失败:', e);
                setError(e.message || '加载技能列表失败');
                if (toast) toast('加载技能列表失败', 'error');
            } finally {
                setLoading(false);
            }
        }, [activeSection, toast]);

        useEffect(() => {
            if (activeSection === 'market') return;
            loadSkills();
        }, [activeSection, loadSkills]);

        const updateStatus = async (candidateId, status) => {
            const API = window.MagnesComponents.Utils.API;
            setBusyId(candidateId);
            try {
                const result = await API.Skills.updateCandidate(candidateId, { status });
                const updated = result?.data;
                const installed = result?.installedSkill;
                setDrafts(prev => prev.filter(item => item.id !== candidateId));
                if (status === 'approved' && updated) {
                    await loadInstalledSkills();
                    setActiveSection('enabled');
                }
                if (toast) {
                    if (status === 'approved' && installed) {
                        toast('技能已生成并启用', 'success');
                    } else {
                        toast(status === 'approved' ? '技能草稿已启用' : '技能草稿已忽略', 'success');
                    }
                }
            } catch (e) {
                console.error('[SkillLibraryPanel] 更新技能草稿失败:', e);
                if (toast) toast('更新技能草稿失败', 'error');
            } finally {
                setBusyId(null);
            }
        };

        const loadInstalledSkills = async () => {
            const API = window.MagnesComponents.Utils.API;
            const result = await API.Skills.listInstalled();
            setEnabledSkills(Array.isArray(result?.data) ? result.data : []);
        };

        const setSkillEnabledState = async (skill, enabled) => {
            const API = window.MagnesComponents.Utils.API;
            setBusyId(skill.id);
            try {
                const result = await API.Skills.updateInstalled(skill.id, { enabled });
                const updated = result?.data;
                setEnabledSkills(prev => prev.map(item => item.id === skill.id ? { ...item, ...(updated || {}), enabled } : item));
                if (toast) toast(enabled ? '技能已启用' : '技能已停用', 'success');
            } catch (e) {
                console.error('[SkillLibraryPanel] 更新技能启用状态失败:', e);
                if (toast) toast('更新技能启用状态失败', 'error');
            } finally {
                setBusyId(null);
            }
        };

        const renameCandidate = async (candidateId, proposedName) => {
            const API = window.MagnesComponents.Utils.API;
            setBusyId(candidateId);
            try {
                const result = await API.Skills.updateCandidate(candidateId, { proposedName });
                const updated = result?.data;
                const applyRename = item => (
                    item.id === candidateId
                        ? { ...item, proposedName: updated?.proposedName || proposedName }
                        : item
                );
                setDrafts(prev => prev.map(item => (
                    applyRename(item)
                )));
                setEnabledSkills(prev => prev.map(item => applyRename(item)));
                if (toast) toast('技能草稿已重命名', 'success');
            } catch (e) {
                console.error('[SkillLibraryPanel] 重命名技能草稿失败:', e);
                if (toast) toast('重命名技能草稿失败', 'error');
                throw e;
            } finally {
                setBusyId(null);
            }
        };

        const useSkill = async (skill) => {
            const API = window.MagnesComponents.Utils.API;
            setBusyId(skill.id);
            try {
                const result = await API.Skills.useInstalled(skill.id);
                const data = result?.data || {};
                if (setActiveTab) setActiveTab('canvas');
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('magnes:activate_skill', {
                        detail: {
                            id: data.activeSkill,
                            label: skill.name || data.skill?.name,
                            summary: data.skillSummary,
                            starterPrompt: data.starterPrompt,
                            installedSkillId: skill.id,
                            resolved: true
                        }
                    }));
                }, 50);
                if (toast) toast(`已选择技能：${skill.name || data.skill?.name || '未命名技能'}`, 'success');
            } catch (e) {
                console.error('[SkillLibraryPanel] 使用技能失败:', e);
                if (toast) toast('使用技能失败', 'error');
            } finally {
                setBusyId(null);
            }
        };

        return (
            <div className="flex-1 overflow-auto bg-zinc-50 h-full">
                <div className="max-w-[1280px] mx-auto p-8">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center -space-x-[1px]">
                            {[
                                { key: 'enabled', label: '我的技能' },
                                { key: 'drafts', label: '技能草稿箱' },
                                { key: 'market', label: '在线技能库' }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveSection(tab.key)}
                                    className={`px-5 py-2 border border-black text-[12px] font-bold transition-all ${activeSection === tab.key ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={loadSkills}
                            disabled={loading}
                            className="px-4 py-2 border border-black bg-white text-black text-[12px] font-bold hover:bg-zinc-50 disabled:opacity-40 flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            刷新
                        </button>
                    </div>

                    {activeSection === 'drafts' ? (
                        <div className="space-y-4">
                            <div className="flex items-end justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-black">技能草稿箱</h3>
                                    <p className="text-[12px] text-zinc-500 mt-1">
                                        这里展示系统从对话、画布和任务轨迹中沉淀出的可复用技能草稿。
                                    </p>
                                </div>
                                <div className="text-[12px] font-bold text-zinc-400">共 {drafts.length} 条</div>
                            </div>

                            {error && (
                                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 text-[12px] font-bold">
                                    {error}
                                </div>
                            )}

                            {loading ? (
                                <div className="border border-dashed border-zinc-300 bg-white py-20 text-center text-zinc-400 font-bold">
                                    正在加载技能草稿...
                                </div>
                            ) : drafts.length === 0 ? (
                                <div className="border border-dashed border-zinc-300 bg-white py-20 text-center">
                                    <div className="text-zinc-400 font-bold mb-2">暂无技能草稿</div>
                                    <div className="text-[12px] text-zinc-400">
                                        后续在对话或画布中完成可复用工作流后，可以主动保存或由系统自动沉淀到这里。
                                    </div>
                                </div>
                            ) : (
                                drafts.map(candidate => (
                                    <SkillCard
                                        key={candidate.id}
                                        candidate={candidate}
                                        mode="draft"
                                        busyId={busyId}
                                        onApprove={(id) => updateStatus(id, 'approved')}
                                        onReject={(id) => updateStatus(id, 'rejected')}
                                        onRename={renameCandidate}
                                    />
                                ))
                            )}
                        </div>
                    ) : activeSection === 'enabled' ? (
                        <div className="space-y-4">
                            <div className="flex items-end justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-black">我的技能</h3>
                                    <p className="text-[12px] text-zinc-500 mt-1">
                                        已启用的技能会作为后续 Planner 自动召回和用户显式点选的候选。
                                    </p>
                                </div>
                                <div className="text-[12px] font-bold text-zinc-400">共 {enabledSkills.length} 条</div>
                            </div>

                            {error && (
                                <div className="border border-red-500 bg-red-50 text-red-700 px-4 py-3 text-[12px] font-bold">
                                    {error}
                                </div>
                            )}

                            {loading ? (
                                <div className="border border-dashed border-zinc-300 bg-white py-20 text-center text-zinc-400 font-bold">
                                    正在加载我的技能...
                                </div>
                            ) : enabledSkills.length === 0 ? (
                                <div className="border border-dashed border-zinc-300 bg-white py-20 text-center">
                                    <div className="text-zinc-400 font-bold mb-2">暂无已启用技能</div>
                                    <div className="text-[12px] text-zinc-400">
                                        在技能草稿箱点击“启用草稿”后，会出现在这里。
                                    </div>
                                </div>
                            ) : (
                                enabledSkills.map(candidate => (
                                    <SkillCard
                                        key={candidate.id}
                                        candidate={candidate}
                                        mode="enabled"
                                        busyId={busyId}
                                        onRename={renameCandidate}
                                        onUseSkill={useSkill}
                                        onSetSkillEnabled={setSkillEnabledState}
                                    />
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="border border-dashed border-zinc-300 bg-white py-20 text-center">
                            <div className="text-zinc-400 font-bold mb-2">
                                在线技能库暂未开放
                            </div>
                            <div className="text-[12px] text-zinc-400">
                                当前批次先完成技能草稿箱和我的技能，下一批次再接入在线导入。
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    window.MagnesComponents.Skills = window.MagnesComponents.Skills || {};
    window.MagnesComponents.Skills.SkillLibraryPanel = SkillLibraryPanel;
})();
