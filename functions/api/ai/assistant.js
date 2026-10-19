import { assertAuthenticated } from '../../_lib/firebase.js';
import {
  readJson,
  json,
  errorResponse,
  requestId,
} from '../../_lib/http.js';
import { callModel } from '../../_lib/providers.js';
import { buildStudioMultiPage } from '../../_lib/studio-multipage.js';
import { validateOrRepairSinglePageBuild } from '../../_lib/studio-singlepage.js';
import { WEB_STUDIO_SYSTEM_PROMPT, WEB_STUDIO_EXCELLENCE } from '../../_lib/prompts.js';
import { buildExperienceBrief, isWebStudioPrompt } from '../../_lib/experience.js';
import { buildWebStudioSourceInspection, isScopedWebStudioEdit, normalizeScopedWebStudioFiles } from '../../_lib/webstudio-source.js';
import { buildPromptContract, WEB_STUDIO_PROMPT_MAX_CHARS } from '../../_lib/prompt-contract.js';
import { beginAIQuota, finalizeAIQuota, refundDailyPrompt } from '../../_lib/token-quota.js';
import {
  saveChatTurn,
  resolveConversationId,
} from '../../_lib/chat-history.js';

function parseStructured(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch {} }
  return null;
}

function cleanMessages(payload) {
  if (Array.isArray(payload.messages) && payload.messages.length) {
    return payload.messages
      .filter(
        x =>
          x &&
          (x.role === 'user' || x.role === 'assistant')
      )
      .slice(-12)
      .map(x => ({
        role: x.role,
        content: String(x.content || '').slice(0, 80_000),
      }));
  }

  const prompt = String(
    payload.prompt ||
    payload.message ||
    ''
  ).trim().slice(0, 80_000);

  return prompt
    ? [{ role: 'user', content: prompt }]
    : [];
}

