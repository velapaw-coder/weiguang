/** Chat formatting helpers shared by the coach page and restore tests. */

export const MODEL_NOTES = {
  model_unconfigured: '云端模型还没有配置，这次是本机整理的内容。内部测试包会在首次启动时预置密钥；也可以在「数据与隐私」高级设置里填写。',
  consent_required: '你还没有允许把记录摘要发给云端模型，这次是本机整理的内容。可以在下方允许后重试。',
  offline: '现在没有网络，这次是本机整理的内容。',
  skipped: '这次没有调用云端模型，是本机整理的内容。',
  model_failed: '云端模型这次没有返回，下面是本机整理的内容。',
  model_incomplete: '云端模型回答不完整，下面是本机整理的内容。',
  model_empty: '云端模型没有给出文字，下面是本机整理的内容。',
};

export const REASON_NOTES = {
  cancelled: '已取消这次请求。',
  timeout: '请求超时，可以再试一次。',
  transport: '网络请求没有完成，可以再试一次。',
  key_not_configured: '还没有可用的模型密钥。',
  release_direct_disabled: '正式包不能直连模型。',
  bad_url: '模型地址不正确。',
  bad_contract: '模型请求格式不正确。',
};

export function reasonNote(reason) {
  if (!reason) return '';
  if (REASON_NOTES[reason]) return REASON_NOTES[reason];
  if (String(reason).startsWith('http_')) return `云端返回 ${String(reason).slice(5)}，可以再试一次。`;
  return '';
}

export function coachItems(values) {
  const items = [];
  const status = values?.modelStatus;
  if (status === 'ok' && values.modelText) {
    items.push({ who: 'ai', text: values.modelText, retryable: false });
  } else {
    const lines = [MODEL_NOTES[status] || MODEL_NOTES.model_failed];
    const note = reasonNote(values?.modelReason);
    if (note) lines.push(note);
    for (const notice of values?.notices || []) {
      if (!/SDK/.test(notice)) lines.push(notice);
    }
    if (values?.followup) lines.push(values.followup);
    items.push({
      who: 'ai',
      text: lines.join('\n'),
      retryable: status === 'model_failed' || status === 'model_incomplete' || status === 'model_empty' || status === 'offline',
      lastQuestion: values?.question || '',
    });
  }
  for (const proposal of values?.proposals || []) {
    items.push({ who: 'proposal', proposal, saved: false, dismissed: false });
  }
  return items;
}

/** Rebuild chat lines from SQLite coach_results so reopen keeps the conversation. */
export function restoreCoachMessages(coachResults, opening) {
  const items = [{ who: 'ai', text: opening }];
  const rows = [...(coachResults || [])].sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
  for (const row of rows) {
    let summary = {};
    let result = {};
    try { summary = JSON.parse(row.summary_json || '{}'); } catch { summary = {}; }
    try { result = JSON.parse(row.result_json || '{}'); } catch { result = {}; }
    const question = String(summary.question || result.question || '').trim();
    if (question) items.push({ who: 'user', text: question });
    const values = {
      modelStatus: row.status || result.status || 'unknown',
      modelText: result.modelText || '',
      modelReason: result.modelReason || '',
      notices: result.notices || [],
      followup: result.followup || '',
      proposals: result.proposals || [],
      question,
    };
    for (const item of coachItems(values)) items.push(item);
  }
  return items;
}