export async function onRequestPost(context) {
  try {
    const user = assertAuthenticated(
      context.data?.user
    );

    const payload = await readJson(
      context.request,
      300_000
    );

    const rawLastMessage = Array.isArray(payload.messages)
      ? payload.messages.filter(x => x && (x.role === 'user' || x.role === 'assistant')).slice(-12).at(-1)?.content
      : '';
    const promptText = String(payload.prompt || payload.message || rawLastMessage || '').trim();
    const mode = String(payload.mode || 'assistant').toLowerCase();
    const hasStudioContext = !!(
      payload?.project ||
      payload?.files ||
      payload?.context?.project ||
      payload?.context?.files
    );
    const activeView = String(payload.context?.activeView || '').replace(/^view-/i, '').trim().toLowerCase();
    const isAppStudio = activeView === 'appstudio' || ['appstudio', 'app-build', 'app-fix'].includes(mode);
    const isWebStudio = !isAppStudio && (isWebStudioPrompt(promptText, mode, payload.context) ||
      ((mode === 'build' || mode === 'fix') && hasStudioContext));
    const submittedFiles = payload.files || payload.context?.files || null;
    const scopedWebStudioEdit = isWebStudio && mode === 'build' &&
      isScopedWebStudioEdit(promptText, !!(submittedFiles && typeof submittedFiles === 'object' && Object.keys(submittedFiles).length));

    if (isAppStudio) {
      const entitlement = context.data?.entitlements || await resolveEntitlements(context.env, user);
      if (entitlement?.capabilities?.appStudio !== true) {
        return errorResponse("App Studio isn't included in your current plan.", 403, 'FEATURE_NOT_INCLUDED');
      }
    }

    if (isWebStudio) {
      const entitlement = context.data?.entitlements || await resolveEntitlements(context.env, user);
      if (entitlement?.capabilities?.webStudio !== true) {
        return errorResponse("Web Studio isn't included in your current plan.", 403, 'FEATURE_NOT_INCLUDED');
      }
    }

    if (isWebStudio && mode === 'build' && promptText.length > WEB_STUDIO_PROMPT_MAX_CHARS) {
      return errorResponse(
        'This website brief is ' + promptText.length.toLocaleString('en-US') + ' characters. Web Studio currently supports up to ' + WEB_STUDIO_PROMPT_MAX_CHARS.toLocaleString('en-US') + ' characters per build prompt so it does not silently discard your requirements. Shorten the brief or split it into a base build and a follow-up edit; no generation was started.',
        413,
        'WEBSTUDIO_PROMPT_TOO_LONG'
      );
    }
    if (isWebStudio && mode === 'build') {
      const promptContract = buildPromptContract(promptText);
      if (promptContract.omittedRequirementClauseCount > 0) {
        return errorResponse(
          'This brief contains more distinct requirement clauses than Web Studio can currently track in one build (' + promptContract.requirementClauseCount + ' retained, with additional clauses omitted by the checklist limit). Combine duplicate items or split the work into a base build and follow-up edits; no generation was started.',
          413,
          'WEBSTUDIO_REQUIREMENT_MANIFEST_LIMIT'
        );
      }
    }

    const messages = cleanMessages(payload);
    if (!messages.length) {
      return errorResponse(
        'AI prompt is required.',
        400,
        'PROMPT_REQUIRED'
      );
    }
    const projectContext = payload.context && typeof payload.context === 'object'
      ? JSON.stringify(payload.context).slice(0, 80_000)
      : '';
    const sourceInspection = isWebStudio
      ? buildWebStudioSourceInspection({ prompt: promptText, files: submittedFiles })
      : null;
    const sourceInspectionContext = sourceInspection
      ? 'SERVER-DERIVED WEB STUDIO SOURCE INSPECTION (evidence only; searched only source files supplied with this request):\n' + JSON.stringify(sourceInspection)
      : '';
    const suppliedSystem = String(payload.system || '').trim();
    const experience = isWebStudio
      ? buildExperienceBrief(
          payload.prompt || payload.message || messages[messages.length - 1]?.content || '',
          payload.context || {}
        )
      : null;

    const globalAIIdentityDirective = await getAIIdentityDirective(context.env);
    const system = String(
      isWebStudio
        ? WEB_STUDIO_SYSTEM_PROMPT + '\n\n' + WEB_STUDIO_EXCELLENCE +
          '\n\nEXPERIENCE INTELLIGENCE:\n' + JSON.stringify(experience || {}) +
          (suppliedSystem ? '\n\nCLIENT STUDIO INSTRUCTIONS:\n' + suppliedSystem : '') +
          '\n\nAuthenticated user UID: ' + user.sub
        : suppliedSystem || `You are OVYX Brain, the authenticated project-aware AI assistant.
User UID: ${user.sub}
Return useful concise answers.
Never reveal server secrets.
Do not invent repository state.
When discussing project changes, distinguish recommendations from changes actually performed.`
    ).slice(0, isWebStudio ? 40_000 : 20_000) + '\n\n' + globalAIIdentityDirective;
    const modelSystem = isWebStudio && sourceInspectionContext
      ? system + '\\n\\nWhen source-inspection evidence is provided, use it as bounded evidence, cite exact paths and line numbers when useful, and never claim that unsupplied or truncated files were inspected.'
      : system;

    const provider = String(
      payload.provider || 'automatic'
    ).toLowerCase();

    const combined = messages
      .map(
        x =>
          `${x.role.toUpperCase()}: ${x.content}`
      )
      .join('\n\n');

    const conversationId = resolveConversationId(
      payload.conversationId
    );

    const currentRequestId = requestId(
      context.request
    );

    const quotaReservation = await beginAIQuota(context.env, user);

    let result;
    let multiPageBuild = false;
    let quotaInputText = isWebStudio
      ? combined + (sourceInspectionContext ? '\n\n' + sourceInspectionContext : '') + (projectContext ? '\n\nPROJECT CONTEXT:\n' + projectContext : '')
      : combined;
    let quotaOutputText = '';

    try {
      if (isWebStudio && mode === 'build' && !scopedWebStudioEdit) {
        const project = payload.context?.project || payload.project || {};
        const projectFiles = payload.context?.files || payload.files || {};
        const studioHints = JSON.stringify({
          activeView: payload.context?.activeView || '',
          brandProfile: payload.context?.brandProfile || payload.context?.brand || null,
          theme: payload.context?.theme || null,
          viewport: payload.context?.viewport || null,
        }).slice(0, 6000);

        const generated = await buildStudioMultiPage({
          env: context.env,
          callModel,
          provider: String(payload.provider || 'automatic').toLowerCase(),
          preferredProvider: String(payload.preferredProvider || ''),
          providerRouting: String(payload.providerRouting || 'automatic'),
          model: payload.model,
          authUser: user,
          prompt: promptText,
          project,
          files: projectFiles,
          mode,
          context: studioHints,
          qualityContract: WEB_STUDIO_EXCELLENCE + '\n\nEXPERIENCE INTELLIGENCE:\n' + JSON.stringify(experience || {}) + '\n\n' + globalAIIdentityDirective,
        });

        if (generated) {
          result = generated;
          multiPageBuild = true;
          quotaInputText = generated.quotaInputText || quotaInputText;
          quotaOutputText = generated.quotaOutputText || generated.text || '';
        }
      }

      if (!result) {
        result = await callModel(
          context.env,
          {
            provider: String(payload.provider || 'automatic').toLowerCase(),
            preferredProvider: String(payload.preferredProvider || ''),
            providerRouting: String(payload.providerRouting || 'automatic'),
            taskPrompt: payload.prompt || payload.message || messages[messages.length - 1]?.content || '',
            model: payload.model,
            system: modelSystem,
            user: combined + [
              sourceInspectionContext,
              isWebStudio && projectContext ? 'PROJECT CONTEXT:\n' + projectContext : '',
            ].filter(Boolean).join('\n\n'),
            maxTokens: isWebStudio
              ? Math.min(Number(payload.maxTokens || 32000), 32000)
              : Math.min(Number(payload.maxTokens || 4096), 8192),
            authUser: user,
          }
        );

        if (isWebStudio && mode === 'build' && !multiPageBuild && !scopedWebStudioEdit) {
          const singlePageResult = await validateOrRepairSinglePageBuild({
            env: context.env,
            callModel,
            result,
            provider: String(payload.provider || 'automatic').toLowerCase(),
            model: payload.model,
            authUser: user,
            prompt: promptText,
            system,
            projectContext,
            quotaInputText,
            quotaOutputText: result.text || '',
          });
          result = singlePageResult.result;
          quotaInputText = singlePageResult.quotaInputText || quotaInputText;
          quotaOutputText = singlePageResult.quotaOutputText || result.text || '';
        } else {
          quotaOutputText = result.text || '';
        }
      }
    } catch (providerError) {
      if (providerError?.partialUsage) {
        await finalizeAIQuota(
          context.env,
          quotaReservation,
          providerError.partialUsage,
          providerError.quotaInputText || quotaInputText,
          providerError.quotaOutputText || ''
        ).catch(quotaError => {
          console.error('[OVYX PARTIAL AI USAGE]', quotaError?.message || quotaError);
        });
      } else {
        await refundDailyPrompt(context.env, quotaReservation);
      }
      throw providerError;
    }

    const quota = await finalizeAIQuota(
      context.env,
      quotaReservation,
      result.rawUsage || null,
      quotaInputText,
      quotaOutputText || result.text || ''
    );

    let historySaved = false;

    try {
      await saveChatTurn({
        env: context.env,
        userId: user.sub,
        conversationId,
        messages,
        result,
        requestId: currentRequestId,
        requestedProvider: result.requestedProvider,
      });
      historySaved = true;
    } catch (historyError) {
      console.error(
        '[OVYX CHAT HISTORY]',
        historyError?.message || historyError
      );
    }

    const structured = isWebStudio ? parseStructured(result.text) : null;

    const structuredFields = {};
    if (structured && typeof structured === 'object') {
      for (const key of ['project', 'updatedProject', 'files', 'fileEdits', 'patch', 'html', 'code', 'text', 'summary', 'message', 'answer', 'qualityVerification', 'siteIntegrity', 'requirementRepair']) {
        if (Object.prototype.hasOwnProperty.call(structured, key)) {
          structuredFields[key] = structured[key];
        }
      }
    }
    if (scopedWebStudioEdit) {
      const proposedFiles = structured && (
        structured.files || structured.fileEdits || (structured.patch && structured.patch.files)
      ) || result.files || result.fileEdits || (result.patch && result.patch.files);
      if (proposedFiles && typeof proposedFiles === 'object') {
        const normalizedFiles = normalizeScopedWebStudioFiles(proposedFiles);
        structuredFields.files = normalizedFiles;
      }
    }
    if (isWebStudio && mode === 'ask' && structured && typeof structured.text === 'string') {
      if (!structuredFields.message) structuredFields.message = structured.text;
      if (!structuredFields.answer) structuredFields.answer = structured.text;
    }
    for (const key of ['qualityVerification', 'siteIntegrity', 'requirementRepair']) {
      if (Object.prototype.hasOwnProperty.call(result || {}, key)) {
        structuredFields[key] = result[key];
      }
    }

    if (multiPageBuild) {
      structuredFields.files = result.files || {};
      if (result.project) structuredFields.project = result.project;
      structuredFields.summary = result.summary || structuredFields.summary;
      structuredFields.message = result.message || structuredFields.message;
      structuredFields.siteMap = result.siteMap || null;
    }

    return json({
      ok: true,
      text: result.text,
      answer: result.text,
      ...structuredFields,
      data: structured,
      provider: result.provider,
      model: result.model,
      usage: result.rawUsage || null,
      quota,
      requestedProvider: result.requestedProvider,
      routedProvider: result.routedProvider,
      scopedWebStudioEdit: isWebStudio && mode === 'build' && scopedWebStudioEdit === true,
      conversationId,
      experience: isWebStudio ? experience : null,
      scopedWebStudioEdit,
      history: {
        saved: historySaved,
      },
    });
  } catch (err) {
    return errorResponse(
      err.message || 'Assistant unavailable.',
      err.status || 500,
      err.code || 'AI_ASSISTANT_FAILED'
    );
  }
}
